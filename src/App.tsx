import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, CircleAlert, Clock3, Heart, MapPin, Minus, Plus, RefreshCw, Search, ShoppingBag, Star, Store, X, XCircle } from 'lucide-react'
import { appConfig } from './config/environment'
import { catalogApi, type CatalogSource } from './services/catalogApi'
import { cartApi, type AvailableDeliverySlot, type CartLine, type CartSnapshot, type CheckoutPreview, type FulfilmentOptions } from './services/cartApi'
import { authApi, type DevIdentity } from './services/authApi'
import { orderApi } from './services/orderApi'
import { paymentApi, type PaymentIntent } from './services/paymentApi'
import type { Category, Product, Shop } from './types'
import SellerView from './SellerView'
import AdminView from './AdminView'
import OrdersView from './OrdersView'
import LoginView from './LoginView'
import VerifyEmailView from './VerifyEmailView'
import SupportView from './SupportView'
import AuthControls from './AuthControls'
import NotificationBell from './NotificationBell'
import NotificationsView from './NotificationsView'

const categories: { label: Category; icon: string }[] = [
  { label: 'All', icon: '✦' }, { label: 'Fresh', icon: '🥬' }, { label: 'Grocery', icon: '🛒' }, { label: 'Tiffin', icon: '🍱' }, { label: 'Home', icon: '🏠' }, { label: 'Services', icon: '🛠️' },
]

function newIdempotencyKey(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `dukaansetu-${prefix}-${random}`
}

