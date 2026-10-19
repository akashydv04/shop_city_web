import { appConfig } from '../config/environment'
import { authApi } from './authApi'

export type SellerReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
}

export interface SellerOrder {
  id: string
  buyerId: string
  shopId: string
  status: OrderStatus
  total: number
  items: OrderItem[]
  createdAt?: string
}

export interface SellerProfile {
  id?: string
  businessName: string
  contactName: string
  email: string
  phone: string
  address: string
  city: string
  status: SellerReviewStatus
  rejectionReason?: string
}

export type SellerProfileInput = Omit<SellerProfile, 'id' | 'status' | 'rejectionReason'>

export interface SellerShop {
  id: string
  name: string
  slug: string
  description: string
  city: string
  status: SellerReviewStatus
  rejectionReason?: string
}

export interface SellerShopInput {
  name: string
  slug: string
  description: string
  city: string
}

export interface SellerProduct {
  id: string
  shopId: string
  name: string
  description: string
  price: number
  quantity: number
  active: boolean
}

export interface SellerProductInput {
  name: string
  description: string
  price: number
  quantity: number
  active: boolean
}

export interface SellerProductCreateInput {
  name: string
  description: string
  price: number
  initialQuantity: number
}

export interface FulfilmentSettings {
  shopId: string
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryFee: number
}

export interface DeliverySlot {
  id: string
  shopId: string
  date: string
  startTime: string
  endTime: string
  capacity: number
  booked: number
  active: boolean
}

export interface DeliverySlotInput {
  date: string
  startTime: string
  endTime: string
  capacity: number
}

export class SellerApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'SellerApiError'
  }
}

const emptyProfile: SellerProfile = {
  businessName: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  city: 'Gurugram',
  status: 'PENDING',
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? fallback : String(value)
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'false' || value.trim() === '0') return false
    if (value.trim().toLowerCase() === 'true' || value.trim() === '1') return true
  }
  return fallback
}

function statusValue(value: unknown): SellerReviewStatus {
  const status = stringValue(value, 'PENDING').toUpperCase()
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING'
}

function orderStatusValue(value: unknown): OrderStatus {
  const status = stringValue(value, 'PENDING').toUpperCase()
  return status === 'CONFIRMED' || status === 'PREPARING' || status === 'READY' || status === 'COMPLETED' || status === 'CANCELLED' ? status : 'PENDING'
}

function mapOrderItem(payload: unknown): OrderItem {
  const raw = objectValue(payload)
  return {
    productId: stringValue(raw.productId ?? raw.product_id ?? objectValue(raw.product).id),
    productName: stringValue(raw.productName ?? raw.product_name ?? raw.name ?? objectValue(raw.product).name, 'Neighbourhood item'),
    quantity: Math.max(0, Math.floor(numberValue(raw.quantity, 0))),
    unitPrice: Math.max(0, numberValue(raw.unitPrice ?? raw.unit_price ?? raw.price, 0)),
  }
}

export function mapOrder(payload: unknown): SellerOrder {
  const envelope = objectValue(payload)
  const raw = objectValue(envelope.order ?? envelope.data ?? payload)
  const rawItems = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.orderItems) ? raw.orderItems : []
  return {
    id: stringValue(raw.id),
    buyerId: stringValue(raw.buyerId ?? raw.buyer_id ?? objectValue(raw.buyer).id),
    shopId: stringValue(raw.shopId ?? raw.shop_id ?? objectValue(raw.shop).id),
    status: orderStatusValue(raw.status),
    total: Math.max(0, numberValue(raw.total ?? raw.amount, 0)),
    items: rawItems.map(mapOrderItem),
    ...(raw.createdAt || raw.created_at ? { createdAt: String(raw.createdAt ?? raw.created_at) } : {}),
  }
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

function payloadData(payload: unknown, key: string) {
  const root = objectValue(payload)
  return objectValue(root[key] ?? root.data ?? payload)
}

function mapProfile(payload: unknown): SellerProfile {
  const raw = payloadData(payload, 'profile')
  return {
    id: raw.id === undefined ? undefined : String(raw.id),
    businessName: stringValue(raw.businessName ?? raw.business_name),
    contactName: stringValue(raw.contactName ?? raw.contact_name ?? raw.displayName),
    email: stringValue(raw.email),
    phone: stringValue(raw.phone ?? raw.phoneNumber),
    address: stringValue(raw.address),
    city: stringValue(raw.city, 'Gurugram'),
    status: statusValue(raw.status ?? raw.reviewStatus ?? raw.approvalStatus),
    ...(raw.rejectionReason ? { rejectionReason: String(raw.rejectionReason) } : {}),
  }
}

