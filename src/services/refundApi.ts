import { appConfig } from '../config/environment'
import { authApi } from './authApi'

export type RefundRequestStatus = 'REQUESTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
export type RefundDecision = 'APPROVE' | 'REJECT'

export interface RefundRequestHistoryEntry {
  status: RefundRequestStatus
  note?: string
  actorName?: string
  createdAt?: string
}

export interface RefundRequest {
  id: string
  orderId: string
  buyerId: string
  buyerName?: string
  buyerEmail?: string
  requestedAmount: number
  approvedAmount?: number
  currency: string
  reason: string
  status: RefundRequestStatus
  decisionNote?: string
  createdAt?: string
  updatedAt?: string
  financialActionRequired: boolean
  automaticMoneyMovement: boolean
  history: RefundRequestHistoryEntry[]
}

export interface CreateRefundRequestInput {
  orderId: string
  amount: number
  reason: string
  idempotencyKey: string
}

export class RefundApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'RefundApiError'
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? fallback : String(value)
}

function numberValue(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function statusValue(value: unknown): RefundRequestStatus {
  const status = stringValue(value, 'REQUESTED').toUpperCase().replace(/[-\s]/g, '_')
  if (status === 'IN_REVIEW') return 'UNDER_REVIEW'
  if (status === 'UNDER_REVIEW' || status === 'APPROVED' || status === 'REJECTED' || status === 'PROCESSING' || status === 'COMPLETED' || status === 'FAILED') return status
  return 'REQUESTED'
}

function refundPayload(payload: unknown): Record<string, unknown> {
  const envelope = objectValue(payload)
  const data = objectValue(envelope.data)
  const nested = objectValue(envelope.refundRequest ?? envelope.refund_request ?? data.refundRequest ?? data.refund_request ?? envelope.refund ?? data.refund)
  return Object.keys(nested).length ? nested : Object.keys(data).length ? data : envelope
}

function mapHistory(value: unknown): RefundRequestHistoryEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
      const raw = objectValue(entry)
    const note = stringValue(raw.note ?? raw.decisionNote ?? raw.decision_note ?? raw.reason)
    const actor = objectValue(raw.actor ?? raw.user ?? raw.operator)
    return {
      status: statusValue(raw.status ?? raw.state ?? raw.toStatus ?? raw.to_status),
      ...(note ? { note } : {}),
      ...(stringValue(raw.actorName ?? raw.actor_name ?? actor.displayName ?? actor.name) ? { actorName: stringValue(raw.actorName ?? raw.actor_name ?? actor.displayName ?? actor.name) } : {}),
       ...(stringValue(raw.createdAt ?? raw.created_at ?? raw.timestamp) ? { createdAt: stringValue(raw.createdAt ?? raw.created_at ?? raw.timestamp) } : {}),
    }
  })
}

export function mapRefundRequest(payload: unknown): RefundRequest {
  const raw = refundPayload(payload)
  const buyer = objectValue(raw.buyer ?? raw.customer ?? raw.user)
  const requestedAmount = numberValue(raw.requestedAmount ?? raw.requested_amount ?? raw.amount ?? raw.refundAmount ?? raw.refund_amount)
  return {
    id: stringValue(raw.id ?? raw.refundRequestId ?? raw.refund_request_id ?? raw.requestId ?? raw.request_id),
    orderId: stringValue(raw.orderId ?? raw.order_id ?? objectValue(raw.order).id),
    buyerId: stringValue(raw.buyerId ?? raw.buyer_id ?? raw.requesterId ?? raw.requester_id ?? raw.customerId ?? raw.customer_id ?? buyer.id),
    ...(stringValue(raw.buyerName ?? raw.buyer_name ?? buyer.displayName ?? buyer.name) ? { buyerName: stringValue(raw.buyerName ?? raw.buyer_name ?? buyer.displayName ?? buyer.name) } : {}),
    ...(stringValue(raw.buyerEmail ?? raw.buyer_email ?? buyer.email) ? { buyerEmail: stringValue(raw.buyerEmail ?? raw.buyer_email ?? buyer.email) } : {}),
     requestedAmount,
    ...(raw.approvedAmount !== undefined || raw.approved_amount !== undefined ? { approvedAmount: numberValue(raw.approvedAmount ?? raw.approved_amount) } : {}),
    currency: stringValue(raw.currency ?? raw.currencyCode ?? raw.currency_code, 'INR').toUpperCase(),
    reason: stringValue(raw.reason ?? raw.reasonCode ?? raw.reason_code ?? raw.description, 'No reason provided.'),
    status: statusValue(raw.status ?? raw.refundStatus ?? raw.refund_status ?? raw.state),
    ...(stringValue(raw.decisionNote ?? raw.decision_note ?? raw.note) ? { decisionNote: stringValue(raw.decisionNote ?? raw.decision_note ?? raw.note) } : {}),
      ...(stringValue(raw.createdAt ?? raw.created_at ?? raw.requestedAt ?? raw.requested_at) ? { createdAt: stringValue(raw.createdAt ?? raw.created_at ?? raw.requestedAt ?? raw.requested_at) } : {}),
      ...(stringValue(raw.updatedAt ?? raw.updated_at ?? raw.requestedAt ?? raw.requested_at) ? { updatedAt: stringValue(raw.updatedAt ?? raw.updated_at ?? raw.requestedAt ?? raw.requested_at) } : {}),
    financialActionRequired: raw.financialActionRequired === true || raw.financial_action_required === true,
    automaticMoneyMovement: raw.automaticMoneyMovement === true || raw.automatic_money_movement === true,
      history: mapHistory(raw.history ?? raw.auditHistory ?? raw.audit_history ?? raw.statusHistory ?? raw.status_history),
  }
}

