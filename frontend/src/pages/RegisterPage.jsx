import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function RegisterPage() {
  const navigate = useNavigate()
  const { isAuthenticated, register } = useAuth()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'reviewer',
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
    try {
      await register(formData)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Registration failed. Try a different username.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-layout page">
      <div className="auth-panel card">
        <p className="auth-eyebrow">Umoja Staff Access</p>
        <h1>Create Account</h1>
        <p className="auth-subtitle">Register a dashboard user with the right operational role.</p>
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
          <select name="role" value={formData.role} onChange={onChange}>
            <option value="reviewer">Reviewer</option>
            <option value="district_officer">District Officer</option>
            <option value="admin">Admin</option>
          </select>
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