import { useEffect, useState } from 'react'
import api from '../services/api'

function toSeverityLabel(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

function EditReportModal({ report, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    phone: report?.phone || '',
    district: report?.district || '',
    crop: report?.crop || '',
    symptom: report?.symptom || '',
    severity: toSeverityLabel(report?.severity),
    date: report?.date || new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleChange(event) {
    setFormData((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await api.patch(`/reports/${report.id}`, formData)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update report')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Report Enrichment</p>
            <h2>Add details to SMS report</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="modal-source">
            <span className="modal-source-label">Original SMS</span>
            <span className="modal-source-detail">
              {report?.raw_message || report?.symptom || 'No raw SMS text available'}
            </span>
          </div>

          <div className="report-edit-grid">
            <div className="form-group">
              <label htmlFor="edit-phone">Phone</label>
              <input
                id="edit-phone"
                name="phone"
                type="text"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-district">District</label>
              <input
                id="edit-district"
                name="district"
                type="text"
                value={formData.district}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-crop">Crop</label>
              <input
                id="edit-crop"
                name="crop"
                type="text"
                value={formData.crop}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-severity">Severity</label>
              <select id="edit-severity" name="severity" value={formData.severity} onChange={handleChange}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="edit-symptom">Disease / Symptom Details</label>
            <textarea
              id="edit-symptom"
              name="symptom"
              value={formData.symptom}
              onChange={handleChange}
              rows={4}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-date">Report Date</label>
            <input id="edit-date" name="date" type="date" value={formData.date} onChange={handleChange} required />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditReportModal
