import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api, { getStoredToken, setStoredToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function hydrateUser() {
      const storedToken = getStoredToken()
      if (!storedToken) {
        setLoading(false)
        return
      }

      try {
        const response = await api.get('/auth/me')
        setUser(response.data)
      } catch {
        setStoredToken(null)
        setToken(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    hydrateUser()
  }, [])

  async function login(credentials) {
    const response = await api.post('/auth/login', credentials)
    const nextToken = response.data.access_token
    setStoredToken(nextToken)
    setToken(nextToken)
    setUser(response.data.user)
    return response.data.user
  }

  async function register(payload) {
    const response = await api.post('/auth/register', payload)
    const nextToken = response.data.access_token
    setStoredToken(nextToken)
    setToken(nextToken)
    setUser(response.data.user)
    return response.data.user
  }

  function logout() {
    setStoredToken(null)
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
    }),
    [token, user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}