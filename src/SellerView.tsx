import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, Clock3, Edit3, Package, RefreshCw, Save, Store, X, XCircle } from 'lucide-react'
import { sellerApi, type DeliverySlot, type DeliverySlotInput, type FulfilmentSettings, type OrderStatus, type SellerOrder, type SellerProduct, type SellerProductCreateInput, type SellerProductInput, type SellerProfile, type SellerProfileInput, type SellerReviewStatus, type SellerShop, type SellerShopInput } from './services/sellerApi'
import { authApi } from './services/authApi'
import AuthControls from './AuthControls'
import NotificationBell from './NotificationBell'

const statusCopy: Record<SellerReviewStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

function statusIcon(status: SellerReviewStatus) {
  if (status === 'APPROVED') return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === 'REJECTED') return <XCircle size={16} aria-hidden="true" />
  return <Clock3 size={16} aria-hidden="true" />
}

function StatusBadge({ status }: { status: SellerReviewStatus }) {
  return <span className={`seller-status seller-status-${status.toLowerCase()}`}>{statusIcon(status)}<span>{statusCopy[status]}</span></span>
}

const orderStatusCopy: Record<OrderStatus, string> = {
  PENDING: 'Pending', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const orderTransitions: Record<OrderStatus, { status: OrderStatus; label: string }[]> = {
  PENDING: [{ status: 'CONFIRMED', label: 'Confirm order' }, { status: 'CANCELLED', label: 'Cancel order' }],
  CONFIRMED: [{ status: 'PREPARING', label: 'Start preparing' }, { status: 'CANCELLED', label: 'Cancel order' }],
  PREPARING: [{ status: 'READY', label: 'Mark ready' }],
  READY: [{ status: 'COMPLETED', label: 'Mark completed' }],
  COMPLETED: [], CANCELLED: [],
}

const LOW_STOCK_THRESHOLD = 5

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const icon = status === 'COMPLETED' ? <CheckCircle2 size={15} aria-hidden="true" /> : status === 'CANCELLED' ? <XCircle size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />
  return <span className={`order-status order-status-${status.toLowerCase()}`}>{icon}<span>{orderStatusCopy[status]}</span></span>
}

function fieldValue(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
  return event.target.value
}

