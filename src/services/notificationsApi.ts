import { appConfig } from '../config/environment'
import { authApi, type AppRole } from './authApi'

export interface AppNotification {
  id: string
  title: string
  message: string
  read: boolean
  readAt?: string
  createdAt?: string
  type?: string
  relatedEntityType?: string
  relatedEntityId?: string
  href?: string
}

export class NotificationsApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'NotificationsApiError'
  }
}

const listeners = new Set<() => void>()

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value)
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.toLowerCase() === 'true'
  return fallback
}

function responseMessage(body: unknown, fallback: string) {
  const raw = objectValue(body)
  const error = objectValue(raw.error)
  return stringValue(raw.message ?? error.message ?? raw.detail ?? raw.title) || fallback
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

function available() {
  return Boolean(appConfig.apiBaseUrl && authApi.isAuthenticated())
}

function unavailableMessage() {
  if (!appConfig.apiBaseUrl) return 'Notifications are unavailable until VITE_API_BASE_URL points to the backend.'
  return 'Sign in with an account to access your notifications.'
}

async function request(path: string, init: RequestInit = {}) {
  if (!available()) throw new NotificationsApiError(unavailableMessage())
  const headers = authApi.headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, { ...init, headers })
  const body = await readBody(response)
  if (!response.ok) throw new NotificationsApiError(responseMessage(body, `Notification request failed (${response.status})`), response.status)
  return body
}

function payloadRoot(payload: unknown) {
  const root = objectValue(payload)
  const data = objectValue(root.data)
  return { root, data }
}

function listPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const { root, data } = payloadRoot(payload)
  for (const candidate of [root.notifications, root.items, root.results, root.data, data.notifications, data.items, data.results, data.content]) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function safeHashHref(rawType: string, role: AppRole): string | undefined {
  const type = rawType.toLowerCase().replace(/[-\s]/g, '_')
  if (type.includes('support') || type.includes('case') || type.includes('ticket')) {
    return role === 'buyer' || role === 'support' || role === 'admin' ? '#support' : undefined
  }
  if (type.includes('refund')) {
    return role === 'buyer' ? '#orders' : role === 'support' || role === 'admin' ? '#support' : undefined
  }
  if (type.includes('order')) {
    if (role === 'buyer') return '#orders'
    if (role === 'seller') return '#seller'
    return undefined
  }
  if (type.includes('seller') || type.includes('product') || type.includes('shop')) {
    if (role === 'seller') return '#seller'
    if (role === 'admin') return '#admin'
    return undefined
  }
  if (type.includes('admin') || type.includes('review')) return role === 'admin' ? '#admin' : undefined
  // Ignore server-provided external URLs. Notification links are restricted to
  // known in-app destinations so a notification cannot turn into an open redirect.
  if (type.includes('notification')) return '#notifications'
  return undefined
}

function normalizeNotification(value: unknown, role: AppRole): AppNotification | null {
  const raw = objectValue(value)
  const id = stringValue(raw.id ?? raw.notificationId ?? raw.notification_id)
  if (!id) return null
  const related = objectValue(raw.related ?? raw.entity ?? raw.reference)
  const relatedEntityType = stringValue(raw.relatedEntityType ?? raw.related_entity_type ?? raw.relatedType ?? raw.related_type ?? raw.entityType ?? raw.entity_type ?? raw.referenceType ?? raw.reference_type ?? related.type)
  const relatedEntityId = stringValue(raw.relatedEntityId ?? raw.related_entity_id ?? raw.relatedId ?? raw.related_id ?? raw.entityId ?? raw.entity_id ?? raw.referenceId ?? raw.reference_id ?? related.id)
  const readAt = stringValue(raw.readAt ?? raw.read_at)
  const type = stringValue(raw.type ?? raw.event)
  const href = safeHashHref(relatedEntityType || type, role)
  return {
    id,
    title: stringValue(raw.title ?? raw.subject ?? raw.event ?? raw.type) || 'Notification',
    message: stringValue(raw.message ?? raw.body ?? raw.description ?? raw.text) || 'You have an update from DukaanSetu.',
    read: 'readAt' in raw || 'read_at' in raw ? Boolean(readAt) : booleanValue(raw.read ?? raw.isRead ?? raw.is_read ?? raw.seen, false),
    ...(readAt ? { readAt } : {}),
    ...(stringValue(raw.createdAt ?? raw.created_at ?? raw.timestamp ?? raw.sentAt ?? raw.sent_at) ? { createdAt: stringValue(raw.createdAt ?? raw.created_at ?? raw.timestamp ?? raw.sentAt ?? raw.sent_at) } : {}),
    ...(type ? { type } : {}),
    ...(relatedEntityType ? { relatedEntityType } : {}),
    ...(relatedEntityId ? { relatedEntityId } : {}),
    ...(href ? { href } : {}),
  }
}

function parseUnreadCount(payload: unknown) {
  if (typeof payload === 'number') return payload
  const { root, data } = payloadRoot(payload)
  const value = root.unreadCount ?? root.unread_count ?? root.unread ?? root.count ?? (typeof root.data === 'number' ? root.data : undefined) ?? data.unreadCount ?? data.unread_count ?? data.unread ?? data.count
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function notifyChanged() {
  listeners.forEach((listener) => listener())
}

export const notificationsApi = {
  isAvailable: available,
  unavailableMessage,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  async list(): Promise<AppNotification[]> {
    const identity = authApi.getIdentity()
    if (!identity) throw new NotificationsApiError(unavailableMessage())
    const payload = await request('/api/notifications')
    return listPayload(payload).map((item) => normalizeNotification(item, identity.role)).filter((item): item is AppNotification => Boolean(item))
  },
  async unreadCount() {
    return parseUnreadCount(await request('/api/notifications/unread-count'))
  },
  async markRead(id: string) {
    const payload = await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
    notifyChanged()
    const { root, data } = payloadRoot(payload)
    return stringValue(root.readAt ?? root.read_at ?? data.readAt ?? data.read_at) || undefined
  },
  async markAllRead() {
    await request('/api/notifications/read-all', { method: 'POST' })
    notifyChanged()
  },
  roleHref(type: string | undefined, _id: string | undefined, role: AppRole) {
    return safeHashHref(type ?? '', role)
  },
}
