import { useEffect, useMemo, useState } from 'react'

function CreateAlertModal({ reports, onClose, onSend, sending = false, error = '' }) {
  const today = new Date().toISOString().split('T')[0]
  const [message, setMessage] = useState('')
  const [alertDate, setAlertDate] = useState(today)

  const selectedReports = reports || []
  const districts = useMemo(
    () => [...new Set(selectedReports.map((item) => String(item.district || '').trim()))],
    [selectedReports],
  )
  const district = districts.length === 1 ? districts[0] : ''
  const invalidSelection = selectedReports.length === 0 || !district
  const reportIds = selectedReports.map((item) => item.id)

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
    if (invalidSelection) {
      return
    }

    await onSend({
      district,
      message,
      alert_date: alertDate,
      status: 'draft',
      created_by: 'system',
      report_ids: reportIds,
    })
  }

  const sendLabel = sending ? 'Sending…' : `Send Combined Alert (${selectedReports.length})`

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">District SMS Alert</p>
            <h2>{district ? `Send Alert to ${district}` : 'Selected reports must be in one district'}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {/* Body / Form */}
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-source">
            <span className="modal-source-label">Selected reports</span>
            <span className="modal-source-detail">{selectedReports.length} report(s) selected</span>
            {selectedReports.slice(0, 5).map((item) => (
              <span key={item.id} className="modal-source-detail">
                #{item.id} · {item.crop || 'Unknown crop'} · {item.symptom || 'No symptom text'}
              </span>
            ))}
            {selectedReports.length > 5 && (
              <span className="modal-source-detail">+{selectedReports.length - 5} more…</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="alert-district">District</label>
            <input
              id="alert-district"
              type="text"
              value={district || 'Multiple districts selected'}
              readOnly
              className="input-readonly"
            />
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

          {invalidSelection && (
            <div className="modal-warning">
              Select one or more reports from the same district to create a combined alert.
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={sending || invalidSelection || !message.trim()}>
              {sendLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateAlertModal
