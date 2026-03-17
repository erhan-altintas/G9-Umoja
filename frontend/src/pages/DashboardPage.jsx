import { useEffect, useState } from 'react'
import api from '../services/api'
import ReportsTable from '../components/ReportsTable'
import AlertsList from '../components/AlertsList'
import CreateAlertModal from '../components/CreateAlertModal'

function DashboardPage() {
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])
  const [alertReport, setAlertReport] = useState(null)

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

  function handleCreateAlert(report) {
    setAlertReport(report)
  }

  function handleAlertSent() {
    fetchAlerts()
    fetchReports()
  }

  return (
    <div className="page">
      <section className="hero-banner card dashboard-hero">
        <p className="auth-eyebrow">Operations Dashboard</p>
        <h1>Disease Monitoring Control Center</h1>
        <p>Review incoming reports, verify field intelligence, and publish district-level alerts.</p>
      </section>
      <ReportsTable
        reports={reports}
        onVerify={handleVerify}
        onReject={handleReject}
        onCreateAlert={handleCreateAlert}
      />
      <AlertsList alerts={alerts} />

      {alertReport && (
        <CreateAlertModal
          report={alertReport}
          onClose={() => setAlertReport(null)}
          onSent={handleAlertSent}
        />
      )}
    </div>
  )
}

export default DashboardPage