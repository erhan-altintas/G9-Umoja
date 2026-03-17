import { useState } from 'react'
import api from '../services/api'

const COUNTRY_CODES = [
  { label: 'Belgium', code: '+32' },
  { label: 'Netherlands', code: '+31' },
  { label: 'Kenya', code: '+254' },
  { label: 'Uganda', code: '+256' },
  { label: 'Tanzania', code: '+255' },
  { label: 'Rwanda', code: '+250' },
  { label: 'Burundi', code: '+257' },
  { label: 'DR Congo', code: '+243' },
  { label: 'South Africa', code: '+27' },
  { label: 'United Kingdom', code: '+44' },
  { label: 'United States', code: '+1' },
]

function ReportForm() {
  const [countryCode, setCountryCode] = useState('+254')
  const [formData, setFormData] = useState({
    phone: '',
    district: '',
    crop: '',
    symptom: '',
    severity: 'Low',
  })

  const [submitted, setSubmitted] = useState(false)

  function handleChange(e) {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const localPhone = formData.phone.replace(/\D/g, '')
    const normalizedPhone = `${countryCode}${localPhone}`

    const newReport = {
      ...formData,
      phone: normalizedPhone,
      date: new Date().toISOString().split('T')[0],
    }

    try {
      await api.post('/reports', newReport)
      setSubmitted(true)
      setCountryCode('+254')
      setFormData({
        phone: '',
        district: '',
        crop: '',
        symptom: '',
        severity: 'Low',
      })
    } catch (error) {
      console.error('Error sending report:', error)
    }
  }

  return (
    <div className="card">
      <h2>Report Crop Disease</h2>
      <form onSubmit={handleSubmit} className="form">
        <div className="phone-input-row">
          <select
            name="countryCode"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="phone-country-select"
            aria-label="Country code"
          >
            {COUNTRY_CODES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label} ({country.code})
              </option>
            ))}
          </select>
          <input
            type="tel"
            name="phone"
            placeholder="Phone number"
            value={formData.phone}
            onChange={handleChange}
            pattern="[0-9 ]{6,15}"
            title="Enter numbers only"
            required
          />
        </div>
        <input
          type="text"
          name="district"
          placeholder="District"
          value={formData.district}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="crop"
          placeholder="Crop"
          value={formData.crop}
          onChange={handleChange}
          required
        />
        <textarea
          name="symptom"
          placeholder="Describe the symptom"
          value={formData.symptom}
          onChange={handleChange}
          required
        />
        <select
          name="severity"
          value={formData.severity}
          onChange={handleChange}
        >
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <button type="submit">Send Report</button>
      </form>

      {submitted && (
        <p className="success-message">Report submitted successfully.</p>
      )}
    </div>
  )
}

export default ReportForm