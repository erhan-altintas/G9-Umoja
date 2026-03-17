function AlertsList({ alerts }) {
  return (
    <div className="card">
      <h2>Recent Alerts</h2>

      {alerts.length === 0 ? (
        <div className="empty-message">No alerts created yet.</div>
      ) : (
        alerts.map((alert) => (
          <div key={alert.id} className="alert-item">
            <p>
              <strong>District:</strong> {alert.district}
            </p>
            <p>
              <strong>Message:</strong> {alert.message}
            </p>
            <p>
              <strong>Date:</strong> {alert.alert_date || alert.date}
            </p>
            <p>
              <strong>Status:</strong>{' '}
              <span className={`status-badge status-${String(alert.status || '').toLowerCase()}`}>{alert.status}</span>
            </p>
          </div>
        ))
      )}
    </div>
  )
}

export default AlertsList