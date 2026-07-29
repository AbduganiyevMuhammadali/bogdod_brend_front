import { ref, computed } from 'vue'

const TAX_RATE = 0.12

export const CATEGORIES = ['all', 'drinks', 'food', 'sweets', 'snacks']

export const CUSTOMERS = [
  { id: 1, name: 'Alisher Karimov',  phone: '+998 90 123 45 67' },
  { id: 2, name: 'Malika Yusupova',  phone: '+998 91 234 56 78' },
  { id: 3, name: 'Bobur Toshmatov',  phone: '+998 93 345 67 89' },
  { id: 4, name: 'Zulfiya Rahimova', phone: '+998 94 456 78 90' },
]

export const PRODUCTS = [
  // Drinks
  { id: 1,  name: 'Coca-Cola 0.5L',     category: 'drinks', price: 8500,  emoji: '🥤' },
  { id: 2,  name: 'Pepsi 0.5L',         category: 'drinks', price: 8000,  emoji: '🥤' },
  { id: 3,  name: 'Lipton Choy',        category: 'drinks', price: 9500,  emoji: '🍵' },
  { id: 4,  name: 'Red Bull 250ml',     category: 'drinks', price: 18000, emoji: '🔴' },
  { id: 5,  name: 'Bon Aqua 1.5L',     category: 'drinks', price: 6000,  emoji: '💧' },
  { id: 6,  name: 'Fanta Apelsin',      category: 'drinks', price: 8500,  emoji: '🍊' },
  // Food
  { id: 7,  name: 'Hotdog',             category: 'food',   price: 15000, emoji: '🌭' },
  { id: 8,  name: 'Burger',             category: 'food',   price: 25000, emoji: '🍔' },
  { id: 9,  name: 'Pizza (1 bo\'lak)',  category: 'food',   price: 20000, emoji: '🍕' },
  { id: 10, name: 'Lavash Roll',        category: 'food',   price: 18000, emoji: '🌯' },
  { id: 11, name: 'Qovurilgan kartoshka', category: 'food', price: 12000, emoji: '🍟' },
  { id: 12, name: 'Somsa (1 dona)',     category: 'food',   price: 8000,  emoji: '🥟' },
  // Sweets
  { id: 13, name: 'Snickers',           category: 'sweets', price: 7000,  emoji: '🍫' },
  { id: 14, name: 'Twix',              category: 'sweets', price: 7000,  emoji: '🍫' },
  { id: 15, name: 'Bounty',            category: 'sweets', price: 7000,  emoji: '🍫' },
  { id: 16, name: 'KitKat',            category: 'sweets', price: 8500,  emoji: '🍫' },
  { id: 17, name: 'Chupa Chups',       category: 'sweets', price: 3000,  emoji: '🍭' },
  { id: 18, name: 'Haribo Gummy',      category: 'sweets', price: 12000, emoji: '🐻' },
  // Snacks
  { id: 19, name: 'Lays Classic',      category: 'snacks', price: 10000, emoji: '🥔' },
  { id: 20, name: 'Doritos',           category: 'snacks', price: 11000, emoji: '🌽' },
  { id: 21, name: 'Pringles',          category: 'snacks', price: 22000, emoji: '🥫' },
  { id: 22, name: 'Nuts Mix',          category: 'snacks', price: 15000, emoji: '🥜' },
  { id: 23, name: 'Popcorn Tuzlangan', category: 'snacks', price: 9000,  emoji: '🍿' },
  { id: 24, name: 'Cracker Soli',      category: 'snacks', price: 7500,  emoji: '🍘' },
]

// Mock past orders for returns
export const PAST_ORDERS = [
  {
    id: 'ORD-1042',
    date: '2026-04-18',
    time: '10:24',
    cashier: 'Muhammadali',
    payment: 'cash',
    customer: CUSTOMERS[0],
    items: [
      { productId: 1,  name: 'Coca-Cola 0.5L',   qty: 2, price: 8500  },
      { productId: 13, name: 'Snickers',          qty: 1, price: 7000  },
      { productId: 11, name: 'Qovurilgan kartoshka', qty: 1, price: 12000 },
    ],
  },
  {
    id: 'ORD-1041',
    date: '2026-04-18',
    time: '09:55',
    cashier: 'Muhammadali',
    payment: 'card',
    customer: CUSTOMERS[1],
    items: [
      { productId: 8,  name: 'Burger',            qty: 1, price: 25000 },
      { productId: 5,  name: 'Bon Aqua 1.5L',    qty: 2, price: 6000  },
    ],
  },
  {
    id: 'ORD-1040',
    date: '2026-04-17',
    time: '18:33',
    cashier: 'Muhammadali',
    payment: 'transfer',
    customer: CUSTOMERS[0],
    items: [
      { productId: 9,  name: 'Pizza (1 bo\'lak)', qty: 3, price: 20000 },
      { productId: 6,  name: 'Fanta Apelsin',    qty: 3, price: 8500  },
    ],
  },
]

// — Shared cart state (module-level = singleton) —
export const saleMode      = ref(false)
const cartItems            = ref([])
const discountType         = ref('percent')
const discountVal          = ref(0)
const lastReceipt          = ref(null)
const selectedCustomer     = ref(null)
const orderHistory         = ref([...PAST_ORDERS])
let   orderCounter         = 1043

// — Computed totals —
const subtotal = computed(() =>
  cartItems.value.reduce((s, i) => s + i.price * i.qty, 0)
)

const discountAmount = computed(() => {
  if (!discountVal.value) return 0
  if (discountType.value === 'percent')
    return Math.round(subtotal.value * discountVal.value / 100)
  return Math.min(discountVal.value, subtotal.value)
})

const taxableAmount = computed(() => subtotal.value - discountAmount.value)
const taxAmount     = computed(() => Math.round(taxableAmount.value * TAX_RATE))
const total         = computed(() => taxableAmount.value + taxAmount.value)

// — Cart actions —
function addToCart(product) {
  const existing = cartItems.value.find(i => i.id === product.id)
  if (existing) {
    existing.qty++
  } else {
    cartItems.value.push({ ...product, qty: 1 })
  }
}

function removeFromCart(productId) {
  cartItems.value = cartItems.value.filter(i => i.id !== productId)
}

function updateQty(productId, delta) {
  const item = cartItems.value.find(i => i.id === productId)
  if (!item) return
  item.qty = Math.max(1, item.qty + delta)
}

function setQty(productId, qty) {
  const item = cartItems.value.find(i => i.id === productId)
  if (!item) return
  const n = parseInt(qty)
  if (n > 0) item.qty = n
  else removeFromCart(productId)
}

function clearCart() {
  cartItems.value    = []
  discountVal.value  = 0
  discountType.value = 'percent'
}

function applyDiscount(type, val) {
  discountType.value = type
  discountVal.value  = parseFloat(val) || 0
}

function removeDiscount() {
  discountVal.value = 0
}

function processPayment(method, tendered) {
  const now = new Date()
  const receipt = {
    id:       `ORD-${orderCounter++}`,
    date:     now.toISOString().slice(0, 10),
    time:     now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
    cashier:  'Muhammadali',
    customer: selectedCustomer.value,
    items:    cartItems.value.map(i => ({ ...i })),
    subtotal: subtotal.value,
    discount: discountAmount.value,
    tax:      taxAmount.value,
    total:    total.value,
    payment:  method,
    tendered: method === 'cash' ? tendered : total.value,
    change:   method === 'cash' ? Math.max(0, tendered - total.value) : 0,
  }
  orderHistory.value.unshift(receipt)
  lastReceipt.value = receipt
  clearCart()
  return receipt
}

export function useSales() {
  return {
    cartItems,
    discountType,
    discountVal,
    lastReceipt,
    selectedCustomer,
    orderHistory,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    addToCart,
    removeFromCart,
    updateQty,
    setQty,
    clearCart,
    applyDiscount,
    removeDiscount,
    processPayment,
  }
}
