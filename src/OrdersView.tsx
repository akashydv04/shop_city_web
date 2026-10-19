import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, FileText, Package, RefreshCw, ShieldAlert, XCircle } from 'lucide-react'
import { appConfig } from './config/environment'
import { orderApi } from './services/orderApi'
import type { OrderStatus, SellerOrder } from './services/sellerApi'
import { authApi } from './services/authApi'
import AuthControls from './AuthControls'
import NotificationBell from './NotificationBell'
import { refundApi, type RefundRequest, type RefundRequestStatus } from './services/refundApi'

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

function formatMoney(value: number, currency = 'INR') {
  return `${currency === 'INR' ? '₹' : `${currency} `}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [refundLoading, setRefundLoading] = useState(true)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundNotice, setRefundNotice] = useState<string | null>(null)

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

  async function loadRefunds() {
    if (appConfig.environment !== 'dev' || !refundApi.customerAvailable()) {
      setRefundLoading(false)
      return
    }
    setRefundLoading(true)
    setRefundError(null)
    try {
      setRefunds(await refundApi.listMine())
    } catch (reason: unknown) {
      setRefundError(reason instanceof Error ? reason.message : 'Refund request history could not be loaded.')
    } finally {
      setRefundLoading(false)
    }
  }

  useEffect(() => { void loadOrders(); void loadRefunds() }, [])

  return <div className="orders-shell">
    <header className="seller-topbar">
      <a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
       <div className="seller-topbar-actions"><span className="seller-dev-label">CUSTOMER ORDERS</span><a className="seller-nav-link" href="#top">Browse shops</a><NotificationBell /><button className="seller-refresh" onClick={() => { void loadOrders(true); void loadRefunds() }} disabled={!orderApi.isAvailable() || refreshing} aria-label="Refresh orders and refund requests">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={authApi.getIdentity()} /></div>
    </header>
     <main className="seller-main orders-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
        <section className="seller-intro orders-intro"><div><span className="overline">YOUR ORDERS</span><h1>Everything you’ve ordered.</h1><p>Review your order history and open any order to see its server-backed items, total, and current status.</p><a className="orders-support-entry" href="#support"><CircleAlert size={15} /> Need help with an order?</a></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN BUYER</span><strong>{authApi.getIdentity()?.displayName || authApi.getIdentity()?.id || 'Not signed in'}</strong><small>Account session</small></div></section>

      {!orderApi.isAvailable() ? <UnavailableOrdersState /> : <>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
         {loading ? <div className="seller-loading" role="status"><div className="loader" /><h2>Loading your orders</h2><p>Reading order history from the backend.</p></div> : error && orders.length === 0 ? <div className="seller-card admin-empty admin-error" role="alert"><CircleAlert size={28} /><h2>We couldn’t load your orders</h2><p>{error}</p><button className="retry-button" onClick={() => void loadOrders(true)} disabled={refreshing}>Try again</button></div> : orders.length === 0 ? <div className="seller-card admin-empty" role="status"><Package size={28} /><h2>No orders yet</h2><p>Orders created by this buyer will appear here.</p></div> : <div className="orders-layout"><section className="seller-card order-history-card" aria-labelledby="order-history-heading"><div className="seller-card-heading"><div><span className="overline">ORDER HISTORY</span><h2 id="order-history-heading">Your recent orders</h2></div><span className="count-label">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span></div><div className="order-history-list">{orders.map((order) => <button className={`order-history-row ${selectedId === order.id ? 'selected' : ''}`} key={order.id} onClick={() => void openDetail(order.id)} aria-pressed={selectedId === order.id}><div className="order-row-main"><strong>Order #{order.id.slice(0, 8)}</strong><span>{formatDate(order.createdAt)}</span></div><div className="order-row-meta"><StatusBadge status={order.status} /><strong>{formatPrice(order.total)}</strong></div><span className="order-row-items">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span></button>)}</div></section><OrderDetail order={detail} loading={detailLoading} error={detailError} notice={refundNotice} onCreated={(created) => { setRefunds((current) => [created, ...current]); setRefundNotice('Refund request submitted for human review. No money was moved automatically.') }} /></div>}
         {appConfig.environment === 'dev' && <RefundHistory refunds={refunds} loading={refundLoading} error={refundError} />}
       </>}
    </main>
  </div>
}

function OrderDetail({ order, loading, error, notice, onCreated }: { order: SellerOrder | null; loading: boolean; error: string | null; notice: string | null; onCreated: (request: RefundRequest) => void }) {
  return <section className="seller-card order-detail-card" aria-labelledby="order-detail-heading"><div className="seller-card-heading"><div><span className="overline">ORDER DETAIL</span><h2 id="order-detail-heading">{order ? `Order #${order.id.slice(0, 8)}` : 'Select an order'}</h2></div>{order && <StatusBadge status={order.status} />}</div>{loading ? <div className="order-detail-state" role="status"><div className="loader" /><p>Loading order details…</p></div> : error ? <div className="order-detail-state order-detail-error" role="alert"><CircleAlert size={25} /><p>{error}</p></div> : !order ? <div className="order-detail-state"><Package size={27} /><p>Select an order to see its items and total.</p></div> : <><div className="order-detail-meta"><span>Placed {formatDate(order.createdAt)}</span><span>Shop ID {order.shopId}</span></div><div className="order-item-list">{order.items.map((item) => <div className="order-item-row" key={`${item.productId}-${item.productName}`}><div><strong>{item.productName}</strong><span>{item.quantity} × {formatPrice(item.unitPrice)}</span></div><b>{formatPrice(item.quantity * item.unitPrice)}</b></div>)}</div><div className="order-total"><span>Total</span><strong>{formatPrice(order.total)}</strong></div>{appConfig.environment === 'dev' && <RefundRequestForm order={order} onCreated={onCreated} notice={notice} />}</>}</section>
}