export default function SellerView() {
  const [profile, setProfile] = useState<SellerProfile>(sellerApi.emptyProfile)
  const [profileForm, setProfileForm] = useState<SellerProfileInput>({ ...sellerApi.emptyProfile })
  const [shops, setShops] = useState<SellerShop[]>([])
  const [productsByShop, setProductsByShop] = useState<Record<string, SellerProduct[]>>({})
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [shopSaving, setShopSaving] = useState(false)
  const [savingProductKey, setSavingProductKey] = useState<string | null>(null)
  const [creatingProductShopId, setCreatingProductShopId] = useState<string | null>(null)
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [productsError, setProductsError] = useState<string | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersRefreshing, setOrdersRefreshing] = useState(false)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [orderActionId, setOrderActionId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shopForm, setShopForm] = useState<SellerShopInput>({ name: '', slug: '', description: '', city: 'Gurugram' })
  const approvedShops = useMemo(() => shops.filter((shop) => shop.status === 'APPROVED'), [shops])
  const lowStockItems = useMemo(() => approvedShops.flatMap((shop) => (productsByShop[shop.id] ?? [])
    .filter((product) => product.active && product.quantity <= LOW_STOCK_THRESHOLD)
    .map((product) => ({ shopName: shop.name, product })))
    .sort((left, right) => left.product.quantity - right.product.quantity), [approvedShops, productsByShop])

  async function loadOrders(isRefresh = false) {
    if (!sellerApi.isAvailable()) {
      setOrdersLoading(false)
      setOrdersRefreshing(false)
      return
    }
    if (isRefresh) setOrdersRefreshing(true)
    else setOrdersLoading(true)
    setOrdersError(null)
    try {
      setOrders(await sellerApi.listOrders())
    } catch (reason: unknown) {
      setOrdersError(reason instanceof Error ? reason.message : 'Seller orders could not be loaded.')
    } finally {
      setOrdersLoading(false)
      setOrdersRefreshing(false)
    }
  }

  async function loadSellerData(isRefresh = false) {
    if (!sellerApi.isAvailable()) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [loadedProfile, loadedShops] = await Promise.all([sellerApi.getProfile(), sellerApi.listShops()])
      const nextProfile = loadedProfile ?? { ...sellerApi.emptyProfile }
      setProfile(nextProfile)
      setProfileForm({
        businessName: nextProfile.businessName,
        contactName: nextProfile.contactName,
        email: nextProfile.email,
        phone: nextProfile.phone,
        address: nextProfile.address,
        city: nextProfile.city,
      })
      setShops(loadedShops)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Seller data could not be loaded.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void loadSellerData(); void loadOrders() }, [])

  useEffect(() => {
    if (!sellerApi.isAvailable() || approvedShops.length === 0) {
      setProductsByShop({})
      setProductsLoading(false)
      setProductsError(null)
      return
    }

    let alive = true
    setProductsLoading(true)
    setProductsError(null)
    Promise.all(approvedShops.map(async (shop) => ({ shopId: shop.id, products: await sellerApi.listProducts(shop.id) })))
      .then((results) => {
        if (!alive) return
        setProductsByShop(Object.fromEntries(results.map(({ shopId, products }) => [shopId, products])))
      })
      .catch((reason: unknown) => {
        if (alive) setProductsError(reason instanceof Error ? reason.message : 'Products could not be loaded.')
      })
      .finally(() => { if (alive) setProductsLoading(false) })
    return () => { alive = false }
  }, [approvedShops])

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSaving(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await sellerApi.saveProfile(profileForm)
      setProfile(saved)
      setProfileForm({ businessName: saved.businessName, contactName: saved.contactName, email: saved.email, phone: saved.phone, address: saved.address, city: saved.city })
      setNotice('Seller profile submitted. Its review status is shown above; this does not approve the profile.')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Seller profile could not be submitted.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function submitShop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShopSaving(true)
    setError(null)
    setNotice(null)
    try {
      const created = await sellerApi.createShop(shopForm)
      setShops((current) => [created, ...current])
      setShopForm({ name: '', slug: '', description: '', city: profileForm.city || 'Gurugram' })
      setNotice('Shop submitted. Approval is determined by the backend and is shown in the shop list.')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Shop could not be created.')
    } finally {
      setShopSaving(false)
    }
  }

  async function saveProduct(shopId: string, productId: string, input: SellerProductInput) {
    const key = `${shopId}:${productId}`
    setSavingProductKey(key)
    setProductsError(null)
    setError(null)
    setNotice(null)
    try {
      const saved = await sellerApi.updateProduct(shopId, productId, input)
      setProductsByShop((current) => ({
        ...current,
        [shopId]: (current[shopId] ?? []).map((product) => product.id === productId ? saved : product),
      }))
      setEditingProductKey(null)
      setNotice(`${saved.name} was saved successfully.`)
    } catch (reason: unknown) {
      setProductsError(reason instanceof Error ? reason.message : 'The product could not be saved.')
      throw reason
    } finally {
      setSavingProductKey(null)
    }
  }

  async function createProduct(shopId: string, input: SellerProductCreateInput) {
    setCreatingProductShopId(shopId)
    setProductsError(null)
    setError(null)
    setNotice(null)
    try {
      const created = await sellerApi.createProduct(shopId, input)
      setProductsByShop((current) => ({
        ...current,
        [shopId]: [...(current[shopId] ?? []), created],
      }))
      setNotice(`${created.name} was added to the catalogue.`)
    } catch (reason: unknown) {
      setProductsError(reason instanceof Error ? reason.message : 'The product could not be added.')
      throw reason
    } finally {
      setCreatingProductShopId(null)
    }
  }

  async function transitionOrder(order: SellerOrder, nextStatus: OrderStatus) {
    const action = orderTransitions[order.status].find((candidate) => candidate.status === nextStatus)
    if (!action || !window.confirm(`${action.label} for order #${order.id.slice(0, 8)}? This changes the order status in the backend.`)) return
    setOrderActionId(order.id)
    setOrdersError(null)
    setNotice(null)
    try {
      await sellerApi.transitionOrder(order.id, nextStatus)
      setNotice(`Order #${order.id.slice(0, 8)} was updated. The order queue was refreshed.`)
      await loadOrders(true)
    } catch (reason: unknown) {
      setOrdersError(reason instanceof Error ? reason.message : 'The order status could not be changed.')
    } finally {
      setOrderActionId(null)
    }
  }

  return <div className="seller-shell">
     <header className="seller-topbar">
      <a className="brand" href="#top" aria-label="Back to DukaanSetu storefront"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
        <div className="seller-topbar-actions"><span className="seller-dev-label">LOCAL SELLER STUDIO</span><NotificationBell /><button className="seller-refresh" onClick={() => { void loadSellerData(true); void loadOrders(true) }} disabled={!sellerApi.isAvailable() || refreshing || ordersRefreshing} aria-label="Refresh seller data">{refreshing || ordersRefreshing ? <span className="loader seller-loader" /> : <RefreshCw size={16} />}<span>Refresh</span></button><AuthControls identity={authApi.getIdentity()} /></div>
    </header>
    <main className="seller-main">
      <a className="back-link" href="#top"><ArrowLeft size={16} /> Back to storefront</a>
       <section className="seller-intro"><div><span className="overline">SELLER ONBOARDING</span><h1>Set up your local shop.</h1><p>Submit your seller details, create a shop, and track the status returned by the backend.</p></div><div className="seller-identity"><span className="eyebrow">SIGNED-IN SELLER</span><strong>{authApi.getIdentity()?.displayName || authApi.getIdentity()?.id || 'Not signed in'}</strong><small>Account session</small></div></section>

      {!sellerApi.isAvailable() ? <UnavailableSellerState /> : <>
        {error && <div className="seller-alert seller-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
        {notice && <div className="seller-alert seller-alert-success" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}
        {loading ? <div className="seller-loading" role="status"><div className="loader" /><h2>Loading seller workspace</h2><p>Reading your profile and shops from the backend.</p></div> : <div className="seller-grid">
          <section className="seller-card seller-profile-card" aria-labelledby="profile-heading">
            <div className="seller-card-heading"><div><span className="overline">SELLER PROFILE</span><h2 id="profile-heading">Your details</h2></div><StatusBadge status={profile.status} /></div>
            {profile.status === 'REJECTED' && profile.rejectionReason && <p className="seller-rejection" role="note">Backend feedback: {profile.rejectionReason}</p>}
            <form className="seller-form" onSubmit={submitProfile}>
              <div className="form-field"><label htmlFor="business-name">Business name <span aria-hidden="true">*</span></label><input id="business-name" required value={profileForm.businessName} onChange={(event) => setProfileForm({ ...profileForm, businessName: fieldValue(event) })} /></div>
              <div className="form-field"><label htmlFor="contact-name">Contact name <span aria-hidden="true">*</span></label><input id="contact-name" required value={profileForm.contactName} onChange={(event) => setProfileForm({ ...profileForm, contactName: fieldValue(event) })} /></div>
              <div className="form-field"><label htmlFor="seller-email">Email <span aria-hidden="true">*</span></label><input id="seller-email" type="email" required value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: fieldValue(event) })} /></div>
              <div className="form-field"><label htmlFor="seller-phone">Phone</label><input id="seller-phone" type="tel" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: fieldValue(event) })} /></div>
              <div className="form-field form-field-wide"><label htmlFor="seller-address">Address</label><input id="seller-address" value={profileForm.address} onChange={(event) => setProfileForm({ ...profileForm, address: fieldValue(event) })} /></div>
              <div className="form-field"><label htmlFor="seller-city">City <span aria-hidden="true">*</span></label><input id="seller-city" required value={profileForm.city} onChange={(event) => setProfileForm({ ...profileForm, city: fieldValue(event) })} /></div>
              <div className="form-actions form-field-wide"><button className="seller-primary-button" type="submit" disabled={profileSaving}>{profileSaving ? 'Submitting…' : 'Submit seller profile'}</button><span className="form-hint">Submitting sends these fields to the seller profile endpoint.</span></div>
            </form>
          </section>

          <section className="seller-card shop-create-card" aria-labelledby="create-shop-heading">
            <div className="seller-card-heading"><div><span className="overline">NEW SHOP</span><h2 id="create-shop-heading">Create a shop</h2></div><Store size={21} aria-hidden="true" /></div>
            <form className="seller-form seller-shop-form" onSubmit={submitShop}>
              <div className="form-field form-field-wide"><label htmlFor="shop-name">Shop name <span aria-hidden="true">*</span></label><input id="shop-name" required value={shopForm.name} onChange={(event) => setShopForm({ ...shopForm, name: fieldValue(event) })} /></div>
              <div className="form-field"><label htmlFor="shop-slug">Slug</label><input id="shop-slug" pattern="[a-z0-9-]+" title="Use lowercase letters, numbers, and hyphens" placeholder="my-local-shop" value={shopForm.slug} onChange={(event) => setShopForm({ ...shopForm, slug: fieldValue(event) })} /><span className="field-help">Optional if the backend generates one.</span></div>
              <div className="form-field"><label htmlFor="shop-city">City <span aria-hidden="true">*</span></label><input id="shop-city" required value={shopForm.city} onChange={(event) => setShopForm({ ...shopForm, city: fieldValue(event) })} /></div>
              <div className="form-field form-field-wide"><label htmlFor="shop-description">Description</label><textarea id="shop-description" rows={4} value={shopForm.description} onChange={(event) => setShopForm({ ...shopForm, description: fieldValue(event) })} /></div>
              <div className="form-actions form-field-wide"><button className="seller-primary-button" type="submit" disabled={shopSaving}>{shopSaving ? 'Creating…' : 'Create shop'}</button><span className="form-hint">New shops remain in the status returned by the backend.</span></div>
            </form>
          </section>
        </div>}
         {!loading && <section className="seller-card seller-shops-card" aria-labelledby="shops-heading"><div className="seller-card-heading"><div><span className="overline">SHOP MANAGEMENT</span><h2 id="shops-heading">Your shops</h2></div><span className="count-label">{shops.length} {shops.length === 1 ? 'shop' : 'shops'}</span></div>{shops.length === 0 ? <div className="seller-empty"><Store size={25} /><h3>No shops yet</h3><p>Create a shop above to send it to the backend for review.</p></div> : <div className="seller-shop-list">{shops.map((shop) => <ShopStatusCard key={shop.id || `${shop.name}-${shop.slug}`} shop={shop} />)}</div>}</section>}
           {!loading && <section className="seller-card seller-catalogue-card" aria-labelledby="catalogue-heading"><div className="seller-card-heading"><div><span className="overline">CATALOGUE MANAGEMENT</span><h2 id="catalogue-heading">Products in your approved shops</h2></div><span className="count-label">{approvedShops.length} {approvedShops.length === 1 ? 'approved shop' : 'approved shops'}</span></div><p className="seller-section-intro">Keep prices, inventory, and availability current for customers. Only approved shops can publish catalogue changes.</p>{approvedShops.length === 0 ? <div className="seller-empty seller-no-approved"><Package size={27} /><h3>No approved shop yet</h3><p>Products become available here after an admin approves one of your shops.</p></div> : productsLoading ? <div className="seller-loading seller-catalogue-loading" role="status"><div className="loader" /><h3>Loading your catalogues</h3><p>Reading products from each approved shop.</p></div> : <>{productsError && <div className="seller-alert seller-alert-error seller-products-error" role="alert"><CircleAlert size={18} /><span>{productsError}</span></div>}<div className="seller-catalogue-list">{approvedShops.map((shop) => <section className="seller-catalogue-shop" key={shop.id} aria-labelledby={`catalogue-shop-${shop.id}`}><div className="seller-catalogue-shop-heading"><div><span className="overline">APPROVED SHOP</span><h3 id={`catalogue-shop-${shop.id}`}>{shop.name}</h3></div><span className="seller-status seller-status-approved"><CheckCircle2 size={15} aria-hidden="true" /> Approved</span></div>{(productsByShop[shop.id] ?? []).length === 0 ? <div className="seller-empty seller-product-empty"><Package size={23} /><h4>No products yet</h4><p>This shop does not have any products to edit.</p></div> : <div className="seller-product-list">{(productsByShop[shop.id] ?? []).map((product) => <SellerProductCard key={product.id} product={product} editing={editingProductKey === `${shop.id}:${product.id}`} saving={savingProductKey === `${shop.id}:${product.id}`} onEdit={() => setEditingProductKey(`${shop.id}:${product.id}`)} onCancel={() => setEditingProductKey(null)} onSave={(input) => saveProduct(shop.id, product.id, input)} />)}</div>}</section>)}</div></> }</section>}
           {approvedShops.length > 0 && !loading && <AddProductPanel shops={approvedShops} savingShopId={creatingProductShopId} onCreate={createProduct} />}
          {!loading && <section className="seller-card seller-orders-card" aria-labelledby="seller-orders-heading"><div className="seller-card-heading"><div><span className="overline">ORDER QUEUE</span><h2 id="seller-orders-heading">Orders to fulfil</h2></div><span className="count-label">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span></div><p className="seller-section-intro">Move each order through only the statuses allowed by the backend. Every action is confirmed and then read back from the queue.</p>{ordersError && <div className="seller-alert seller-alert-error seller-products-error" role="alert"><CircleAlert size={18} /><span>{ordersError}</span><button className="seller-inline-retry" onClick={() => void loadOrders(true)} disabled={ordersRefreshing}>Retry</button></div>}{ordersLoading ? <div className="seller-loading seller-catalogue-loading" role="status"><div className="loader" /><h3>Loading order queue</h3><p>Reading orders assigned to your shops from the backend.</p></div> : orders.length === 0 && !ordersError ? <div className="seller-empty seller-no-approved"><Package size={27} /><h3>No orders in the queue</h3><p>Orders from your shops will appear here when the backend exposes them.</p></div> : orders.length > 0 ? <div className="seller-order-list">{orders.map((order) => <SellerOrderCard key={order.id} order={order} busy={orderActionId === order.id} onTransition={(status) => void transitionOrder(order, status)} />)}</div> : null}</section>}
         </>}
           {sellerApi.isAvailable() && !loading && <section className="seller-card seller-insights-card" aria-labelledby="inventory-insights-heading"><div className="seller-card-heading"><div><span className="overline">SELLER TOOL · READ ONLY</span><h2 id="inventory-insights-heading">Low-stock watch</h2></div><span className="count-label">{lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'items'}</span></div><p className="seller-section-intro">Active products at or below {LOW_STOCK_THRESHOLD} units, calculated from the latest approved-shop catalogue response. This view does not change inventory or call an AI provider.</p>{approvedShops.length === 0 ? <div className="seller-empty seller-insight-empty"><Package size={25} /><h3>Nothing to monitor yet</h3><p>Approve a shop and publish products before inventory insights can appear.</p></div> : productsLoading ? <div className="seller-loading seller-insight-loading" role="status"><div className="loader" /><p>Checking current inventory.</p></div> : productsError ? <div className="seller-empty seller-insight-empty" role="status"><CircleAlert size={25} /><h3>Inventory insight unavailable</h3><p>Refresh the catalogue to calculate low-stock items from the backend response.</p></div> : lowStockItems.length === 0 ? <div className="seller-empty seller-insight-empty" role="status"><CheckCircle2 size={25} /><h3>No low-stock items</h3><p>All active products currently have more than {LOW_STOCK_THRESHOLD} units.</p></div> : <div className="seller-insight-list">{lowStockItems.map(({ shopName, product }) => <article className="seller-insight-row" key={product.id}><div className="seller-insight-icon"><Package size={18} /></div><div className="seller-insight-copy"><strong>{product.name}</strong><span>{shopName}</span></div><div className={`seller-insight-stock ${product.quantity === 0 ? 'critical' : 'warning'}`}><strong>{product.quantity}</strong><span>{product.quantity === 0 ? 'Out of stock' : 'Units left'}</span></div></article>)}</div>}</section>}
    </main>
  </div>
}

function ShopStatusCard({ shop }: { shop: SellerShop }) {
  return <><article className="seller-shop-item"><div className="seller-shop-icon"><Store size={21} /></div><div className="seller-shop-details"><div className="seller-shop-title"><h3>{shop.name}</h3><StatusBadge status={shop.status} /></div><p>{shop.description || 'No description provided.'}</p><small>{shop.city}{shop.slug ? ` · ${shop.slug}` : ''}</small>{shop.status === 'REJECTED' && shop.rejectionReason && <div className="seller-rejection">Backend feedback: {shop.rejectionReason}</div>}</div></article>{shop.status === 'APPROVED' && <FulfilmentCard shop={shop} />}</>
}

function AddProductPanel({ shops, savingShopId, onCreate }: { shops: SellerShop[]; savingShopId: string | null; onCreate: (shopId: string, input: SellerProductCreateInput) => Promise<void> }) {
  const [shopId, setShopId] = useState(shops[0]?.id ?? '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('0')
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!shops.some((shop) => shop.id === shopId)) setShopId(shops[0]?.id ?? '')
  }, [shops, shopId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    const parsedPrice = Number(price)
    const parsedQuantity = Number(initialQuantity)
    if (!shopId) return setValidationError('Choose an approved shop.')
    if (!trimmedName) return setValidationError('Product name is required.')
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return setValidationError('Price must be zero or greater.')
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) return setValidationError('Initial inventory must be a whole number zero or greater.')
    setValidationError(null)
    try {
      await onCreate(shopId, { name: trimmedName, description: description.trim(), price: parsedPrice, initialQuantity: parsedQuantity })
      setName('')
      setDescription('')
      setPrice('')
      setInitialQuantity('0')
    } catch {
      // The parent keeps the form available and renders the backend error.
    }
  }

  const busy = savingShopId !== null
  return <section className="seller-card seller-add-product-card" aria-labelledby="add-product-heading"><div className="seller-card-heading"><div><span className="overline">CATALOGUE ACTION</span><h2 id="add-product-heading">Add a new product</h2></div><Package size={21} aria-hidden="true" /></div><p className="seller-section-intro">Create a product in an approved shop. The backend stores the product and starting inventory; customers see it only when it is active and the shop is approved.</p><form className="seller-form seller-add-product-form" onSubmit={(event) => void submit(event)}><div className="form-field form-field-wide"><label htmlFor="new-product-shop">Approved shop <span aria-hidden="true">*</span></label><select id="new-product-shop" value={shopId} disabled={busy} onChange={(event) => setShopId(event.target.value)}>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} · {shop.city}</option>)}</select></div><div className="form-field form-field-wide"><label htmlFor="new-product-name">Product name <span aria-hidden="true">*</span></label><input id="new-product-name" required maxLength={200} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder="e.g. Whole wheat atta" /></div><div className="form-field"><label htmlFor="new-product-price">Price <span aria-hidden="true">*</span></label><input id="new-product-price" required type="number" min="0" step="0.01" value={price} disabled={busy} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></div><div className="form-field"><label htmlFor="new-product-quantity">Starting inventory <span aria-hidden="true">*</span></label><input id="new-product-quantity" required type="number" min="0" step="1" value={initialQuantity} disabled={busy} onChange={(event) => setInitialQuantity(event.target.value)} /></div><div className="form-field form-field-wide"><label htmlFor="new-product-description">Description</label><textarea id="new-product-description" rows={3} maxLength={1000} value={description} disabled={busy} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the pack size or key details." /></div>{validationError && <p className="seller-validation-error" role="alert">{validationError}</p>}<div className="form-actions form-field-wide"><button className="seller-primary-button" type="submit" disabled={busy}>{busy ? 'Adding product…' : 'Add product'}</button><span className="form-hint">New products are active by default and can be edited below.</span></div></form></section>
}

function FulfilmentCard({ shop }: { shop: SellerShop }) {
  const [settings, setSettings] = useState<FulfilmentSettings>({ shopId: shop.id, deliveryEnabled: false, pickupEnabled: false, deliveryFee: 0 })
  const [slots, setSlots] = useState<DeliverySlot[]>([])
  const [form, setForm] = useState<DeliverySlotInput>({ date: '', startTime: '', endTime: '', capacity: 1 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotBusy, setSlotBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [nextSettings, nextSlots] = await Promise.all([sellerApi.getFulfilment(shop.id), sellerApi.listDeliverySlots(shop.id)])
      setSettings(nextSettings)
      setSlots(nextSlots)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Fulfilment settings could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [shop.id])

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings.pickupEnabled && !settings.deliveryEnabled) {
      setError('Enable pickup or delivery before saving fulfilment settings.')
      return
    }
    if (!Number.isFinite(settings.deliveryFee) || settings.deliveryFee < 0) {
      setError('Delivery fee must be zero or greater.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      setSettings(await sellerApi.saveFulfilment(shop.id, { deliveryEnabled: settings.deliveryEnabled, pickupEnabled: settings.pickupEnabled, deliveryFee: settings.deliveryFee }))
      setNotice('Fulfilment settings saved.')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Fulfilment settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.date || !form.startTime || !form.endTime || !Number.isInteger(form.capacity) || form.capacity < 1) {
      setError('Enter a date, start and end time, and a capacity of at least one.')
      return
    }
    if (form.endTime <= form.startTime) {
      setError('Delivery slot end time must be after its start time.')
      return
    }
    setSlotSaving(true)
    setError(null)
    setNotice(null)
    try {
      const created = await sellerApi.createDeliverySlot(shop.id, form)
      setSlots((current) => [...current, created])
      setForm({ date: '', startTime: '', endTime: '', capacity: 1 })
      setNotice('Delivery slot created.')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Delivery slot could not be created.')
    } finally {
      setSlotSaving(false)
    }
  }

  async function toggleSlot(slot: DeliverySlot) {
    setSlotBusy(slot.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await sellerApi.toggleDeliverySlot(shop.id, slot.id, !slot.active)
      setSlots((current) => current.map((candidate) => candidate.id === slot.id ? updated : candidate))
      setNotice(`Slot ${updated.active ? 'enabled' : 'disabled'}.`)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Delivery slot could not be updated.')
    } finally {
      setSlotBusy(null)
    }
  }

  return <section className="seller-fulfilment-item" aria-labelledby={`fulfilment-${shop.id}`}><div className="seller-fulfilment-heading"><div><span className="overline">APPROVED SHOP</span><h3 id={`fulfilment-${shop.id}`}>{shop.name}</h3></div><span className="seller-status seller-status-approved"><CheckCircle2 size={15} aria-hidden="true" /> Approved</span></div>{error && <div className="seller-alert seller-alert-error fulfilment-alert" role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" className="seller-inline-retry" onClick={() => void load()}>Retry</button></div>}{notice && <div className="seller-alert seller-alert-success fulfilment-alert" role="status"><CheckCircle2 size={16} /><span>{notice}</span></div>}{loading ? <div className="seller-loading seller-fulfilment-loading" role="status"><div className="loader" /><p>Loading fulfilment settings and delivery slots.</p></div> : <><form className="seller-fulfilment-settings" onSubmit={saveSettings}><label className="seller-toggle"><input type="checkbox" checked={settings.deliveryEnabled} onChange={(event) => setSettings({ ...settings, deliveryEnabled: event.target.checked })} /><span>Delivery enabled</span></label><label className="seller-toggle"><input type="checkbox" checked={settings.pickupEnabled} onChange={(event) => setSettings({ ...settings, pickupEnabled: event.target.checked })} /><span>Pickup enabled</span></label><div className="form-field fulfilment-fee-field"><label htmlFor={`delivery-fee-${shop.id}`}>Delivery fee</label><input id={`delivery-fee-${shop.id}`} type="number" min="0" step="0.01" value={settings.deliveryFee} onChange={(event) => setSettings({ ...settings, deliveryFee: Number(event.target.value) })} /><span className="field-help">Charged only for delivery. The checkout preview remains server-priced.</span></div><button className="seller-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button></form><div className="seller-slot-section"><div className="seller-slot-heading"><div><span className="overline">DELIVERY SLOTS</span><h4>Capacity and availability</h4></div><span className="count-label">{slots.length} {slots.length === 1 ? 'slot' : 'slots'}</span></div><p className="field-help">Create slots in local time. Disabling a slot removes it from the customer selection without deleting its history.</p><form className="seller-slot-form" onSubmit={createSlot}><div className="form-field"><label htmlFor={`slot-date-${shop.id}`}>Date</label><input id={`slot-date-${shop.id}`} type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></div><div className="form-field"><label htmlFor={`slot-start-${shop.id}`}>Start time</label><input id={`slot-start-${shop.id}`} type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></div><div className="form-field"><label htmlFor={`slot-end-${shop.id}`}>End time</label><input id={`slot-end-${shop.id}`} type="time" required value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></div><div className="form-field"><label htmlFor={`slot-capacity-${shop.id}`}>Capacity</label><input id={`slot-capacity-${shop.id}`} type="number" min="1" step="1" required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} /></div><button className="seller-secondary-button" type="submit" disabled={slotSaving}>{slotSaving ? 'Creating…' : 'Create slot'}</button></form>{slots.length === 0 ? <div className="seller-slot-empty"><Clock3 size={20} /><p>No delivery slots have been created yet.</p></div> : <div className="seller-slot-list">{slots.map((slot) => <div className={`seller-slot-row ${slot.active ? '' : 'seller-slot-disabled'}`} key={slot.id}><div><strong>{slot.date}</strong><span>{slot.startTime}–{slot.endTime}</span></div><span className="seller-slot-capacity">{Math.max(0, slot.capacity - slot.booked)} of {slot.capacity} remaining</span><button type="button" className="seller-secondary-button" onClick={() => void toggleSlot(slot)} disabled={slotBusy === slot.id}>{slotBusy === slot.id ? 'Saving…' : slot.active ? 'Disable' : 'Enable'}</button></div>)}</div>}</div></>}</section>
}

function formatPrice(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SellerOrderCard({ order, busy, onTransition }: { order: SellerOrder; busy: boolean; onTransition: (status: OrderStatus) => void }) {
  return <article className="seller-order-card"><div className="seller-order-heading"><div><span className="overline">ORDER #{order.id.slice(0, 8)}</span><h3>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</h3><small>{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable'} · Shop {order.shopId.slice(0, 8)}</small></div><OrderStatusBadge status={order.status} /></div><div className="seller-order-items">{order.items.map((item) => <div className="seller-order-item" key={`${item.productId}-${item.productName}`}><span>{item.productName}</span><span>{item.quantity} × {formatPrice(item.unitPrice)}</span><strong>{formatPrice(item.quantity * item.unitPrice)}</strong></div>)}</div><div className="seller-order-footer"><div><span>TOTAL</span><strong>{formatPrice(order.total)}</strong></div><div className="seller-order-actions">{orderTransitions[order.status].map((action) => <button key={action.status} className={action.status === 'CANCELLED' ? 'seller-cancel-button' : 'seller-primary-button'} onClick={() => onTransition(action.status)} disabled={busy}>{busy ? 'Saving…' : action.label}</button>)}</div></div></article>
}

function SellerProductCard({ product, editing, saving, onEdit, onCancel, onSave }: { product: SellerProduct; editing: boolean; saving: boolean; onEdit: () => void; onCancel: () => void; onSave: (input: SellerProductInput) => Promise<void> }) {
  if (editing) return <ProductEditor product={product} saving={saving} onCancel={onCancel} onSave={onSave} />
  const availability = !product.active ? 'Inactive' : product.quantity > 0 ? 'Available' : 'Out of stock'
  const availabilityClass = availability === 'Available' ? 'available' : availability === 'Inactive' ? 'inactive' : 'out'
  return <article className="seller-product-row"><div className="seller-product-main"><div className="seller-product-icon"><Package size={19} /></div><div><h4>{product.name}</h4><p>{product.description || 'No description provided.'}</p></div></div><div className="seller-product-stat"><span>PRICE</span><strong>{formatPrice(product.price)}</strong></div><div className="seller-product-stat"><span>INVENTORY</span><strong>{product.quantity}</strong></div><div className="seller-product-stat"><span>AVAILABILITY</span><b className={`seller-availability seller-availability-${availabilityClass}`}>{availability}</b></div><button className="seller-edit-button" onClick={onEdit}><Edit3 size={15} /> Edit</button></article>
}

function ProductEditor({ product, saving, onCancel, onSave }: { product: SellerProduct; saving: boolean; onCancel: () => void; onSave: (input: SellerProductInput) => Promise<void> }) {
  const [form, setForm] = useState<SellerProductInput>({ name: product.name, description: product.description, price: product.price, quantity: product.quantity, active: product.active })
  const [validationError, setValidationError] = useState<string | null>(null)
  const idPrefix = `product-${product.id}`

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) return setValidationError('Product name is required.')
    if (!Number.isFinite(form.price) || form.price < 0) return setValidationError('Price must be zero or greater.')
    if (!Number.isInteger(form.quantity) || form.quantity < 0) return setValidationError('Inventory must be a whole number zero or greater.')
    setValidationError(null)
    try {
      await onSave({ ...form, name, description: form.description.trim() })
    } catch {
      // The parent renders the backend error and keeps this editor open.
    }
  }

  return <form className="seller-product-editor" onSubmit={submit} aria-label={`Edit ${product.name}`}><div className="seller-editor-heading"><div><span className="overline">EDIT PRODUCT</span><h4>{product.name}</h4></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Cancel product editing"><X size={17} /></button></div><div className="seller-product-editor-fields"><div className="form-field"><label htmlFor={`${idPrefix}-name`}>Name <span aria-hidden="true">*</span></label><input id={`${idPrefix}-name`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} aria-invalid={Boolean(validationError && !form.name.trim())} /></div><div className="form-field"><label htmlFor={`${idPrefix}-price`}>Price <span aria-hidden="true">*</span></label><input id={`${idPrefix}-price`} type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></div><div className="form-field"><label htmlFor={`${idPrefix}-quantity`}>Inventory quantity <span aria-hidden="true">*</span></label><input id={`${idPrefix}-quantity`} type="number" min="0" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></div><div className="form-field seller-active-field"><label htmlFor={`${idPrefix}-active`}>Availability</label><label className="seller-toggle"><input id={`${idPrefix}-active`} type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>Active for customers</span></label></div><div className="form-field form-field-wide"><label htmlFor={`${idPrefix}-description`}>Description</label><textarea id={`${idPrefix}-description`} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div></div>{validationError && <p className="seller-validation-error" role="alert">{validationError}</p>}<div className="seller-editor-actions"><button type="button" className="seller-secondary-button" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="seller-primary-button" disabled={saving}>{saving ? <><span className="loader seller-loader" /> Saving…</> : <><Save size={15} /> Save changes</>}</button></div></form>
}

function UnavailableSellerState() {
  return <div className="seller-unavailable" role="status"><CircleAlert size={28} /><h2>Seller onboarding is unavailable here</h2><p>{sellerApi.unavailableMessage()}</p><p>Sign in with a seller account and configure <code>VITE_API_BASE_URL</code>. No seller data is stored or fabricated locally.</p></div>
}
