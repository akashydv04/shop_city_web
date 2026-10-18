import { useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { authApi, type DevIdentity } from './services/authApi'

function roleLabel(role: DevIdentity['role']) {
  return role === 'admin' ? 'App admin' : role[0].toUpperCase() + role.slice(1)
}

export default function AuthControls({ identity }: { identity: DevIdentity | null }) {
  const [error, setError] = useState<string | null>(null)

  async function logout() {
    setError(null)
    try {
      await authApi.logout()
      window.location.hash = '#top'
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Logout failed. Your local session was cleared.')
      window.location.hash = '#top'
    }
  }

  return <div className="auth-controls">
    {identity ? <>
      <span className={`role-badge role-${identity.role}`} aria-label={`Signed in as ${roleLabel(identity.role)}`}><span className="role-badge-dot" />{roleLabel(identity.role)}</span>
      <span className="auth-identity-name">{identity.displayName || identity.email || identity.id.slice(0, 8)}</span>
      <button className="auth-button" onClick={() => void logout()}><LogOut size={14} /> Log out</button>
      {error && <span className="auth-control-error" role="alert">{error}</span>}
    </> : <a className="auth-button auth-login-button" href="#login"><LogIn size={14} /> Sign in</a>}
  </div>
}
