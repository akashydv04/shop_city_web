import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Clock3, Heart, MapPin, Minus, Plus, RefreshCw, Search, ShoppingBag, Star, Store, X } from 'lucide-react'
import { appConfig } from './config/environment'
import { catalogApi, type CatalogSource } from './services/catalogApi'
import { cartApi, type AvailableDeliverySlot, type CartLine, type CartSnapshot, type CheckoutPreview, type FulfilmentOptions } from './services/cartApi'
import type { Category, Product, Shop } from './types'
import SellerView from './SellerView'
import AdminView from './AdminView'
import OrdersView from './OrdersView'
import LoginView from './LoginView'
import SupportView from './SupportView'
import AuthControls from './AuthControls'
import { authApi, type DevIdentity } from './services/authApi'

const categories: { label: Category; icon: string }[] = [
  { label: 'All', icon: '✦' }, { label: 'Fresh', icon: '🥬' }, { label: 'Grocery', icon: '🛒' }, { label: 'Tiffin', icon: '🍱' }, { label: 'Home', icon: '🏠' }, { label: 'Services', icon: '🛠️' },
]

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
  const [notice, setNotice] = useState<string | null>(null)
  const apiCartMode = source === 'api'
  const liveCartEnabled = apiCartMode && identity?.role === 'buyer' && authApi.isAuthenticated()

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    catalogApi.load()
      .then((catalog) => { if (alive) { setShops(catalog.shops); setProducts(catalog.products); setSource(catalog.source); setLoading(false) } })
      .catch(() => { if (alive) { setLoading(false); setError(true) } })
    return () => { alive = false }
  }, [reloadToken])

  useEffect(() => {
    if (!liveCartEnabled || !products.length) return
    let alive = true
    setCartLoading(true)
    setCartError(null)
    cartApi.load(products, shops)
      .then((snapshot) => { if (alive) { setCart(snapshot.lines); setServerCart(snapshot); setCartLoading(false) } })
      .catch((reason: unknown) => { if (alive) { setCartLoading(false); setCartError(reason instanceof Error ? reason.message : 'We could not load your live cart.') } })
    return () => { alive = false }
  }, [liveCartEnabled, products, shops])

  const visibleShops = useMemo(() => shops.filter((shop) => (category === 'All' || shop.category === category) && `${shop.name} ${shop.description}`.toLowerCase().includes(query.toLowerCase())), [shops, category, query])
  const visibleProducts = useMemo(() => products.filter((product) => {
    const shop = shops.find((item) => item.id === product.shopId)
    return (category === 'All' || shop?.category === category) && (!query || `${product.name} ${product.detail} ${shop?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  }), [products, shops, category, query])
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const calculatedCartTotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const cartSubtotal = apiCartMode ? (serverCart?.subtotal ?? calculatedCartTotal) : calculatedCartTotal
  const cartShop = cart[0] ? shops.find((shop) => shop.id === (serverCart?.shopId ?? cart[0].product.shopId)) : null
  const cartShopName = serverCart?.shopName ?? cartShop?.name
  const selectedDeliverySlot = fulfilmentOptions?.slots.find((slot) => slot.id === deliverySlotId)
  const previewDeliveryFee = checkoutPreview?.deliveryFee ?? (fulfilmentMethod === 'DELIVERY' ? fulfilmentOptions?.deliveryFee : 0)
  const displayedTotal = checkoutPreview?.total ?? serverCart?.total ?? cartSubtotal + (previewDeliveryFee ?? 0)

  async function addToCart(product: Product) {
    if (cartBusy) return
    if (cart.length && cart[0].product.shopId !== product.shopId) {
      setNotice('Your cart is for one shop at a time. Open the cart to review it before choosing another shop.')
      return
    }
    if (apiCartMode) {
      if (!liveCartEnabled) {
         setNotice('Live cart access requires a signed-in buyer account.')
        return
      }
      setCartBusy(true)
      setCartError(null)
      try {
        const snapshot = await cartApi.addItem(product, products, shops)
        setCart(snapshot.lines)
        setServerCart(snapshot)
        setCheckoutPreview(null)
        setNotice(null)
      } catch (reason: unknown) {
        setCartError(reason instanceof Error ? reason.message : 'We could not update your live cart.')
      } finally {
        setCartBusy(false)
      }
      return
    }
    setNotice(null)
    setCart((current) => current.some((line) => line.product.id === product.id)
      ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, { product, quantity: 1 }])
  }

  async function changeQuantity(productId: string, delta: number) {
    if (apiCartMode) {
      if (!liveCartEnabled) {
         setNotice('Live cart access requires a signed-in buyer account.')
        return
      }
      const line = cart.find((candidate) => candidate.product.id === productId)
      if (!line) return
      setCartBusy(true)
      setCartError(null)
      try {
        const snapshot = line.quantity + delta <= 0
          ? await cartApi.removeItem(productId, products, shops)
          : await cartApi.updateQuantity(productId, line.quantity + delta, products, shops)
        setCart(snapshot.lines)
        setServerCart(snapshot)
        setCheckoutPreview(null)
      } catch (reason: unknown) {
        setCartError(reason instanceof Error ? reason.message : 'We could not update your live cart.')
      } finally {
        setCartBusy(false)
      }
      return
    }
    setCart((current) => current.flatMap((line) => line.product.id === productId && line.quantity + delta <= 0 ? [] : line.product.id === productId ? [{ ...line, quantity: line.quantity + delta }] : [line]))
  }

  async function refreshServerCart() {
    if (!liveCartEnabled) return
    setCartLoading(true)
    setCartError(null)
    try {
      const snapshot = await cartApi.load(products, shops)
      setCart(snapshot.lines)
      setServerCart(snapshot)
      setCheckoutPreview(null)
      setFulfilmentOptions(null)
      setDeliverySlotId('')
      if (snapshot.shopId) {
        setFulfilmentLoading(true)
        setFulfilmentError(null)
        try {
          const options = await cartApi.getFulfilmentOptions(snapshot.shopId)
          setFulfilmentOptions(options)
          setFulfilmentMethod(options.pickupEnabled ? 'PICKUP' : 'DELIVERY')
          setDeliverySlotId(options.slots[0]?.id ?? '')
        } catch (reason: unknown) {
          setFulfilmentError(reason instanceof Error ? reason.message : 'Fulfilment options are unavailable right now.')
        } finally {
          setFulfilmentLoading(false)
        }
      }
    } catch (reason: unknown) {
      setCartError(reason instanceof Error ? reason.message : 'We could not load your live cart.')
    } finally {
      setCartLoading(false)
    }
  }

  async function previewCheckout() {
    if (!liveCartEnabled || !cart.length) return
    if (!fulfilmentOptions || (!fulfilmentOptions.pickupEnabled && !fulfilmentOptions.deliveryEnabled)) {
      setCartError('This shop has not configured a pickup or delivery method yet.')
      return
    }
    if (fulfilmentMethod === 'DELIVERY' && !deliverySlotId) {
      setCartError('Choose an available delivery slot before previewing checkout.')
      return
    }
    setPreviewLoading(true)
    setCartError(null)
    try {
      setCheckoutPreview(await cartApi.previewCheckout({ fulfilmentMethod, ...(fulfilmentMethod === 'DELIVERY' ? { deliverySlotId } : {}) }))
    } catch (reason: unknown) {
      setCartError(reason instanceof Error ? reason.message : 'Checkout preview is unavailable right now.')
    } finally {
      setPreviewLoading(false)
    }
  }

  function openCart() {
    setCartOpen(true)
    if (liveCartEnabled) void refreshServerCart()
  }

  return (
    <div className="app-shell">
       <header className="topbar">
        <a className="brand" href="#top" aria-label="DukaanSetu home"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
        <div className="location"><MapPin size={17} strokeWidth={2.5} /><div><span className="eyebrow">DELIVERING TO</span><strong>Gurugram, Haryana</strong></div><ChevronDown size={15} /></div>
         <div className="top-actions">{identity?.role === 'buyer' && <><a className="orders-nav-link" href="#orders">Orders</a><a className="support-nav-link" href="#support">Support</a></>}{identity?.role === 'seller' && <a className="seller-nav-link" href="#seller">Seller studio</a>}{identity?.role === 'admin' && <><a className="admin-nav-link" href="#admin">Admin</a><a className="support-nav-link" href="#support">Support</a></>}{identity?.role === 'support' && <a className="support-nav-link" href="#support">Support</a>}<button className="icon-button" aria-label="Saved shops"><Heart size={19} /></button><button className="cart-button" onClick={openCart}><ShoppingBag size={18} /><span>Cart</span>{cartCount > 0 && <b>{cartCount}</b>}</button><AuthControls identity={identity} /></div>
      </header>

      <main id="top">
         {appConfig.environment === 'dev' && <div className="dev-warning" role="note"><strong>Development mode</strong><span>Seeded role login is available as an explicit local fallback; account auth uses the configured API.</span></div>}{!authApi.isAuthenticated() && !identity && appConfig.apiBaseUrl && <div className="dev-warning production-auth-warning" role="status"><strong>Sign in for protected actions</strong><span>The catalogue is public. Cart, orders, support, and workspaces require a signed-in account.</span></div>}{notice && <div className="notice" role="status"><span>{notice}</span><button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <section className="hero">
          <div className="hero-copy"><div className="demo-badge"><span className="pulse" /> {appConfig.environment.toUpperCase()} · {source === 'api' ? 'Catalogue API' : source === 'demo' ? 'Demo storefront' : 'Catalogue unavailable'}</div><h1>Your local market,<br /><em>together.</em></h1><p>Discover trusted neighbourhood shops and get the things you need, from people you know.</p><div className="search-wrap"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shops, products, or essentials" aria-label="Search shops, products, or essentials" /><kbd>⌘ K</kbd></div><div className="hero-note"><span><MapPin size={14} /> Serving select areas in Gurugram</span><span><Clock3 size={14} /> Same-day neighbourhood delivery</span></div></div><div className="hero-art" aria-hidden="true"><div className="sun" /><div className="arch"><div className="shop-window"><span>YOUR<br />LOCAL<br /><b>MARKET</b></span><div className="window-plants">🌿　🌿</div></div></div><div className="art-leaf leaf-one">✦</div><div className="art-leaf leaf-two">✦</div></div>
        </section>

        <section className="content-section categories-section"><div className="section-heading"><div><span className="overline">EXPLORE THE NEIGHBOURHOOD</span><h2>What are you looking for?</h2></div><span className="count-label">{visibleShops.length} shops nearby</span></div><div className="category-row" role="tablist" aria-label="Shop categories">{categories.map((item) => <button key={item.label} className={`category-chip ${category === item.label ? 'selected' : ''}`} onClick={() => setCategory(item.label)} role="tab" aria-selected={category === item.label}><span>{item.icon}</span>{item.label}</button>)}</div></section>

       <section className="content-section shops-section"><div className="section-heading"><div><span className="overline">MEET YOUR NEIGHBOURS</span><h2>Shops around you</h2></div><button className="text-link" onClick={() => setCategory('All')}>View all <ArrowRight size={16} /></button></div>{loading ? <LoadingState /> : error ? <ErrorState onRetry={() => { setError(false); setReloadToken((token) => token + 1) }} /> : visibleShops.length === 0 ? <EmptyState label="shops" /> : <div className="shop-grid">{visibleShops.map((shop) => <ShopCard key={shop.id} shop={shop} active={activeShop === shop.id} onClick={() => setActiveShop(activeShop === shop.id ? null : shop.id)} />)}</div>}</section>

       <section className="content-section products-section"><div className="section-heading"><div><span className="overline">A LITTLE SOMETHING FOR TODAY</span><h2>Popular near you</h2></div><span className="fresh-label"><span className="green-dot" /> {source === 'api' ? 'Live catalogue' : 'Local demo data'}</span></div>{loading ? <LoadingState /> : !error && visibleProducts.length === 0 ? <EmptyState label="products" /> : !error && <div className="product-grid">{visibleProducts.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} shop={shops.find((shop) => shop.id === product.shopId)} onAdd={() => addToCart(product)} />)}</div>}</section>
      </main>

        <footer className="footer"><div className="brand footer-brand"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></div><p>{source === 'api' ? 'Discovering local commerce in Gurugram.' : source === 'demo' ? 'A demo foundation for discovering local commerce in Gurugram.' : 'Catalogue configuration is required for this environment.'}</p><span className="footer-demo">{appConfig.environment.toUpperCase()} · {source === 'api' ? 'CATALOGUE API' : source === 'demo' ? 'DEMO DATA ONLY' : 'CATALOGUE UNAVAILABLE'}</span></footer>
      {cartOpen && <CartDrawer cart={cart} cartShop={cartShop} cartShopName={cartShopName} subtotal={cartSubtotal} total={displayedTotal} mode={apiCartMode ? 'api' : source === 'demo' ? 'demo' : 'unavailable'} liveCartEnabled={liveCartEnabled} loading={cartLoading} busy={cartBusy} error={cartError} fulfilmentOptions={fulfilmentOptions} fulfilmentLoading={fulfilmentLoading} fulfilmentError={fulfilmentError} fulfilmentMethod={fulfilmentMethod} deliverySlotId={deliverySlotId} selectedDeliverySlot={selectedDeliverySlot} preview={checkoutPreview} previewLoading={previewLoading} onClose={() => setCartOpen(false)} onRefresh={refreshServerCart} onPreview={previewCheckout} onChange={changeQuantity} onFulfilmentMethod={(method) => { setFulfilmentMethod(method); setCheckoutPreview(null); setCartError(null) }} onDeliverySlot={(slotId) => { setDeliverySlotId(slotId); setCheckoutPreview(null); setCartError(null) }} />}
    </div>
  )
}

function ShopCard({ shop, active, onClick }: { shop: Shop; active: boolean; onClick: () => void }) {
  return <article className={`shop-card ${active ? 'active' : ''}`}><button className={`shop-avatar ${shop.accent}`} onClick={onClick} aria-label={`Open ${shop.name}`}><span>{shop.initials}</span><i>{shop.open ? 'Open' : 'Closed'}</i></button><div className="shop-info"><div className="shop-topline"><span className="shop-category">{shop.category}</span><span className="distance">{shop.distance}</span></div><h3>{shop.name}</h3><p>{shop.description}</p><div className="shop-meta"><span><Star size={14} fill="currentColor" /> {shop.rating}</span><span>·</span><span>{shop.open ? 'Open until 9 PM' : 'Opens tomorrow'}</span></div></div><button className="round-arrow" onClick={onClick} aria-label={`View ${shop.name}`}><ArrowRight size={17} /></button></article>
}

function ProductCard({ product, shop, onAdd }: { product: Product; shop?: Shop; onAdd: () => void }) {
  return <article className="product-card"><div className="product-image"><span>{product.emoji}</span>{product.tag && <b>{product.tag}</b>}<button aria-label={`Save ${product.name}`} className="save-product"><Heart size={16} /></button></div><div className="product-body"><span className="product-shop">{shop?.name}</span><h3>{product.name}</h3><p>{product.detail}</p><div className="product-bottom"><strong>₹{product.price}</strong><button className="add-button" onClick={onAdd}><Plus size={16} /> Add</button></div></div></article>
}

function LoadingState() { return <div className="state-card"><div className="loader" /><h3>Finding shops around you</h3><p>Just a moment while we check the neighbourhood.</p></div> }
function EmptyState({ label }: { label: string }) { return <div className="state-card"><div className="state-icon">⌕</div><h3>No {label} found</h3><p>Try a different search or explore another category.</p></div> }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="state-card error-state"><div className="state-icon">!</div><h3>We couldn’t load the catalogue</h3><p>There was a problem connecting to the catalogue. Please try again.</p><button className="retry-button" onClick={onRetry}>Try again</button></div> }

function CartDrawer({
  cart,
  cartShop,
  cartShopName,
  subtotal,
  total,
  mode,
  liveCartEnabled,
  loading,
  busy,
  error,
  fulfilmentOptions,
  fulfilmentLoading,
  fulfilmentError,
  fulfilmentMethod,
  deliverySlotId,
  selectedDeliverySlot,
  preview,
  previewLoading,
  onClose,
  onRefresh,
  onPreview,
  onChange,
  onFulfilmentMethod,
  onDeliverySlot,
}: {
  cart: CartLine[]
  cartShop: Shop | null | undefined
  cartShopName?: string
  subtotal: number
  total: number
  mode: 'api' | 'demo' | 'unavailable'
  liveCartEnabled: boolean
  loading: boolean
  busy: boolean
  error: string | null
  fulfilmentOptions: FulfilmentOptions | null
  fulfilmentLoading: boolean
  fulfilmentError: string | null
  fulfilmentMethod: 'PICKUP' | 'DELIVERY'
  deliverySlotId: string
  selectedDeliverySlot?: AvailableDeliverySlot
  preview: CheckoutPreview | null
  previewLoading: boolean
  onClose: () => void
  onRefresh: () => void
  onPreview: () => void
  onChange: (id: string, delta: number) => void | Promise<void>
  onFulfilmentMethod: (method: 'PICKUP' | 'DELIVERY') => void
  onDeliverySlot: (slotId: string) => void
}) {
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const title = mode === 'api' ? 'Live cart' : 'Shopping cart'
  return <div className="drawer-backdrop" onClick={onClose}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cart-title">
    <div className="drawer-header"><div><span className="overline">YOUR BAG</span><h2 id="cart-title">Cart <small>({itemCount})</small></h2></div><div className="drawer-actions"><span className="sr-only">{title}</span>{mode === 'api' && <button className="icon-button" onClick={onRefresh} disabled={loading || !liveCartEnabled} aria-label="Refresh live cart"><RefreshCw size={17} /></button>}<button className="icon-button" onClick={onClose} aria-label="Close cart"><X size={20} /></button></div></div>
      {mode === 'api' && !liveCartEnabled ? <div className="drawer-state drawer-warning" role="status"><ShoppingBag size={28} /><h3>Live cart unavailable</h3><p>Sign in as a buyer to access the protected API cart. No cart data was stored locally.</p><a className="seller-nav-link" href="#login">Sign in</a></div> : loading && !cart.length ? <div className="drawer-state" role="status"><div className="loader" /><h3>Refreshing your cart</h3><p>Reading the latest cart from the server.</p></div> : error && !cart.length ? <div className="drawer-state drawer-error" role="alert"><div className="state-icon">!</div><h3>We couldn’t load your cart</h3><p>{error}</p><button className="retry-button" onClick={onRefresh} disabled={loading}>Try again</button></div> : cart.length === 0 ? <div className="drawer-empty"><ShoppingBag size={34} /><h3>Your bag is waiting</h3><p>{mode === 'api' ? 'Your server cart is empty.' : 'Add something lovely from a local shop.'}</p></div> : <>
      {error && <p className="cart-inline-error" role="alert">{error}</p>}
      <div className="cart-shop"><Store size={16} /><span>{cartShopName ?? cartShop?.name ?? 'Local shop'}</span><small>One shop per order</small></div>
      <div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.product.id}><span className="line-emoji">{line.product.emoji}</span><div><h3>{line.product.name}</h3><p>₹{line.product.price} · {line.product.unit}</p></div><div className="quantity"><button onClick={() => onChange(line.product.id, -1)} disabled={busy} aria-label={`Remove one ${line.product.name}`}><Minus size={14} /></button><span aria-live="polite">{line.quantity}</span><button onClick={() => onChange(line.product.id, 1)} disabled={busy} aria-label={`Add one ${line.product.name}`}><Plus size={14} /></button></div></div>)}</div>
       <div className="cart-summary"><div><span>{mode === 'api' ? 'Server subtotal' : 'Subtotal'}</span><strong>₹{subtotal}</strong></div>{mode === 'api' && fulfilmentMethod === 'DELIVERY' && <div><span>Delivery fee</span><strong>{preview?.deliveryFee !== undefined ? `₹${preview.deliveryFee}` : fulfilmentOptions ? `₹${fulfilmentOptions.deliveryFee}` : 'Unavailable until preview'}</strong></div>}{mode === 'demo' && <div><span>Neighbourhood delivery</span><span className="free">Preview only</span></div>}<hr /><div className="grand-total"><span>{mode === 'api' ? 'Total preview' : 'Total'}</span><strong>₹{total}</strong></div>
         {mode === 'api' ? <>{fulfilmentLoading ? <div className="fulfilment-loading" role="status">Loading pickup and delivery options…</div> : fulfilmentError ? <div className="fulfilment-error" role="alert">{fulfilmentError}</div> : fulfilmentOptions && <div className="fulfilment-picker" aria-label="Fulfilment method"><span className="overline">FULFILMENT</span><div className="fulfilment-methods"><label className={!fulfilmentOptions.pickupEnabled ? 'disabled' : ''}><input type="radio" name="fulfilment-method" value="PICKUP" checked={fulfilmentMethod === 'PICKUP'} disabled={!fulfilmentOptions.pickupEnabled || busy} onChange={() => onFulfilmentMethod('PICKUP')} /> Pickup</label><label className={!fulfilmentOptions.deliveryEnabled ? 'disabled' : ''}><input type="radio" name="fulfilment-method" value="DELIVERY" checked={fulfilmentMethod === 'DELIVERY'} disabled={!fulfilmentOptions.deliveryEnabled || busy} onChange={() => onFulfilmentMethod('DELIVERY')} /> Delivery</label></div>{fulfilmentMethod === 'DELIVERY' && <div className="fulfilment-slot-field"><label htmlFor="checkout-slot">Available delivery slot</label><select id="checkout-slot" value={deliverySlotId} disabled={busy || !fulfilmentOptions.slots.length} onChange={(event) => onDeliverySlot(event.target.value)}><option value="">{fulfilmentOptions.slots.length ? 'Choose a slot' : 'No slots available'}</option>{fulfilmentOptions.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.date} · {slot.startTime}–{slot.endTime}{slot.remainingCapacity !== undefined ? ` · ${slot.remainingCapacity} left` : ''}</option>)}</select>{!fulfilmentOptions.slots.length && <small>No available delivery slots are configured for this shop.</small>}</div>}</div>}
         <button className="checkout-preview-button" onClick={onPreview} disabled={previewLoading || busy || fulfilmentLoading}>{previewLoading ? 'Preparing preview…' : 'Preview checkout'}</button><p className="cart-note">Payment unavailable in this MVP. This preview is server-priced and does not place an order.</p>{preview && <div className="checkout-preview" role="status"><span className="overline">CHECKOUT PREVIEW</span><strong>{preview.total === undefined ? 'Server preview ready' : `₹${preview.total}`}</strong>{preview.fulfilmentMethod && <span>Method {preview.fulfilmentMethod === 'DELIVERY' ? 'Delivery' : 'Pickup'}</span>}{preview.subtotal !== undefined && <span>Subtotal ₹{preview.subtotal}</span>}{preview.deliveryFee !== undefined && <span>Delivery fee ₹{preview.deliveryFee}</span>}{(preview.deliverySlot || selectedDeliverySlot) && <span>Slot {(preview.deliverySlot || selectedDeliverySlot)?.date} · {(preview.deliverySlot || selectedDeliverySlot)?.startTime}–{(preview.deliverySlot || selectedDeliverySlot)?.endTime}</span>}<p>{preview.message}</p><b>Payment unavailable · no order was created</b></div>}</> : mode === 'demo' ? <><div className="demo-checkout-state" role="status"><strong>Demo checkout preview only</strong><span>Pickup, delivery slots, payment, and order creation are unavailable without the live API.</span></div><button className="checkout-disabled" disabled>Checkout <span>Unavailable</span></button><p className="cart-note">Demo mode does not create payments or orders.</p></> : <p className="cart-note">Checkout is unavailable until a live cart identity is configured.</p>}
      </div>
    </>}
  </aside></div>
}

function App() {
  const [identity, setIdentity] = useState<DevIdentity | null>(() => authApi.getIdentity())
  const [route, setRoute] = useState(() => getRoute())
  const [authError, setAuthError] = useState<string | null>(null)

  function getRoute() {
    return window.location.hash === '#seller' ? 'seller' : window.location.hash === '#admin' ? 'admin' : window.location.hash === '#orders' ? 'orders' : window.location.hash === '#support' ? 'support' : window.location.hash === '#login' ? 'login' : 'storefront'
  }

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const unsubscribe = authApi.subscribe(() => setIdentity(authApi.getIdentity()))
    return () => { unsubscribe() }
  }, [])

  useEffect(() => {
    if (!authApi.isAvailable()) return
    void authApi.me().then((nextIdentity) => { setIdentity(nextIdentity); setAuthError(null) }).catch((reason: unknown) => {
      setAuthError(reason instanceof Error ? reason.message : 'The authentication service could not verify the current session.')
    })
  }, [])

  if (route === 'login') return <LoginView onLogin={(nextIdentity) => { setAuthError(null); setIdentity(nextIdentity) }} />
  if (route === 'seller') return identity?.role === 'seller' ? <SellerView /> : <Storefront identity={identity} />
  if (route === 'admin') return identity?.role === 'admin' ? <AdminView /> : <Storefront identity={identity} />
  if (route === 'support') return identity?.role === 'buyer' || identity?.role === 'support' || identity?.role === 'admin' ? <SupportView /> : <Storefront identity={identity} />
  if (route === 'orders') return identity?.role === 'buyer' ? <OrdersView /> : <Storefront identity={identity} />
  return <><Storefront identity={identity} />{authError && <div className="app-auth-error" role="alert"><strong>Authentication error</strong><span>{authError}</span></div>}</>
}

export default App
