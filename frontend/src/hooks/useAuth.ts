import { useState, useEffect } from 'react'

const SESSION_KEY = 'wms_user'

export interface AuthUser {
  username: string
}

const MOCK_USERS: Record<string, string> = {
  admin: 'admin1234',
  viewer: 'view1234',
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  })

  useEffect(() => {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(SESSION_KEY)
  }, [user])

  const login = (username: string, password: string): boolean => {
    if (MOCK_USERS[username] === password) {
      setUser({ username })
      return true
    }
    return false
  }

  const logout = () => setUser(null)

  return { user, login, logout }
}
