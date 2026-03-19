import { useEffect, useState } from 'react'
import api from '../services/api'
import { enqueueAlert, getAllQueued, dequeueAlert } from '../services/alertQueue'
import ReportsTable from '../components/ReportsTable'
import AlertsList from '../components/AlertsList'

function DashboardPage() {
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queuedCount, setQueuedCount] = useState(0)
  const [flushing, setFlushing] = useState(false)

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

  async function syncQueueCount() {
    const items = await getAllQueued()
    setQueuedCount(items.length)
  }

  async function flushQueue() {
    const items = await getAllQueued()
    if (!items.length) return
    setFlushing(true)
    for (const item of items) {
      // eslint-disable-next-line no-unused-vars
      const { id, queuedAt, ...alertData } = item
      try {
        await api.post('/alerts/send', alertData)
        await dequeueAlert(id)
      } catch {
        // leave in queue, will retry next time online
      }
    }
    setFlushing(false)
    syncQueueCount()
    fetchAlerts()
  }

  useEffect(() => {
    fetchReports()
    fetchAlerts()
    syncQueueCount()

    const interval = setInterval(() => {
      fetchReports()
      fetchAlerts()
    }, 5000)

    function handleOnline() {
      setIsOnline(true)
      flushQueue()
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Flush any queued alerts left from a previous offline session
    if (navigator.onLine) {
      flushQueue()
    }

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const alertData = {
      district: report.district,
      message: `Warning for ${report.district}: possible ${report.crop} disease reported. Symptom: ${report.symptom}.`,
      alert_date: new Date().toISOString().split('T')[0],
      status: 'draft',
      created_by: 'system',
    }

    if (!navigator.onLine) {
      await enqueueAlert(alertData)
      syncQueueCount()
      return
    }

    try {
      await api.post('/alerts/send', alertData)
      fetchAlerts()
      fetchReports()
    } catch (error) {
      console.error('Alert send failed, queuing for retry:', error)
      await enqueueAlert(alertData)
      syncQueueCount()
    }
  }

  return (
    <div className="page">
      {!isOnline && (
        <div className="offline-banner">
          You are offline — alerts will be queued and sent automatically when the connection is restored.
          {queuedCount > 0 && ` (${queuedCount} queued)`}
        </div>
      )}
      {isOnline && queuedCount > 0 && (
        <div className="sync-banner">
          {flushing
            ? `Sending ${queuedCount} queued alert(s)…`
            : `${queuedCount} queued alert(s) — reconnected, sending now…`}
        </div>
      )}
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
    </div>
  )
}

export default DashboardPage