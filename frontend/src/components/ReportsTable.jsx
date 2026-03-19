function ReportsTable({
  title = 'Incoming Reports',
  emptyMessage = 'No reports submitted yet.',
  reports,
  selectedReportIds = [],
  onToggleReport,
  onVerify,
  onReject,
  onCreateAlert,
  onEditReport,
}) {
  return (
    <div className="card">
      <h2>{title}</h2>

      <table>
        <thead>
          <tr>
            <th>Select</th>
            <th>Phone</th>
            <th>District</th>
            <th>Crop</th>
            <th>Symptom</th>
            <th>Severity</th>
            <th>Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {reports.length === 0 ? (
            <tr>
              <td colSpan="9">
                <div className="empty-message">{emptyMessage}</div>
              </td>
            </tr>
          ) : (
            reports.map((report) => (
              <tr key={report.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedReportIds.includes(report.id)}
                    disabled={report.status === 'Rejected' || typeof onToggleReport !== 'function'}
                    onChange={() => onToggleReport?.(report)}
                  />
                </td>
                <td>{report.phone}</td>
                <td>{report.district}</td>
                <td>{report.crop}</td>
                <td>{report.symptom}</td>
                <td>{report.severity}</td>
                <td>{report.date}</td>
                <td>
                  <span
                    className={`status-badge ${
                      report.status === 'Pending'
                        ? 'status-pending'
                        : report.status === 'Verified'
                        ? 'status-verified'
                        : 'status-rejected'
                    }`}
                  >
                    {report.status}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => onVerify(report.id)}
                      type="button"
                      disabled={report.status !== 'Pending'}
                    >
                      Verify
                    </button>

                    <button
                      onClick={() => onReject(report.id)}
                      type="button"
                      disabled={report.status !== 'Pending'}
                    >
                      Reject
                    </button>

                    <button type="button" onClick={() => onCreateAlert?.(report)} disabled={!onCreateAlert}>
                      Create Alert
                    </button>

                    {onEditReport ? (
                      <button type="button" onClick={() => onEditReport(report)}>
                        Edit
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default ReportsTable