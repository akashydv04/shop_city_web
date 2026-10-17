import type { Product, Shop } from '../types'

export const demoShops: Shop[] = [
  { id: 'green-basket', name: 'Green Basket', category: 'Fresh', description: 'Farm-fresh fruits, vegetables & daily essentials', rating: 4.8, distance: '0.4 km', accent: 'mint', initials: 'GB', open: true },
  { id: 'ghar-ka-khana', name: 'Ghar Ka Khana', category: 'Tiffin', description: 'Wholesome home-style meals, made with care', rating: 4.9, distance: '0.8 km', accent: 'peach', initials: 'GK', open: true },
  { id: 'saini-general-store', name: 'Saini General Store', category: 'Grocery', description: 'Everything your kitchen needs, close to home', rating: 4.7, distance: '1.2 km', accent: 'lavender', initials: 'SG', open: true },
  { id: 'fix-it-fast', name: 'Fix It Fast', category: 'Services', description: 'Reliable repairs for your everyday needs', rating: 4.6, distance: '1.5 km', accent: 'sky', initials: 'FF', open: false },
]

export const demoProducts: Product[] = [
  { id: 'tomatoes', shopId: 'green-basket', name: 'Farm tomatoes', detail: 'Freshly picked · 500 g', price: 38, unit: '500 g', emoji: '🍅', tag: 'Popular' },
  { id: 'spinach', shopId: 'green-basket', name: 'Baby spinach', detail: 'Tender leaves · 250 g', price: 32, unit: '250 g', emoji: '🥬' },
  { id: 'bananas', shopId: 'green-basket', name: 'Robusta bananas', detail: 'Naturally ripened · 1 dozen', price: 58, unit: '1 dozen', emoji: '🍌' },
  { id: 'thali', shopId: 'ghar-ka-khana', name: 'Everyday thali', detail: 'Dal, 3 rotis, sabzi & rice', price: 149, unit: '1 meal', emoji: '🍱', tag: 'Bestseller' },
  { id: 'paratha', shopId: 'ghar-ka-khana', name: 'Aloo paratha', detail: 'With curd & homemade pickle', price: 75, unit: '2 pieces', emoji: '🫓' },
  { id: 'atta', shopId: 'saini-general-store', name: 'Whole wheat atta', detail: 'Sharbati wheat · 5 kg', price: 285, unit: '5 kg', emoji: '🌾' },
  { id: 'tea', shopId: 'saini-general-store', name: 'Assam tea', detail: 'Strong morning blend · 250 g', price: 165, unit: '250 g', emoji: '🫖' },
]
