import { demoProducts, demoShops } from '../data/demo'
import { appConfig } from '../config/environment'
import type { Product, Shop } from '../types'

export type CatalogSource = 'api' | 'demo' | 'unavailable'

export interface Catalog {
  shops: Shop[]
  products: Product[]
  source: CatalogSource
}

interface ApiProduct {
  id: string | number
  shopId?: string | number
  name?: string
  description?: string | null
  detail?: string | null
  price?: number | string
  unit?: string | null
  emoji?: string | null
  tag?: string | null
  active?: boolean
}

interface ApiShop {
  id: string | number
  name?: string
  slug?: string
  description?: string | null
  city?: string
  category?: string | null
  rating?: number | string | null
  distance?: string | null
  open?: boolean
  isOpen?: boolean
  products?: ApiProduct[]
}

function categoryFor(shop: ApiShop): Shop['category'] {
  const value = `${shop.category ?? ''} ${shop.name ?? ''} ${shop.description ?? ''}`.toLowerCase()
  if (/tiffin|meal|khana|food|paratha/.test(value)) return 'Tiffin'
  if (/repair|service|fix|salon|laundry/.test(value)) return 'Services'
  if (/home|decor|clean/.test(value)) return 'Home'
  if (/grocery|general|store|atta|tea|rice/.test(value)) return 'Grocery'
  return 'Fresh'
}

function emojiFor(product: ApiProduct, category: Shop['category']) {
  if (product.emoji) return product.emoji
  const value = `${product.name ?? ''} ${product.description ?? ''}`.toLowerCase()
  if (/tomato/.test(value)) return '🍅'
  if (/spinach|leaf|green/.test(value)) return '🥬'
  if (/banana/.test(value)) return '🍌'
  if (/tea|chai/.test(value)) return '🫖'
  if (/atta|wheat|flour/.test(value)) return '🌾'
  if (category === 'Tiffin') return '🍱'
  if (category === 'Services') return '🛠️'
  return category === 'Fresh' ? '🥕' : category === 'Home' ? '🏠' : '🛒'
}

function toNumber(value: number | string | null | undefined, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function mapApiCatalog(payload: unknown): Catalog {
  const root = payload && typeof payload === 'object' ? payload as { shops?: unknown; data?: unknown } : null
  const nested = root?.data && typeof root.data === 'object' ? root.data as { shops?: unknown } : null
  const shopsPayload = Array.isArray(payload) ? payload : root?.shops ?? nested?.shops
  if (!Array.isArray(shopsPayload)) throw new Error('Catalogue response did not contain shops')

  const shops: Shop[] = []
  const products: Product[] = []
  shopsPayload.forEach((rawShop) => {
    if (!rawShop || typeof rawShop !== 'object') return
    const shop = rawShop as ApiShop
    const id = String(shop.id)
    const category = categoryFor(shop)
    const name = shop.name?.trim() || shop.slug?.trim() || 'Neighbourhood shop'
    shops.push({
      id,
      name,
      category,
      description: shop.description?.trim() || 'Local essentials from your neighbourhood',
      rating: toNumber(shop.rating, 0),
      distance: shop.distance?.trim() || 'Nearby',
      accent: category === 'Fresh' ? 'mint' : category === 'Tiffin' ? 'peach' : category === 'Grocery' ? 'lavender' : 'sky',
      initials: name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      open: shop.open ?? shop.isOpen ?? true,
    })
    ;(Array.isArray(shop.products) ? shop.products : []).forEach((rawProduct) => {
      if (rawProduct.active === false || !rawProduct.name) return
      const productId = String(rawProduct.id)
      products.push({
        id: productId,
        shopId: String(rawProduct.shopId ?? id),
        name: rawProduct.name.trim(),
        detail: rawProduct.detail?.trim() || rawProduct.description?.trim() || 'Available from this local shop',
        price: toNumber(rawProduct.price),
        unit: rawProduct.unit?.trim() || '1 item',
        emoji: emojiFor(rawProduct, category),
        ...(rawProduct.tag ? { tag: rawProduct.tag } : {}),
      })
    })
  })
  return { shops, products, source: 'api' }
}

export interface CatalogApi {
  load(): Promise<Catalog>
}

export const catalogApi: CatalogApi = {
  async load() {
    if (!appConfig.apiBaseUrl) {
      if (appConfig.allowDemoFallback) return { shops: demoShops, products: demoProducts, source: 'demo' }
      throw new Error(`Catalogue API is required for the ${appConfig.environment} environment`)
    }

    const response = await fetch(`${appConfig.apiBaseUrl}/api/shops?city=Gurugram`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`)
    return mapApiCatalog(await response.json())
  },
}
