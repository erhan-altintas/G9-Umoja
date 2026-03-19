import axios from 'axios'

const AUTH_TOKEN_KEY = 'umoja_auth_token'

const envBaseUrl = import.meta.env.VITE_API_BASE_URL
const isLocalHost = (value) =>
  typeof value === 'string' && /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(value)

const resolvedBaseUrl =
  !import.meta.env.DEV && isLocalHost(envBaseUrl)
    ? '/api'
    : envBaseUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '/api')

const api = axios.create({
  baseURL: resolvedBaseUrl,
})

export function getStoredToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredToken(token) {
  if (!token) {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    return
  }
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(`${normalized}${padding}`)
}

export function isTokenExpired(token) {
  if (!token || typeof token !== 'string') {
    return true
  }

  const [payload] = token.split('.')
  if (!payload) {
    return true
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload))
    const exp = Number(parsed?.exp)
    if (!Number.isFinite(exp)) {
      return true
    }
    return exp <= Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}

api.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api