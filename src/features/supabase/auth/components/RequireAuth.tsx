"use client"
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../index'
import type { Session, User } from '@supabase/supabase-js'

interface RequireAuthProps {
  children: React.ReactNode
  redirectTo?: string
}

interface AuthContextValue {
  user: User
  session: Session
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

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.replace(redirectTo)
      } else {
        setAuth({ user: data.session.user, session: data.session })
      }
      setLoading(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuth({ user: session.user, session })
      } else {
        setAuth(null)
        router.replace(redirectTo)
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
