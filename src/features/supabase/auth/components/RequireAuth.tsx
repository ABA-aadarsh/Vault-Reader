"use client"
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../../index'
import AuthAPI from '../auth.service'
import type { Session, User } from '@supabase/supabase-js'
import { engine } from '@/features/sync/SyncEngine'

interface RequireAuthProps {
  children: React.ReactNode
  redirectTo?: string
}

interface AuthContextValue {
  user: User
  session: Session
  fromCache: boolean
  sessionExpired: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within RequireAuth")
  }
  return ctx
}

export const RequireAuth = ({ children, redirectTo = '/signin' }: RequireAuthProps) => {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthContextValue | null>(null)
  const [loading, setLoading] = useState(true)
  const authRef = useRef(auth)
  authRef.current = auth

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        setAuth({ user: data.session.user, session: data.session, fromCache: false, sessionExpired: false })
        setLoading(false)
        return
      }

      if (!navigator.onLine) {
        const cachedUser = AuthAPI.getCachedUser()
        if (cachedUser) {
          setAuth({ user: cachedUser, session: null as unknown as Session, fromCache: true, sessionExpired: true })
          setLoading(false)
          return
        }
      }

      router.replace(redirectTo)
      setLoading(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (navigator.onLine) {
          setAuth(null)
          router.replace(redirectTo)
        } else {
          const current = authRef.current
          if (current) {
            setAuth({ ...current, fromCache: true, sessionExpired: true })
          }
        }
        return
      }

      if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) {
        setAuth({ user: session.user, session, fromCache: false, sessionExpired: false })
        engine.scheduleSync()
      } else if (session) {
        setAuth({ user: session.user, session, fromCache: false, sessionExpired: false })
      }
    })

    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [router, redirectTo])

  if (loading) return <div className="p-4">Loading...</div>
  if (!auth) return null

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  )
}
