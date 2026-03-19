import { useEffect, useState } from 'react'
import api from '../services/api'

function CreateAlertModal({ report, reports, onClose, onSent, onSend, sending = false, error = '' }) {
  const selectedReports = reports || (report ? [report] : [])
  const primaryReport = selectedReports[0] || null
  const today = new Date().toISOString().split('T')[0]
  const district = primaryReport?.district || ''

  const hasMultipleReports = selectedReports.length > 1

  const inferredCrop = primaryReport?.crop || 'crop'
  const inferredSymptom = primaryReport?.symptom || 'symptom'

  const defaultMessage = primaryReport
    ? `Warning for ${district}: a possible ${inferredCrop} disease has been reported. Symptom observed: "${inferredSymptom}". Please inspect your crops and contact your local agricultural officer immediately.`
    : ''

  const [message, setMessage] = useState(defaultMessage)
  const [alertDate, setAlertDate] = useState(today)
  const [farmerCount, setFarmerCount] = useState(null)
  const [loadingCount, setLoadingCount] = useState(true)
  const [internalSending, setInternalSending] = useState(false)
  const [localError, setLocalError] = useState('')

  const isSending = Boolean(onSend) ? sending : internalSending
  const effectiveError = error || localError

  useEffect(() => {
    setMessage(defaultMessage)
  }, [defaultMessage])

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

    const payload = {
      district,
      message,
      alert_date: alertDate,
      report_ids: selectedReports.map((item) => item.id),
    }

    if (onSend) {
      await onSend(payload)
      return
    }

    setInternalSending(true)
    setLocalError('')

    try {
      await api.post('/alerts/send', payload)
      onSent?.()
      onClose()
    } catch (err) {
      setLocalError(err.response?.data?.detail || 'Failed to send alert. Please try again.')
    } finally {
      setInternalSending(false)
    }
  }

  const sendLabel = isSending
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
          {primaryReport && (
            <div className="modal-source">
              <span className="modal-source-label">Based on report</span>
              <span className="modal-source-detail">
                {hasMultipleReports
                  ? `${selectedReports.length} reports selected in ${district}`
                  : `${primaryReport.crop} · ${primaryReport.symptom} · Severity: ${primaryReport.severity}`}
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

          {effectiveError && <div className="error-message">{effectiveError}</div>}

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSending || loadingCount}>
              {sendLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateAlertModal
