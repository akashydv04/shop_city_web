import { appConfig } from '../config/environment'
import { mapOrder, type SellerOrder } from './sellerApi'
import { authApi } from './authApi'

export class OrderApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'OrderApiError'
  }
}

function isAvailable() {
  return Boolean(appConfig.apiBaseUrl && authApi.hasRole('buyer') && authApi.isAuthenticated())
}

function unavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'Orders are unavailable until VITE_API_BASE_URL points to the backend.'
  return 'Orders are unavailable until a signed-in buyer account is available.'
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function orderList(payload: unknown): SellerOrder[] {
  const root = objectValue(payload)
  const values: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root.orders)
      ? root.orders
      : Array.isArray(root.data)
        ? root.data
        : Array.isArray(objectValue(root.data).orders)
          ? objectValue(root.data).orders as unknown[]
          : []
  return values.map(mapOrder).filter((order) => order.id)
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

async function request(path: string) {
  if (!isAvailable()) throw new OrderApiError(unavailableMessage())
  if (!authApi.hasRole('buyer') || !authApi.isAuthenticated()) throw new OrderApiError(unavailableMessage())
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    headers: authApi.headers({ Accept: 'application/json' }),
  })
  const body = await readBody(response)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message)
      : `Order request failed (${response.status})`
    throw new OrderApiError(message, response.status)
  }
  return body
}

export interface CreateOrderInput {
  shopId: string
  items: Array<{ productId: string; quantity: number }>
}

export interface OrderApi {
  isAvailable: typeof isAvailable
  unavailableMessage: typeof unavailableMessage
  listHistory(): Promise<SellerOrder[]>
  getDetail(orderId: string): Promise<SellerOrder>
  create(input: CreateOrderInput, idempotencyKey: string): Promise<SellerOrder>
}

export const orderApi: OrderApi = {
  isAvailable,
  unavailableMessage,
  async listHistory() {
    return orderList(await request('/api/orders'))
  },
  async getDetail(orderId) {
    return mapOrder(await request(`/api/orders/${encodeURIComponent(orderId)}`))
  },
  async create(input, idempotencyKey) {
    if (!idempotencyKey.trim()) throw new OrderApiError('An idempotency key is required before creating an order.')
    if (!input.shopId || !input.items.length) throw new OrderApiError('The order needs a shop and at least one item.')
    if (!isAvailable()) throw new OrderApiError(unavailableMessage())
    const response = await fetch(`${appConfig.apiBaseUrl}/api/orders`, {
      method: 'POST',
      headers: authApi.headers({ Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify(input),
    })
    const body = await readBody(response)
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message?: unknown }).message)
        : `Order request failed (${response.status})`
      throw new OrderApiError(message, response.status)
    }
    return mapOrder(body)
  },
}
