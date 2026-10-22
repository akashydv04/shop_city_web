import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, Check, CircleAlert, ExternalLink, RefreshCw } from 'lucide-react'
import { authApi } from './services/authApi'
import AuthControls from './AuthControls'
import NotificationBell from './NotificationBell'
import { notificationsApi, type AppNotification } from './services/notificationsApi'

function formatDate(value?: string) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function NotificationsView() {
  const identity = authApi.getIdentity()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(isRefresh = false) {
    if (!notificationsApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setNotifications(await notificationsApi.list())
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function markRead(notification: AppNotification): Promise<boolean> {
    if (notification.read) return true
    if (busyId) return false
    setBusyId(notification.id)
    setError(null)
    try {
      const readAt = await notificationsApi.markRead(notification.id)
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true, readAt } : item))
      return true
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'This notification could not be marked as read.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function markAllRead() {
    if (markingAll || !notifications.some((item) => !item.read)) return
    setMarkingAll(true)
    setError(null)
    try {
      await notificationsApi.markAllRead()
      setNotifications((current) => current.map((item) => ({ ...item, read: true })))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Notifications could not be marked as read.')
    } finally {
      setMarkingAll(false)
    }
  }

  async function openNotification(notification: AppNotification) {
    if (await markRead(notification)) {
      if (notification.href) window.location.hash = notification.href.slice(1)
    }
  }

  return <div className="notifications-shell">
    <header className="seller-topbar"><a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a><div className="seller-topbar-actions"><span className="seller-dev-label">NOTIFICATION CENTER</span><a className="seller-nav-link" href="#top">Browse shops</a><NotificationBell /><RefreshButton onClick={() => void load(true)} disabled={!notificationsApi.isAvailable() || refreshing} refreshing={refreshing} /><AuthControls identity={identity} /></div></header>
    <main className="seller-main notifications-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
      <section className="seller-intro notifications-intro"><div><span className="overline">YOUR UPDATES</span><h1>Stay in the loop.</h1><p>Order, support, seller, and account updates appear here when the backend sends them.</p></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN ACCOUNT</span><strong>{identity?.displayName || identity?.email || identity?.id || 'Not signed in'}</strong><small>{identity?.role ? `${identity.role} notifications` : 'Notifications unavailable'}</small></div></section>
      <div className="notifications-safety-note" role="note"><Bell size={17} /><span><strong>In-app notifications only.</strong> Email and SMS are not connected.</span></div>
      {!notificationsApi.isAvailable() ? <UnavailableNotificationsState /> : <section className="seller-card notifications-card" aria-labelledby="notifications-heading">
        <div className="seller-card-heading"><div><span className="overline">NOTIFICATION CENTER</span><h2 id="notifications-heading">Recent updates</h2></div><button className="seller-secondary-button" onClick={() => void markAllRead()} disabled={markingAll || !notifications.some((item) => !item.read)}>{markingAll ? 'Updating…' : 'Mark all as read'}</button></div>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {loading ? <div className="seller-loading" role="status"><div className="loader" /><h2>Loading notifications</h2><p>Reading your latest updates from the backend.</p></div> : error && notifications.length === 0 ? <div className="seller-card admin-empty admin-error" role="alert"><CircleAlert size={28} /><h2>We couldn’t load notifications</h2><p>{error}</p><button className="retry-button" onClick={() => void load(true)} disabled={refreshing}>Try again</button></div> : notifications.length === 0 ? <div className="notifications-empty" role="status"><Check size={28} /><h2>You’re all caught up</h2><p>New in-app updates will appear here. Email and SMS are not connected.</p></div> : <div className="notification-list">{notifications.map((notification) => <article className={`notification-item ${notification.read ? 'notification-read' : 'notification-unread'}`} key={notification.id}><div className="notification-icon"><Bell size={17} /></div><div className="notification-copy"><div className="notification-heading"><h3>{notification.title}</h3><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></div><p>{notification.message}</p>{notification.relatedEntityType && <span className="notification-context">{notification.relatedEntityType}{notification.relatedEntityId ? ` · ${notification.relatedEntityId.slice(0, 10)}` : ''}</span>}<div className="notification-actions"><button className="notification-read-button" onClick={() => void markRead(notification)} disabled={notification.read || busyId === notification.id}>{busyId === notification.id ? 'Updating…' : notification.read ? 'Read' : 'Mark as read'}</button>{notification.href && <button className="notification-link-button" onClick={() => void openNotification(notification)}><ExternalLink size={14} /> Open related {notification.href === '#orders' ? 'order' : notification.href === '#support' ? 'support' : 'workspace'}</button>}</div></div>{!notification.read && <span className="notification-unread-dot" aria-label="Unread" />}</article>)}</div>}
      </section>}
    </main>
  </div>
}

function RefreshButton({ onClick, disabled, refreshing }: { onClick: () => void; disabled: boolean; refreshing: boolean }) {
  return <button className="seller-refresh" onClick={onClick} disabled={disabled} aria-label="Refresh notifications">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button>
}

function UnavailableNotificationsState() {
  return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Notifications are unavailable here</h2><p>{notificationsApi.unavailableMessage()}</p><p>Sign in with a supported account and configure <code>VITE_API_BASE_URL</code>. No notification data is stored or fabricated locally.</p></div>
}
