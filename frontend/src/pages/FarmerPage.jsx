import ReportForm from '../components/ReportForm'

function FarmerPage() {
  return (
    <div className="page">
      <section className="hero-banner card">
        <p className="auth-eyebrow">Community Reporting</p>
        <h1>Report Crop Disease Early</h1>
        <p>
          Submit symptoms from the field. District teams review reports in real time and trigger alerts when risk patterns appear.
        </p>
      </section>
      <ReportForm />
    </div>
  )
}

export default FarmerPage