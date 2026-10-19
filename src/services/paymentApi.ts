import { appConfig } from '../config/environment'
import { authApi } from './authApi'

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED'

export interface PaymentIntent {
  id: string
  orderId?: string
  amount?: number
  currency?: string
  status: PaymentStatus
  message?: string
}

export class PaymentApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'PaymentApiError'
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function statusValue(value: unknown): PaymentStatus {
  const status = stringValue(value).toUpperCase()
  if (status === 'SUCCEEDED' || status === 'SUCCESS' || status === 'CONFIRMED' || status === 'PAID') return 'SUCCEEDED'
  if (status === 'FAILED' || status === 'FAILURE' || status === 'CANCELLED' || status === 'CANCELED') return 'FAILED'
  return 'PENDING'
}

function isAvailable() {
  return appConfig.environment === 'dev' && Boolean(appConfig.apiBaseUrl && authApi.hasRole('buyer') && authApi.isAuthenticated())
}

function unavailableMessage() {
  if (appConfig.environment !== 'dev') return 'Sandbox payment is available only in the dev environment.'
  if (!appConfig.apiBaseUrl) return 'Sandbox payment needs VITE_API_BASE_URL pointing to the backend.'
  return 'Sandbox payment needs a signed-in buyer account.'
}

function mapIntent(payload: unknown): PaymentIntent {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const nested = root.paymentIntent ?? root.payment_intent ?? data.paymentIntent ?? data.payment_intent ?? root.attempt ?? data.attempt
  const raw = objectValue(nested ?? (Object.keys(data).length ? data : payload))
  const orderId = stringValue(root.orderId ?? root.order_id ?? raw.orderId ?? raw.order_id)
  const id = orderId || stringValue(raw.id ?? raw.paymentIntentId ?? raw.payment_intent_id ?? raw.providerReference ?? raw.provider_reference)
  if (!id) throw new PaymentApiError('The payment response did not contain a payment reference.')
  return {
    id,
    ...(orderId ? { orderId } : {}),
    ...(numberValue(root.amount ?? raw.amount ?? raw.amountMinor ?? raw.amount_minor) !== undefined ? { amount: numberValue(root.amount ?? raw.amount ?? raw.amountMinor ?? raw.amount_minor) } : {}),
    ...(stringValue(root.currency ?? raw.currency ?? raw.currencyCode ?? raw.currency_code) ? { currency: stringValue(root.currency ?? raw.currency ?? raw.currencyCode ?? raw.currency_code).toUpperCase() } : {}),
    status: statusValue(root.orderPaymentStatus ?? root.order_payment_status ?? root.status ?? raw.status ?? raw.state ?? raw.paymentStatus ?? raw.payment_status),
    ...(stringValue(raw.message) ? { message: stringValue(raw.message) } : {}),
  }
}

async function readBody(response: Response): Promise<unknown | undefined> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try { return JSON.parse(text) as unknown } catch { return text }
}

function errorMessage(body: unknown, fallback: string) {
  const root = objectValue(body)
  const nested = objectValue(root.error)
  return stringValue(root.message ?? nested.message ?? root.detail) || fallback
}

async function request(path: string, init: RequestInit = {}) {
  if (!isAvailable()) throw new PaymentApiError(unavailableMessage())
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) throw new PaymentApiError(errorMessage(body, `Payment request failed (${response.status})`), response.status)
  return body
}

export interface PaymentApi {
  isAvailable: typeof isAvailable
  unavailableMessage: typeof unavailableMessage
  createSandboxIntent(input: { orderId: string; idempotencyKey: string }): Promise<PaymentIntent>
  getIntent(intentId: string): Promise<PaymentIntent>
}

export const paymentApi: PaymentApi = {
  isAvailable,
  unavailableMessage,
  async createSandboxIntent({ orderId, idempotencyKey }) {
    if (!orderId) throw new PaymentApiError('A backend order is required before requesting payment.')
    if (!idempotencyKey.trim()) throw new PaymentApiError('An idempotency key is required before requesting payment.')
    return mapIntent(await request(`/api/orders/${encodeURIComponent(orderId)}/payment-intents`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({}),
    }))
  },
  async getIntent(orderId) {
    if (!orderId) throw new PaymentApiError('An order id is required.')
    return mapIntent(await request(`/api/orders/${encodeURIComponent(orderId)}/payment`))
  },
}
