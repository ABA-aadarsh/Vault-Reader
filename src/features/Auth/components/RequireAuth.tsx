"use client"
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AuthAPI from '../data/auth.service'
import type { Session, User } from '@supabase/supabase-js'
import { engine } from '@/features/Sync'

interface RequireAuthProps {
  children: React.ReactNode
  redirectTo?: string
}

interface AuthContextValue {
  user: User
  /** Null while running from the cached user offline. */
  session: Session | null
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

/** An access token that has already expired cannot be refreshed offline. */
function isExpired(session: Session): boolean {
  return typeof session.expires_at === 'number' && session.expires_at * 1000 <= Date.now()
}

const SESSION_READ_TIMEOUT_MS = 2500

/**
 * `getSession()` may refresh an expired token over the network and stall a cold
 * start on "Loading...", so time out and fall back to the cached user.
 */
async function readStoredSession(): Promise<Session | null> {
  const read = supabase.auth.getSession().then(({ data }) => data.session ?? null)

  return Promise.race([
    read,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), SESSION_READ_TIMEOUT_MS)
    }),
  ]).catch(() => null)
}

export const RequireAuth = ({ children, redirectTo = '/signin' }: RequireAuthProps) => {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthContextValue | null>(null)
  const [loading, setLoading] = useState(true)
  const authRef = useRef(auth)
  authRef.current = auth

  useEffect(() => {
    const applyCachedUser = (): boolean => {
      const cachedUser = AuthAPI.getCachedUser()
      if (!cachedUser) return false

      setAuth({
        user: cachedUser,
        session: null,
        fromCache: true,
        sessionExpired: true,
      })
      setLoading(false)
      return true
    }

    const init = async () => {
      const session = await readStoredSession()

      if (session) {
        // An expired session is usable locally, but sync/download need a re-auth.
        const expired = isExpired(session)
        setAuth({
          user: session.user,
          session,
          fromCache: expired,
          sessionExpired: expired,
        })
        setLoading(false)
        return
      }

      if (applyCachedUser()) return

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
