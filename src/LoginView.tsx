import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CircleAlert, KeyRound, LogIn, MailCheck, UserPlus } from 'lucide-react'
import { appConfig } from './config/environment'
import { authApi, type AppRole, type DevIdentity } from './services/authApi'

const roles: { value: AppRole; label: string; description: string }[] = [
  { value: 'buyer', label: 'Buyer', description: 'Browse the storefront, use the cart, and view orders.' },
  { value: 'seller', label: 'Seller', description: 'Open the seller studio and manage shops and products.' },
  { value: 'support', label: 'Support', description: 'Review customer cases and record status or resolution notes.' },
  { value: 'admin', label: 'App admin', description: 'Review the pending shop approval queue.' },
]

export default function LoginView({ onLogin }: { onLogin: (identity: DevIdentity) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover' | 'reset'>('login')
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [devRole, setDevRole] = useState<AppRole>('buyer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function destination(identity: DevIdentity) {
    window.location.hash = identity.role === 'seller' ? '#seller' : identity.role === 'admin' ? '#admin' : identity.role === 'support' ? '#support' : '#top'
  }

  function showMode(nextMode: typeof mode) {
    setMode(nextMode)
    setError(null)
    setMessage(null)
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
          // Keep the real bearer session and role identity, while taking the
          // user through the verification guidance after registration.
          window.location.hash = `#verify-email?email=${encodeURIComponent(email.trim())}&registered=1`
        } else {
          showMode('login')
          setPassword('')
          setMessage('Registration submitted. Check the verification guidance before signing in.')
        }
      } else if (mode === 'login') {
        const identity = await authApi.login({ email: email.trim(), password })
        onLogin(identity)
        destination(identity)
      } else if (mode === 'recover') {
        const result = await authApi.requestPasswordReset(email)
        setMessage(`${result.message} Email delivery provider is not connected.`)
        if (result.developmentToken) {
          setResetToken(result.developmentToken)
          setMessage(`${result.message} Email delivery provider is not connected. A development token is shown below for local testing.`)
        }
        setMode('reset')
      } else {
        if (newPassword.length < 12) throw new Error('Use a password with at least 12 characters.')
        const result = await authApi.resetPassword({ token: resetToken, newPassword })
        setPassword('')
        setNewPassword('')
        setResetToken('')
        showMode('login')
        setMessage(`${result.message} All previous bearer sessions have been cleared. Sign in again.`)
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

  const heading = mode === 'login' ? 'Welcome back.' : mode === 'register' ? 'Create your account.' : mode === 'recover' ? 'Recover access.' : 'Choose a new password.'
  const intro = mode === 'login' ? 'Sign in to access your DukaanSetu workspace.' : mode === 'register' ? 'Register as a buyer or seller to use the live storefront and workspace.' : mode === 'recover' ? 'Request a password reset using the email on your account.' : 'Use the one-time token from the recovery provider to finish resetting your password.'

  return <div className="auth-shell">
    <main className="auth-card" aria-labelledby="login-heading">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
      <span className="overline">DUKAANSETU ACCESS</span>
      <h1 id="login-heading">{heading}</h1>
      <p className="auth-intro">{intro}</p>

      {!authApi.isAvailable() ? <div className="auth-unavailable" role="status"><CircleAlert size={24} /><div><strong>Authentication is not configured</strong><p>{authApi.unavailableMessage()}</p></div></div> : <>
         {(mode === 'login' || mode === 'register') && <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
           <button className={mode === 'login' ? 'selected' : ''} onClick={() => showMode('login')} role="tab" aria-selected={mode === 'login'}>Sign in</button>
           <button className={mode === 'register' ? 'selected' : ''} onClick={() => showMode('register')} role="tab" aria-selected={mode === 'register'}>Register</button>
         </div>}
         <form className="auth-form" onSubmit={(event) => void submit(event)}>
           {mode === 'register' && <label className="form-field"><span>Name</span><input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>}
           {(mode === 'login' || mode === 'register' || mode === 'recover') && <label className="form-field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
           {(mode === 'login' || mode === 'register') && <label className="form-field"><span>Password</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
           {mode === 'reset' && <>
             <label className="form-field"><span>Reset token</span><input autoComplete="off" value={resetToken} onChange={(event) => setResetToken(event.target.value)} required /></label>
             <label className="form-field"><span>New password</span><input type="password" minLength={12} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small className="field-help">At least 12 characters.</small></label>
           </>}
           {mode === 'register' && <fieldset className="auth-role-field"><legend>Account type</legend><div className="role-options">{roles.filter((item) => item.value === 'buyer' || item.value === 'seller').map((item) => <label className={`role-option ${role === item.value ? 'selected' : ''}`} key={item.value}><input type="radio" name="account-role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value === 'seller' ? 'seller' : 'buyer')} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div></fieldset>}
           {message && <div className="auth-success" role="status">{message}</div>}
           {error && <div className="auth-error" role="alert"><CircleAlert size={17} />{error}</div>}
           <button className="auth-submit" type="submit" disabled={busy}>{mode === 'login' ? <LogIn size={16} /> : mode === 'register' ? <UserPlus size={16} /> : mode === 'recover' ? <MailCheck size={16} /> : <KeyRound size={16} />}{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'recover' ? 'Request reset' : 'Reset password'}</button>
         </form>
         {mode === 'login' && <div className="auth-links"><button className="text-link" onClick={() => showMode('recover')}>Forgot password?</button><a className="text-link" href="#verify-email">Need email verification?</a></div>}
         {(mode === 'recover' || mode === 'reset') && <button className="auth-quiet-link" onClick={() => showMode('login')}>Back to sign in</button>}
       </>}

       {appConfig.environment === 'dev' && mode === 'reset' && resetToken && <div className="dev-token-notice" role="note"><strong>DEV ONLY · recovery token</strong><code>{resetToken}</code><span>Returned by the local backend for testing. Never use or expose this token in UAT, preprod, or production.</span></div>}

      {appConfig.environment === 'dev' && authApi.isAvailable() && <section className="dev-auth-fallback" aria-labelledby="dev-login-heading"><div className="auth-warning"><span className="auth-warning-mark">DEV</span><div><strong id="dev-login-heading">Seeded development fallback</strong><p>Use a seeded identity only when testing local role-aware flows. This does not create or authenticate a real account.</p></div></div><div className="role-options" role="radiogroup" aria-label="Development role">{roles.map((item) => <label className={`role-option ${devRole === item.value ? 'selected' : ''}`} key={item.value}><input type="radio" name="dev-role" value={item.value} checked={devRole === item.value} onChange={() => setDevRole(item.value)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}</div><button className="auth-submit auth-submit-secondary" onClick={() => void submitDevLogin()} disabled={busy}><LogIn size={16} />{busy ? 'Signing in…' : 'Use seeded dev identity'}</button></section>}
    </main>
  </div>
}
