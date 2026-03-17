import { useEffect, useState } from 'react'
import api from '../services/api'

function CreateAlertModal({ report, onClose, onSent }) {
  const today = new Date().toISOString().split('T')[0]
  const district = report?.district || ''

  const defaultMessage = report
    ? `Warning for ${report.district}: a possible ${report.crop} disease has been reported. Symptom observed: "${report.symptom}". Please inspect your crops and contact your local agricultural officer immediately.`
    : ''

  const [message, setMessage] = useState(defaultMessage)
  const [alertDate, setAlertDate] = useState(today)
  const [farmerCount, setFarmerCount] = useState(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!district) {
      setLoadingCount(false)
      return
    }
    setLoadingCount(true)
    api
      .get('/farmers')
      .then((res) => {
        const active = (res.data || []).filter(
          (f) => f.district?.toLowerCase() === district.toLowerCase() && f.active,
        )
        setFarmerCount(active.length)
      })
      .catch(() => setFarmerCount(null))
      .finally(() => setLoadingCount(false))
  }, [district])

  // Close on Escape key
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await api.post('/alerts/send', {
        district,
        message,
        alert_date: alertDate,
      })
      onSent()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send alert. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const sendLabel = sending
    ? 'Sending…'
    : farmerCount !== null && farmerCount > 0
    ? `Send to ${farmerCount} Farmer${farmerCount !== 1 ? 's' : ''}`
    : 'Send Alert'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">District SMS Alert</p>
            <h2>Send Alert to {district}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {/* Body / Form */}
        <form onSubmit={handleSubmit} className="modal-body">
          {/* Source report badge */}
          {report && (
            <div className="modal-source">
              <span className="modal-source-label">Based on report</span>
              <span className="modal-source-detail">
                {report.crop} · {report.symptom} · Severity: {report.severity}
              </span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="alert-district">District</label>
            <input id="alert-district" type="text" value={district} readOnly className="input-readonly" />
          </div>

          <div className="form-group">
            <label htmlFor="alert-message">Alert Message</label>
            <textarea
              id="alert-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
              minLength={5}
              maxLength={1000}
              placeholder="Write the alert message that will be sent to farmers…"
            />
            <span className="char-count">{message.length} / 1000</span>
          </div>

          <div className="form-group">
            <label htmlFor="alert-date">Alert Date</label>
            <input
              id="alert-date"
              type="date"
              value={alertDate}
              onChange={(e) => setAlertDate(e.target.value)}
              required
            />
          </div>

          {/* Recipient preview */}
          {!loadingCount && farmerCount !== null && farmerCount > 0 && (
            <div className="modal-preview">
              <span className="preview-icon">📨</span>
              <p>
                This SMS will be sent to{' '}
                <strong>
                  {farmerCount} active farmer{farmerCount !== 1 ? 's' : ''}
                </strong>{' '}
                registered in <strong>{district}</strong>.
              </p>
            </div>
          )}

          {!loadingCount && farmerCount === 0 && (
            <div className="modal-warning">
              ⚠ No active farmers are registered in <strong>{district}</strong>. The alert will be
              saved but no SMS will be sent.
            </div>
          )}

          {loadingCount && (
            <div className="modal-loading-count">Looking up farmers in {district}…</div>
          )}

          {error && <div className="error-message">{error}</div>}

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={sending || loadingCount}>
              {sendLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateAlertModal
