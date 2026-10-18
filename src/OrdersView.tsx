import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, Package, RefreshCw, XCircle } from 'lucide-react'
import { orderApi } from './services/orderApi'
import type { OrderStatus, SellerOrder } from './services/sellerApi'
import { authApi } from './services/authApi'
import AuthControls from './AuthControls'
import NotificationBell from './NotificationBell'

const statusCopy: Record<OrderStatus, string> = {
  PENDING: 'Placed',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready for delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const icon = status === 'COMPLETED' ? <CheckCircle2 size={15} aria-hidden="true" /> : status === 'CANCELLED' ? <XCircle size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />
  return <span className={`order-status order-status-${status.toLowerCase()}`}>{icon}<span>{statusCopy[status]}</span></span>
}

function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value?: string) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function OrdersView() {
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SellerOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function loadOrders(isRefresh = false) {
    if (!orderApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const nextOrders = await orderApi.listHistory()
      setOrders(nextOrders)
      if (selectedId && !nextOrders.some((order) => order.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Your orders could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function openDetail(orderId: string) {
    setSelectedId(orderId)
    setDetailLoading(true)
    setDetailError(null)
    try {
      setDetail(await orderApi.getDetail(orderId))
    } catch (reason: unknown) {
      setDetail(null)
      setDetailError(reason instanceof Error ? reason.message : 'Order details could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => { void loadOrders() }, [])

  return <div className="orders-shell">
    <header className="seller-topbar">
      <a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
       <div className="seller-topbar-actions"><span className="seller-dev-label">CUSTOMER ORDERS</span><a className="seller-nav-link" href="#top">Browse shops</a><NotificationBell /><button className="seller-refresh" onClick={() => void loadOrders(true)} disabled={!orderApi.isAvailable() || refreshing} aria-label="Refresh orders">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={authApi.getIdentity()} /></div>
    </header>
    <main className="seller-main orders-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
        <section className="seller-intro orders-intro"><div><span className="overline">YOUR ORDERS</span><h1>Everything you’ve ordered.</h1><p>Review your order history and open any order to see its server-backed items, total, and current status.</p><a className="orders-support-entry" href="#support"><CircleAlert size={15} /> Need help with an order?</a></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN BUYER</span><strong>{authApi.getIdentity()?.displayName || authApi.getIdentity()?.id || 'Not signed in'}</strong><small>Account session</small></div></section>

      {!orderApi.isAvailable() ? <UnavailableOrdersState /> : <>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {loading ? <div className="seller-loading" role="status"><div className="loader" /><h2>Loading your orders</h2><p>Reading order history from the backend.</p></div> : error && orders.length === 0 ? <div className="seller-card admin-empty admin-error" role="alert"><CircleAlert size={28} /><h2>We couldn’t load your orders</h2><p>{error}</p><button className="retry-button" onClick={() => void loadOrders(true)} disabled={refreshing}>Try again</button></div> : orders.length === 0 ? <div className="seller-card admin-empty" role="status"><Package size={28} /><h2>No orders yet</h2><p>Orders created by this buyer will appear here.</p></div> : <div className="orders-layout"><section className="seller-card order-history-card" aria-labelledby="order-history-heading"><div className="seller-card-heading"><div><span className="overline">ORDER HISTORY</span><h2 id="order-history-heading">Your recent orders</h2></div><span className="count-label">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span></div><div className="order-history-list">{orders.map((order) => <button className={`order-history-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => void openDetail(order.id)} aria-pressed={selectedId === order.id}><div className="order-row-main"><strong>Order #{order.id.slice(0, 8)}</strong><span>{formatDate(order.createdAt)}</span></div><div className="order-row-meta"><StatusBadge status={order.status} /><strong>{formatPrice(order.total)}</strong></div><span className="order-row-items">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span></button>)}</div></section><OrderDetail order={detail} loading={detailLoading} error={detailError} /></div>}
      </>}
    </main>
  </div>
}

function OrderDetail({ order, loading, error }: { order: SellerOrder | null; loading: boolean; error: string | null }) {
  return <section className="seller-card order-detail-card" aria-labelledby="order-detail-heading"><div className="seller-card-heading"><div><span className="overline">ORDER DETAIL</span><h2 id="order-detail-heading">{order ? `Order #${order.id.slice(0, 8)}` : 'Select an order'}</h2></div>{order && <StatusBadge status={order.status} />}</div>{loading ? <div className="order-detail-state" role="status"><div className="loader" /><p>Loading order details…</p></div> : error ? <div className="order-detail-state order-detail-error" role="alert"><CircleAlert size={25} /><p>{error}</p></div> : !order ? <div className="order-detail-state"><Package size={27} /><p>Select an order to see its items and total.</p></div> : <><div className="order-detail-meta"><span>Placed {formatDate(order.createdAt)}</span><span>Shop ID {order.shopId}</span></div><div className="order-item-list">{order.items.map((item) => <div className="order-item-row" key={`${item.productId}-${item.productName}`}><div><strong>{item.productName}</strong><span>{item.quantity} × {formatPrice(item.unitPrice)}</span></div><b>{formatPrice(item.quantity * item.unitPrice)}</b></div>)}</div><div className="order-total"><span>Total</span><strong>{formatPrice(order.total)}</strong></div></>}</section>
}

function UnavailableOrdersState() {
  return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Orders are unavailable here</h2><p>{orderApi.unavailableMessage()}</p><p>Sign in with a buyer account and configure <code>VITE_API_BASE_URL</code>. No order data is stored or fabricated locally.</p></div>
}
