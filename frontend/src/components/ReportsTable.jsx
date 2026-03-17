function ReportsTable({
  title = 'Incoming Reports',
  emptyMessage = 'No reports submitted yet.',
  reports,
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
              <td colSpan="8">
                <div className="empty-message">{emptyMessage}</div>
              </td>
            </tr>
          ) : (
            reports.map((report) => (
              <tr key={report.id}>
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
                    <button onClick={() => onEditReport(report)}>
                      Add Details
                    </button>

                    <button
                      onClick={() => onVerify(report.id)}
                      disabled={report.status !== 'Pending'}
                    >
                      Verify
                    </button>

                    <button
                      onClick={() => onReject(report.id)}
                      disabled={report.status !== 'Pending'}
                    >
                      Reject
                    </button>

                    <button
                      onClick={() => onCreateAlert(report)}
                      disabled={!report.district || !report.crop || !report.symptom}
                    >
                      Create Alert
                    </button>
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