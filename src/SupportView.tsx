import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, CircleHelp, Clock3, FileText, MessageSquare, RefreshCw, Send, ShieldAlert } from 'lucide-react'
import { appConfig } from './config/environment'
import AuthControls from './AuthControls'
import { authApi } from './services/authApi'
import { catalogApi } from './services/catalogApi'
import { orderApi } from './services/orderApi'
import type { SellerOrder } from './services/sellerApi'
import { customerSupportApi, supportApi, type CreateSupportCaseInput, type SupportCase, type SupportCaseStatus } from './services/supportApi'
import type { Shop } from './types'
import NotificationBell from './NotificationBell'
import { refundApi, type RefundDecision, type RefundRequest, type RefundRequestStatus } from './services/refundApi'

const reasonOptions = [
  { value: 'ORDER_NOT_RECEIVED', label: 'Order not received' },
  { value: 'MISSING_OR_WRONG_ITEM', label: 'Missing or wrong item' },
  { value: 'ITEM_QUALITY', label: 'Item quality issue' },
  { value: 'DELIVERY_PROBLEM', label: 'Delivery problem' },
  { value: 'OTHER', label: 'Something else' },
]

const shopReasonOptions = [
  { value: 'SHOP_ISSUE', label: 'Shop or catalogue issue' },
  { value: 'SHOP_INFORMATION', label: 'Question about a shop' },
  { value: 'OTHER', label: 'Something else' },
]

const generalReasonOptions = [
  { value: 'GENERAL_QUESTION', label: 'General question' },
  { value: 'ACCOUNT_ISSUE', label: 'Account or access issue' },
  { value: 'OTHER', label: 'Something else' },
]

type CustomerCaseScope = 'ORDER' | 'SHOP' | 'GENERAL'
type SupportQueueFilter = 'ALL' | SupportCaseStatus

const statusCopy: Record<SupportCaseStatus, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
}

function formatDate(value?: string) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatRefundMoney(value: number, currency = 'INR') {
  return `${currency === 'INR' ? '₹' : `${currency} `}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortId(value: string) {
  return value.length > 10 ? value.slice(0, 8) : value
}

function caseContextLabel(item: SupportCase, orderLabel?: string) {
  if (item.orderId) return orderLabel ?? `Order #${shortId(item.orderId)}`
  if (item.shopId) return `Shop #${shortId(item.shopId)}`
  return 'General support'
}

function StatusBadge({ status }: { status: SupportCaseStatus }) {
  const Icon = status === 'RESOLVED' || status === 'CLOSED' ? CheckCircle2 : status === 'IN_REVIEW' ? Clock3 : MessageSquare
  return <span className={`case-status case-status-${status.toLowerCase()}`}><Icon size={14} aria-hidden="true" />{statusCopy[status]}</span>
}

function QueueStatusFilter({ value, disabled, onChange }: { value: SupportQueueFilter; disabled: boolean; onChange: (status: SupportQueueFilter) => void }) {
  return <div className="support-case-form"><label className="form-field"><span>Filter support cases by status</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as SupportQueueFilter)}><option value="OPEN">Open</option><option value="IN_REVIEW">In review</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option><option value="ALL">All statuses</option></select></label></div>
}

export default function SupportView() {
  const identity = authApi.getIdentity()
  if (identity?.role === 'support' || identity?.role === 'admin') return <SupportQueueView />
  return <CustomerSupportView />
}

function SupportQueueView() {
  const identity = authApi.getIdentity()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [queueStatus, setQueueStatus] = useState<SupportQueueFilter>('OPEN')
  const [nextStatus, setNextStatus] = useState<SupportCaseStatus>('IN_REVIEW')
  const [resolutionNote, setResolutionNote] = useState('')
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [selectedRefundId, setSelectedRefundId] = useState<string | null>(null)
  const [refundDetail, setRefundDetail] = useState<RefundRequest | null>(null)
  const [refundLoading, setRefundLoading] = useState(true)
  const [refundDetailLoading, setRefundDetailLoading] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundDetailError, setRefundDetailError] = useState<string | null>(null)
  const [refundSaving, setRefundSaving] = useState(false)
  const [refundDecisionNote, setRefundDecisionNote] = useState('')
  const [refundActionError, setRefundActionError] = useState<string | null>(null)

  async function loadQueue(isRefresh = false, status: SupportQueueFilter = queueStatus) {
    if (!supportApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const nextCases = await supportApi.listQueue(status === 'ALL' ? undefined : status)
      setCases(nextCases)
      if (selectedId && !nextCases.some((item) => item.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'The support queue could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function openDetail(caseId: string) {
    setSelectedId(caseId)
    setDetailLoading(true)
    setDetailError(null)
    setActionError(null)
    try {
      const nextDetail = await supportApi.getCase(caseId)
      setDetail(nextDetail)
      setNextStatus(nextDetail.status === 'OPEN' ? 'IN_REVIEW' : nextDetail.status)
      setResolutionNote(nextDetail.resolutionNote ?? '')
    } catch (reason: unknown) {
      setDetail(null)
      setDetailError(reason instanceof Error ? reason.message : 'Case details could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveStatus() {
    if (!detail || saving) return
    if ((nextStatus === 'RESOLVED' || nextStatus === 'CLOSED') && !resolutionNote.trim()) {
      setActionError('Add a resolution note before resolving or closing this case.')
      return
    }
    setSaving(true)
    setActionError(null)
    try {
      const updated = await supportApi.updateStatus(detail.id, { status: nextStatus, ...(resolutionNote.trim() ? { resolutionNote: resolutionNote.trim() } : {}) })
      setDetail(updated)
      setCases((current) => current.map((item) => item.id === updated.id ? updated : item).filter((item) => queueStatus === 'ALL' || item.status === queueStatus))
      if (queueStatus !== 'ALL' && updated.status !== queueStatus) {
        setSelectedId(null)
        setDetail(null)
      }
      setNextStatus(updated.status === 'OPEN' ? 'IN_REVIEW' : updated.status)
      setResolutionNote(updated.resolutionNote ?? '')
    } catch (reason: unknown) {
      setActionError(reason instanceof Error ? reason.message : 'The case status could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  async function loadRefundQueue(isRefresh = false) {
    if (appConfig.environment !== 'dev' || !refundApi.reviewerAvailable()) {
      setRefundLoading(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    setRefundError(null)
    try {
      const nextRefunds = await refundApi.listQueue()
      setRefunds(nextRefunds)
      if (selectedRefundId && !nextRefunds.some((item) => item.id === selectedRefundId)) {
        setSelectedRefundId(null)
        setRefundDetail(null)
      }
    } catch (reason: unknown) {
      setRefundError(reason instanceof Error ? reason.message : 'The refund queue could not be loaded.')
    } finally {
      setRefundLoading(false)
      if (isRefresh) setRefreshing(false)
    }
  }

  async function openRefundDetail(refundId: string) {
    setSelectedRefundId(refundId)
    setRefundDetailLoading(true)
    setRefundDetailError(null)
    setRefundActionError(null)
    try {
      const nextDetail = await refundApi.getForReview(refundId)
      setRefundDetail(nextDetail)
      setRefundDecisionNote(nextDetail.decisionNote ?? '')
    } catch (reason: unknown) {
      setRefundDetail(null)
      setRefundDetailError(reason instanceof Error ? reason.message : 'Refund request details could not be loaded.')
    } finally {
      setRefundDetailLoading(false)
    }
  }

  async function decideRefund(decision: RefundDecision) {
    if (!refundDetail || refundSaving || refundDetailLoading || !['REQUESTED', 'UNDER_REVIEW'].includes(refundDetail.status)) return
    if (!refundDecisionNote.trim()) {
      setRefundActionError('Add a decision note before approving or rejecting this request.')
      return
    }
    const label = decision === 'APPROVE' ? 'approve' : 'reject'
    if (!window.confirm(`Confirm ${label}ing this refund request? This records an authorized human decision only; it does not move money automatically.`)) return
    setRefundSaving(true); setRefundActionError(null)
    try {
      const updated = await refundApi.decide(refundDetail.id, decision, refundDecisionNote)
      setRefundDetail(updated)
      setRefunds((current) => current.map((item) => item.id === updated.id ? updated : item))
      setRefundDecisionNote(updated.decisionNote ?? '')
    } catch (reason: unknown) {
      setRefundActionError(reason instanceof Error ? reason.message : 'The refund decision could not be recorded.')
    } finally { setRefundSaving(false) }
  }

  async function completeSandboxRefund() {
    if (appConfig.environment !== 'dev' || !refundDetail || refundSaving || refundDetailLoading || refundDetail.status !== 'APPROVED') return
    if (!window.confirm('Complete this approved refund in the local sandbox? This records a sandbox refund only and does not move real money.')) return
    setRefundSaving(true); setRefundActionError(null)
    try {
      const updated = await refundApi.completeSandbox(refundDetail.id)
      setRefundDetail(updated)
      setRefunds((current) => current.map((item) => item.id === updated.id ? updated : item))
      setRefundDecisionNote(updated.decisionNote ?? '')
    } catch (reason: unknown) {
      setRefundActionError(reason instanceof Error ? reason.message : 'The sandbox refund could not be completed.')
    } finally { setRefundSaving(false) }
  }

  useEffect(() => { void loadQueue(); void loadRefundQueue() }, [])

  return <div className="support-shell support-workspace-shell">
      <header className="seller-topbar"><a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a><div className="seller-topbar-actions"><span className="seller-dev-label">SUPPORT WORKSPACE</span><NotificationBell /><button className="seller-refresh" onClick={() => { void loadQueue(true); void loadRefundQueue(true) }} disabled={!supportApi.isAvailable() || refreshing} aria-label="Refresh support and refund queues">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={identity} /></div></header>
    <main className="seller-main support-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
      <section className="seller-intro support-intro"><div><span className="overline">CASE OPERATIONS</span><h1>Help customers get unstuck.</h1><p>Review customer cases, keep the status current, and leave a clear resolution note for the next person who opens the case.</p></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN OPERATOR</span><strong>{identity?.displayName || identity?.id || 'Not signed in'}</strong><small>{identity?.role === 'admin' ? 'Admin queue access' : 'Support queue access'}</small></div></section>
      <div className="support-safety-note" role="note"><ShieldAlert size={17} /><span><strong>Support workflow only.</strong> No refund or financial decision is automatically performed by this screen.</span></div>
       {!supportApi.isAvailable() ? <UnavailableSupportState /> : <>
         {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
          <div className="seller-card-heading"><h2>Support queue</h2><QueueStatusFilter value={queueStatus} disabled={loading || refreshing || saving || detailLoading} onChange={(status) => { setQueueStatus(status); setCases([]); setSelectedId(null); setDetail(null); setDetailError(null); void loadQueue(false, status) }} /></div>
          {loading ? <LoadingSupportState label="Loading support queue" /> : error && cases.length === 0 ? <ErrorSupportState message={error} onRetry={() => void loadQueue(true)} disabled={refreshing} /> : cases.length === 0 ? <EmptySupportState /> : <div className="support-layout"><section className="seller-card support-queue-card" aria-labelledby="support-queue-heading"><div className="seller-card-heading"><div><span className="overline">CASE QUEUE</span><h2 id="support-queue-heading">Customer cases</h2></div><span className="count-label">{cases.length} {cases.length === 1 ? 'case' : 'cases'}</span></div><div className="support-case-list">{cases.map((item) => <CaseCard key={item.id} item={item} selected={selectedId === item.id} onClick={() => void openDetail(item.id)} operator />)}</div></section><SupportCaseDetail detail={detail} loading={detailLoading} error={detailError} operator nextStatus={nextStatus} resolutionNote={resolutionNote} saving={saving} actionError={actionError} onStatus={setNextStatus} onResolutionNote={setResolutionNote} onSave={() => void saveStatus()} /></div>}
           {appConfig.environment === 'dev' && <RefundReviewQueue refunds={refunds} selectedId={selectedRefundId} detail={refundDetail} loading={refundLoading} detailLoading={refundDetailLoading} error={refundError} detailError={refundDetailError} decisionNote={refundDecisionNote} saving={refundSaving} actionError={refundActionError} onRefresh={() => void loadRefundQueue(true)} onSelect={(id) => void openRefundDetail(id)} onDecisionNote={setRefundDecisionNote} onDecision={(decision) => void decideRefund(decision)} onSandboxComplete={() => void completeSandboxRefund()} />}
       </>}
    </main>
  </div>
}

function CustomerSupportView() {
  const identity = authApi.getIdentity()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SupportCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [shopsError, setShopsError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [caseScope, setCaseScope] = useState<CustomerCaseScope>('GENERAL')
  const [form, setForm] = useState<CreateSupportCaseInput>({ orderId: '', reason: '', description: '' })

  async function loadCases(isRefresh = false) {
    if (!customerSupportApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const nextCases = await customerSupportApi.listCases()
      setCases(nextCases)
      if (selectedId && !nextCases.some((item) => item.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Your support cases could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadOrders() {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      setOrders(await orderApi.listHistory())
    } catch (reason: unknown) {
      setOrdersError(reason instanceof Error ? reason.message : 'Your orders could not be loaded for case selection.')
    } finally {
      setOrdersLoading(false)
    }
  }

  async function loadShops() {
    if (!customerSupportApi.isAvailable()) return
    setShopsError(null)
    try {
      const catalog = await catalogApi.load()
      setShops(catalog.shops)
    } catch (reason: unknown) {
      setShopsError(reason instanceof Error ? reason.message : 'Shops could not be loaded for case selection.')
    }
  }

  async function openDetail(caseId: string) {
    setSelectedId(caseId)
    setDetailLoading(true)
    setDetailError(null)
    try {
      setDetail(await customerSupportApi.getCase(caseId))
    } catch (reason: unknown) {
      setDetail(null)
      setDetailError(reason instanceof Error ? reason.message : 'Case details could not be loaded.')
    } finally {
      setDetailLoading(false)
    }
  }

  async function submitCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const description = form.description.trim()
    if ((caseScope === 'ORDER' && !form.orderId) || (caseScope === 'SHOP' && !form.shopId) || !form.reason || description.length < 10) {
      setSubmitError(`${caseScope === 'ORDER' ? 'Choose an order, select a reason' : caseScope === 'SHOP' ? 'Choose a shop, select a reason' : 'Select a reason'}, and describe the issue in at least 10 characters.`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setNotice(null)
    try {
      const created = await customerSupportApi.createCase({ reason: form.reason, description, ...(caseScope === 'ORDER' ? { orderId: form.orderId } : caseScope === 'SHOP' ? { shopId: form.shopId } : {}) })
      setCases((current) => [created, ...current])
      setForm({ orderId: '', shopId: '', reason: '', description: '' })
      setNotice('Your case was sent to the support queue.')
      await openDetail(created.id)
    } catch (reason: unknown) {
      setSubmitError(reason instanceof Error ? reason.message : 'Your support case could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => { void loadCases(); void loadOrders(); void loadShops() }, [])

  const orderLabel = useMemo(() => new Map(orders.map((order) => [order.id, `Order #${shortId(order.id)}`])), [orders])
  const reasonChoices = caseScope === 'ORDER' ? reasonOptions : caseScope === 'SHOP' ? shopReasonOptions : generalReasonOptions

  function changeCaseScope(nextScope: CustomerCaseScope) {
    setCaseScope(nextScope)
    setForm((current) => ({ ...current, orderId: nextScope === 'ORDER' ? current.orderId : '', shopId: nextScope === 'SHOP' ? current.shopId : '', reason: '' }))
    setSubmitError(null)
  }

  return <div className="support-shell support-workspace-shell">
     <header className="seller-topbar"><a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a><div className="seller-topbar-actions"><span className="seller-dev-label">CUSTOMER SUPPORT</span><NotificationBell /><button className="seller-refresh" onClick={() => { void loadCases(true); void loadOrders(); void loadShops() }} disabled={!customerSupportApi.isAvailable() || refreshing} aria-label="Refresh support cases">{refreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={identity} /></div></header>
    <main className="seller-main support-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
       <section className="seller-intro support-intro"><div><span className="overline">CUSTOMER SUPPORT</span><h1>Tell us what went wrong.</h1><p>Open an order-related, shop-related, or general support case and keep an eye on its status as the support team reviews it.</p></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN BUYER</span><strong>{identity?.displayName || identity?.id || 'Not signed in'}</strong><small>Development identity</small></div></section>
      <div className="support-safety-note" role="note"><ShieldAlert size={17} /><span><strong>Support case only.</strong> No refund or financial decision is automatically performed by this screen.</span></div>
      {!customerSupportApi.isAvailable() ? <UnavailableCustomerState /> : <>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
         <div className="customer-support-grid"><section className="seller-card support-form-card" aria-labelledby="new-case-heading"><div className="seller-card-heading"><div><span className="overline">NEW CASE</span><h2 id="new-case-heading">How can we help?</h2></div><FileText size={21} /></div><form className="support-case-form" onSubmit={(event) => void submitCase(event)}><div className="form-field form-field-wide"><label htmlFor="support-scope">Case type <span>*</span></label><select id="support-scope" value={caseScope} disabled={submitting} onChange={(event) => changeCaseScope(event.target.value as CustomerCaseScope)}><option value="ORDER">Order-related</option><option value="SHOP">Shop-related</option><option value="GENERAL">General support</option></select></div>{caseScope === 'ORDER' && <div className="form-field form-field-wide"><label htmlFor="support-order">Order <span>*</span></label><select id="support-order" value={form.orderId ?? ''} disabled={ordersLoading || submitting} onChange={(event) => setForm({ ...form, orderId: event.target.value })}><option value="">{ordersLoading ? 'Loading your orders…' : orders.length ? 'Choose an order' : 'No orders available'}</option>{orders.map((order) => <option key={order.id} value={order.id}>{orderLabel.get(order.id)} · {order.status}</option>)}</select>{ordersError && <span className="field-help support-field-error">{ordersError}</span>}{!ordersLoading && !ordersError && !orders.length && <span className="field-help">Order-related cases need an order. Choose another case type if you need general help.</span>}</div>}{caseScope === 'SHOP' && <div className="form-field form-field-wide"><label htmlFor="support-shop">Shop <span>*</span></label><select id="support-shop" value={form.shopId ?? ''} disabled={submitting || Boolean(shopsError)} onChange={(event) => setForm({ ...form, shopId: event.target.value })}><option value="">{shopsError ? 'Shops unavailable' : shops.length ? 'Choose a shop' : 'No shops available'}</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}{shop.city ? ` · ${shop.city}` : ''}</option>)}</select>{shopsError && <span className="field-help support-field-error">{shopsError}</span>}</div>}<div className="form-field form-field-wide"><label htmlFor="support-reason">Reason <span>*</span></label><select id="support-reason" value={form.reason} disabled={submitting} onChange={(event) => setForm({ ...form, reason: event.target.value })}><option value="">Choose a reason</option>{reasonChoices.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></div><div className="form-field form-field-wide"><label htmlFor="support-description">Description <span>*</span></label><textarea id="support-description" value={form.description} disabled={submitting} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={caseScope === 'ORDER' ? 'Tell the support team what happened and what you checked already.' : 'Tell the support team what you need help with.'} minLength={10} required /><span className="field-help">Minimum 10 characters. Include useful context so the support team can help quickly.</span></div>{submitError && <div className="seller-alert seller-alert-error support-form-error" role="alert"><CircleAlert size={17} /><span>{submitError}</span></div>}{notice && <div className="seller-alert seller-alert-success support-form-error" role="status"><CheckCircle2 size={17} /><span>{notice}</span></div>}<div className="form-actions"><button className="seller-primary-button support-submit" type="submit" disabled={submitting || (caseScope === 'ORDER' && ordersLoading) || (caseScope === 'SHOP' && !shops.length)}><Send size={15} />{submitting ? 'Sending case…' : 'Send support case'}</button></div></form></section><section className="seller-card support-cases-card" aria-labelledby="my-cases-heading"><div className="seller-card-heading"><div><span className="overline">CASE HISTORY</span><h2 id="my-cases-heading">Your cases</h2></div><span className="count-label">{cases.length} {cases.length === 1 ? 'case' : 'cases'}</span></div>{loading ? <LoadingSupportState label="Loading your cases" /> : error && cases.length === 0 ? <ErrorSupportState message={error} onRetry={() => void loadCases(true)} disabled={refreshing} /> : cases.length === 0 ? <EmptyCustomerCasesState /> : <div className="support-case-list">{cases.map((item) => <CaseCard key={item.id} item={item} selected={selectedId === item.id} onClick={() => void openDetail(item.id)} orderLabel={item.orderId ? orderLabel.get(item.orderId) : undefined} />)}</div>}</section></div><CustomerCaseDetail detail={detail} loading={detailLoading} error={detailError} orderLabel={detail?.orderId ? orderLabel.get(detail.orderId) : undefined} />
      </>}
    </main>
  </div>
}

function CaseCard({ item, selected, onClick, operator = false, orderLabel }: { item: SupportCase; selected: boolean; onClick: () => void; operator?: boolean; orderLabel?: string }) {
  return <button className={`support-case-card ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}><div className="support-case-card-top"><div><span className="case-id">CASE #{shortId(item.id)}</span><h3>{item.reason.replace(/_/g, ' ')}</h3></div><StatusBadge status={item.status} /></div><p>{item.description || 'No description provided.'}</p><div className="support-case-card-meta"><span>{operator && item.customerName ? item.customerName : caseContextLabel(item, orderLabel)}</span><span>{formatDate(item.createdAt)}</span></div></button>
}

function refundStatusLabel(status: RefundRequestStatus) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

type RefundReviewQueueProps = { refunds: RefundRequest[]; selectedId: string | null; detail: RefundRequest | null; loading: boolean; detailLoading: boolean; error: string | null; detailError: string | null; decisionNote: string; saving: boolean; actionError: string | null; onRefresh: () => void; onSelect: (id: string) => void; onDecisionNote: (note: string) => void; onDecision: (decision: RefundDecision) => void; onSandboxComplete: () => void }

function RefundReviewQueue({ refunds, selectedId, detail, loading, detailLoading, error, detailError, decisionNote, saving, actionError, onRefresh, onSelect, onDecisionNote, onDecision, onSandboxComplete }: RefundReviewQueueProps) {
  const canDecide = detail?.status === 'REQUESTED' || detail?.status === 'UNDER_REVIEW'
  return <section className="refund-review-section" aria-labelledby="refund-review-heading">
    <div className="refund-review-heading"><div><span className="overline">AUTHORIZED HUMAN WORKFLOW · DEVELOPMENT ONLY</span><h2 id="refund-review-heading">Refund requests</h2><p>Review requests and record a decision with a note. Approved requests remain here until sandbox completion.</p></div><button className="seller-refresh" onClick={onRefresh} disabled={loading || saving || detailLoading} aria-label="Refresh refund queue"><RefreshCw size={15} /> Refresh</button></div>
    {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    {loading ? <LoadingSupportState label="Loading refund queue" /> : !refunds.length && !error ? <div className="seller-card support-empty" role="status"><FileText size={27} /><h2>No refund requests awaiting action</h2><p>Requests awaiting review or completion will appear here.</p></div> : <div className="refund-review-layout">
      <section className="seller-card refund-review-list" aria-label="Refund request queue">
        <div className="seller-card-heading"><h3>{refunds.length} {refunds.length === 1 ? 'request' : 'requests'}</h3></div>
        {refunds.map((request) => <button className={`refund-review-row ${selectedId === request.id ? 'selected' : ''}`} key={request.id} onClick={() => onSelect(request.id)} disabled={saving || detailLoading} aria-pressed={selectedId === request.id}><div><strong>#{request.id.slice(0, 8)}</strong><span>{request.buyerName || request.buyerEmail || `Buyer ${request.buyerId.slice(0, 8)}`}</span><small>Order #{request.orderId.slice(0, 8)}</small></div><div><b>{formatRefundMoney(request.requestedAmount, request.currency)}</b><span className={`refund-status refund-status-${request.status.toLowerCase()}`}>{refundStatusLabel(request.status)}</span></div></button>)}
      </section>
      <section className="seller-card refund-review-detail" aria-labelledby="refund-review-detail-heading">
        <div className="seller-card-heading"><div><span className="overline">REFUND DETAIL</span><h3 id="refund-review-detail-heading">{detail ? `Request #${detail.id.slice(0, 8)}` : 'Select a request'}</h3></div>{detail && <span className={`refund-status refund-status-${detail.status.toLowerCase()}`}>{refundStatusLabel(detail.status)}</span>}</div>
        {detailLoading ? <LoadingSupportState label="Loading refund details" /> : detailError ? <div className="support-detail-state support-detail-error" role="alert"><CircleAlert size={22} /><p>{detailError}</p></div> : !detail ? <div className="support-detail-state"><CircleHelp size={26} /><p>Select a request to review its order, amount, reason, and history.</p></div> : <div className="refund-review-content">
          <div className="support-detail-meta"><span>Order #{detail.orderId.slice(0, 8)}</span><span>Buyer {detail.buyerName || detail.buyerId}</span><span>Requested {formatRefundMoney(detail.requestedAmount, detail.currency)}</span></div>
          <div className="support-description"><span className="overline">BUYER REASON</span><p>{detail.reason}</p></div>
          {detail.history.length > 0 && <div className="refund-history-timeline">{detail.history.map((entry, index) => <span key={`${detail.id}-review-${index}`}><strong>{refundStatusLabel(entry.status)}</strong>{entry.actorName ? ` · ${entry.actorName}` : ''}{entry.createdAt ? ` · ${formatDate(entry.createdAt)}` : ''}{entry.note ? ` · ${entry.note}` : ''}</span>)}</div>}
          {actionError && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={16} /><span>{actionError}</span></div>}
          {canDecide ? <div className="refund-status-editor">
            <label htmlFor="refund-decision-note">Decision note (required)</label><textarea id="refund-decision-note" value={decisionNote} required maxLength={2000} disabled={saving} onChange={(event) => onDecisionNote(event.target.value)} placeholder="Record the evidence reviewed and the policy outcome." />
            <div className="refund-review-actions"><button className="refund-reject-button" onClick={() => onDecision('REJECT')} disabled={saving || !decisionNote.trim()}>Reject request</button><button className="seller-primary-button" onClick={() => onDecision('APPROVE')} disabled={saving || !decisionNote.trim()}>Approve request</button></div>
          </div> : detail.decisionNote && <p>Decision note: {detail.decisionNote}</p>}
          {appConfig.environment === 'dev' && detail.status === 'APPROVED' && <div className="refund-status-editor"><h3>Complete approved refund</h3><p>Record completion in the local sandbox. No real money is moved.</p><button className="seller-primary-button" type="button" onClick={onSandboxComplete} disabled={saving}>{saving ? 'Completing…' : 'Complete in sandbox'}</button></div>}
        </div>}
      </section>
    </div>}
  </section>
}

function SupportCaseDetail({ detail, loading, error, operator, nextStatus, resolutionNote, saving, actionError, onStatus, onResolutionNote, onSave }: { detail: SupportCase | null; loading: boolean; error: string | null; operator: boolean; nextStatus: SupportCaseStatus; resolutionNote: string; saving: boolean; actionError: string | null; onStatus: (status: SupportCaseStatus) => void; onResolutionNote: (note: string) => void; onSave: () => void }) {
  return <section className="seller-card support-detail-card" aria-labelledby="support-detail-heading"><div className="seller-card-heading"><div><span className="overline">CASE DETAIL</span><h2 id="support-detail-heading">{detail ? `Case #${shortId(detail.id)}` : 'Select a case'}</h2></div>{detail && <StatusBadge status={detail.status} />}</div>{loading ? <LoadingSupportState label="Loading case details" /> : error ? <div className="support-detail-state support-detail-error" role="alert"><CircleAlert size={25} /><p>{error}</p></div> : !detail ? <div className="support-detail-state"><CircleHelp size={28} /><p>Select a case to read its description and current status.</p></div> : <div className="support-detail-content"><div className="support-detail-meta"><span>{caseContextLabel(detail)}</span><span>Opened {formatDate(detail.createdAt)}</span>{operator && detail.customerName && <span>Customer {detail.customerName}</span>}</div><div className="support-description"><span className="overline">CUSTOMER MESSAGE</span><p>{detail.description || 'No description provided.'}</p></div>{detail.resolutionNote && <div className="support-resolution-read"><span className="overline">RESOLUTION NOTE</span><p>{detail.resolutionNote}</p></div>}{operator && <div className="support-status-editor"><label htmlFor="support-case-status">Update status</label><select id="support-case-status" value={nextStatus} disabled={saving} onChange={(event) => onStatus(event.target.value as SupportCaseStatus)}>{(Object.keys(statusCopy) as SupportCaseStatus[]).map((status) => <option key={status} value={status}>{statusCopy[status]}</option>)}</select><label htmlFor="support-resolution-note">Resolution note <span>(optional)</span></label><textarea id="support-resolution-note" value={resolutionNote} disabled={saving} onChange={(event) => onResolutionNote(event.target.value)} placeholder="Record what was checked or communicated to the customer." />{actionError && <div className="seller-alert seller-alert-error support-form-error" role="alert"><CircleAlert size={17} /><span>{actionError}</span></div>}<button className="seller-primary-button" onClick={onSave} disabled={saving}>{saving ? 'Saving status…' : 'Save case update'}</button><p className="support-no-finance">Status updates do not initiate refunds, credits, payments, or any other financial decision.</p></div>}</div>}</section>
}

function CustomerCaseDetail({ detail, loading, error, orderLabel }: { detail: SupportCase | null; loading: boolean; error: string | null; orderLabel?: string }) {
  return <section className="seller-card support-detail-card customer-detail-card" aria-labelledby="customer-case-detail-heading"><div className="seller-card-heading"><div><span className="overline">CASE DETAIL</span><h2 id="customer-case-detail-heading">{detail ? `Case #${shortId(detail.id)}` : 'Select a case'}</h2></div>{detail && <StatusBadge status={detail.status} />}</div>{loading ? <LoadingSupportState label="Loading case details" /> : error ? <div className="support-detail-state support-detail-error" role="alert"><CircleAlert size={25} /><p>{error}</p></div> : !detail ? <div className="support-detail-state"><CircleHelp size={28} /><p>Select one of your cases to read its full details.</p></div> : <div className="support-detail-content"><div className="support-detail-meta"><span>{caseContextLabel(detail, orderLabel)}</span><span>Opened {formatDate(detail.createdAt)}</span></div><div className="support-description"><span className="overline">YOUR MESSAGE</span><p>{detail.description || 'No description provided.'}</p></div>{detail.resolutionNote && <div className="support-resolution-read"><span className="overline">SUPPORT NOTE</span><p>{detail.resolutionNote}</p></div>}<p className="support-no-finance">A support case does not automatically trigger a refund or any other financial decision.</p></div>}</section>
}

function LoadingSupportState({ label }: { label: string }) { return <div className="support-state" role="status"><div className="loader" /><h3>{label}</h3><p>Reading the latest case data from the backend.</p></div> }
function EmptySupportState() { return <div className="seller-card support-empty" role="status"><MessageSquare size={28} /><h2>No cases match this filter</h2><p>Choose another status or refresh to check for new customer cases.</p></div> }
function EmptyCustomerCasesState() { return <div className="support-state" role="status"><MessageSquare size={27} /><h3>No support cases yet</h3><p>Use the form to ask about an order, a shop, or a general issue. Your case will appear here.</p></div> }
function ErrorSupportState({ message, onRetry, disabled }: { message: string; onRetry: () => void; disabled: boolean }) { return <div className="support-state support-error" role="alert"><CircleAlert size={28} /><h3>Cases could not be loaded</h3><p>{message}</p><button className="retry-button" onClick={onRetry} disabled={disabled}>Try again</button></div> }
function UnavailableSupportState() { return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Support queue is unavailable here</h2><p>{supportApi.unavailableMessage()}</p><p>Sign in with a Support or Admin account and configure <code>VITE_API_BASE_URL</code>. No queue data is stored or fabricated locally.</p></div> }
function UnavailableCustomerState() { return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Customer support is unavailable here</h2><p>{customerSupportApi.unavailableMessage()}</p><p>Sign in with a buyer account and configure <code>VITE_API_BASE_URL</code>. No case data is stored or fabricated locally.</p></div> }
