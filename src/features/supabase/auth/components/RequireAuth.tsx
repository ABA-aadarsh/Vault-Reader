"use client"
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../../index'
import type { Session } from '@supabase/supabase-js'

interface RequireAuthProps {
  children: React.ReactNode
  redirectTo?: string
}

export const RequireAuth = ({ children, redirectTo = '/login' }: RequireAuthProps) => {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.replace(redirectTo)
      } else {
        setSession(data.session)
      }
      setLoading(false)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) {
        router.replace(redirectTo)
      }
    })

    return () => {
      listener?.subscription.unsubscribe()
    }
  }, [router, redirectTo])

  if (loading) return <div className="p-4">Loading...</div>
  if (!session) return null

  return <>{children}</>
}
