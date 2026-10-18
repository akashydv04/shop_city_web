import { appConfig } from '../config/environment'

export type AppRole = 'buyer' | 'seller' | 'support' | 'admin'

export interface UserIdentity {
  id: string
  role: AppRole
  displayName?: string
  email?: string
}

// Kept as an alias for the existing view imports while the UI is migrated from
// its original development-only naming.
export type DevIdentity = UserIdentity

export interface AuthSession {
  accessToken: string
  user: UserIdentity
  expiresAt?: string
  csrfToken?: string
}

export interface AuthActionResult {
  message: string
  /** A one-time local testing token. This field is only populated in dev. */
  developmentToken?: string
  session?: AuthSession
}

export class AuthApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'AuthApiError'
  }
}

const sessionStorageKey = 'dukaansetu.auth.session'
const devIdentityStorageKey = 'dukaansetu.dev.identity'
let currentSession: AuthSession | null = readStoredSession()
let currentDevIdentity: UserIdentity | null = readStoredDevIdentity()
const listeners = new Set<() => void>()

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value)
}

function normalizeRole(value: unknown): AppRole | null {
  const role = stringValue(value).toLowerCase().replace(/[-\s]/g, '_')
  if (role === 'buyer') return 'buyer'
  if (role === 'seller') return 'seller'
  if (role === 'support' || role === 'support_agent' || role === 'customer_support') return 'support'
  if (role === 'admin' || role === 'app_admin' || role === 'appadmin') return 'admin'
  return null
}

function identityPayload(payload: unknown): Record<string, unknown> {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const user = objectValue(root.user ?? data.user)
  const identity = objectValue(root.identity ?? data.identity)
  const nested = Object.keys(user).length ? user : identity
  // Some APIs return role beside `user`, while others put all fields in user.
  return { ...root, ...data, ...nested }
}

function roleFrom(raw: Record<string, unknown>): AppRole | null {
  const direct = normalizeRole(raw.role ?? raw.userRole ?? raw.user_role ?? raw.type)
  if (direct) return direct
  const roles = raw.roles ?? raw.authorities
  if (Array.isArray(roles)) {
    for (const value of roles) {
      const candidate = normalizeRole(typeof value === 'object' ? objectValue(value).name : value)
      if (candidate) return candidate
    }
  }
  return null
}

export function mapIdentity(payload: unknown): UserIdentity {
  const raw = identityPayload(payload)
  const id = stringValue(raw.id ?? raw.userId ?? raw.user_id ?? raw.subject ?? raw.sub)
  const role = roleFrom(raw)
  if (!id || !role) throw new AuthApiError('The authentication response did not contain a user id and supported role.')
  return {
    id,
    role,
    ...(stringValue(raw.displayName ?? raw.display_name ?? raw.name) ? { displayName: stringValue(raw.displayName ?? raw.display_name ?? raw.name) } : {}),
    ...(stringValue(raw.email) ? { email: stringValue(raw.email) } : {}),
  }
}

function mapSession(payload: unknown): AuthSession {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const accessToken = stringValue(root.accessToken ?? root.access_token ?? root.token ?? data.accessToken ?? data.access_token ?? data.token)
  if (!accessToken) throw new AuthApiError('The login response did not contain an access token.')
  const userPayload = Object.keys(objectValue(root.user ?? data.user)).length ? { ...root, ...data } : payload
  return {
    accessToken,
    user: mapIdentity(userPayload),
    ...(stringValue(root.expiresAt ?? root.expires_at ?? data.expiresAt ?? data.expires_at) ? { expiresAt: stringValue(root.expiresAt ?? root.expires_at ?? data.expiresAt ?? data.expires_at) } : {}),
    ...(stringValue(root.csrfToken ?? root.csrf_token ?? data.csrfToken ?? data.csrf_token) ? { csrfToken: stringValue(root.csrfToken ?? root.csrf_token ?? data.csrfToken ?? data.csrf_token) } : {}),
  }
}

function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(sessionStorageKey)
    if (!value) return null
    const raw = JSON.parse(value) as unknown
    const session = mapSession(raw)
    return session
  } catch {
    window.localStorage.removeItem(sessionStorageKey)
    return null
  }
}

function readStoredDevIdentity(): UserIdentity | null {
  if (appConfig.environment !== 'dev' || typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(devIdentityStorageKey)
    return value ? mapIdentity(JSON.parse(value)) : null
  } catch {
    window.localStorage.removeItem(devIdentityStorageKey)
    return null
  }
}

function notify() {
  listeners.forEach((listener) => listener())
}

function setSession(session: AuthSession | null) {
  currentSession = session
  if (typeof window !== 'undefined') {
    if (session) window.localStorage.setItem(sessionStorageKey, JSON.stringify(session))
    else window.localStorage.removeItem(sessionStorageKey)
  }
  notify()
}

function setDevIdentity(identity: UserIdentity | null) {
  currentDevIdentity = identity
  if (typeof window !== 'undefined') {
    if (identity) window.localStorage.setItem(devIdentityStorageKey, JSON.stringify(identity))
    else window.localStorage.removeItem(devIdentityStorageKey)
  }
  notify()
}

function authConfigured() {
  return Boolean(appConfig.apiBaseUrl)
}

function unavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'Authentication is unavailable until VITE_API_BASE_URL points to the backend.'
  return 'Sign in with an account to access this protected workspace.'
}

async function readBody(response: Response): Promise<unknown | undefined> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function responseMessage(body: unknown, fallback: string) {
  const raw = objectValue(body)
  const nested = objectValue(raw.error)
  const message = raw.message ?? nested.message ?? raw.detail ?? raw.title
  return stringValue(message) || fallback
}