function listPayload(payload: unknown): RefundRequest[] {
  if (Array.isArray(payload)) return payload.map(mapRefundRequest).filter((item) => item.id)
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const values = [root.refunds, root.refundRequests, root.refund_requests, root.items, root.results, root.data, data.refunds, data.refundRequests, data.refund_requests, data.items]
    .find((value): value is unknown[] => Array.isArray(value))
  return (values ?? []).map(mapRefundRequest).filter((item) => item.id)
}

function customerAvailable() {
  return Boolean(appConfig.apiBaseUrl && authApi.hasRole('buyer') && authApi.isAuthenticated())
}

function reviewerAvailable() {
  return Boolean(appConfig.apiBaseUrl && (authApi.hasRole('support') || authApi.hasRole('admin')) && authApi.isAuthenticated())
}

function unavailableMessage(access: 'customer' | 'reviewer') {
  if (!appConfig.apiBaseUrl) return 'Refund requests are unavailable until VITE_API_BASE_URL points to the backend.'
  return access === 'customer' ? 'Refund requests require a signed-in buyer account.' : 'Refund review requires a signed-in Support or Admin account.'
}

async function readBody(response: Response): Promise<unknown | undefined> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try { return JSON.parse(text) as unknown } catch { return text }
}

async function request(path: string, init: RequestInit, access: 'customer' | 'reviewer') {
  const available = access === 'customer' ? customerAvailable() : reviewerAvailable()
  if (!available) throw new RefundApiError(unavailableMessage(access))
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) {
    const root = objectValue(body)
    const nested = objectValue(root.error)
    const message = stringValue(root.message ?? nested.message ?? root.detail) || `Refund request failed (${response.status})`
    throw new RefundApiError(message, response.status)
  }
  return body
}

export const refundApi = {
  customerAvailable,
  reviewerAvailable,
  customerUnavailableMessage: () => unavailableMessage('customer'),
  reviewerUnavailableMessage: () => unavailableMessage('reviewer'),
  async create(input: CreateRefundRequestInput) {
    if (!input.orderId || !Number.isFinite(input.amount) || input.amount <= 0 || !input.reason.trim()) throw new RefundApiError('Choose an order, enter a positive refund amount, and provide a reason.')
    const idempotencyKey = input.idempotencyKey?.trim()
    if (!idempotencyKey || idempotencyKey.length > 200) throw new RefundApiError('A stable submission key of 1–200 characters is required to submit or retry a refund request.')
    const created = mapRefundRequest(await request(`/api/orders/${encodeURIComponent(input.orderId)}/refund-requests`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ amount: input.amount, reason: input.reason.trim() }),
    }, 'customer'))
    if (!created.id) throw new RefundApiError('The server did not return the refund request. Retry with the same submission key to confirm the result.')
    return created
  },
  async listMine() {
    return listPayload(await request('/api/refunds', {}, 'customer'))
  },
  async getMine(id: string) {
    const found = (await this.listMine()).find((item) => item.id === id)
    if (!found) throw new RefundApiError('Refund request was not found in your account history.', 404)
    return found
  },
  async listQueue() {
    const [requested, underReview, approved] = await Promise.all([
      request('/api/refunds?status=REQUESTED', {}, 'reviewer'),
      request('/api/refunds?status=UNDER_REVIEW', {}, 'reviewer'),
      request('/api/refunds?status=APPROVED', {}, 'reviewer'),
    ])
    const byId = new Map([...listPayload(requested), ...listPayload(underReview), ...listPayload(approved)].map((item) => [item.id, item]))
    return [...byId.values()]
  },
  async getForReview(id: string) {
    const found = (await this.listQueue()).find((item) => item.id === id)
    if (!found) throw new RefundApiError('Refund request was not found in the review queue.', 404)
    return found
  },
  async decide(id: string, decision: RefundDecision, decisionNote: string) {
    if (!decisionNote.trim()) throw new RefundApiError('A decision note is required before approving or rejecting a refund request.')
    return mapRefundRequest(await request(`/api/refunds/${encodeURIComponent(id)}/decision`, { method: 'PATCH', body: JSON.stringify({ decision: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', note: decisionNote.trim() }) }, 'reviewer'))
  },
  async completeSandbox(id: string) {
    if (appConfig.environment !== 'dev') throw new RefundApiError('Sandbox refund completion is available only in development.')
    return mapRefundRequest(await request(`/api/refunds/${encodeURIComponent(id)}/sandbox-complete`, { method: 'POST' }, 'reviewer'))
  },
  async sandboxComplete(id: string) {
    return this.completeSandbox(id)
  },
}
