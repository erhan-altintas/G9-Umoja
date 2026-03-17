import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Navbar() {
  const { isAuthenticated, user, logout } = useAuth()

  return (
    <nav className="navbar">
      <div className="brand-block">
        <p className="brand-chip">Umoja</p>
        <h2>Crop Disease Alert Network</h2>
      </div>
      <div className="nav-links">
        <Link to="/">Farmer Report</Link>
        {isAuthenticated ? <Link to="/dashboard">Dashboard</Link> : null}
        {isAuthenticated ? (
          <>
            <span className="user-pill">{user?.username}</span>
            <button className="ghost-button" onClick={logout}>Sign out</button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register" className="cta-link">Register</Link>
          </>
        )}
      </div>
    </nav>
  )
}

export default Navbar