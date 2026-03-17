import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login } = useAuth()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  function onChange(event) {
    setFormData((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  async function onSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(formData)
      const from = location.state?.from || '/dashboard'
      navigate(from, { replace: true })
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout page">
      <div className="auth-panel card">
        <p className="auth-eyebrow">Umoja Staff Access</p>
        <h1>Sign In</h1>
        <p className="auth-subtitle">Only authenticated staff can open the dashboard.</p>
        <form onSubmit={onSubmit} className="form">
          <input
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={onChange}
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={onChange}
            required
          />
          {error ? <p className="error-message">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="auth-footnote">
          No account yet? <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}

export default LoginPage