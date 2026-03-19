import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import ReportsTable from '../components/ReportsTable'
import AlertsList from '../components/AlertsList'
import CreateAlertModal from '../components/CreateAlertModal'
import EditReportModal from '../components/EditReportModal'
import { clearQueue, dequeueAlert, enqueueAlert, getAllQueued } from '../services/alertQueue'

function DashboardPage() {
  const [reports, setReports] = useState([])
  const [alerts, setAlerts] = useState([])
  const [selectedReportIds, setSelectedReportIds] = useState([])
  const [alertReports, setAlertReports] = useState([])
  const [editingReport, setEditingReport] = useState(null)
  const [queueCount, setQueueCount] = useState(0)
  const [isQueueSyncing, setIsQueueSyncing] = useState(false)
  const [queueError, setQueueError] = useState('')
  const [modalSending, setModalSending] = useState(false)
  const [modalError, setModalError] = useState('')
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

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

  async function refreshQueueCount() {
    const queued = await getAllQueued()
    setQueueCount(queued.length)
  }

  async function flushQueuedAlerts() {
    setIsQueueSyncing(true)
    setQueueError('')

    try {
      const queued = await getAllQueued()
      for (const queuedAlert of queued) {
        const { id, queuedAt, ...payload } = queuedAlert
        try {
          await api.post('/alerts/send', payload)
          await dequeueAlert(id)
        } catch (error) {
          if (!error?.response) {
            setQueueError('Still offline. Alerts remain in queue.')
            break
          }
          setQueueError(error.response?.data?.detail || 'Failed to sync one or more queued alerts.')
          break
        }
      }
      await refreshQueueCount()
      fetchAlerts()
      fetchReports()
    } finally {
      setIsQueueSyncing(false)
    }
  }

  useEffect(() => {
    fetchReports()
    fetchAlerts()
    refreshQueueCount()

    const interval = setInterval(() => {
      fetchReports()
      fetchAlerts()
    }, 5000)

    function handleOnline() {
      setIsOnline(true)
      flushQueuedAlerts()
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (navigator.onLine) {
      flushQueuedAlerts()
    }

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedReportIds((previous) =>
      previous.filter((id) => reports.some((report) => report.id === id && report.status !== 'Rejected')),
    )
  }, [reports])

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

  function handleEditReport(report) {
    setEditingReport(report)
  }

  function handleReportSaved() {
    fetchReports()
  }

  async function handleClearQueuedAlerts() {
    await clearQueue()
    await refreshQueueCount()
    setQueueError('')
  }

  function toggleReportSelection(report) {
    if (report.status === 'Rejected') {
      return
    }

    const reportId = report.id
    setSelectedReportIds((previous) =>
      previous.includes(reportId) ? previous.filter((id) => id !== reportId) : [...previous, reportId],
    )
  }

  function openCreateAlertModal() {
    if (selectedReports.length === 0) {
      return
    }
    setModalError('')
    setAlertReports(selectedReports)
  }

  function openCreateAlertForReport(report) {
    if (!report) {
      return
    }
    setModalError('')
    setAlertReports([report])
  }

  async function handleSendAlert(alertData) {
    setModalSending(true)
    setModalError('')

    try {
      await api.post('/alerts/send', {
        district: alertData.district,
        message: alertData.message,
        alert_date: alertData.alert_date,
      })
      setAlertReports([])
      setSelectedReportIds((previous) => previous.filter((id) => !alertData.report_ids.includes(id)))
      fetchAlerts()
      fetchReports()
      await refreshQueueCount()
    } catch (error) {
      if (!error?.response) {
        await enqueueAlert({
          district: alertData.district,
          message: alertData.message,
          alert_date: alertData.alert_date,
        })
        await refreshQueueCount()
        setAlertReports([])
        setSelectedReportIds([])
        setQueueError('Alert queued offline. It will be sent when connection is restored.')
      } else {
        setModalError(error.response?.data?.detail || 'Failed to send alert')
      }
    } finally {
      setModalSending(false)
    }
  }

  const smsReports = reports.filter((report) => report.source === 'sms')
  const onlineReports = reports.filter((report) => report.source !== 'sms')
  const selectedReports = useMemo(
    () => reports.filter((report) => selectedReportIds.includes(report.id) && report.status !== 'Rejected'),
    [reports, selectedReportIds],
  )

  return (
    <div className="page">
      {!isOnline && (
        <section className="offline-banner">
          <span>You are offline. Alerts will be queued.</span>
          {queueCount > 0 && <span>{queueCount} queued</span>}
        </section>
      )}

      {queueCount > 0 && (
        <section className="sync-banner">
          <span>
            {isQueueSyncing
              ? `Sending ${queueCount} queued alert(s)...`
              : `${queueCount} alert(s) in queue waiting to send.`}
          </span>
          <button type="button" className="queue-resume-btn" onClick={flushQueuedAlerts} disabled={isQueueSyncing}>
            Send now
          </button>
          <button
            type="button"
            className="queue-clear-btn"
            onClick={handleClearQueuedAlerts}
            aria-label="Clear queued alerts"
            title="Clear queued alerts"
            disabled={isQueueSyncing}
          >
            ×
          </button>
        </section>
      )}

      {queueError && <div className="error-message">{queueError}</div>}

      <section className="hero-banner card dashboard-hero">
        <p className="auth-eyebrow">Operations Dashboard</p>
        <h1>Disease Monitoring Control Center</h1>
        <p>Review incoming reports, verify field intelligence, and publish district-level alerts.</p>
      </section>

      <section className="card reports-toolbar reports-toolbar-top">
        <button type="button" onClick={openCreateAlertModal} disabled={selectedReports.length === 0}>
          Create Alert ({selectedReports.length})
        </button>
      </section>

      <ReportsTable
        title="SMS Incoming Reports"
        emptyMessage="No SMS reports yet."
        reports={smsReports}
        selectedReportIds={selectedReportIds}
        onToggleReport={toggleReportSelection}
        onVerify={handleVerify}
        onReject={handleReject}
        onCreateAlert={openCreateAlertForReport}
        onEditReport={handleEditReport}
      />

      <ReportsTable
        title="Online Form Reports"
        emptyMessage="No online form reports yet."
        reports={onlineReports}
        selectedReportIds={selectedReportIds}
        onToggleReport={toggleReportSelection}
        onVerify={handleVerify}
        onReject={handleReject}
        onCreateAlert={openCreateAlertForReport}
        onEditReport={handleEditReport}
      />
      <AlertsList alerts={alerts} />

      {editingReport && (
        <EditReportModal
          report={editingReport}
          onClose={() => setEditingReport(null)}
          onSaved={handleReportSaved}
        />
      )}

      {alertReports.length > 0 && (
        <CreateAlertModal
          reports={alertReports}
          onClose={() => setAlertReports([])}
          onSend={handleSendAlert}
          sending={modalSending}
          error={modalError}
        />
      )}
    </div>
  )
}

export default DashboardPage