function Storefront({ identity }: { identity: DevIdentity | null }) {
  const [category, setCategory] = useState<Category>('All')
  const [query, setQuery] = useState('')
  const [shops, setShops] = useState<Shop[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [source, setSource] = useState<CatalogSource>(appConfig.apiBaseUrl ? 'api' : appConfig.allowDemoFallback ? 'demo' : 'unavailable')
  const [reloadToken, setReloadToken] = useState(0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [serverCart, setServerCart] = useState<CartSnapshot | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [cartLoading, setCartLoading] = useState(false)
  const [cartBusy, setCartBusy] = useState(false)
  const [cartError, setCartError] = useState<string | null>(null)
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [fulfilmentOptions, setFulfilmentOptions] = useState<FulfilmentOptions | null>(null)
  const [fulfilmentLoading, setFulfilmentLoading] = useState(false)
  const [fulfilmentError, setFulfilmentError] = useState<string | null>(null)
  const [fulfilmentMethod, setFulfilmentMethod] = useState<'PICKUP' | 'DELIVERY'>('PICKUP')
  const [deliverySlotId, setDeliverySlotId] = useState('')
  const [activeShop, setActiveShop] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sandboxSelected, setSandboxSelected] = useState(false)
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [orderKey, setOrderKey] = useState<string | null>(null)
  const [paymentKey, setPaymentKey] = useState<string | null>(null)
  const apiCartMode = source === 'api'
  const liveCartEnabled = apiCartMode && identity?.role === 'buyer' && authApi.isAuthenticated()

  useEffect(() => {
    let alive = true
    setLoading(true); setError(false)
    catalogApi.load().then((catalog) => { if (alive) { setShops(catalog.shops); setProducts(catalog.products); setSource(catalog.source); setLoading(false) } }).catch(() => { if (alive) { setLoading(false); setError(true) } })
    return () => { alive = false }
  }, [reloadToken])

  useEffect(() => {
    if (!liveCartEnabled || !products.length) return
    let alive = true
    setCartLoading(true); setCartError(null)
    cartApi.load(products, shops).then((snapshot) => { if (alive) { setCart(snapshot.lines); setServerCart(snapshot); setCartLoading(false) } }).catch((reason: unknown) => { if (alive) { setCartLoading(false); setCartError(reason instanceof Error ? reason.message : 'We could not load your live cart.') } })
    return () => { alive = false }
  }, [liveCartEnabled, products, shops])

  const visibleShops = useMemo(() => shops.filter((shop) => (category === 'All' || shop.category === category) && `${shop.name} ${shop.description}`.toLowerCase().includes(query.toLowerCase())), [shops, category, query])
  const visibleProducts = useMemo(() => products.filter((product) => { const shop = shops.find((item) => item.id === product.shopId); return (!activeShop || product.shopId === activeShop) && (category === 'All' || shop?.category === category) && (!query || `${product.name} ${product.detail} ${shop?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())) }), [products, shops, category, query, activeShop])
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const calculatedCartTotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const cartSubtotal = apiCartMode ? (serverCart?.subtotal ?? calculatedCartTotal) : calculatedCartTotal
  const cartShop = cart[0] ? shops.find((shop) => shop.id === (serverCart?.shopId ?? cart[0].product.shopId)) : null
  const selectedSlot = fulfilmentOptions?.slots.find((slot) => slot.id === deliverySlotId)
  const total = checkoutPreview?.total ?? serverCart?.total ?? cartSubtotal + (fulfilmentMethod === 'DELIVERY' ? fulfilmentOptions?.deliveryFee ?? 0 : 0)

  function resetPayment() { setSandboxSelected(false); setPaymentIntent(null); setPaymentLoading(false); setPaymentError(null); setOrderId(null); setOrderKey(null); setPaymentKey(null) }

  async function addToCart(product: Product) {
    if (cartBusy) return
    if (cart.length && cart[0].product.shopId !== product.shopId) { setNotice('Your cart is for one shop at a time. Open the cart to review it before choosing another shop.'); return }
    if (apiCartMode) {
      if (!liveCartEnabled) { setNotice('Sign in as a buyer to add products to the live cart.'); window.location.hash = '#login'; return }
      setCartBusy(true); setCartError(null)
      try { const snapshot = await cartApi.addItem(product, products, shops); setCart(snapshot.lines); setServerCart(snapshot); setCheckoutPreview(null); resetPayment(); setNotice(null) } catch (reason: unknown) { setCartError(reason instanceof Error ? reason.message : 'We could not update your live cart.') } finally { setCartBusy(false) }
      return
    }
    setNotice(null); setCart((current) => current.some((line) => line.product.id === product.id) ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1 }])
  }

  async function changeQuantity(productId: string, delta: number) {
    if (apiCartMode) {
      if (!liveCartEnabled) { setNotice('Live cart access requires a signed-in buyer account.'); return }
      const line = cart.find((candidate) => candidate.product.id === productId); if (!line) return
      setCartBusy(true); setCartError(null)
      try { const snapshot = line.quantity + delta <= 0 ? await cartApi.removeItem(productId, products, shops) : await cartApi.updateQuantity(productId, line.quantity + delta, products, shops); setCart(snapshot.lines); setServerCart(snapshot); setCheckoutPreview(null); resetPayment() } catch (reason: unknown) { setCartError(reason instanceof Error ? reason.message : 'We could not update your live cart.') } finally { setCartBusy(false) }
      return
    }
    setCart((current) => current.flatMap((line) => line.product.id === productId && line.quantity + delta <= 0 ? [] : line.product.id === productId ? [{ ...line, quantity: line.quantity + delta }] : [line]))
  }

  async function refreshServerCart(preservePayment = false) {
    if (!liveCartEnabled) return
    setCartLoading(true); setCartError(null)
    try {
      const snapshot = await cartApi.load(products, shops); setCart(snapshot.lines); setServerCart(snapshot); setCheckoutPreview(preservePayment ? checkoutPreview : null); if (!preservePayment) resetPayment(); setFulfilmentOptions(null); setDeliverySlotId('')
      if (snapshot.shopId) { setFulfilmentLoading(true); setFulfilmentError(null); try { const options = await cartApi.getFulfilmentOptions(snapshot.shopId); setFulfilmentOptions(options); setFulfilmentMethod(options.pickupEnabled ? 'PICKUP' : 'DELIVERY'); setDeliverySlotId(options.slots[0]?.id ?? '') } catch (reason: unknown) { setFulfilmentError(reason instanceof Error ? reason.message : 'Fulfilment options are unavailable right now.') } finally { setFulfilmentLoading(false) } }
    } catch (reason: unknown) { setCartError(reason instanceof Error ? reason.message : 'We could not load your live cart.') } finally { setCartLoading(false) }
  }

  async function previewCheckout() {
    if (!liveCartEnabled || !cart.length) return
    if (!fulfilmentOptions || (!fulfilmentOptions.pickupEnabled && !fulfilmentOptions.deliveryEnabled)) { setCartError('This shop has not configured a pickup or delivery method yet.'); return }
    if (fulfilmentMethod === 'DELIVERY' && !deliverySlotId) { setCartError('Choose an available delivery slot before previewing checkout.'); return }
    setPreviewLoading(true); setCartError(null)
    try { setCheckoutPreview(await cartApi.previewCheckout({ fulfilmentMethod, ...(fulfilmentMethod === 'DELIVERY' ? { deliverySlotId } : {}) })); resetPayment() } catch (reason: unknown) { setCartError(reason instanceof Error ? reason.message : 'Checkout preview is unavailable right now.') } finally { setPreviewLoading(false) }
  }

  async function startSandboxPayment() {
    if (!sandboxSelected || !checkoutPreview || !cart.length || !serverCart?.shopId || !paymentApi.isAvailable()) { if (!paymentApi.isAvailable()) setPaymentError(paymentApi.unavailableMessage()); return }
    setPaymentLoading(true); setPaymentError(null)
    try {
      const currentOrderKey = orderKey ?? newIdempotencyKey('order'); if (!orderKey) setOrderKey(currentOrderKey)
      const order = orderId ? await orderApi.getDetail(orderId) : await orderApi.create({ shopId: serverCart.shopId, items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }, currentOrderKey)
      if (!orderId) setOrderId(order.id)
      const currentPaymentKey = paymentKey ?? newIdempotencyKey('payment'); if (!paymentKey) setPaymentKey(currentPaymentKey)
      const intent = await paymentApi.createSandboxIntent({ orderId: order.id, idempotencyKey: currentPaymentKey }); setPaymentIntent(intent)
      if (intent.status === 'PENDING') for (let attempt = 0; attempt < 12; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 1500)); const latest = await paymentApi.getIntent(intent.id); setPaymentIntent(latest); if (latest.status !== 'PENDING') break }
    } catch (reason: unknown) { setPaymentError(reason instanceof Error ? reason.message : 'The sandbox payment request could not be completed.') } finally { setPaymentLoading(false) }
  }

  function openCart() { setCartOpen(true); if (liveCartEnabled && !checkoutPreview && !paymentIntent) void refreshServerCart(true) }

  function focusSection(id: string) {
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function showAllShops() {
    setCategory('All')
    setQuery('')
    setActiveShop(null)
    focusSection('shops-section')
  }

  function selectShop(shopId: string) {
    setActiveShop((current) => current === shopId ? null : shopId)
    focusSection('shop-products')
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="DukaanSetu home"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a><div className="location"><MapPin size={17} strokeWidth={2.5} /><div><span className="eyebrow">DELIVERING TO</span><strong>Gurugram, Haryana</strong></div><ChevronDown size={15} /></div><div className="top-actions">{identity?.role === 'buyer' && <><a className="orders-nav-link" href="#orders">Orders</a><a className="support-nav-link" href="#support">Support</a></>}{identity?.role === 'seller' && <a className="seller-nav-link" href="#seller">Seller studio</a>}{identity?.role === 'admin' && <><a className="admin-nav-link" href="#admin">Admin</a><a className="support-nav-link" href="#support">Support</a></>}{identity?.role === 'support' && <a className="support-nav-link" href="#support">Support</a>}<NotificationBell /><button className="icon-button" aria-label="Saved shops"><Heart size={19} /></button><button className="cart-button" onClick={openCart}><ShoppingBag size={18} /><span>Cart</span>{cartCount > 0 && <b>{cartCount}</b>}</button><AuthControls identity={identity} /></div></header>
    <main id="top">{appConfig.environment === 'dev' && <div className="dev-warning" role="note"><strong>Development mode</strong><span>Seeded role login is available as an explicit local fallback; account auth uses the configured API.</span></div>}{!authApi.isAuthenticated() && !identity && appConfig.apiBaseUrl && <div className="dev-warning production-auth-warning" role="status"><strong>Sign in for protected actions</strong><span>The catalogue is public. Cart, orders, support, and workspaces require a signed-in account.</span></div>}{notice && <div className="notice" role="status"><span>{notice}</span><button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
      <section className="hero"><div className="hero-copy"><div className="demo-badge"><span className="pulse" /> {appConfig.environment.toUpperCase()} · {source === 'api' ? 'Catalogue API' : source === 'demo' ? 'Demo storefront' : 'Catalogue unavailable'}</div><h1>Your local market,<br /><em>together.</em></h1><p>Discover trusted neighbourhood shops and get the things you need, from people you know.</p><div className="search-wrap"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shops, products, or essentials" aria-label="Search shops, products, or essentials" /><kbd>⌘ K</kbd></div><div className="hero-note"><span><MapPin size={14} /> Serving select areas in Gurugram</span><span><Clock3 size={14} /> Same-day neighbourhood delivery</span></div></div><div className="hero-art" aria-hidden="true"><div className="sun" /><div className="arch"><div className="shop-window"><span>YOUR<br />LOCAL<br /><b>MARKET</b></span><div className="window-plants">🌿　🌿</div></div></div><div className="art-leaf leaf-one">✦</div><div className="art-leaf leaf-two">✦</div></div></section>
       <section className="content-section categories-section"><div className="section-heading"><div><span className="overline">EXPLORE THE NEIGHBOURHOOD</span><h2>What are you looking for?</h2></div><span className="count-label">{visibleShops.length} shops nearby</span></div><div className="category-row" role="tablist" aria-label="Shop categories">{categories.map((item) => <button key={item.label} className={`category-chip ${category === item.label ? 'selected' : ''}`} onClick={() => { setCategory(item.label); setActiveShop(null) }} role="tab" aria-selected={category === item.label}><span>{item.icon}</span>{item.label}</button>)}</div></section>
       <section id="shops-section" className="content-section shops-section"><div className="section-heading"><div><span className="overline">MEET YOUR NEIGHBOURS</span><h2>Shops around you</h2></div><button className="text-link" onClick={showAllShops}>View all <ArrowRight size={16} /></button></div>{loading ? <LoadingState /> : error ? <ErrorState onRetry={() => { setError(false); setReloadToken((token) => token + 1) }} /> : visibleShops.length === 0 ? <EmptyState label="shops" /> : <div className="shop-grid">{visibleShops.map((shop) => <ShopCard key={shop.id} shop={shop} active={activeShop === shop.id} onClick={() => selectShop(shop.id)} />)}</div>}</section>
        <section id="shop-products" className="content-section products-section"><div className="section-heading"><div><span className="overline">A LITTLE SOMETHING FOR TODAY</span><h2>{activeShop ? `${shops.find((shop) => shop.id === activeShop)?.name ?? 'Shop'} products` : 'Popular near you'}</h2></div><div className="products-heading-actions">{activeShop && <button className="text-link" onClick={() => setActiveShop(null)}>Show all products</button>}<span className="fresh-label"><span className="green-dot" /> {source === 'api' ? 'Live catalogue' : 'Local demo data'}</span></div></div>{loading ? <LoadingState /> : !error && visibleProducts.length === 0 ? <EmptyState label="products" /> : !error && <div className="product-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} shop={shops.find((shop) => shop.id === product.shopId)} onView={() => setSelectedProduct(product)} onAdd={() => void addToCart(product)} addLabel={apiCartMode && !liveCartEnabled ? 'Sign in' : 'Add'} />)}</div>}</section>
       {selectedProduct && <ProductDetails product={selectedProduct} shop={shops.find((shop) => shop.id === selectedProduct.shopId)} onClose={() => setSelectedProduct(null)} onAdd={() => { setSelectedProduct(null); void addToCart(selectedProduct) }} addLabel={apiCartMode && !liveCartEnabled ? 'Sign in to add' : 'Add to cart'} />}
    </main>
    <footer className="footer"><div className="brand footer-brand"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></div><p>{source === 'api' ? 'Discovering local commerce in Gurugram.' : source === 'demo' ? 'A demo foundation for discovering local commerce in Gurugram.' : 'Catalogue configuration is required for this environment.'}</p><span className="footer-demo">{appConfig.environment.toUpperCase()} · {source === 'api' ? 'CATALOGUE API' : source === 'demo' ? 'DEMO DATA ONLY' : 'CATALOGUE UNAVAILABLE'}</span></footer>
    {cartOpen && <CartDrawer cart={cart} cartShop={cartShop} cartShopName={serverCart?.shopName} subtotal={cartSubtotal} total={total} mode={apiCartMode ? 'api' : source === 'demo' ? 'demo' : 'unavailable'} liveCartEnabled={liveCartEnabled} loading={cartLoading} busy={cartBusy} error={cartError} fulfilmentOptions={fulfilmentOptions} fulfilmentLoading={fulfilmentLoading} fulfilmentError={fulfilmentError} fulfilmentMethod={fulfilmentMethod} deliverySlotId={deliverySlotId} selectedDeliverySlot={selectedSlot} preview={checkoutPreview} previewLoading={previewLoading} sandboxSelected={sandboxSelected} paymentIntent={paymentIntent} paymentLoading={paymentLoading} paymentError={paymentError} orderId={orderId} onClose={() => setCartOpen(false)} onRefresh={refreshServerCart} onPreview={previewCheckout} onChange={changeQuantity} onFulfilmentMethod={(method) => { setFulfilmentMethod(method); setCheckoutPreview(null); resetPayment(); setCartError(null) }} onDeliverySlot={(slotId) => { setDeliverySlotId(slotId); setCheckoutPreview(null); resetPayment(); setCartError(null) }} onSandboxSelected={(value) => { setSandboxSelected(value); setPaymentError(null) }} onSandboxPayment={startSandboxPayment} />}
  </div>
}

function ShopCard({ shop, active, onClick }: { shop: Shop; active: boolean; onClick: () => void }) { return <article className={`shop-card ${active ? 'active' : ''}`}><button className={`shop-avatar ${shop.accent}`} onClick={onClick} aria-label={`View products from ${shop.name}`}><span>{shop.initials}</span><i>{shop.open ? 'Open' : 'Closed'}</i></button><div className="shop-info"><div className="shop-topline"><span className="shop-category">{shop.category}</span><span className="distance">{shop.distance}</span></div><h3>{shop.name}</h3><p>{shop.description}</p><div className="shop-meta">{shop.rating !== undefined && shop.rating > 0 ? <span><Star size={14} fill="currentColor" /> {shop.rating.toFixed(1)}</span> : <span className="shop-new-label">New shop</span>}<span>·</span><span>{shop.open ? 'Open now' : 'Closed'}</span></div></div><button className="round-arrow" onClick={onClick} aria-label={`View products from ${shop.name}`}><ArrowRight size={17} /></button></article> }
function ProductCard({ product, shop, onView, onAdd, addLabel }: { product: Product; shop?: Shop; onView: () => void; onAdd: () => void; addLabel: string }) { return <article className="product-card"><div className="product-image"><span>{product.emoji}</span>{product.tag && <b>{product.tag}</b>}<button aria-label={`Save ${product.name}`} className="save-product"><Heart size={16} /></button></div><div className="product-body"><span className="product-shop">{shop?.name}</span><button className="product-view-button" onClick={onView}>{product.name}</button><p>{product.detail}</p><div className="product-bottom"><strong>₹{product.price}</strong><div className="product-actions"><button className="product-see-button" onClick={onView}>See</button><button className="add-button" onClick={onAdd}><Plus size={16} /> {addLabel}</button></div></div></div></article> }

function ProductDetails({ product, shop, onClose, onAdd, addLabel }: { product: Product; shop?: Shop; onClose: () => void; onAdd: () => void; addLabel: string }) { return <div className="product-details-backdrop" role="presentation" onClick={onClose}><section className="product-details" role="dialog" aria-modal="true" aria-labelledby="product-details-heading" onClick={(event) => event.stopPropagation()}><button className="product-details-close" onClick={onClose} aria-label="Close product details"><X size={19} /></button><div className="product-details-emoji">{product.emoji}</div><span className="product-shop">{shop?.name ?? 'Local shop'}</span><h2 id="product-details-heading">{product.name}</h2><p>{product.detail}</p><strong className="product-details-price">₹{product.price}</strong><button className="seller-primary-button product-details-add" onClick={onAdd}><Plus size={17} /> {addLabel}</button></section></div> }
function LoadingState() { return <div className="state-card"><div className="loader" /><h3>Finding shops around you</h3><p>Just a moment while we check the neighbourhood.</p></div> }
function EmptyState({ label }: { label: string }) { return <div className="state-card"><div className="state-icon">⌕</div><h3>No {label} found</h3><p>Try a different search or explore another category.</p></div> }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="state-card error-state"><div className="state-icon">!</div><h3>We couldn’t load the catalogue</h3><p>There was a problem connecting to the catalogue. Please try again.</p><button className="retry-button" onClick={onRetry}>Try again</button></div> }

function CartDrawer(props: {
  cart: CartLine[]; cartShop: Shop | null | undefined; cartShopName?: string; subtotal: number; total: number; mode: 'api' | 'demo' | 'unavailable'; liveCartEnabled: boolean; loading: boolean; busy: boolean; error: string | null; fulfilmentOptions: FulfilmentOptions | null; fulfilmentLoading: boolean; fulfilmentError: string | null; fulfilmentMethod: 'PICKUP' | 'DELIVERY'; deliverySlotId: string; selectedDeliverySlot?: AvailableDeliverySlot; preview: CheckoutPreview | null; previewLoading: boolean; sandboxSelected: boolean; paymentIntent: PaymentIntent | null; paymentLoading: boolean; paymentError: string | null; orderId: string | null; onClose: () => void; onRefresh: () => void; onPreview: () => void; onChange: (id: string, delta: number) => void | Promise<void>; onFulfilmentMethod: (method: 'PICKUP' | 'DELIVERY') => void; onDeliverySlot: (slotId: string) => void; onSandboxSelected: (selected: boolean) => void; onSandboxPayment: () => void | Promise<void>
}) {
  const itemCount = props.cart.reduce((sum, line) => sum + line.quantity, 0)
  const { mode, fulfilmentOptions, preview } = props
  return <div className="drawer-backdrop" onClick={props.onClose}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cart-title">
    <div className="drawer-header"><div><span className="overline">YOUR BAG</span><h2 id="cart-title">Cart <small>({itemCount})</small></h2></div><div className="drawer-actions">{mode === 'api' && <button className="icon-button" onClick={props.onRefresh} disabled={props.loading || !props.liveCartEnabled} aria-label="Refresh live cart"><RefreshCw size={17} /></button>}<button className="icon-button" onClick={props.onClose} aria-label="Close cart"><X size={20} /></button></div></div>
    {mode === 'api' && !props.liveCartEnabled ? <div className="drawer-state drawer-warning" role="status"><ShoppingBag size={28} /><h3>Live cart unavailable</h3><p>Sign in as a buyer to access the protected API cart. No cart data was stored locally.</p><a className="seller-nav-link" href="#login">Sign in</a></div> : props.loading && !props.cart.length ? <div className="drawer-state" role="status"><div className="loader" /><h3>Refreshing your cart</h3><p>Reading the latest cart from the server.</p></div> : props.error && !props.cart.length ? <div className="drawer-state drawer-error" role="alert"><div className="state-icon">!</div><h3>We couldn’t load your cart</h3><p>{props.error}</p><button className="retry-button" onClick={props.onRefresh} disabled={props.loading}>Try again</button></div> : !props.cart.length ? <div className="drawer-empty"><ShoppingBag size={34} /><h3>Your bag is waiting</h3><p>{mode === 'api' ? 'Your server cart is empty.' : 'Add something lovely from a local shop.'}</p></div> : <>
      {props.error && <p className="cart-inline-error" role="alert">{props.error}</p>}<div className="cart-shop"><Store size={16} /><span>{props.cartShopName ?? props.cartShop?.name ?? 'Local shop'}</span><small>One shop per order</small></div><div className="cart-lines">{props.cart.map((line) => <div className="cart-line" key={line.product.id}><span className="line-emoji">{line.product.emoji}</span><div><h3>{line.product.name}</h3><p>₹{line.product.price} · {line.product.unit}</p></div><div className="quantity"><button onClick={() => props.onChange(line.product.id, -1)} disabled={props.busy} aria-label={`Remove one ${line.product.name}`}><Minus size={14} /></button><span aria-live="polite">{line.quantity}</span><button onClick={() => props.onChange(line.product.id, 1)} disabled={props.busy} aria-label={`Add one ${line.product.name}`}><Plus size={14} /></button></div></div>)}</div>
      <div className="cart-summary"><div><span>{mode === 'api' ? 'Server subtotal' : 'Subtotal'}</span><strong>₹{props.subtotal}</strong></div>{mode === 'api' && props.fulfilmentMethod === 'DELIVERY' && <div><span>Delivery fee</span><strong>{preview?.deliveryFee !== undefined ? `₹${preview.deliveryFee}` : fulfilmentOptions ? `₹${fulfilmentOptions.deliveryFee}` : 'Unavailable until preview'}</strong></div>}<hr /><div className="grand-total"><span>{mode === 'api' ? 'Total preview' : 'Total'}</span><strong>₹{props.total}</strong></div>
        {mode === 'api' ? <>{props.fulfilmentLoading ? <div className="fulfilment-loading" role="status">Loading pickup and delivery options…</div> : props.fulfilmentError ? <div className="fulfilment-error" role="alert">{props.fulfilmentError}</div> : fulfilmentOptions && <div className="fulfilment-picker" aria-label="Fulfilment method"><span className="overline">FULFILMENT</span><div className="fulfilment-methods"><label className={!fulfilmentOptions.pickupEnabled ? 'disabled' : ''}><input type="radio" name="fulfilment-method" checked={props.fulfilmentMethod === 'PICKUP'} disabled={!fulfilmentOptions.pickupEnabled || props.busy} onChange={() => props.onFulfilmentMethod('PICKUP')} /> Pickup</label><label className={!fulfilmentOptions.deliveryEnabled ? 'disabled' : ''}><input type="radio" name="fulfilment-method" checked={props.fulfilmentMethod === 'DELIVERY'} disabled={!fulfilmentOptions.deliveryEnabled || props.busy} onChange={() => props.onFulfilmentMethod('DELIVERY')} /> Delivery</label></div>{props.fulfilmentMethod === 'DELIVERY' && <div className="fulfilment-slot-field"><label htmlFor="checkout-slot">Available delivery slot</label><select id="checkout-slot" value={props.deliverySlotId} disabled={props.busy || !fulfilmentOptions.slots.length} onChange={(event) => props.onDeliverySlot(event.target.value)}><option value="">{fulfilmentOptions.slots.length ? 'Choose a slot' : 'No slots available'}</option>{fulfilmentOptions.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.date} · {slot.startTime}–{slot.endTime}</option>)}</select></div>}</div>}
          <button className="checkout-preview-button" onClick={props.onPreview} disabled={props.previewLoading || props.busy || props.fulfilmentLoading}>{props.previewLoading ? 'Preparing preview…' : 'Preview checkout'}</button><p className="cart-note">The preview is server-priced and does not place an order or claim payment.</p>{preview && <div className="checkout-preview" role="status"><span className="overline">CHECKOUT PREVIEW</span><strong>{preview.total === undefined ? 'Server preview ready' : `₹${preview.total}`}</strong>{preview.fulfilmentMethod && <span>Method {preview.fulfilmentMethod === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>}{preview.subtotal !== undefined && <span>Server subtotal ₹{preview.subtotal}</span>}{preview.deliveryFee !== undefined && <span>Server delivery fee ₹{preview.deliveryFee}</span>}{(preview.deliverySlot || props.selectedDeliverySlot) && <span>Slot {(preview.deliverySlot || props.selectedDeliverySlot)?.date} · {(preview.deliverySlot || props.selectedDeliverySlot)?.startTime}–{(preview.deliverySlot || props.selectedDeliverySlot)?.endTime}</span>}<p>{preview.message}</p><b>Preview only · no order or payment was created</b></div>}
          {appConfig.environment === 'dev' && <div className="sandbox-payment" role="group" aria-labelledby="sandbox-payment-heading"><div className="sandbox-payment-heading"><span className="overline">DEVELOPMENT ONLY</span><h3 id="sandbox-payment-heading">Local sandbox payment</h3></div><p>Use the backend sandbox payment intent and webhook state machine for local testing. This does not represent a real charge.</p><label className="sandbox-payment-choice"><input type="checkbox" checked={props.sandboxSelected} disabled={props.paymentLoading} onChange={(event) => props.onSandboxSelected(event.target.checked)} /><span>I explicitly want to test sandbox payment in dev.</span></label><div className="sandbox-warning"><CircleAlert size={15} /> Sandbox only. Never use this flow to claim production payment success.</div>{props.paymentError && <div className="payment-state payment-state-failed" role="alert"><XCircle size={17} /><span>{props.paymentError}</span></div>}{props.paymentIntent && <div className={`payment-state payment-state-${props.paymentIntent.status.toLowerCase()}`} role="status">{props.paymentIntent.status === 'SUCCEEDED' ? <CheckCircle2 size={17} /> : props.paymentIntent.status === 'FAILED' ? <XCircle size={17} /> : <Clock3 size={17} />}<div><strong>Payment {props.paymentIntent.status === 'SUCCEEDED' ? 'succeeded in sandbox' : props.paymentIntent.status === 'FAILED' ? 'failed' : 'pending'}</strong><span>{props.paymentIntent.amount !== undefined && props.paymentIntent.currency ? `Server amount ${props.paymentIntent.currency} ${props.paymentIntent.amount}` : 'Waiting for the server-calculated amount and currency'}</span>{props.paymentIntent.status === 'PENDING' && <small>Waiting for the backend webhook to update this intent. Retrying is idempotent.</small>}{props.paymentIntent.message && <small>{props.paymentIntent.message}</small>}</div></div>}{props.paymentIntent?.status === 'SUCCEEDED' && props.orderId ? <div className="payment-confirmed"><strong>Backend payment state confirmed.</strong><span>Order creation was confirmed with the same idempotent checkout request.</span><a className="seller-nav-link" href="#orders">Open order #{props.orderId.slice(0, 8)}</a></div> : props.paymentIntent?.status === 'SUCCEEDED' ? <div className="payment-confirmed"><strong>Payment confirmed by the backend.</strong><span>The backend did not return an order link. Check Orders or contact Support before retrying.</span><a className="seller-nav-link" href="#orders">Check Orders</a></div> : <button className="sandbox-payment-button" onClick={props.onSandboxPayment} disabled={!props.sandboxSelected || !preview || props.paymentLoading}>{props.paymentLoading ? 'Waiting for sandbox status…' : props.paymentIntent?.status === 'FAILED' || props.paymentError ? 'Retry sandbox payment' : 'Create sandbox payment intent'}</button>}{props.paymentIntent?.status !== 'SUCCEEDED' && <small className="sandbox-idempotency-note">Retries reuse the same order and payment idempotency keys; they do not intentionally duplicate checkout.</small>}</div>}
        </> : mode === 'demo' ? <><div className="demo-checkout-state" role="status"><strong>Demo checkout preview only</strong><span>Pickup, delivery slots, payment, and order creation are unavailable without the live API.</span></div><button className="checkout-disabled" disabled>Checkout <span>Unavailable</span></button><p className="cart-note">Demo mode does not create payments or orders.</p></> : <p className="cart-note">Checkout is unavailable until a live cart identity is configured.</p>}
      </div>
    </>}
  </aside></div>
}

function App() {
  const [identity, setIdentity] = useState<DevIdentity | null>(() => authApi.getIdentity())
  const [route, setRoute] = useState(() => getRoute())
  const [authError, setAuthError] = useState<string | null>(null)
  function getRoute() { const hash = window.location.hash.split('?')[0]; return hash === '#seller' ? 'seller' : hash === '#admin' ? 'admin' : hash === '#orders' ? 'orders' : hash === '#support' ? 'support' : hash === '#notifications' ? 'notifications' : hash === '#login' ? 'login' : hash === '#verify-email' ? 'verify-email' : 'storefront' }
  useEffect(() => { const onHashChange = () => setRoute(getRoute()); window.addEventListener('hashchange', onHashChange); return () => window.removeEventListener('hashchange', onHashChange) }, [])
  useEffect(() => { const unsubscribe = authApi.subscribe(() => setIdentity(authApi.getIdentity())); return () => { unsubscribe() } }, [])
  useEffect(() => { if (!authApi.isAvailable()) return; void authApi.me().then((nextIdentity) => { setIdentity(nextIdentity); setAuthError(null) }).catch((reason: unknown) => setAuthError(reason instanceof Error ? reason.message : 'The authentication service could not verify the current session.')) }, [])
  if (route === 'login') return <LoginView onLogin={(nextIdentity) => { setAuthError(null); setIdentity(nextIdentity) }} />
  if (route === 'verify-email') return <VerifyEmailView onLogin={(nextIdentity) => { setAuthError(null); setIdentity(nextIdentity) }} />
  if (route === 'seller') return identity?.role === 'seller' ? <SellerView /> : <Storefront identity={identity} />
  if (route === 'admin') return identity?.role === 'admin' ? <AdminView /> : <Storefront identity={identity} />
  if (route === 'support') return identity?.role === 'buyer' || identity?.role === 'support' || identity?.role === 'admin' ? <SupportView /> : <Storefront identity={identity} />
  if (route === 'orders') return identity?.role === 'buyer' ? <OrdersView /> : <Storefront identity={identity} />
  if (route === 'notifications') return <NotificationsView />
  return <><Storefront identity={identity} />{authError && <div className="app-auth-error" role="alert"><strong>Authentication error</strong><span>{authError}</span></div>}</>
}

export default App