function mapShop(payload: unknown): SellerShop {
  const raw = objectValue(payload)
  return {
    id: String(raw.id ?? ''),
    name: stringValue(raw.name, 'Unnamed shop'),
    slug: stringValue(raw.slug),
    description: stringValue(raw.description),
    city: stringValue(raw.city, 'Gurugram'),
    status: statusValue(raw.status ?? raw.reviewStatus ?? raw.approvalStatus),
    ...(raw.rejectionReason ? { rejectionReason: String(raw.rejectionReason) } : {}),
  }
}

function mapProduct(payload: unknown, fallbackShopId = ''): SellerProduct {
  const envelope = objectValue(payload)
  const data = objectValue(envelope.data)
  const raw = objectValue(envelope.product ?? data.product ?? (Object.keys(data).length ? data : payload))
  return {
    id: stringValue(raw.id),
    shopId: stringValue(raw.shopId ?? raw.shop_id, fallbackShopId),
    name: stringValue(raw.name, 'Unnamed product'),
    description: stringValue(raw.description ?? raw.detail),
    price: Math.max(0, numberValue(raw.price)),
    quantity: Math.max(0, Math.floor(numberValue(raw.quantity ?? raw.availableQuantity ?? raw.inventoryQuantity ?? raw.inventory ?? raw.stock))),
    active: booleanValue(raw.active ?? raw.isActive, true),
  }
}

function mapFulfilment(payload: unknown, fallbackShopId = ''): FulfilmentSettings {
  const envelope = objectValue(payload)
  const data = objectValue(envelope.data)
  const raw = objectValue(envelope.fulfilment ?? envelope.fulfillment ?? envelope.settings ?? data.fulfilment ?? data.fulfillment ?? data ?? payload)
  return {
    shopId: stringValue(raw.shopId ?? raw.shop_id, fallbackShopId),
    deliveryEnabled: booleanValue(raw.deliveryEnabled ?? raw.delivery_enabled ?? raw.delivery, false),
    pickupEnabled: booleanValue(raw.pickupEnabled ?? raw.pickup_enabled ?? raw.pickup, false),
    deliveryFee: Math.max(0, numberValue(raw.deliveryFee ?? raw.delivery_fee, 0)),
  }
}

function mapDeliverySlot(payload: unknown, fallbackShopId = ''): DeliverySlot {
  const envelope = objectValue(payload)
  const data = objectValue(envelope.data)
  const raw = objectValue(envelope.slot ?? envelope.deliverySlot ?? data.slot ?? data.deliverySlot ?? data ?? payload)
  return {
    id: stringValue(raw.id),
    shopId: stringValue(raw.shopId ?? raw.shop_id, fallbackShopId),
    date: stringValue(raw.date ?? raw.slotDate ?? raw.slot_date),
    startTime: stringValue(raw.startTime ?? raw.start_time),
    endTime: stringValue(raw.endTime ?? raw.end_time),
    capacity: Math.max(0, Math.floor(numberValue(raw.capacity, 0))),
    booked: Math.max(0, Math.floor(numberValue(raw.booked ?? raw.bookedCount ?? raw.booked_count, 0))),
    active: booleanValue(raw.active ?? raw.enabled, true),
  }
}

function deliverySlotList(payload: unknown, shopId: string): DeliverySlot[] {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const values: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root.slots)
      ? root.slots
      : Array.isArray(root.deliverySlots)
        ? root.deliverySlots
        : Array.isArray(data.slots)
          ? data.slots
          : Array.isArray(data.deliverySlots)
            ? data.deliverySlots
          : []
  return values.map((value) => mapDeliverySlot(value, shopId)).filter((slot) => slot.id)
}

function isAvailable() {
  return Boolean(appConfig.apiBaseUrl && authApi.hasRole('seller') && authApi.isAuthenticated())
}

function unavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'Seller onboarding is unavailable until VITE_API_BASE_URL points to the backend.'
  return 'Seller onboarding is unavailable until a signed-in seller account is available.'
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