function actionResult(payload: unknown, fallback: string): AuthActionResult {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const message = stringValue(root.message ?? data.message) || responseMessage(payload, fallback)
  const sessionPayload = Object.keys(root).length ? { ...root, ...data } : payload
  let session: AuthSession | undefined
  try {
    if (stringValue(root.accessToken ?? root.access_token ?? root.token ?? data.accessToken ?? data.access_token ?? data.token)) {
      session = mapSession(sessionPayload)
    }
  } catch {
    // Action endpoints may return a message without a complete session.
  }

  // Development tokens are intentionally parsed only in dev. In every other
  // environment the response is reduced to its user-safe message.
  const developmentToken = appConfig.environment === 'dev'
    ? stringValue(root.developmentToken ?? root.development_token ?? root.localToken ?? root.local_token ?? data.developmentToken ?? data.development_token ?? data.localToken ?? data.local_token ?? root.verificationToken ?? root.verification_token ?? root.resetToken ?? root.reset_token ?? data.verificationToken ?? data.verification_token ?? data.resetToken ?? data.reset_token ?? root.token ?? data.token)
    : ''
  return {
    message,
    ...(developmentToken ? { developmentToken } : {}),
    ...(session ? { session } : {}),
  }
}

async function request(path: string, init: RequestInit = {}) {
  if (!authConfigured()) throw new AuthApiError(unavailableMessage())
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) throw new AuthApiError(responseMessage(body, `Authentication request failed (${response.status})`), response.status)
  return body
}

function currentHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers)
  if (currentSession?.accessToken) {
    result.set('Authorization', `Bearer ${currentSession.accessToken}`)
  } else if (appConfig.environment === 'dev' && currentDevIdentity?.id) {
    // This is intentionally the only code path that can emit the seeded-user
    // header. It is never used for a real session or outside dev.
    result.set('X-User-Id', currentDevIdentity.id)
  }
  return result
}

export const authApi = {
  isAvailable: authConfigured,
  unavailableMessage,
  getIdentity(): UserIdentity | null {
    return currentSession?.user ?? currentDevIdentity
  },
  getSession(): AuthSession | null {
    return currentSession
  },
  hasToken() {
    return Boolean(currentSession?.accessToken)
  },
  isAuthenticated() {
    return Boolean(currentSession?.accessToken || (appConfig.environment === 'dev' && currentDevIdentity))
  },
  hasRole(role: AppRole) {
    return this.getIdentity()?.role === role
  },
  headers(headers?: HeadersInit) {
    return currentHeaders(headers)
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  clear() {
    setSession(null)
    setDevIdentity(null)
  },
  async register(input: { email: string; password: string; displayName: string; role: 'buyer' | 'seller' }) {
    const payload = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: input.email, password: input.password, displayName: input.displayName, requestedRole: input.role.toUpperCase() }),
    })
    try {
      const session = mapSession(payload)
      setDevIdentity(null)
      setSession(session)
      return { identity: session.user, session }
    } catch (error) {
      if (error instanceof AuthApiError && !error.status) return { identity: null, session: null }
      throw error
    }
  },
  async requestPasswordReset(email: string): Promise<AuthActionResult> {
    return actionResult(await request('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    }), 'If the account is eligible, password reset instructions are available.')
  },
  async resetPassword(input: { token: string; newPassword: string }): Promise<AuthActionResult> {
    const result = actionResult(await request('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token: input.token.trim(), newPassword: input.newPassword }),
    }), 'Password reset successful. Sign in with your new password.')
    if (result.session) {
      setDevIdentity(null)
      setSession(result.session)
    } else {
      // Password reset revokes existing bearer sessions on the backend. Do not
      // leave an expired token in localStorage or keep the user apparently signed in.
      setSession(null)
      setDevIdentity(null)
    }
    return result
  },
  async requestEmailVerification(email: string): Promise<AuthActionResult> {
    return actionResult(await request('/api/auth/verification/resend', {
      method: 'POST',
      headers: currentHeaders(),
      body: JSON.stringify({ email: email.trim() }),
    }), 'If the account is eligible, verification instructions are available.')
  },
  async verifyEmail(token: string): Promise<AuthActionResult> {
    const result = actionResult(await request('/api/auth/verify-email', {
      method: 'POST',
      headers: currentHeaders(),
      body: JSON.stringify({ token: token.trim() }),
    }), 'Email verified successfully.')
    if (result.session) {
      setDevIdentity(null)
      setSession(result.session)
    }
    return result
  },
  async login(input: { email: string; password: string }) {
    const session = mapSession(await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }))
    setDevIdentity(null)
    setSession(session)
    return session.user
  },
  async devLogin(role: AppRole) {
    if (appConfig.environment !== 'dev') throw new AuthApiError('Development login is only available in the dev environment.')
    const identity = mapIdentity(await request('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role: role.toUpperCase() }),
    }))
    setSession(null)
    setDevIdentity(identity)
    return identity
  },
  async me() {
    if (!authConfigured()) return null
    try {
      const identity = mapIdentity(await request('/api/auth/me', { headers: currentHeaders() }))
      if (currentSession) setSession({ ...currentSession, user: identity })
      else if (currentDevIdentity) setDevIdentity(identity)
      return identity
    } catch (error) {
      if (error instanceof AuthApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
        this.clear()
        return null
      }
      throw error
    }
  },
  async logout() {
    const session = currentSession
    let error: unknown
    const hasSession = Boolean(session?.accessToken || (appConfig.environment === 'dev' && currentDevIdentity))
    if (hasSession && authConfigured()) {
      try {
        await request('/api/auth/logout', {
          method: 'POST',
          headers: currentHeaders(session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : undefined),
          body: JSON.stringify({}),
        })
      } catch (reason) {
        error = reason
      }
    }
    this.clear()
    if (error) throw error
  },
}
