import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function getErrorMessage(requestError) {
  if (requestError?.response?.status === 409) {
    return 'Deze gebruikersnaam bestaat al. Kies een andere gebruikersnaam of log in.'
  }

  const detail = requestError?.response?.data?.detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || String(item)).join(' ')
  }
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  return 'Registration failed. Try a different username.'
}

function RegisterPage() {
  const navigate = useNavigate()
  const { isAuthenticated, register } = useAuth()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
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

    const payload = {
      ...formData,
      username: formData.username.trim(),
    }

    if (payload.username.length < 3) {
      setError('Username must be at least 3 characters.')
      setSubmitting(false)
      return
    }

    try {
      await register(payload)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(getErrorMessage(requestError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout page">
      <div className="auth-panel card">
        <p className="auth-eyebrow">Umoja Staff Access</p>
        <h1>Create Account</h1>
        <p className="auth-subtitle">
          Register for dashboard access. After registering, email Umoja@cropalert.com and we will verify your account in the database.
        </p>
        <form onSubmit={onSubmit} className="form">
          <input
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={onChange}
            minLength={3}
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={onChange}
            minLength={8}
            required
          />
          {error ? <p className="error-message">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="auth-footnote">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage