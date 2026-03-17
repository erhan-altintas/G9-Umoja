import axios from 'axios'

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

export default api