async function request(path: string, init: RequestInit = {}) {
  if (!isAvailable()) throw new SellerApiError(unavailableMessage())
  if (!authApi.hasRole('seller') || !authApi.isAuthenticated()) throw new SellerApiError(unavailableMessage())
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message)
      : `Seller request failed (${response.status})`
    throw new SellerApiError(message, response.status)
  }
  return body
}

export const sellerApi = {
  isAvailable,
  unavailableMessage,
  async getProfile(): Promise<SellerProfile | null> {
    try {
      return mapProfile(await request('/api/seller/profile'))
    } catch (error) {
      if (error instanceof SellerApiError && error.status === 404) return null
      throw error
    }
  },
  async saveProfile(input: SellerProfileInput): Promise<SellerProfile> {
    return mapProfile(await request('/api/seller/profile', { method: 'PUT', body: JSON.stringify(input) }))
  },
  async listShops(): Promise<SellerShop[]> {
    try {
      const payload = await request('/api/seller/shops')
      const root = objectValue(payload)
      const values = Array.isArray(payload) ? payload : Array.isArray(root.shops) ? root.shops : Array.isArray(root.data) ? root.data : []
      return values.map(mapShop)
    } catch (error) {
      if (error instanceof SellerApiError && error.status === 404) return []
      throw error
    }
  },
  async createShop(input: SellerShopInput): Promise<SellerShop> {
    return mapShop(await request('/api/seller/shops', { method: 'POST', body: JSON.stringify(input) }))
  },
  async listProducts(shopId: string): Promise<SellerProduct[]> {
    const payload = await request(`/api/seller/shops/${encodeURIComponent(shopId)}/products`)
    const root = objectValue(payload)
    const nestedData = objectValue(root.data)
    const values: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray(root.products)
        ? root.products
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(nestedData.products)
            ? nestedData.products
          : []
    return values.map((value) => mapProduct(value, shopId)).filter((product) => product.id)
  },
  async createProduct(shopId: string, input: SellerProductCreateInput): Promise<SellerProduct> {
    return mapProduct(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/products`, {
      method: 'POST',
      body: JSON.stringify(input),
    }), shopId)
  },
  async updateProduct(shopId: string, productId: string, input: SellerProductInput): Promise<SellerProduct> {
    const payload = await request(`/api/seller/shops/${encodeURIComponent(shopId)}/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    if (payload !== undefined) return mapProduct(payload, shopId)

    // Some PATCH handlers return 204. Read the product back so the studio only
    // reports success after it can display the persisted server state.
    const saved = (await this.listProducts(shopId)).find((product) => product.id === productId)
    if (!saved) throw new SellerApiError('The product was saved but could not be read back from the backend.')
    return saved
  },
  async getFulfilment(shopId: string): Promise<FulfilmentSettings> {
    try {
      return mapFulfilment(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/fulfilment`), shopId)
    } catch (error) {
      if (error instanceof SellerApiError && error.status === 404) {
        return { shopId, deliveryEnabled: false, pickupEnabled: false, deliveryFee: 0 }
      }
      throw error
    }
  },
  async saveFulfilment(shopId: string, input: Omit<FulfilmentSettings, 'shopId'>): Promise<FulfilmentSettings> {
    return mapFulfilment(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/fulfilment`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }), shopId)
  },
  async listDeliverySlots(shopId: string): Promise<DeliverySlot[]> {
    return deliverySlotList(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/delivery-slots`), shopId)
  },
  async createDeliverySlot(shopId: string, input: DeliverySlotInput): Promise<DeliverySlot> {
    return mapDeliverySlot(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/delivery-slots`, {
      method: 'POST',
      body: JSON.stringify(input),
    }), shopId)
  },
  async toggleDeliverySlot(shopId: string, slotId: string, active: boolean): Promise<DeliverySlot> {
    return mapDeliverySlot(await request(`/api/seller/shops/${encodeURIComponent(shopId)}/delivery-slots/${encodeURIComponent(slotId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }), shopId)
  },
  async listOrders(): Promise<SellerOrder[]> {
    return orderList(await request('/api/seller/orders'))
  },
  async transitionOrder(orderId: string, status: OrderStatus): Promise<SellerOrder> {
    return mapOrder(await request(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }))
  },
  emptyProfile,
}
