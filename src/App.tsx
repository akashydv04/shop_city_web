import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Clock3, Heart, MapPin, Minus, Plus, Search, ShoppingBag, Star, Store, X } from 'lucide-react'
import { appConfig } from './config/environment'
import { catalogApi, type CatalogSource } from './services/catalogApi'
import type { Category, Product, Shop } from './types'

const categories: { label: Category; icon: string }[] = [
  { label: 'All', icon: '✦' }, { label: 'Fresh', icon: '🥬' }, { label: 'Grocery', icon: '🛒' }, { label: 'Tiffin', icon: '🍱' }, { label: 'Home', icon: '🏠' }, { label: 'Services', icon: '🛠️' },
]

type CartLine = { product: Product; quantity: number }

function App() {
  const [category, setCategory] = useState<Category>('All')
  const [query, setQuery] = useState('')
  const [shops, setShops] = useState<Shop[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [source, setSource] = useState<CatalogSource>(appConfig.apiBaseUrl ? 'api' : appConfig.allowDemoFallback ? 'demo' : 'unavailable')
  const [reloadToken, setReloadToken] = useState(0)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [activeShop, setActiveShop] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    catalogApi.load()
      .then((catalog) => { if (alive) { setShops(catalog.shops); setProducts(catalog.products); setSource(catalog.source); setLoading(false) } })
      .catch(() => { if (alive) { setLoading(false); setError(true) } })
    return () => { alive = false }
  }, [reloadToken])

  const visibleShops = useMemo(() => shops.filter((shop) => (category === 'All' || shop.category === category) && `${shop.name} ${shop.description}`.toLowerCase().includes(query.toLowerCase())), [shops, category, query])
  const visibleProducts = useMemo(() => products.filter((product) => {
    const shop = shops.find((item) => item.id === product.shopId)
    return (category === 'All' || shop?.category === category) && (!query || `${product.name} ${product.detail} ${shop?.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  }), [products, shops, category, query])
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const cartTotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const cartShop = cart[0] ? shops.find((shop) => shop.id === cart[0].product.shopId) : null

  function addToCart(product: Product) {
    if (cart.length && cart[0].product.shopId !== product.shopId) {
      setNotice('Your cart is for one shop at a time. Open the cart to review it before choosing another shop.')
      return
    }
    setNotice(null)
    setCart((current) => current.some((line) => line.product.id === product.id)
      ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, { product, quantity: 1 }])
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current.flatMap((line) => line.product.id === productId && line.quantity + delta <= 0 ? [] : line.product.id === productId ? [{ ...line, quantity: line.quantity + delta }] : [line]))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="DukaanSetu home"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></a>
        <div className="location"><MapPin size={17} strokeWidth={2.5} /><div><span className="eyebrow">DELIVERING TO</span><strong>Gurugram, Haryana</strong></div><ChevronDown size={15} /></div>
        <div className="top-actions"><button className="icon-button" aria-label="Saved shops"><Heart size={19} /></button><button className="cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={18} /><span>Cart</span>{cartCount > 0 && <b>{cartCount}</b>}</button></div>
      </header>

      <main id="top">
        {notice && <div className="notice" role="status"><span>{notice}</span><button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss notice"><X size={15} /></button></div>}
        <section className="hero">
          <div className="hero-copy"><div className="demo-badge"><span className="pulse" /> {appConfig.environment.toUpperCase()} · {source === 'api' ? 'Catalogue API' : source === 'demo' ? 'Demo storefront' : 'Catalogue unavailable'}</div><h1>Your local market,<br /><em>together.</em></h1><p>Discover trusted neighbourhood shops and get the things you need, from people you know.</p><div className="search-wrap"><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shops, products, or essentials" aria-label="Search shops, products, or essentials" /><kbd>⌘ K</kbd></div><div className="hero-note"><span><MapPin size={14} /> Serving select areas in Gurugram</span><span><Clock3 size={14} /> Same-day neighbourhood delivery</span></div></div><div className="hero-art" aria-hidden="true"><div className="sun" /><div className="arch"><div className="shop-window"><span>YOUR<br />LOCAL<br /><b>MARKET</b></span><div className="window-plants">🌿　🌿</div></div></div><div className="art-leaf leaf-one">✦</div><div className="art-leaf leaf-two">✦</div></div>
        </section>

        <section className="content-section categories-section"><div className="section-heading"><div><span className="overline">EXPLORE THE NEIGHBOURHOOD</span><h2>What are you looking for?</h2></div><span className="count-label">{visibleShops.length} shops nearby</span></div><div className="category-row" role="tablist" aria-label="Shop categories">{categories.map((item) => <button key={item.label} className={`category-chip ${category === item.label ? 'selected' : ''}`} onClick={() => setCategory(item.label)} role="tab" aria-selected={category === item.label}><span>{item.icon}</span>{item.label}</button>)}</div></section>

       <section className="content-section shops-section"><div className="section-heading"><div><span className="overline">MEET YOUR NEIGHBOURS</span><h2>Shops around you</h2></div><button className="text-link" onClick={() => setCategory('All')}>View all <ArrowRight size={16} /></button></div>{loading ? <LoadingState /> : error ? <ErrorState onRetry={() => { setError(false); setReloadToken((token) => token + 1) }} /> : visibleShops.length === 0 ? <EmptyState label="shops" /> : <div className="shop-grid">{visibleShops.map((shop) => <ShopCard key={shop.id} shop={shop} active={activeShop === shop.id} onClick={() => setActiveShop(activeShop === shop.id ? null : shop.id)} />)}</div>}</section>

       <section className="content-section products-section"><div className="section-heading"><div><span className="overline">A LITTLE SOMETHING FOR TODAY</span><h2>Popular near you</h2></div><span className="fresh-label"><span className="green-dot" /> {source === 'api' ? 'Live catalogue' : 'Local demo data'}</span></div>{loading ? <LoadingState /> : !error && visibleProducts.length === 0 ? <EmptyState label="products" /> : !error && <div className="product-grid">{visibleProducts.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} shop={shops.find((shop) => shop.id === product.shopId)} onAdd={() => addToCart(product)} />)}</div>}</section>
      </main>

        <footer className="footer"><div className="brand footer-brand"><span className="brand-mark">D</span><span>Dukaan<span>Setu</span></span></div><p>{source === 'api' ? 'Discovering local commerce in Gurugram.' : source === 'demo' ? 'A demo foundation for discovering local commerce in Gurugram.' : 'Catalogue configuration is required for this environment.'}</p><span className="footer-demo">{appConfig.environment.toUpperCase()} · {source === 'api' ? 'CATALOGUE API' : source === 'demo' ? 'DEMO DATA ONLY' : 'CATALOGUE UNAVAILABLE'}</span></footer>
      {cartOpen && <CartDrawer cart={cart} cartShop={cartShop} total={cartTotal} onClose={() => setCartOpen(false)} onChange={changeQuantity} />}
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

function CartDrawer({ cart, cartShop, total, onClose, onChange }: { cart: CartLine[]; cartShop: Shop | null | undefined; total: number; onClose: () => void; onChange: (id: string, delta: number) => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Shopping cart"><div className="drawer-header"><div><span className="overline">YOUR BAG</span><h2>Cart <small>({cart.length ? cart.reduce((sum, line) => sum + line.quantity, 0) : 0})</small></h2></div><button className="icon-button" onClick={onClose} aria-label="Close cart"><X size={20} /></button></div>{cart.length === 0 ? <div className="drawer-empty"><ShoppingBag size={34} /><h3>Your bag is waiting</h3><p>Add something lovely from a local shop.</p></div> : <><div className="cart-shop"><Store size={16} /><span>{cartShop?.name}</span><small>One shop per order</small></div><div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.product.id}><span className="line-emoji">{line.product.emoji}</span><div><h3>{line.product.name}</h3><p>₹{line.product.price} · {line.product.unit}</p></div><div className="quantity"><button onClick={() => onChange(line.product.id, -1)} aria-label={`Remove one ${line.product.name}`}><Minus size={14} /></button><span>{line.quantity}</span><button onClick={() => onChange(line.product.id, 1)} aria-label={`Add one ${line.product.name}`}><Plus size={14} /></button></div></div>)}</div><div className="cart-summary"><div><span>Subtotal</span><strong>₹{total}</strong></div><div><span>Neighbourhood delivery</span><span className="free">FREE <s>₹30</s></span></div><hr /><div className="grand-total"><span>Total</span><strong>₹{total}</strong></div><button className="checkout-disabled" disabled>Checkout <span>Coming soon</span></button><p className="cart-note">Demo only · no payment or account required</p></div></>}</aside></div>
}

export default App
