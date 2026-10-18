import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, RefreshCw, Store, UserRound, XCircle } from 'lucide-react'
import { adminApi, type AdminShop } from './services/adminApi'
import type { SellerReviewStatus } from './services/sellerApi'
import { authApi } from './services/authApi'
import AuthControls from './AuthControls'

const statusCopy: Record<SellerReviewStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

function StatusBadge({ status }: { status: SellerReviewStatus }) {
  const icon = status === 'APPROVED' ? <CheckCircle2 size={15} aria-hidden="true" /> : status === 'REJECTED' ? <XCircle size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />
  return <span className={`seller-status seller-status-${status.toLowerCase()}`}>{icon}<span>{statusCopy[status]}</span></span>
}

export default function AdminView() {
  const [shops, setShops] = useState<AdminShop[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})

  async function loadQueue(isRefresh = false) {
    if (!adminApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      setShops(await adminApi.listPending())
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Pending shops could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void loadQueue() }, [])

  async function approve(shop: AdminShop) {
    if (!window.confirm(`Approve ${shop.name}? This changes the shop status in the backend.`)) return
    setActionId(shop.id)
    setError(null)
    setNotice(null)
    try {
      await adminApi.approve(shop.id)
      setNotice(`${shop.name} was approved. The pending queue was refreshed.`)
      await loadQueue(true)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The shop could not be approved.')
    } finally {
      setActionId(null)
    }
  }

  async function reject(shop: AdminShop) {
    const reason = rejectReasons[shop.id]?.trim() || undefined
    if (!window.confirm(`Reject ${shop.name}?${reason ? `\n\nReason: ${reason}` : ''}`)) return
    setActionId(shop.id)
    setError(null)
    setNotice(null)
    try {
      await adminApi.reject(shop.id, reason)
      setNotice(`${shop.name} was rejected. The pending queue was refreshed.`)
      await loadQueue(true)
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : 'The shop could not be rejected.')
    } finally {
      setActionId(null)
    }
  }

  return <div className="admin-shell">
    <header className="seller-topbar">
      <a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
       <div className="seller-topbar-actions"><span className="seller-dev-label">LOCAL ADMIN CONSOLE</span><button className="seller-refresh" onClick={() => void loadQueue(true)} disabled={!adminApi.isAvailable() || refreshing} aria-label="Refresh pending shops">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={authApi.getIdentity()} /></div>
    </header>
    <main className="seller-main admin-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
       <section className="seller-intro admin-intro"><div><span className="overline">ADMIN REVIEW</span><h1>Review local shops.</h1><p>Approve or reject pending shop submissions from the backend queue.</p></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN APP ADMIN</span><strong>{authApi.getIdentity()?.displayName || authApi.getIdentity()?.id || 'Not signed in'}</strong><small>Account session</small></div></section>

      {!adminApi.isAvailable() ? <UnavailableAdminState /> : <>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {notice && <div className="seller-alert seller-alert-success" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}
        {loading ? <div className="seller-loading" role="status"><div className="loader" /><h2>Loading pending shops</h2><p>Reading the review queue from the backend.</p></div> : error && shops.length === 0 ? <div className="seller-card admin-empty admin-error" role="alert"><CircleAlert size={28} /><h2>We couldn’t load the queue</h2><p>{error}</p><button className="retry-button" onClick={() => void loadQueue(true)} disabled={refreshing}>Try again</button></div> : shops.length === 0 ? <div className="seller-card admin-empty" role="status"><CheckCircle2 size={28} /><h2>Queue is clear</h2><p>No shops are currently pending review.</p></div> : <section className="admin-queue" aria-labelledby="admin-queue-heading"><div className="admin-queue-heading"><div><span className="overline">PENDING QUEUE</span><h2 id="admin-queue-heading">Shops awaiting review</h2></div><span className="count-label">{shops.length} {shops.length === 1 ? 'shop' : 'shops'}</span></div><div className="admin-shop-list">{shops.map((shop) => <AdminShopCard key={shop.id} shop={shop} reason={rejectReasons[shop.id] ?? ''} busy={actionId === shop.id} onReasonChange={(value) => setRejectReasons((current) => ({ ...current, [shop.id]: value }))} onApprove={() => void approve(shop)} onReject={() => void reject(shop)} />)}</div></section>}
      </>}
    </main>
  </div>
}

function AdminShopCard({ shop, reason, busy, onReasonChange, onApprove, onReject }: { shop: AdminShop; reason: string; busy: boolean; onReasonChange: (value: string) => void; onApprove: () => void; onReject: () => void }) {
  return <article className="seller-card admin-shop-card"><div className="admin-shop-card-heading"><div><span className="overline">SHOP SUBMISSION</span><h2>{shop.name}</h2><span className="admin-shop-meta">{shop.city}{shop.slug ? ` · ${shop.slug}` : ''}</span></div><StatusBadge status={shop.status} /></div><div className="admin-detail-grid"><div className="admin-detail"><span className="admin-detail-label"><Store size={14} /> SHOP DETAILS</span><p>{shop.description || 'No description provided.'}</p></div><div className="admin-detail"><span className="admin-detail-label"><UserRound size={14} /> SELLER DETAILS</span><strong>{shop.seller.businessName}</strong>{shop.seller.contactName && <span>{shop.seller.contactName}</span>}{shop.seller.email && <span>{shop.seller.email}</span>}{shop.seller.phone && <span>{shop.seller.phone}</span>}{shop.seller.address && <span>{shop.seller.address}</span>}</div></div><div className="admin-decision"><label htmlFor={`reject-reason-${shop.id}`}>Rejection reason <span>(optional)</span></label><textarea id={`reject-reason-${shop.id}`} rows={2} value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Add context for the seller if rejecting" disabled={busy} /><div className="admin-decision-actions"><button className="admin-reject-button" onClick={onReject} disabled={busy}>{busy ? 'Saving…' : 'Reject'}</button><button className="seller-primary-button" onClick={onApprove} disabled={busy}>{busy ? 'Saving…' : 'Approve shop'}</button></div></div></article>
}

function UnavailableAdminState() {
  return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Admin review is unavailable here</h2><p>{adminApi.unavailableMessage()}</p><p>Sign in with an Admin account and configure <code>VITE_API_BASE_URL</code>. This surface never fabricates queue data.</p></div>
}
