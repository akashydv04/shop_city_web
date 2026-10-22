import { appConfig } from '../config/environment'
import { authApi } from './authApi'
import type { Product, Shop } from '../types'

export interface CartLine {
  product: Product
  quantity: number
}

export interface CartSnapshot {
  lines: CartLine[]
  shopId?: string
  shopName?: string
  subtotal?: number
  total?: number
}

export interface CheckoutPreview {
  cartId?: string
  shopId?: string
  subtotal?: number
  deliveryFee?: number
  total?: number
  fulfilmentMethod?: 'PICKUP' | 'DELIVERY'
  slotId?: string
  deliverySlot?: AvailableDeliverySlot
  message: string
  paymentAvailable: boolean
  checkoutStatus?: string
}

export interface AvailableDeliverySlot {
  id: string
  date: string
  startTime: string
  endTime: string
  capacity?: number
  remainingCapacity?: number
}

export interface FulfilmentOptions {
  deliveryEnabled: boolean
  pickupEnabled: boolean
  deliveryFee: number
  slots: AvailableDeliverySlot[]
}

interface ApiCartItem {
  productId?: string | number
  productName?: string
  name?: string
  quantity?: number | string
  unitPrice?: number | string
  price?: number | string
  unit?: string | null
  emoji?: string | null
  shopId?: string | number
  product?: { id?: string | number; name?: string; description?: string; price?: number | string; unit?: string; emoji?: string }
}

interface ApiCart {
  shopId?: string | number
  shopName?: string
  shop?: { id?: string | number; name?: string }
  items?: ApiCartItem[]
  subtotal?: number | string
  total?: number | string
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function unwrapCart(payload: unknown): ApiCart {
  const root = objectValue(payload)
  const nested = root.cart ?? root.data
  return objectValue(nested ?? payload) as ApiCart
}

function mapCart(payload: unknown, products: Product[], shops: Shop[]): CartSnapshot {
  const rawCart = unwrapCart(payload)
  const rawItems = Array.isArray(rawCart.items) ? rawCart.items : []
  const lines = rawItems.flatMap((rawItem) => {
    const item = objectValue(rawItem) as ApiCartItem
    const nestedProduct = objectValue(item.product)
    const productId = String(item.productId ?? nestedProduct.id ?? '')
    if (!productId) return []

    const catalogProduct = products.find((product) => product.id === productId)
    const price = asNumber(item.unitPrice ?? item.price ?? nestedProduct.price) ?? catalogProduct?.price ?? 0
    const product: Product = catalogProduct
      ? { ...catalogProduct, price, ...(item.unit ? { unit: String(item.unit) } : {}) }
      : {
        id: productId,
        shopId: String(item.shopId ?? rawCart.shopId ?? nestedProduct.shopId ?? ''),
        name: String(item.productName ?? item.name ?? nestedProduct.name ?? 'Neighbourhood item'),
        detail: String(nestedProduct.description ?? 'Available from this local shop'),
        price,
        unit: String(item.unit ?? nestedProduct.unit ?? '1 item'),
        emoji: String(item.emoji ?? nestedProduct.emoji ?? '🛒'),
      }
    const quantity = Math.max(0, Math.floor(asNumber(item.quantity) ?? 0))
    return quantity > 0 ? [{ product, quantity }] : []
  })

  const rawShopId = rawCart.shopId ?? rawCart.shop?.id
  const shopId = rawShopId === undefined || rawShopId === null || rawShopId === ''
    ? lines[0]?.product.shopId
    : String(rawShopId)
  const shop = shopId ? shops.find((candidate) => candidate.id === shopId) : undefined
  return {
    lines,
    ...(shopId ? { shopId } : {}),
    ...(rawCart.shopName || rawCart.shop?.name || shop?.name ? { shopName: rawCart.shopName ?? rawCart.shop?.name ?? shop?.name } : {}),
    ...(asNumber(rawCart.subtotal) !== undefined ? { subtotal: asNumber(rawCart.subtotal) } : {}),
    ...(asNumber(rawCart.total) !== undefined ? { total: asNumber(rawCart.total) } : {}),
  }
}

export interface CartApi {
  load(products: Product[], shops: Shop[]): Promise<CartSnapshot>
  addItem(product: Product, products: Product[], shops: Shop[]): Promise<CartSnapshot>
  updateQuantity(productId: string, quantity: number, products: Product[], shops: Shop[]): Promise<CartSnapshot>
  removeItem(productId: string, products: Product[], shops: Shop[]): Promise<CartSnapshot>
  getFulfilmentOptions(shopId: string): Promise<FulfilmentOptions>
  previewCheckout(options: { fulfilmentMethod: 'PICKUP' | 'DELIVERY'; deliverySlotId?: string }): Promise<CheckoutPreview>
}

function ensureEnabled() {
  const identity = authApi.getIdentity()
  if (!appConfig.apiBaseUrl || identity?.role !== 'buyer' || !authApi.isAuthenticated()) {
    throw new Error('Live cart access requires a signed-in buyer account.')
  }
  return identity
}

function mapAvailableSlot(payload: unknown): AvailableDeliverySlot {
  const raw = objectValue(payload)
  const capacity = asNumber(raw.capacity)
  const reserved = asNumber(raw.reservedCount)
  const remainingCapacity = asNumber(raw.remainingCapacity ?? raw.remaining_capacity)
    ?? (capacity !== undefined && reserved !== undefined ? Math.max(0, capacity - reserved) : undefined)
  return {
    id: String(raw.id ?? ''),
    date: String(raw.date ?? raw.localDate ?? raw.slotDate ?? raw.slot_date ?? ''),
    startTime: String(raw.startTime ?? raw.start_time ?? ''),
    endTime: String(raw.endTime ?? raw.end_time ?? ''),
    ...(asNumber(raw.capacity) !== undefined ? { capacity: asNumber(raw.capacity) } : {}),
    ...(remainingCapacity !== undefined ? { remainingCapacity } : {}),
  }
}

function mapFulfilmentOptions(payload: unknown): FulfilmentOptions {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  const raw = objectValue(root.fulfilment ?? root.fulfillment ?? data.fulfilment ?? data.fulfillment ?? root.data ?? payload)
  const rawSlots = Array.isArray(raw.slots) ? raw.slots : Array.isArray(raw.deliverySlots) ? raw.deliverySlots : []
  return {
    deliveryEnabled: raw.deliveryEnabled === undefined && raw.delivery_enabled === undefined ? Boolean(raw.delivery) : Boolean(raw.deliveryEnabled ?? raw.delivery_enabled),
    pickupEnabled: raw.pickupEnabled === undefined && raw.pickup_enabled === undefined ? Boolean(raw.pickup) : Boolean(raw.pickupEnabled ?? raw.pickup_enabled),
    deliveryFee: Math.max(0, asNumber(raw.deliveryFee ?? raw.delivery_fee) ?? 0),
    slots: rawSlots.map(mapAvailableSlot).filter((slot) => slot.id && slot.date && slot.startTime && slot.endTime && (slot.remainingCapacity === undefined || slot.remainingCapacity > 0)),
  }
}

async function request(path: string, init: RequestInit = {}) {
  ensureEnabled()
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await readBody(response)
    const message = body && typeof body === 'object' && 'message' in body ? String((body as { message?: unknown }).message) : `Cart request failed (${response.status})`
    throw new Error(message)
  }
  return response
}

