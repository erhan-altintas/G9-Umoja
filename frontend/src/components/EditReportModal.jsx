import { useEffect, useState } from 'react'
import api from '../services/api'

function EditReportModal({ report, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    district: report?.district || '',
    crop: report?.crop || '',
    symptom: report?.symptom || '',
    severity: (report?.severity || 'Low').toLowerCase(),
    date: report?.date || new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await api.patch(`/reports/${report.id}`, {
        district: formData.district,
        crop: formData.crop,
        symptom: formData.symptom,
        severity: formData.severity,
        date: formData.date,
      })
      onSaved?.()
      onClose()
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Failed to update report.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Report Review</p>
            <h2>Edit Report #{report?.id}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="edit-report-district">District</label>
            <input
              id="edit-report-district"
              name="district"
              type="text"
              value={formData.district}
              onChange={handleChange}
              required
              minLength={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-report-crop">Crop</label>
            <input
              id="edit-report-crop"
              name="crop"
              type="text"
              value={formData.crop}
              onChange={handleChange}
              required
              minLength={2}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-report-symptom">Symptom</label>
            <textarea
              id="edit-report-symptom"
              name="symptom"
              rows={4}
              value={formData.symptom}
              onChange={handleChange}
              required
              minLength={3}
              maxLength={1000}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-report-severity">Severity</label>
            <select
              id="edit-report-severity"
              name="severity"
              value={formData.severity}
              onChange={handleChange}
              required
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="edit-report-date">Date</label>
            <input
              id="edit-report-date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          {error ? <div className="error-message">{error}</div> : null}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditReportModal
