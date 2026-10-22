export type Category = 'All' | 'Fresh' | 'Grocery' | 'Tiffin' | 'Home' | 'Services'

export interface Shop {
  id: string
  name: string
  category: Exclude<Category, 'All'>
  description: string
  city?: string
  rating?: number
  distance: string
  accent: string
  initials: string
  open?: boolean
}

export interface Product {
  id: string
  shopId: string
  name: string
  detail: string
  price: number
  unit: string
  emoji: string
  tag?: string
  availableQuantity?: number
  available?: boolean
}