async function readBody(response: Response): Promise<unknown | undefined> {
  if (response.status === 204) return undefined
  const text = await response.text()
  if (!text) return undefined
  try { return JSON.parse(text) as unknown } catch { return text }
}

async function mutate(
  path: string,
  init: RequestInit,
  products: Product[],
  shops: Shop[],
) {
  const identity = ensureEnabled()
  const response = await request(path, init)
  const body = await readBody(response)
  // Do not follow a previous account's mutation with a read using new credentials.
  if (authApi.getIdentity()?.id !== identity.id || authApi.getIdentity()?.role !== identity.role) throw new Error('The signed-in account changed. Reload your cart.')
  return body === undefined ? cartApi.load(products, shops) : mapCart(body, products, shops)
}

export const cartApi: CartApi = {
  async load(products, shops) {
    ensureEnabled()
    const response = await fetch(`${appConfig.apiBaseUrl}/api/carts/current`, { headers: authApi.headers({ Accept: 'application/json' }) })
    // The API returns a 200 empty cart when the buyer has no active cart.
    if (response.status === 204) return { lines: [] }
    if (!response.ok) {
      const body = await readBody(response)
      const message = body && typeof body === 'object' && 'message' in body ? String((body as { message?: unknown }).message) : `Cart request failed (${response.status})`
      throw new Error(message)
    }
    return mapCart(await readBody(response), products, shops)
  },

  addItem(product, products, shops) {
    return mutate('/api/carts/items', {
      method: 'POST',
      body: JSON.stringify({ shopId: product.shopId, productId: product.id, quantity: 1 }),
    }, products, shops)
  },

  updateQuantity(productId, quantity, products, shops) {
    return mutate(`/api/carts/current/items/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }, products, shops)
  },

  removeItem(productId, products, shops) {
    return mutate(`/api/carts/current/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
    }, products, shops)
  },

  async getFulfilmentOptions(shopId) {
    const response = await request(`/api/carts/current/fulfilment-options?shopId=${encodeURIComponent(shopId)}`)
    return mapFulfilmentOptions(await response.json())
  },

  async previewCheckout(options) {
    const response = await request('/api/carts/current/checkout-preview', {
      method: 'POST',
      body: JSON.stringify({ fulfilmentMethod: options.fulfilmentMethod, ...(options.deliverySlotId ? { deliverySlotId: options.deliverySlotId } : {}) }),
    })
    const payload = objectValue(await response.json())
    const rawSlot = payload.deliverySlot ?? payload.slot
    return {
      ...(payload.cartId ? { cartId: String(payload.cartId) } : {}),
      ...(payload.shopId ? { shopId: String(payload.shopId) } : {}),
      subtotal: asNumber(payload.subtotal),
      deliveryFee: asNumber(payload.deliveryFee ?? payload.delivery),
      total: asNumber(payload.total),
      fulfilmentMethod: String(payload.fulfilmentMethod ?? payload.fulfillmentMethod ?? options.fulfilmentMethod).toUpperCase() === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
      ...(payload.slotId ? { slotId: String(payload.slotId) } : {}),
      ...(rawSlot ? { deliverySlot: mapAvailableSlot(rawSlot) } : {}),
      message: String(payload.message ?? 'Checkout preview is ready.'),
      paymentAvailable: Boolean(payload.paymentAvailable),
      ...(payload.checkoutStatus ? { checkoutStatus: String(payload.checkoutStatus) } : {}),
    }
  },
}
