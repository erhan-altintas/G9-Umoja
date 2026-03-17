import { useEffect, useState } from 'react'
import api from '../services/api'
import ReportsTable from '../components/ReportsTable'
import AlertsList from '../components/AlertsList'

function DashboardPage() {
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])

  async function fetchReports() {
    try {
      const response = await api.get('/reports')
      setReports(response.data)
    } catch (error) {
      console.error('Error fetching reports:', error)
    }
  }

  async function fetchAlerts() {
    try {
      const response = await api.get('/alerts')
      setAlerts(response.data)
    } catch (error) {
      console.error('Error fetching alerts:', error)
    }
  }

  useEffect(() => {
  fetchReports()
  fetchAlerts()

  const interval = setInterval(() => {
    fetchReports()
    fetchAlerts()
  }, 5000)

  return () => clearInterval(interval)

}, [])

  async function handleVerify(id) {
    try {
      await api.put(`/reports/${id}/verify`)
      fetchReports()
    } catch (error) {
      console.error('Error verifying report:', error)
    }
  }

  async function handleReject(id) {
    try {
      await api.put(`/reports/${id}/reject`)
      fetchReports()
    } catch (error) {
      console.error('Error rejecting report:', error)
    }
  }

  async function handleCreateAlert(report) {
  try {
    await api.post('/alerts', {
      district: report.district,
      message: `Warning for ${report.district}: possible ${report.crop} disease reported. Symptom: ${report.symptom}.`,
      alert_date: new Date().toISOString().split('T')[0],
    })

    fetchAlerts()
    fetchReports()

  } catch (error) {
    console.error('Error creating alert:', error)
  }
}

  return (
    <div className="page">
      <ReportsTable
        reports={reports}
        onVerify={handleVerify}
        onReject={handleReject}
        onCreateAlert={handleCreateAlert}
      />
      <AlertsList alerts={alerts} />
    </div>
  )
}

export default DashboardPage