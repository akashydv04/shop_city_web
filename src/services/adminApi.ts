import { appConfig } from '../config/environment'
import type { SellerReviewStatus } from './sellerApi'
import { authApi } from './authApi'

export interface AdminSellerDetails {
  id?: string
  businessName: string
  contactName: string
  email: string
  phone: string
  address: string
}

export interface AdminShop {
  id: string
  name: string
  slug: string
  description: string
  city: string
  status: SellerReviewStatus
  rejectionReason?: string
  seller: AdminSellerDetails
}

export class AdminApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'AdminApiError'
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? fallback : String(value)
}

function statusValue(value: unknown): SellerReviewStatus {
  const status = stringValue(value, 'PENDING').toUpperCase()
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING'
}

function mapShop(value: unknown): AdminShop {
  const raw = objectValue(value)
  const shop = objectValue(raw.shop ?? raw)
  const seller = objectValue(raw.seller ?? raw.sellerProfile ?? shop.seller ?? shop.sellerProfile ?? raw.owner)
  const sellerName = seller.name ?? seller.businessName ?? seller.business_name ?? raw.sellerName ?? raw.sellerBusinessName ?? raw.businessName
  return {
    id: stringValue(shop.id ?? raw.shopId),
    name: stringValue(shop.name ?? shop.title, 'Unnamed shop'),
    slug: stringValue(shop.slug),
    description: stringValue(shop.description),
    city: stringValue(shop.city, 'Gurugram'),
    status: statusValue(shop.status ?? shop.reviewStatus ?? shop.approvalStatus ?? raw.status),
    ...(shop.rejectionReason || raw.rejectionReason ? { rejectionReason: String(shop.rejectionReason ?? raw.rejectionReason) } : {}),
    seller: {
      id: seller.id === undefined && raw.sellerId === undefined ? undefined : stringValue(seller.id ?? raw.sellerId),
      businessName: stringValue(seller.businessName ?? seller.business_name ?? sellerName, 'Seller business'),
      contactName: stringValue(seller.contactName ?? seller.contact_name ?? seller.displayName ?? seller.name ?? raw.sellerContactName),
      email: stringValue(seller.email ?? raw.sellerEmail),
      phone: stringValue(seller.phone ?? seller.phoneNumber ?? raw.sellerPhone),
      address: stringValue(seller.address ?? raw.sellerAddress),
    },
  }
}

function mapQueue(payload: unknown): AdminShop[] {
  const root = objectValue(payload)
  const nestedData = objectValue(root.data)
  const values = Array.isArray(payload)
    ? payload
    : Array.isArray(root.shops)
      ? root.shops
      : Array.isArray(root.pendingShops)
        ? root.pendingShops
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(nestedData.shops)
            ? nestedData.shops
          : []
  return values.map(mapShop).filter((shop) => shop.id)
}

function isAvailable() {
  return Boolean(appConfig.apiBaseUrl && authApi.hasRole('admin') && authApi.isAuthenticated())
}

function unavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'The admin console is unavailable until VITE_API_BASE_URL points to the backend.'
  return 'The admin console is unavailable until a signed-in app admin is available.'
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
  if (!isAvailable()) throw new AdminApiError(unavailableMessage())
  if (!authApi.hasRole('admin') || !authApi.isAuthenticated()) throw new AdminApiError(unavailableMessage())
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message)
      : `Admin request failed (${response.status})`
    throw new AdminApiError(message, response.status)
  }
  return body
}

export const adminApi = {
  isAvailable,
  unavailableMessage,
  async listPending(): Promise<AdminShop[]> {
    return mapQueue(await request('/api/admin/shops?status=PENDING'))
  },
  async approve(shopId: string): Promise<AdminShop | null> {
    const body = await request(`/api/admin/shops/${encodeURIComponent(shopId)}/approve`, { method: 'POST' })
    return body === undefined ? null : mapShop(body)
  },
  async reject(shopId: string, reason?: string): Promise<AdminShop | null> {
    const trimmedReason = reason?.trim()
    const body = await request(`/api/admin/shops/${encodeURIComponent(shopId)}/reject`, {
      method: 'POST',
      ...(trimmedReason ? { body: JSON.stringify({ reason: trimmedReason }) } : {}),
    })
    return body === undefined ? null : mapShop(body)
  },
}
