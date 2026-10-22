import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CircleAlert, MailCheck, ShieldCheck } from 'lucide-react'
import { appConfig } from './config/environment'
import { authApi, type DevIdentity } from './services/authApi'

function routeValue(name: string) {
  const query = window.location.hash.split('?')[1]
  return query ? new URLSearchParams(query).get(name) ?? '' : ''
}

export default function VerifyEmailView({ onLogin }: { onLogin: (identity: DevIdentity) => void }) {
  const [email] = useState(() => authApi.getIdentity()?.email || routeValue('email') || '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(() => routeValue('registered') === '1'
    ? 'Account created. Request verification instructions before relying on email verification. The email provider is not connected in this environment.'
    : null)
  const [developmentToken, setDevelopmentToken] = useState<string | null>(null)

  async function requestVerification(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    setDevelopmentToken(null)
    try {
      const result = await authApi.requestEmailVerification()
      setMessage(`${result.message} Email delivery provider is not connected.`)
      setDevelopmentToken(result.developmentToken ?? null)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The verification request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await authApi.verifyEmail(token)
      if (result.session) onLogin(result.session.user)
      setMessage(result.message)
      setToken('')
      setDevelopmentToken(null)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Email verification failed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-shell">
    <main className="auth-card" aria-labelledby="verify-email-heading">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
      <span className="overline">ACCOUNT VERIFICATION</span>
      <h1 id="verify-email-heading">Verify your email.</h1>
      <p className="auth-intro">Request a one-time verification token, then enter it here to confirm your account.</p>

      {!authApi.isAvailable() ? <div className="auth-unavailable" role="status"><CircleAlert size={24} /><div><strong>Authentication is not configured</strong><p>{authApi.unavailableMessage()}</p></div></div> : <>
        {message && <div className="auth-success" role="status">{message}</div>}
        {error && <div className="auth-error" role="alert"><CircleAlert size={17} />{error}</div>}
         <form className="auth-form auth-form-section" onSubmit={(event) => void requestVerification(event)}>
           <div className="auth-section-heading"><MailCheck size={18} /><strong>Request verification</strong></div>
           <label className="form-field"><span>Signed-in email</span><input type="email" autoComplete="email" value={email} readOnly required /><small className="field-help">Verification instructions are requested for the authenticated account.</small></label>
           {!authApi.isAuthenticated() && <p className="field-help">Sign in first to request a new verification token.</p>}
           <button className="auth-submit" type="submit" disabled={busy || !authApi.isAuthenticated()}><MailCheck size={16} />{busy ? 'Working…' : 'Request verification'}</button>
        </form>
        <form className="auth-form auth-form-section" onSubmit={(event) => void verify(event)}>
          <div className="auth-section-heading"><ShieldCheck size={18} /><strong>Enter verification token</strong></div>
          <label className="form-field"><span>Verification token</span><input autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} required /></label>
          <button className="auth-submit" type="submit" disabled={busy}><ShieldCheck size={16} />{busy ? 'Working…' : 'Verify email'}</button>
        </form>
        {appConfig.environment === 'dev' && developmentToken && <div className="dev-token-notice" role="note"><strong>DEV ONLY · verification token</strong><code>{developmentToken}</code><span>Returned by the local backend for testing. Never use or expose this token in UAT, preprod, or production.</span></div>}
        <div className="auth-links"><a className="text-link" href="#login">Back to sign in</a></div>
      </>}
    </main>
  </div>
}