function RefundRequestForm({ order, onCreated, notice }: { order: SellerOrder; onCreated: (request: RefundRequest) => void; notice: string | null }) {
  const [kind, setKind] = useState<'FULL' | 'PARTIAL'>('FULL')
  const [amount, setAmount] = useState(String(order.total))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const maxAmount = order.total

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requestedAmount = kind === 'FULL' ? maxAmount : Number(amount)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > maxAmount || reason.trim().length < 10) {
      setError(`Enter an amount up to ${formatPrice(maxAmount)} and a reason of at least 10 characters.`)
      return
    }
    if (!window.confirm(`Submit a ${kind === 'FULL' ? 'full' : 'partial'} refund request for ${formatMoney(requestedAmount)}? This only opens a human review and does not move money.`)) return
    setBusy(true); setError(null)
    try {
      const created = await refundApi.create({ orderId: order.id, amount: requestedAmount, reason: reason.trim() })
      setReason(''); setAmount(String(order.total)); setKind('FULL'); onCreated(created)
    } catch (reasonValue: unknown) {
      setError(reasonValue instanceof Error ? reasonValue.message : 'The refund request could not be submitted.')
    } finally { setBusy(false) }
  }

  return <div className="refund-request-panel"><div className="refund-panel-heading"><div><span className="overline">DEVELOPMENT ONLY · REFUND REQUEST</span><h3>Ask for a refund</h3></div><FileText size={20} /></div><p className="refund-panel-copy">Request a full or partial amount for human review. This screen does not call a payment provider or move money automatically.</p><form className="refund-form" onSubmit={(event) => void submit(event)}><div className="refund-kind" role="group" aria-label="Refund amount type"><label><input type="radio" checked={kind === 'FULL'} disabled={busy} onChange={() => { setKind('FULL'); setAmount(String(order.total)) }} /> Full refund · {formatPrice(order.total)}</label><label><input type="radio" checked={kind === 'PARTIAL'} disabled={busy} onChange={() => setKind('PARTIAL')} /> Partial refund</label></div>{kind === 'PARTIAL' && <div className="form-field"><label htmlFor="refund-amount">Requested amount <span>*</span></label><input id="refund-amount" type="number" min="0.01" max={maxAmount} step="0.01" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} /></div>}<div className="form-field"><label htmlFor="refund-reason">Reason <span>*</span></label><textarea id="refund-reason" value={reason} disabled={busy} minLength={10} required onChange={(event) => setReason(event.target.value)} placeholder="Tell the reviewer what happened and what amount should be considered." /></div>{error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}{notice && <div className="seller-alert seller-alert-success" role="status"><CheckCircle2 size={16} /><span>{notice}</span></div>}<button className="seller-primary-button" type="submit" disabled={busy || !refundApi.customerAvailable()}>{busy ? 'Submitting…' : 'Submit for human review'}</button></form></div>
}

function refundStatusCopy(status: RefundRequestStatus) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function RefundHistory({ refunds, loading, error }: { refunds: RefundRequest[]; loading: boolean; error: string | null }) {
  return <section className="seller-card refund-history-card" aria-labelledby="refund-history-heading"><div className="seller-card-heading"><div><span className="overline">REFUND REQUESTS</span><h2 id="refund-history-heading">Request history</h2></div><span className="count-label">{refunds.length} {refunds.length === 1 ? 'request' : 'requests'}</span></div><div className="refund-safety-note"><ShieldAlert size={16} /><span>Development workflow only. A request is a review record; no automatic money movement or live provider refund is performed.</span></div>{loading ? <div className="support-state" role="status"><div className="loader" /><p>Loading refund history…</p></div> : error ? <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div> : !refunds.length ? <div className="support-state"><FileText size={25} /><p>No refund requests yet.</p></div> : <div className="refund-history-list">{refunds.map((request) => <article className="refund-history-item" key={request.id}><div><strong>Order #{request.orderId.slice(0, 8)}</strong><span>{formatMoney(request.requestedAmount, request.currency)} · {formatDate(request.createdAt)}</span></div><span className={`refund-status refund-status-${request.status.toLowerCase()}`}>{refundStatusCopy(request.status)}</span><p>{request.reason}</p>{request.decisionNote && <small>Reviewer note: {request.decisionNote}</small>}{request.history.length > 0 && <div className="refund-history-timeline">{request.history.map((entry, index) => <span key={`${request.id}-${index}`}>{refundStatusCopy(entry.status)}{entry.createdAt ? ` · ${formatDate(entry.createdAt)}` : ''}{entry.note ? ` · ${entry.note}` : ''}</span>)}</div>}</article>)}</div>}</section>
}

function UnavailableOrdersState() {
  return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Orders are unavailable here</h2><p>{orderApi.unavailableMessage()}</p><p>Sign in with a buyer account and configure <code>VITE_API_BASE_URL</code>. No order data is stored or fabricated locally.</p></div>
}
