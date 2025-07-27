import { supabase } from '../index'
import type { User, Session } from '@supabase/supabase-js'

const SESSION_KEY = 'vault-user-session'
const USER_KEY = 'vault-user'

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

function cacheUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function getCachedUser(): User | null {
  const user = localStorage.getItem(USER_KEY)
  return user ? JSON.parse(user) : null
}

function setLoggedInState(email: string) {
  localStorage.setItem(SESSION_KEY, email)
}

function clearLoggedInState() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(USER_KEY)
}

function isLoggedInOffline(): boolean {
  return !!localStorage.getItem(SESSION_KEY)
}

async function signup(email: string, password: string, fullname: string): Promise<User> {
  if (!isOnline()) throw new Error('Must be online to sign up')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: {
      name: fullname
    }
    }
  })

  if (error || !data.user) throw error || new Error('Signup failed')

  cacheUser(data.user)
  setLoggedInState(data.user.email!)
  return data.user
}

async function signin(email: string, password: string): Promise<User> {
  if (!isOnline()) throw new Error('Must be online to sign in')

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) throw error || new Error('Signin failed')

  cacheUser(data.user)
  setLoggedInState(data.user.email!)
  return data.user
}

async function signout(): Promise<void> {
  if (isOnline()) {
    try {
      await supabase.auth.signOut()
    } catch (_) {
      // silent fail
    }
  }
  clearLoggedInState()
}

async function getCurrentUser(): Promise<User | null> {
  if (isOnline()) {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data.user) throw error || new Error('No user')

      cacheUser(data.user)
      return data.user
    } catch (_) {
      return getCachedUser()
    }
  } else if (isLoggedInOffline()) {
    return getCachedUser()
  } else {
    throw new Error('Not authenticated (offline)')
  }
}

function isAuthenticated(): boolean {
  return isLoggedInOffline()
}

const AuthAPI = {
  signup,
  signin,
  signout,
  getCurrentUser,
  isAuthenticated,
  isOnline,
}

export default AuthAPI
