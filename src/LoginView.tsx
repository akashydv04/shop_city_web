import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CircleAlert, LogIn, UserPlus } from 'lucide-react'
import { appConfig } from './config/environment'
import { authApi, type AppRole, type DevIdentity } from './services/authApi'

const roles: { value: AppRole; label: string; description: string }[] = [
  { value: 'buyer', label: 'Buyer', description: 'Browse the storefront, use the cart, and view orders.' },
  { value: 'seller', label: 'Seller', description: 'Open the seller studio and manage shops and products.' },
  { value: 'support', label: 'Support', description: 'Review customer cases and record status or resolution notes.' },
  { value: 'admin', label: 'App admin', description: 'Review the pending shop approval queue.' },
]

export default function LoginView({ onLogin }: { onLogin: (identity: DevIdentity) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [devRole, setDevRole] = useState<AppRole>('buyer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function destination(identity: DevIdentity) {
    window.location.hash = identity.role === 'seller' ? '#seller' : identity.role === 'admin' ? '#admin' : identity.role === 'support' ? '#support' : '#top'
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === 'register') {
        if (!displayName.trim()) throw new Error('Enter your name before registering.')
        const result = await authApi.register({ email: email.trim(), password, displayName: displayName.trim(), role })
        if (result.identity) {
          onLogin(result.identity)
          destination(result.identity)
        } else {
          setMode('login')
          setPassword('')
          setMessage('Registration submitted. Sign in with your new account once the backend confirms it.')
        }
      } else {
        const identity = await authApi.login({ email: email.trim(), password })
        onLogin(identity)
        destination(identity)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The authentication request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitDevLogin() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const identity = await authApi.devLogin(devRole)
      onLogin(identity)
      destination(identity)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The development login request failed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-shell">
    <main className="auth-card" aria-labelledby="login-heading">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
      <span className="overline">DUKAANSETU ACCESS</span>
      <h1 id="login-heading">{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
      <p className="auth-intro">{mode === 'login' ? 'Sign in to access your DukaanSetu workspace.' : 'Register as a buyer or seller to use the live storefront and workspace.'}</p>

      {!authApi.isAvailable() ? <div className="auth-unavailable" role="status"><CircleAlert size={24} /><div><strong>Authentication is not configured</strong><p>{authApi.unavailableMessage()}</p></div></div> : <>
        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(null); setMessage(null) }} role="tab" aria-selected={mode === 'login'}>Sign in</button>
          <button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(null); setMessage(null) }} role="tab" aria-selected={mode === 'register'}>Register</button>
        </div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === 'register' && <label className="form-field"><span>Name</span><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>}
          <label className="form-field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="form-field"><span>Password</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {mode === 'register' && <fieldset className="auth-role-field"><legend>Account type</legend><div className="role-options">{roles.filter((item) => item.value === 'buyer' || item.value === 'seller').map((item) => <label className={`role-option ${role === item.value ? 'selected' : ''}`} key={item.value}><input type="radio" name="account-role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value === 'seller' ? 'seller' : 'buyer')} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></fieldset>}
          {message && <div className="auth-success" role="status">{message}</div>}
          {error && <div className="auth-error" role="alert"><CircleAlert size={17} />{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </>}

      {appConfig.environment === 'dev' && authApi.isAvailable() && <section className="dev-auth-fallback" aria-labelledby="dev-login-heading"><div className="auth-warning"><span className="auth-warning-mark">DEV</span><div><strong id="dev-login-heading">Seeded development fallback</strong><p>Use a seeded identity only when testing local role-aware flows. This does not create or authenticate a real account.</p></div></div><div className="role-options" role="radiogroup" aria-label="Development role">{roles.map((item) => <label className={`role-option ${devRole === item.value ? 'selected' : ''}`} key={item.value}><input type="radio" name="dev-role" value={item.value} checked={devRole === item.value} onChange={() => setDevRole(item.value)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div><button className="auth-submit auth-submit-secondary" onClick={() => void submitDevLogin()} disabled={busy}><LogIn size={16} />{busy ? 'Signing in…' : 'Use seeded dev identity'}</button></section>}
    </main>
  </div>
}
