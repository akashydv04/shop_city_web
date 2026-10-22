import { appConfig } from '../config/environment'
import { authApi } from './authApi'

export type SupportCaseStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'CLOSED'

export interface SupportCase {
  id: string
  customerId: string
  orderId?: string
  shopId?: string
  reason: string
  description: string
  status: SupportCaseStatus
  resolutionNote?: string
  createdAt?: string
  updatedAt?: string
  customerName?: string
  customerEmail?: string
}

export interface CreateSupportCaseInput {
  orderId?: string
  shopId?: string
  reason: string
  description: string
}

export interface UpdateSupportCaseInput {
  status: SupportCaseStatus
  resolutionNote?: string
}

export class SupportApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'SupportApiError'
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? fallback : String(value)
}

function caseStatus(value: unknown): SupportCaseStatus {
  const status = stringValue(value, 'OPEN').toUpperCase().replace(/[-\s]/g, '_')
  if (status === 'IN_REVIEW' || status === 'RESOLVED' || status === 'CLOSED') return status
  return 'OPEN'
}

function casePayload(payload: unknown): Record<string, unknown> {
  const envelope = objectValue(payload)
  const data = objectValue(envelope.data)
  const nested = objectValue(envelope.case ?? data.case)
  return Object.keys(nested).length ? nested : Object.keys(data).length ? data : envelope
}

export function mapSupportCase(payload: unknown): SupportCase {
  const raw = casePayload(payload)
  const customer = objectValue(raw.customer ?? raw.buyer ?? raw.user)
  return {
    id: stringValue(raw.id ?? raw.caseId ?? raw.case_id),
    customerId: stringValue(raw.customerId ?? raw.customer_id ?? raw.buyerId ?? raw.buyer_id ?? customer.id),
    ...(stringValue(raw.orderId ?? raw.order_id ?? objectValue(raw.order).id) ? { orderId: stringValue(raw.orderId ?? raw.order_id ?? objectValue(raw.order).id) } : {}),
    ...(stringValue(raw.shopId ?? raw.shop_id ?? objectValue(raw.shop).id) ? { shopId: stringValue(raw.shopId ?? raw.shop_id ?? objectValue(raw.shop).id) } : {}),
    reason: stringValue(raw.reasonCode ?? raw.reason_code ?? raw.reason ?? raw.category, 'Other'),
    description: stringValue(raw.description ?? raw.message),
    status: caseStatus(raw.status ?? raw.caseStatus ?? raw.case_status),
    ...(stringValue(raw.resolutionNote ?? raw.resolution_note ?? raw.note) ? { resolutionNote: stringValue(raw.resolutionNote ?? raw.resolution_note ?? raw.note) } : {}),
    ...(raw.createdAt || raw.created_at ? { createdAt: String(raw.createdAt ?? raw.created_at) } : {}),
    ...(raw.updatedAt || raw.updated_at ? { updatedAt: String(raw.updatedAt ?? raw.updated_at) } : {}),
    ...(stringValue(customer.displayName ?? customer.name) ? { customerName: stringValue(customer.displayName ?? customer.name) } : {}),
    ...(stringValue(customer.email) ? { customerEmail: stringValue(customer.email) } : {}),
  }
}

function caseList(payload: unknown): SupportCase[] {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const values: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root.cases)
      ? root.cases
      : Array.isArray(root.items)
        ? root.items
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(data.cases)
            ? data.cases
            : []
  return values.map(mapSupportCase).filter((item) => item.id)
}

function customerAvailable() {
  return Boolean(appConfig.apiBaseUrl && authApi.hasRole('buyer') && authApi.isAuthenticated())
}

function queueAvailable() {
  return Boolean(appConfig.apiBaseUrl && (authApi.hasRole('support') || authApi.hasRole('admin')) && authApi.isAuthenticated())
}

function customerUnavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'Customer support cases are unavailable until VITE_API_BASE_URL points to the backend.'
  return 'Customer support cases are unavailable until a signed-in buyer account is available.'
}

function queueUnavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'The support queue is unavailable until VITE_API_BASE_URL points to the backend.'
  return 'The support queue requires a signed-in Support or Admin account.'
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

async function request(path: string, init: RequestInit, access: 'customer' | 'queue') {
  const available = access === 'customer' ? customerAvailable() : queueAvailable()
  if (!available) throw new SupportApiError(access === 'customer' ? customerUnavailableMessage() : queueUnavailableMessage())
  const allowed = access === 'customer' ? authApi.hasRole('buyer') : authApi.hasRole('support') || authApi.hasRole('admin')
  if (!allowed || !authApi.isAuthenticated()) throw new SupportApiError(access === 'customer' ? customerUnavailableMessage() : queueUnavailableMessage())
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message)
      : `Support case request failed (${response.status})`
    throw new SupportApiError(message, response.status)
  }
  return body
}

export const customerSupportApi = {
  isAvailable: customerAvailable,
  unavailableMessage: customerUnavailableMessage,
  async createCase(input: CreateSupportCaseInput) {
    return mapSupportCase(await request('/api/support/cases', { method: 'POST', body: JSON.stringify({ reasonCode: input.reason, description: input.description, ...(input.orderId ? { orderId: input.orderId } : {}), ...(input.shopId ? { shopId: input.shopId } : {}) }) }, 'customer'))
  },
  async listCases() {
    return caseList(await request('/api/support/cases', {}, 'customer'))
  },
  async getCase(caseId: string) {
    return mapSupportCase(await request(`/api/support/cases/${encodeURIComponent(caseId)}`, {}, 'customer'))
  },
  create(input: CreateSupportCaseInput) {
    return this.createCase(input)
  },
  list() {
    return this.listCases()
  },
  detail(caseId: string) {
    return this.getCase(caseId)
  },
}

export const supportApi = {
  isAvailable: queueAvailable,
  unavailableMessage: queueUnavailableMessage,
  async listQueue(status?: SupportCaseStatus) {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    return caseList(await request(`/api/support/queue${query}`, {}, 'queue'))
  },
  async getCase(caseId: string) {
    // The individual case endpoint is buyer-only; the operator queue returns
    // the full case payload and is authorized for both Support and Admin.
    const cases = await this.listQueue()
    const supportCase = cases.find((item) => item.id === caseId)
    if (!supportCase) throw new SupportApiError('Support case not found in the queue.', 404)
    return supportCase
  },
  async updateStatus(caseId: string, input: UpdateSupportCaseInput) {
    return mapSupportCase(await request(`/api/support/cases/${encodeURIComponent(caseId)}/status`, { method: 'PATCH', body: JSON.stringify(input) }, 'queue'))
  },
  listCases(status?: SupportCaseStatus) {
    return this.listQueue(status)
  },
  detail(caseId: string) {
    return this.getCase(caseId)
  },
  updateCaseStatus(caseId: string, input: UpdateSupportCaseInput) {
    return this.updateStatus(caseId, input)
  },
}

// Keep the customer-facing adapter name short for callers that treat support
// cases as the customer's resource, while retaining the descriptive export
// used by the view.
export const customerApi = customerSupportApi
