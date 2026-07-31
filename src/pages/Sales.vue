<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon        from '@/components/AppIcon.vue'
import SalePayModal   from '@/components/sales/SalePayModal.vue'
import BarcodeScannerModal from '@/components/sales/BarcodeScannerModal.vue'
import { salesApi }    from '@/api/sales.js'
import { productsApi }  from '@/api/products.js'
import { clientsApi }   from '@/api/clients.js'
import { purchasesApi } from '@/api/purchases.js'
import { fileUrl }      from '@/api/http.js'
import { beep }         from '@/composables/useBeep.js'
import { canAdd }       from '@/composables/usePerms.js'
import { loadStoreSettings } from '@/composables/useStoreSettings.js'

const route  = useRoute()
const router = useRouter()

// ── Currency settings (from localStorage) ────────────────────────
const POS_SETTINGS_KEY = 'pos_settings'
function loadPosSettings() {
  try { return JSON.parse(localStorage.getItem(POS_SETTINGS_KEY) || '{}') } catch { return {} }
}
const posSettings   = ref(loadPosSettings())
const exchangeRate  = computed(() => Number(posSettings.value.exchangeRate) || 0)
const showUSD       = computed(() => !!posSettings.value.showUSD && exchangeRate.value > 0)

// Helper: so'm → $ string
function toUSD(v) {
  if (!showUSD.value || exchangeRate.value <= 0) return null
  return (Number(v) / exchangeRate.value).toFixed(2)
}
// ── Modes ───────────────────────────────────────────────────────
const VALID_MODES = ['pos', 'history', 'cash', 'clients']
const mode = ref(VALID_MODES.includes(route.query.mode) ? route.query.mode : 'pos') // 'pos' | 'history' | 'cash' | 'clients'

// Tashqaridan (masalan mobil pastki menyu) ?mode=history kabi link bilan kirilganda ham ishlashi uchun
watch(() => route.query.mode, (m) => {
  if (VALID_MODES.includes(m)) mode.value = m
})
// mode ichkaridan (ikonka panel) o'zgarganda URL ham yangilanadi — sahifa yangilansa yoki
// tashqaridan qaytilsa ham to'g'ri rejim ochiladi
watch(mode, (m) => {
  if (route.query.mode !== m) router.replace({ query: { ...route.query, mode: m } })
})

// ── Product catalog ──────────────────────────────────────────────
const products      = ref([])
const prodLoading   = ref(false)
const searchQ       = ref('')
const activeCategory = ref('all')
const categories    = ref([])
let   searchTimer   = null

const showOutOfStock = ref(false)

async function loadProducts(q = '') {
  prodLoading.value = true
  try {
    const params = { limit: 200 }
    if (q.trim()) params.search = q.trim()
    if (activeCategory.value !== 'all') params.category = activeCategory.value

    const [res, fifoMap] = await Promise.all([
      productsApi.getAll(params),
      purchasesApi.getFifoPrices().catch(() => ({})),
    ])

    // Override retail/wholesale price with oldest available batch price (FIFO)
    const data = res.data.map(p => {
      const fifo = fifoMap[p.id]
      if (!fifo) return p
      return {
        ...p,
        retailPrice:    fifo.retailPrice    || p.retailPrice,
        wholesalePrice: fifo.wholesalePrice || p.wholesalePrice,
      }
    })

    products.value = showOutOfStock.value
      ? data
      : data.filter(p => Number(p.qty) > 0)
  } catch { products.value = [] }
  finally { prodLoading.value = false }
}

watch(showOutOfStock, () => loadProducts(searchQ.value))

async function loadCategories() {
  try {
    const res = await productsApi.getCategories()
    categories.value = res.filter(Boolean)
  } catch { categories.value = [] }
}

watch(searchQ, v => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProducts(v), 200) })
watch(activeCategory, () => loadProducts(searchQ.value))

// Color palette for product cards
const CARD_COLORS = [
  '#e0e7ff','#fce7f3','#d1fae5','#fef3c7','#dbeafe',
  '#f3e8ff','#ccfbf1','#fef9c3','#ffe4e6','#e0f2fe',
]
function cardColor(idx) { return CARD_COLORS[idx % CARD_COLORS.length] }
const TEXT_COLORS = [
  '#4338ca','#be185d','#047857','#b45309','#1d4ed8',
  '#6d28d9','#0f766e','#a16207','#be123c','#0369a1',
]
function textColor(idx) { return TEXT_COLORS[idx % TEXT_COLORS.length] }

// ── Cart ─────────────────────────────────────────────────────────
const cart        = ref([])
const activeIdx   = ref(-1)
const priceType   = ref('chakana')
const paymentType = ref('Naqd')
const discount    = ref(0)
const docNumber   = ref(1)
const warehouse   = ref('Asosiy ombor')
const saving      = ref(false)
const saveErr     = ref('')
const selectedClient = ref(null)
const showPayModal   = ref(false)

// ── Mobile: cart bottom-sheet (≤768px) ───────────────────────────
const cartExpanded = ref(false)
const bumpedProductId = ref(null) // plays a quick scale/bounce on the tapped product card
function tapAddToCart(product, idx) {
  addToCart(product, idx)
  bumpedProductId.value = product.id
  setTimeout(() => { if (bumpedProductId.value === product.id) bumpedProductId.value = null }, 320)
}

function addToCart(product, idx) {
  beep('add')
  const price = priceType.value === 'ulgurji'
    ? (product.wholesalePrice || product.retailPrice || 0)
    : (product.retailPrice || 0)
  const existing = cart.value.find(i => i.productId === product.id)
  if (existing) {
    existing.qty += 1
    existing.totalSum = +(existing.qty * existing.price).toFixed(2)
    activeIdx.value = cart.value.indexOf(existing)
  } else {
    cart.value.push({
      _key:        Date.now() + Math.random(),
      productId:   product.id,
      barcode:     Array.isArray(product.barcodes) ? (product.barcodes[0] ?? '') : '',
      productName: product.name,
      code:        product.code ?? '',
      qty:         1,
      price,
      totalSum:    price,
      priceType:   priceType.value,
      stockQty:    product.qty ?? 0,
      colorIdx:    idx,
    })
    activeIdx.value = cart.value.length - 1
  }
}

function removeItem(idx) {
  cart.value.splice(idx, 1)
  if (activeIdx.value >= cart.value.length) activeIdx.value = cart.value.length - 1
}

function clearCart() {
  if (cart.value.length && !confirm('Savatni tozalaysizmi?')) return
  cart.value = []; activeIdx.value = -1; discount.value = 0; selectedClient.value = null
}

function setQty(item, v) {
  item.qty = Math.max(0.001, Number(v) || 0)
  item.totalSum = +(item.qty * item.price).toFixed(2)
}
function setPrice(item, v) {
  item.price = Math.max(0, Number(v) || 0)
  item.totalSum = +(item.qty * item.price).toFixed(2)
}

// ── Totals ────────────────────────────────────────────────────────
const totalSum   = computed(() => cart.value.reduce((s,i) => s+(Number(i.totalSum)||0), 0))
const payableSum = computed(() => Math.max(0, totalSum.value - (Number(discount.value)||0)))
const debtSum    = computed(() => paymentType.value === 'Qarz' ? payableSum.value : 0)
const itemsCount = computed(() => cart.value.reduce((s,i) => s+i.qty, 0))

// Rounding discount chips: how much to cut so payable becomes a clean number
const roundChips = computed(() => {
  const base = totalSum.value
  if (base <= 0) return []
  return [1000, 5000, 10000, 50000]
    .map(step => ({ step, rem: base % step }))
    .filter(c => c.rem > 0 && c.rem < base)
    .map(c => ({ label: fmt(base - c.rem), disc: c.rem, step: c.step }))
})

// ── Client ────────────────────────────────────────────────────────
const clientQ      = ref('')
const clientList   = ref([])
const clientOpen   = ref(false)
let   clientTimer  = null

async function searchClients(q) {
  clearTimeout(clientTimer)
  clientTimer = setTimeout(async () => {
    if (!q?.trim()) { clientList.value = []; return }
    try { const r = await clientsApi.getAll({search:q,limit:10}); clientList.value=r.data }
    catch { clientList.value = [] }
  }, 200)
}
function pickClient(c) {
  selectedClient.value=c; clientQ.value=c.name; clientOpen.value=false
  if (c.balance < 0) paymentType.value = 'Qarz'
}
function dropClient() { selectedClient.value=null; clientQ.value='' }

// ── Complete sale ──────────────────────────────────────────────────
async function completeSale() {
  if (!cart.value.length) { flashErr("Savat bo'sh"); return }
  if (paymentType.value==='Qarz' && !selectedClient.value) { flashErr('Qarz uchun mijoz tanlang'); return }
  saving.value=true; saveErr.value=''
  try {
    const soldItems = cart.value.map(i => ({ ...i }))
    await salesApi.complete({
      doc_number:    docNumber.value,
      date:          new Date().toISOString(),
      warehouse:     warehouse.value,
      client_id:     selectedClient.value?.id ?? null,
      payment_type:  paymentType.value,
      price_type:    priceType.value,
      discount:      discount.value,
      exchange_rate: exchangeRate.value,
      items: soldItems.map(i=>({
        product_id:i.productId, barcode:i.barcode, product_name:i.productName,
        qty:i.qty, price:i.price, total_sum:i.totalSum, price_type:i.priceType,
      })),
    })
    // Update stock in-place immediately (no flicker)
    soldItems.forEach(item => {
      const prod = products.value.find(p => p.id === item.productId)
      if (prod) prod.qty = Math.max(0, Number(prod.qty) - Number(item.qty))
    })
    if (!showOutOfStock.value)
      products.value = products.value.filter(p => Number(p.qty) > 0)

    cart.value=[]; activeIdx.value=-1; discount.value=0; discountPct.value=0
    selectedClient.value=null; paymentType.value='Naqd'; showPayModal.value=false
    try {
      const nextNum = await salesApi.getNextDocNumber()
      // fetch the just-completed sale for quick-view
      const allSales = await salesApi.getAll({limit:1})
      if(allSales.data.length) lastSale.value = allSales.data[0]
      docNumber.value = nextNum
    } catch {}
    flashSuccess()
  } catch(e) { flashErr(e.response?.data?.message ?? 'Sotuv amalga oshmadi'); saveErr.value = e.response?.data?.message ?? 'Xatolik' }
  finally { saving.value=false }
}

const successFlash = ref(false)
function flashSuccess() { beep('success'); successFlash.value=true; setTimeout(()=>{successFlash.value=false},2500) }

const errFlash = ref('')
let errTimer = null
function flashErr(msg) {
  beep('error')
  errFlash.value = msg
  clearTimeout(errTimer)
  errTimer = setTimeout(() => { errFlash.value = '' }, 4000)
}

// ── Ajdaniya (parked / held sales) ───────────────────────────────
const parkedSales     = ref([])
const showParkedPanel = ref(false)
const holdFlash       = ref(false)

function parkCurrent() {
  if (!cart.value.length) return
  parkedSales.value.push({
    id:          Date.now(),
    time:        new Date(),
    cart:        JSON.parse(JSON.stringify(cart.value)),
    client:      selectedClient.value ? { ...selectedClient.value } : null,
    discount:    discount.value,
    priceType:   priceType.value,
    paymentType: paymentType.value,
  })
  cart.value = []; activeIdx.value = -1; discount.value = 0
  selectedClient.value = null; paymentType.value = 'Naqd'; clientQ.value = ''
  holdFlash.value = true
  setTimeout(() => { holdFlash.value = false }, 2200)
}

function restoreParked(idx) {
  const saved = parkedSales.value[idx]
  if (!saved) return
  if (cart.value.length) {
    parkedSales.value.splice(idx, 1)
    parkedSales.value.push({
      id: Date.now(), time: new Date(),
      cart:        JSON.parse(JSON.stringify(cart.value)),
      client:      selectedClient.value ? { ...selectedClient.value } : null,
      discount:    discount.value,
      priceType:   priceType.value,
      paymentType: paymentType.value,
    })
  } else {
    parkedSales.value.splice(idx, 1)
  }
  cart.value        = JSON.parse(JSON.stringify(saved.cart))
  selectedClient.value = saved.client ? { ...saved.client } : null
  clientQ.value     = saved.client?.name ?? ''
  discount.value    = saved.discount
  priceType.value   = saved.priceType
  paymentType.value = saved.paymentType
  activeIdx.value   = cart.value.length - 1
  showParkedPanel.value = false
}

function deleteParked(idx) {
  parkedSales.value.splice(idx, 1)
  if (!parkedSales.value.length) showParkedPanel.value = false
}

function parkedTimeAgo(t) {
  const s = Math.round((Date.now() - new Date(t)) / 1000)
  if (s < 60) return `${s}s oldin`
  if (s < 3600) return `${Math.round(s / 60)} min oldin`
  return `${Math.round(s / 3600)} soat oldin`
}

// ── History ────────────────────────────────────────────────────────
const history=ref([]); const histLoad=ref(false)
const histQ=ref(''); const histSt=ref('all'); let histTimer=null
const histFrom=ref(''); const histTo=ref('')
async function loadHistory() {
  histLoad.value=true
  try {
    const p={}
    if(histSt.value!=='all') p.status=histSt.value
    if(histQ.value.trim())   p.search=histQ.value.trim()
    if(histFrom.value)       p.date_from=histFrom.value
    if(histTo.value)         p.date_to=histTo.value
    const r=await salesApi.getAll(p); history.value=r.data
  }
  catch { history.value=[] } finally { histLoad.value=false }
}
watch(mode, v=>{ if(v==='history')loadHistory(); if(v==='cash')loadCash(); if(v==='clients')loadClients() })
watch(histSt, loadHistory)
watch(histFrom, loadHistory)
watch(histTo, loadHistory)
watch(histQ, ()=>{ clearTimeout(histTimer); histTimer=setTimeout(loadHistory,300) })

// ── CSV export ────────────────────────────────────────────────────
function exportHistoryCSV() {
  if(!history.value.length) return
  const cols=['Doc №','Sana','Vaqt','Mijoz','To\'lov','Mahsulotlar','Jami summa','Chegirma','To\'langan','Qarz','Holat']
  const rows=history.value.map(s=>[
    `#${String(s.docNumber).padStart(5,'0')}`,
    s.date?.slice(0,10).split('-').reverse().join('.') ?? '',
    s.date?.slice(11,16) ?? '',
    s.client?.name ?? 'Anonim',
    s.paymentType,
    s.itemCount,
    s.totalSum,
    s.discount||0,
    s.paidSum||0,
    s.debtSum||0,
    s.status==='completed'?'Bajarildi':'Bekor',
  ])
  const csv=[cols,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a'); a.href=url
  a.download=`sotuv-tarixi-${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ── Sale detail modal ──────────────────────────────────────────────
const saleModal=ref(null); const saleModalLoad=ref(false); const showSaleModal=ref(false)
async function openSaleModal(s) {
  showSaleModal.value=true; saleModal.value=null; saleModalLoad.value=true
  try { saleModal.value=await salesApi.getById(s.id) }
  catch { saleModal.value=s } finally { saleModalLoad.value=false }
}
function closeSaleModal() { showSaleModal.value=false }
async function cancelSale(id) {
  if(!confirm("Bu sotuvni bekor qilishni tasdiqlaysizmi?")) return
  try {
    await salesApi.cancel(id)
    const idx=history.value.findIndex(s=>s.id===id)
    if(idx!==-1) history.value[idx]={...history.value[idx],status:'cancelled'}
    if(saleModal.value?.id===id) saleModal.value={...saleModal.value,status:'cancelled'}
  } catch(e) { alert(e.response?.data?.message??'Xatolik') }
}
function fmtDateTime(d) {
  if(!d) return '—'
  const dt=new Date(d)
  return dt.toLocaleDateString('uz-UZ',{day:'2-digit',month:'2-digit',year:'numeric'})
    + ' ' + dt.toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})
}

// ── Cash report ─────────────────────────────────────────────────────
const cashRep=ref(null); const cashLoad=ref(false)
const cashFrom=ref(new Date().toISOString().slice(0,10))
const cashTo=ref(new Date().toISOString().slice(0,10))
async function loadCash() {
  cashLoad.value=true
  try { cashRep.value=await salesApi.getCashReport({date_from:cashFrom.value,date_to:cashTo.value}) }
  catch{cashRep.value=null} finally{cashLoad.value=false}
}

// ── Kassa kirim/chiqim modal ──────────────────────────────────────
const showCashEntryModal=ref(false)
const cashEntryForm=reactive({type:'income',amount:'',payment_type:'Naqd',description:''})
const cashEntrySaving=ref(false)
function openCashEntry(type='income'){
  Object.assign(cashEntryForm,{type,amount:'',payment_type:'Naqd',description:''})
  showCashEntryModal.value=true
}
async function saveCashEntry(){
  if(!cashEntryForm.amount||Number(cashEntryForm.amount)<=0){flashErr('Summani kiriting');return}
  cashEntrySaving.value=true
  try{
    await salesApi.cashEntry({
      type:          cashEntryForm.type,
      amount:        Number(cashEntryForm.amount),
      payment_type:  cashEntryForm.payment_type,
      description:   cashEntryForm.description || undefined,
      exchange_rate: exchangeRate.value,
    })
    showCashEntryModal.value=false
    loadCash()
    flashSuccess()
  }catch(e){flashErr(e.response?.data?.message??'Xatolik')}
  finally{cashEntrySaving.value=false}
}

// ── Qarz to'lash inline ───────────────────────────────────────────
const showDebtModal=ref(false)
const debtClient=ref(null)
const debtForm=reactive({amount:'',payment_type:'Naqd',description:''})
const debtSaving=ref(false)
function openDebtModal(c){
  debtClient.value=c
  Object.assign(debtForm,{amount:c.balance<0?String(Math.abs(Math.round(c.balance))):'',payment_type:'Naqd',description:''})
  showDebtModal.value=true
}
async function saveDebt(){
  if(!debtClient.value||!debtForm.amount||Number(debtForm.amount)<=0){flashErr('Summani kiriting');return}
  debtSaving.value=true
  try{
    await salesApi.payDebt({
      client_id:     debtClient.value.id,
      amount:        Number(debtForm.amount),
      payment_type:  debtForm.payment_type,
      description:   debtForm.description || undefined,
      exchange_rate: exchangeRate.value,
    })
    showDebtModal.value=false
    loadClients()
    flashSuccess()
  }catch(e){flashErr(e.response?.data?.message??'Xatolik')}
  finally{debtSaving.value=false}
}

// ── Transaction detail modal (for non-sale cash rows) ────────────────
const txnModal=ref(null); const showTxnModal=ref(false)
function openTxnModal(t) { txnModal.value=t; showTxnModal.value=true }
function closeTxnModal() { showTxnModal.value=false }

// Route cash row click: sale rows → sale modal, others → txn modal
function onCashRowClick(t) {
  if (t.type==='sale' && t.reference_id) { openSaleModal({id: t.reference_id}) }
  else { openTxnModal(t) }
}

const TXN_ICONS={sale:'shopping-bag',income:'arrow-down-circle',expense:'arrow-up-circle',debt_payment:'clock',refund:'rotate-ccw',opening:'sunrise'}
const TXN_COLORS={sale:'#16a34a',income:'#1d4ed8',expense:'#dc2626',debt_payment:'#b45309',refund:'#9333ea',opening:'#0891b2'}

// ── POS quick actions ─────────────────────────────────────────────
const discountMode=ref('sum') // 'sum' | 'pct'
const discountPct=ref(0)
watch(discountPct, v => {
  if(discountMode.value==='pct') discount.value=Math.round(totalSum.value*(Number(v)||0)/100)
})
watch(totalSum, v => {
  if(discountMode.value==='pct') discount.value=Math.round(v*(Number(discountPct.value)||0)/100)
})
function setDiscountMode(m){
  discountMode.value=m
  if(m==='sum'){discountPct.value=0}
  else{discountPct.value=totalSum.value>0?Math.round(discount.value/totalSum.value*100):0}
}

// Last sale quick-view
const lastSale=ref(null)

// Receipt print from sale modal
function printSaleReceipt(s){
  if(!s) return
  const lines=s.items?.map(i=>`
    <div class="rp-item">
      <div class="rp-item__name">${i.productName||i.product_name}</div>
      <div class="rp-item__line">
        <span class="rp-item__qty">${i.qty} × ${new Intl.NumberFormat('uz-UZ').format(Math.round(i.price))} so'm</span>
        <span class="rp-item__sum">${new Intl.NumberFormat('uz-UZ').format(Math.round(i.totalSum??i.total_sum))} so'm</span>
      </div>
    </div>`).join('')??''
  const f=v=>new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v)||0))
  const dt=new Date(s.date)
  const dateStr=dt.toLocaleDateString('uz-UZ',{day:'2-digit',month:'2-digit',year:'numeric'})
  const timeStr=dt.toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})
  const store=loadStoreSettings()
  const win=window.open('','_blank','width=420,height=800,scrollbars=yes')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chek #${s.docNumber}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#e5e7eb;display:flex;justify-content:center;padding:20px;font-family:'Courier New',monospace}
    .receipt{width:300px;background:white}
    .perf{height:14px;background:repeating-radial-gradient(circle at 7px 7px,#e5e7eb 6px,white 6px) -7px 0/14px 14px}
    .perf-b{height:14px;background:repeating-radial-gradient(circle at 7px 0,#e5e7eb 6px,white 6px) -7px 0/14px 14px}
    .body{padding:14px 16px}
    .store{text-align:center;font-size:17px;font-weight:900;letter-spacing:3px;margin-bottom:2px}
    .sub{text-align:center;font-size:10px;color:#6b7280;margin-bottom:10px}
    .meta{display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-bottom:2px}
    .dash{border-top:1px dashed #d1d5db;margin:8px 0}
    .rp-item{margin-bottom:8px}
    .rp-item__name{font-size:12px;font-weight:700;margin-bottom:1px}
    .rp-item__line{display:flex;justify-content:space-between;font-size:11px;color:#6b7280}
    .rp-item__sum{font-weight:700;color:#111}
    .row{display:flex;justify-content:space-between;font-size:11.5px;margin:3px 0}
    .total-row{display:flex;justify-content:space-between;font-weight:900;font-size:15px;padding:8px 0;border-top:2px solid #111;border-bottom:2px solid #111;margin:4px 0}
    .disc{color:#ef4444}.debt{color:#ef4444;font-weight:700}
    .footer{text-align:center;padding:10px 0 4px;border-top:1px dashed #d1d5db;margin-top:6px}
    .footer-main{font-size:13px;font-weight:800;letter-spacing:1px}
    .footer-sub{font-size:10px;color:#9ca3af;margin-top:3px}
    @media print{body{background:white;padding:0}}
  </style></head><body><div class="receipt">
    <div class="perf"></div>
    <div class="body">
      <div class="store">${store.name}</div>
      ${store.address?`<div class="sub">${store.address}</div>`:''}
      ${store.phone?`<div class="sub">${store.phone}</div>`:''}
      ${store.header?`<div class="sub">${store.header}</div>`:''}
      <div class="sub">${dateStr} · ${timeStr}</div>
      <div class="meta"><span>Chek #${String(s.docNumber).padStart(5,'0')}</span><span>${s.cashierName||'Kassir'}</span></div>
      ${s.warehouse?`<div class="meta"><span>Filial</span><span>${s.warehouse}</span></div>`:''}
      <div class="dash"></div>
      ${lines}
      <div class="dash"></div>
      <div class="row"><span>Jami</span><span>${f(s.totalSum+(s.discount||0))} so'm</span></div>
      ${s.discount>0?`<div class="row disc"><span>Chegirma</span><span>− ${f(s.discount)} so'm</span></div>`:''}
      <div class="total-row"><span>TO'LASH KERAK</span><span>${f(s.totalSum)} so'm</span></div>
      <div class="row"><span>To'lov turi</span><span>${s.paymentType}</span></div>
      ${s.paidSum>0?`<div class="row"><span>To'langan</span><span>${f(s.paidSum)} so'm</span></div>`:''}
      ${s.debtSum>0?`<div class="row debt"><span>Qarz qoldi</span><span>${f(s.debtSum)} so'm</span></div>`:''}
      ${s.client?.name?`<div class="row" style="margin-top:6px"><span>Mijoz</span><span>${s.client.name}</span></div>`:''}
    </div>
    <div class="perf-b"></div>
    <div class="footer">
      <div class="footer-main">${store.footer}</div>
    </div>
  </div></body></html>`)
  win.document.close(); win.focus()
  setTimeout(()=>{win.print();win.close()},400)
}

// ── Clients ─────────────────────────────────────────────────────────
const clients=ref([]); const cliLoad=ref(false)
const cliQ=ref(''); const showCliModal=ref(false); const editCli=ref(null)
const cliForm=reactive({name:'',phone:'',address:'',comment:''})
let cliTimer2=null
async function loadClients() {
  cliLoad.value=true
  try { const p={}; if(cliQ.value.trim())p.search=cliQ.value.trim()
    const r=await clientsApi.getAll(p); clients.value=r.data }
  catch{clients.value=[]} finally{cliLoad.value=false}
}
watch(cliQ,()=>{ clearTimeout(cliTimer2); cliTimer2=setTimeout(loadClients,300) })
function openCliAdd(){editCli.value=null;Object.assign(cliForm,{name:'',phone:'',address:'',comment:''});showCliModal.value=true}
function openCliEdit(c){editCli.value=c;Object.assign(cliForm,{name:c.name,phone:c.phone,address:c.address,comment:c.comment});showCliModal.value=true}
async function saveCli(){
  try { if(editCli.value) await clientsApi.update(editCli.value.id,cliForm); else await clientsApi.create(cliForm)
    showCliModal.value=false; loadClients() }
  catch(e){alert(e.response?.data?.message??'Xatolik')}
}
async function delCli(id){ if(!confirm("O'chirasizmi?"))return; try{await clientsApi.remove(id);loadClients()}catch(e){alert(e.response?.data?.message??'Xatolik')} }

// ── Barcode scan ─────────────────────────────────────────────────────
const barcodeQ  = ref('')
const barcodeEl = ref(null)

async function resolveScannedBarcode(bc) {
  try {
    const found = await productsApi.getByBarcode(bc)
    if (found && Number(found.qty) > 0) {
      const idx = products.value.findIndex(p => p.id === found.id)
      addToCart(found, idx >= 0 ? idx : 0)
    } else if (found) {
      flashErr(`${found.name}: zaxira tugagan`)
    } else {
      flashErr(`Tovar topilmadi: ${bc}`)
    }
  } catch { /* ignore */ }
}

async function onBarcodeScan() {
  const bc = barcodeQ.value.trim()
  if (!bc) return
  barcodeQ.value = ''
  await resolveScannedBarcode(bc)
  await nextTick()
  barcodeEl.value?.focus()
}

// ── Mobile: camera barcode scanner ────────────────────────────────────
const showCameraScanner = ref(false)
async function onCameraDetected(code) {
  await resolveScannedBarcode(code)
}

// cart item stock warning
function cartItemOverStock(item) {
  return Number(item.qty) > Number(item.stockQty) && item.stockQty > 0
}

// ── Keyboard ─────────────────────────────────────────────────────────
function onKey(e) {
  if(mode.value!=='pos') return
  if(e.key==='F2'){e.preventDefault(); nextTick(()=>barcodeEl.value?.focus())}
  if(e.key==='F9'){e.preventDefault(); if(cart.value.length) parkCurrent(); else if(parkedSales.value.length) showParkedPanel.value=!showParkedPanel.value}
  if(e.key==='F12'){e.preventDefault(); if(cart.value.length)showPayModal.value=true}
  if(e.key==='Escape'){ showPayModal.value=false; showParkedPanel.value=false }
}
onMounted(async()=>{
  window.addEventListener('keydown',onKey)
  await Promise.all([loadProducts(), loadCategories()])
  try{docNumber.value=await salesApi.getNextDocNumber()}catch{}
})
onUnmounted(()=>window.removeEventListener('keydown',onKey))

function fmt(v){return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v)||0))}
const STATUS_MAP={completed:{label:'Bajarildi',cls:'st--ok'},cancelled:{label:'Bekor',cls:'st--cancel'},draft:{label:'Qoralama',cls:'st--draft'}}
const PAY_ICONS={'Naqd':'dollar-sign','Karta':'credit-card',"O'tkazma":'send','Qarz':'clock'}
const TXN_LABELS={sale:"Sotuv",income:"Kirim",expense:"Chiqim",debt_payment:"Qarz to'lovi",refund:"Qaytarish",opening:"Ochilish qoldig'i"}
</script>

<template>
<div class="sales-root">
<div class="sp">

  <!-- Narrow icon sidebar -->
  <aside class="sp-ico">
    <div class="sp-ico__logo"><AppIcon name="shopping-cart" :size="18" :stroke-width="2.5"/></div>
    <nav class="sp-ico__nav">
      <button :class="['ico-btn',mode==='pos'&&'ico-btn--on']"     @click="mode='pos'"     title="POS"><AppIcon name="monitor"     :size="18"/></button>
      <button :class="['ico-btn',mode==='history'&&'ico-btn--on']" @click="mode='history'" title="Tarix"><AppIcon name="list"      :size="18"/></button>
      <button :class="['ico-btn',mode==='cash'&&'ico-btn--on']"    @click="mode='cash'"    title="Kassa"><AppIcon name="bar-chart-2" :size="18"/></button>
      <button :class="['ico-btn',mode==='clients'&&'ico-btn--on']" @click="mode='clients'" title="Mijozlar"><AppIcon name="users" :size="18"/></button>
    </nav>
    <div class="sp-ico__bot">
      <button
        class="price-type-btn"
        :class="priceType==='ulgurji' ? 'price-type-btn--ulg' : 'price-type-btn--cha'"
        @click="priceType=priceType==='chakana'?'ulgurji':'chakana'"
        :title="priceType==='chakana' ? 'Chakana narx — bosing ulgurjiga o\'tish uchun' : 'Ulgurji narx — bosing chakanaga qaytish uchun'"
      >
        <AppIcon name="tag" :size="14"/>
        <span class="price-type-lbl">{{ priceType==='chakana' ? 'Chak.' : 'Ulg.' }}</span>
      </button>
    </div>
  </aside>

  <!-- POS main -->
  <div v-if="mode==='pos'" class="pos">

    <!-- Success toast -->
    <transition name="toast">
      <div v-if="successFlash" class="pos-toast pos-toast--ok"><AppIcon name="check-circle" :size="18"/> Sotuv amalga oshirildi!</div>
    </transition>

    <!-- Hold toast -->
    <transition name="toast">
      <div v-if="holdFlash" class="pos-toast pos-toast--hold"><AppIcon name="pause-circle" :size="18"/> Ajdaniyaga qo'yildi</div>
    </transition>

    <!-- Error toast -->
    <transition name="toast">
      <div v-if="errFlash" class="pos-toast pos-toast--err"><AppIcon name="alert-circle" :size="18"/> {{ errFlash }}</div>
    </transition>

    <!-- LEFT: Product catalog -->
    <div class="pos__catalog">
      <!-- Search + Scan -->
      <div class="cat__topbar">
        <div class="cat__scan-wrap">
          <AppIcon name="zap" :size="13" class="cat__scan-ico"/>
          <input
            ref="barcodeEl"
            v-model="barcodeQ"
            class="cat__scan-inp"
            placeholder="Shtrix kod (F2)..."
            autocomplete="off"
            @keyup.enter="onBarcodeScan"
          />
          <button class="cat__scan-cam-btn" title="Kamera bilan skanerlash" @click="showCameraScanner = true">
            <AppIcon name="camera" :size="15" :stroke-width="2.1"/>
          </button>
        </div>
        <div class="cat__search-wrap">
          <AppIcon name="search" :size="13" class="cat__search-ico"/>
          <input id="main-search" v-model="searchQ" class="cat__search" placeholder="Nom, artikul..." autocomplete="off"/>
        </div>
        <div class="cat__meta">
          <span class="cat__doc">#{{ docNumber }}</span>
          <select v-model="warehouse" class="cat__wh">
            <option>Asosiy ombor</option><option>2-filial</option><option>3-filial</option>
          </select>
          <button
            class="cat__oos-btn"
            :class="{ on: showOutOfStock }"
            :title="showOutOfStock ? 'Faqat mavjudlarni ko\'rsatish' : 'Tugaganlari ham ko\'rsatish'"
            @click="showOutOfStock = !showOutOfStock"
          >
            <AppIcon name="eye" :size="13"/>
          </button>
          <button
            class="cat__price-type-btn"
            :class="priceType==='ulgurji' ? 'cat__price-type-btn--ulg' : 'cat__price-type-btn--cha'"
            @click="priceType=priceType==='chakana'?'ulgurji':'chakana'"
            :title="priceType==='chakana' ? 'Chakana narx — bosing ulgurjiga o\'tish uchun' : 'Ulgurji narx — bosing chakanaga qaytish uchun'"
          >
            <AppIcon name="tag" :size="13"/>
            <span>{{ priceType==='chakana' ? 'Chak.' : 'Ulg.' }}</span>
          </button>
        </div>
      </div>

      <!-- Category tabs -->
      <div class="cat__tabs">
        <button :class="['cat__tab',activeCategory==='all'&&'cat__tab--on']" @click="activeCategory='all'">Barchasi</button>
        <button v-for="c in categories" :key="c" :class="['cat__tab',activeCategory===c&&'cat__tab--on']" @click="activeCategory=c">{{ c }}</button>
      </div>

      <!-- Price type banner -->
      <div v-if="priceType==='ulgurji'" class="cat__price-banner">
        <AppIcon name="tag" :size="13"/> Ulgurji narxlarda sotuv
        <button @click="priceType='chakana'">Chakana</button>
      </div>

      <!-- Grid -->
      <div class="cat__grid-wrap">
        <div v-if="prodLoading" class="cat__grid">
          <div v-for="i in 12" :key="i" class="skeleton prod-skel"></div>
        </div>
        <div v-else-if="!products.length" class="cat__empty">
          <AppIcon name="package" :size="40" :stroke-width="1.2"/>
          <p>Mahsulot topilmadi</p>
        </div>
        <div v-else class="cat__grid">
          <button
            v-for="(p, idx) in products" :key="p.id"
            class="pcard"
            :class="[p.qty<=0 && 'pcard--out', bumpedProductId===p.id && 'pcard--bump']"
            @click="tapAddToCart(p, idx)"
          >
            <!-- Stock badge -->
            <div class="pcard__stock" :class="p.qty>0 ? 'bq--ok' : 'bq--zero'">
              {{ p.qty }} {{ p.unit||'don' }}
            </div>

            <!-- Top area: photo or colored icon -->
            <div class="pcard__top" :style="p.photo ? {} : { background: cardColor(idx), color: textColor(idx) }">
              <img
                v-if="p.photo"
                :src="fileUrl(p.photo)"
                class="pcard__photo" alt=""
                @error="e => e.target.parentElement.style.background = cardColor(idx)"
              />
              <div v-else class="pcard__icon-wrap">
                <AppIcon name="package" :size="32" :stroke-width="1.3"/>
              </div>
              <div v-if="p.qty<=0" class="pcard__sold-out">Tugagan</div>
            </div>

            <!-- Bottom: name + price -->
            <div class="pcard__info">
              <div class="pcard__name">{{ p.name }}</div>
              <div class="pcard__price-row">
                <span class="pcard__price">{{ fmt(priceType==='ulgurji' ? p.wholesalePrice : p.retailPrice) }}</span>
                <span class="pcard__cur">so'm</span>
              </div>
              <div v-if="showUSD && exchangeRate > 0" class="pcard__usd">
                ≈ {{ toUSD(priceType==='ulgurji' ? p.wholesalePrice : p.retailPrice) }} $
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- RIGHT: Cart -->
    <div class="pos__cart">

      <!-- ── Header ───────────────────────────────────── -->
      <div class="cart__hdr">
        <div class="cart__hdr-l">
          <div class="cart__hdr-icon"><AppIcon name="shopping-cart" :size="16" :stroke-width="2.5"/></div>
          <div class="cart__hdr-titles">
            <span class="cart__title">Savat</span>
            <span class="cart__doc">#{{ docNumber }}</span>
          </div>
          <span v-if="cart.length" class="cart__cnt">{{ itemsCount }} ta</span>
        </div>
        <div class="cart__hdr-acts">
          <!-- Last sale quick view -->
          <button v-if="lastSale" class="chdr-btn chdr-btn--last" @click="openSaleModal(lastSale)" title="Oxirgi sotuv">
            <AppIcon name="clock" :size="14"/>
          </button>
          <!-- Client picker -->
          <div style="position:relative">
            <button class="chdr-btn" :class="selectedClient&&'chdr-btn--on'" @click="clientOpen=!clientOpen" title="Mijoz tanlash">
              <AppIcon name="user" :size="14"/>
            </button>
            <div v-if="clientOpen" class="client-drop">
              <div v-if="selectedClient" class="cli-sel">
                <div>
                  <div class="cli-sel__name">{{ selectedClient.name }}</div>
                  <div v-if="selectedClient.balance<0" class="cli-sel__debt">Qarz: {{ fmt(-selectedClient.balance) }} so'm</div>
                </div>
                <button class="cli-sel__x" @click="dropClient();clientOpen=false"><AppIcon name="x" :size="12"/></button>
              </div>
              <div class="cli-search">
                <input v-model="clientQ" class="cli-search__inp" placeholder="Mijoz qidirish..." @input="searchClients(clientQ)" autofocus/>
              </div>
              <div v-if="clientList.length" class="cli-list">
                <button v-for="c in clientList" :key="c.id" class="cli-opt" @mousedown.prevent="pickClient(c);clientOpen=false">
                  <span class="cli-opt__name">{{ c.name }}</span>
                  <span class="cli-opt__sub">{{ c.phone }}<span v-if="c.balance<0" class="cli-opt__debt"> · Qarz: {{ fmt(-c.balance) }}</span></span>
                </button>
              </div>
            </div>
          </div>
          <!-- Clear cart -->
          <button v-if="cart.length" class="chdr-btn chdr-btn--del" @click="clearCart" title="Savatni tozalash">
            <AppIcon name="trash-2" :size="14"/>
          </button>
        </div>
      </div>

      <!-- ── Ajdaniya bar ──────────────────────────────── -->
      <div class="adj-bar">
        <button
          class="adj-park-btn"
          :class="!cart.length && 'adj-park-btn--off'"
          @click="parkCurrent"
          title="Ajdaniyaga qo'yish — joriy savatni kutishga olish (F9)"
        >
          <AppIcon name="pause-circle" :size="14"/>
          <span>Kutishga qo'y</span>
        </button>
        <div class="adj-pills">
          <button
            v-for="(p, i) in parkedSales" :key="p.id"
            class="adj-pill"
            @click="restoreParked(i)"
            :title="`Tiklash: ${p.client?.name||'Anonim'} · ${p.cart.length} ta mahsulot · ${fmt(p.cart.reduce((s,c)=>s+(Number(c.totalSum)||0),0))} so'm`"
          >
            <span class="adj-pill__n">{{ i+1 }}</span>
            <span class="adj-pill__lbl">{{ p.client?.name?.split(' ')[0] || 'Anonim' }}</span>
            <span class="adj-pill__sum">{{ fmt(p.cart.reduce((s,c)=>s+(Number(c.totalSum)||0),0)) }}</span>
            <button class="adj-pill__x" @click.stop="deleteParked(i)"><AppIcon name="x" :size="9" :stroke-width="3"/></button>
          </button>
        </div>
      </div>

      <!-- ── Client bar ────────────────────────────────── -->
      <div v-if="selectedClient" class="cart__cli-bar">
        <div class="cli-bar-av">{{ (selectedClient.name[0]||'?').toUpperCase() }}</div>
        <div class="cli-bar-info">
          <span class="cli-bar-name">{{ selectedClient.name }}</span>
          <span v-if="selectedClient.balance<0" class="cli-bar-debt">Qarz: {{ fmt(-selectedClient.balance) }} so'm</span>
          <span v-else class="cli-bar-ok">Qarz yo'q</span>
        </div>
        <button class="cli-bar-x" @click="dropClient"><AppIcon name="x" :size="12"/></button>
      </div>

      <!-- ── Payment type ───────────────────────────────── -->
      <div class="cart__pay-type">
        <button v-for="pt in ['Naqd','Karta',&quot;O\'tkazma&quot;,'Qarz']" :key="pt"
          :class="['pt-chip', paymentType===pt && 'pt-chip--on']" @click="paymentType=pt">
          <AppIcon :name="PAY_ICONS[pt]" :size="11"/>{{ pt }}
        </button>
      </div>

      <!-- ── Cart items ─────────────────────────────────── -->
      <div class="cart__items">
        <div v-if="!cart.length" class="cart__empty">
          <div class="cart__empty-icon"><AppIcon name="shopping-cart" :size="40" :stroke-width="1.1"/></div>
          <p class="cart__empty-title">Savat bo'sh</p>
          <p class="cart__empty-hint">Chap tarafdan mahsulot tanlang<br/>yoki shtrix kod skanerlang</p>
        </div>
        <div v-else class="cart__list">
          <div
            v-for="(item, idx) in cart" :key="item._key"
            :class="['cart-item', idx===activeIdx && 'cart-item--active']"
            @click="activeIdx=idx"
          >
            <!-- Yuqori qator: № + nom + jami summa (burchakda) + o'chirish -->
            <div class="ci-top">
              <div class="ci-num">{{ idx+1 }}</div>
              <div class="ci-name">{{ item.productName }}</div>
              <div class="ci-total-badge">{{ fmt(item.totalSum) }} <span>so'm</span></div>
              <button class="ci-del" @click.stop="removeItem(idx)"><AppIcon name="x" :size="11" :stroke-width="3"/></button>
            </div>
            <!-- Pastki qator: miqdor + narx tahriri -->
            <div class="ci-bottom">
              <div class="ci-qty-wrap">
                <button class="ci-q-btn" @click.stop="setQty(item,item.qty-1)" :disabled="item.qty<=1">−</button>
                <input class="ci-q-inp" type="number" :value="item.qty" @change.stop="setQty(item,$event.target.value)" @click.stop/>
                <button class="ci-q-btn" @click.stop="setQty(item,item.qty+1)">+</button>
              </div>
              <span v-if="cartItemOverStock(item)" class="ci-over">
                <AppIcon name="alert-triangle" :size="9" :stroke-width="2.5"/> oshib ketdi
              </span>
              <div class="ci-price-edit" @click.stop>
                <span class="ci-price-lbl">Narx</span>
                <input class="ci-p-inp" type="number" :value="item.price" @change.stop="setPrice(item,$event.target.value)" title="Bir dona narxini o'zgartirish"/>
                <span class="ci-price-cur">so'm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Footer ────────────────────────────────────── -->
      <div class="cart__foot">
        <!-- Discount -->
        <div class="cart__disc-row">
          <span class="cart__disc-lbl">
            <AppIcon name="percent" :size="11"/> Skidka
          </span>
          <div class="disc-mode-tabs">
            <button :class="['dmt',discountMode==='sum'&&'dmt--on']" @click="setDiscountMode('sum')">so'm</button>
            <button :class="['dmt',discountMode==='pct'&&'dmt--on']" @click="setDiscountMode('pct')">%</button>
          </div>
          <div class="cart__disc-ctrl">
            <input v-if="discountMode==='pct'" v-model.number="discountPct" type="number" min="0" max="100" class="disc-inp" placeholder="0"/>
            <input v-else v-model.number="discount" type="number" min="0" class="disc-inp" placeholder="0"/>
            <span class="disc-cur">{{ discountMode==='pct'?'%':'so\'m' }}</span>
            <button v-if="discount>0" class="disc-x" @click="discount=0;discountPct=0">×</button>
          </div>
        </div>
        <div v-if="roundChips.length" class="cart__disc-chips">
          <button v-for="c in roundChips" :key="c.step"
            class="disc-chip" :class="discount===c.disc&&'disc-chip--on'"
            @click="discount=c.disc">
            {{ c.label }}<span>−{{ fmt(c.disc) }}</span>
          </button>
        </div>
        <!-- Totals -->
        <div class="cart__totals">
          <div class="cart__total-row">
            <span>Mahsulotlar ({{ cart.length }} ta)</span>
            <div class="dual-val">
              <span>{{ fmt(totalSum) }} so'm</span>
              <span v-if="showUSD" class="dual-usd">≈ {{ toUSD(totalSum) }} $</span>
            </div>
          </div>
          <div v-if="discount>0" class="cart__total-row cart__total-disc">
            <span>Skidka</span>
            <div class="dual-val">
              <span>−{{ fmt(discount) }} so'm</span>
              <span v-if="showUSD" class="dual-usd">−{{ toUSD(discount) }} $</span>
            </div>
          </div>
          <div class="cart__total-main">
            <span>To'lash kerak</span>
            <div class="dual-val">
              <span>{{ fmt(payableSum) }} so'm</span>
              <span v-if="showUSD" class="dual-usd-main">{{ toUSD(payableSum) }} $</span>
            </div>
          </div>
        </div>
        <div v-if="saveErr" class="cart__err">{{ saveErr }}</div>
        <!-- Pay button -->
        <button class="cart__pay-btn" :disabled="!cart.length||saving||!canAdd('sales')" :title="!canAdd('sales') ? 'Sotuv qilish huquqingiz yo\'q' : ''" @click="showPayModal=true">
          <AppIcon name="zap" :size="18" :stroke-width="2.5"/>
          <span class="pay-sum">{{ fmt(payableSum) }} so'm</span>
          <span v-if="showUSD" class="pay-usd">≈ {{ toUSD(payableSum) }} $</span>
          <kbd>F12</kbd>
        </button>
        <div v-if="debtSum>0" class="cart__debt-note">
          <AppIcon name="clock" :size="11"/> Qarz: {{ fmt(debtSum) }} so'm
          <span v-if="showUSD"> ≈ {{ toUSD(debtSum) }} $</span>
          · {{ selectedClient?.name }}
        </div>
      </div>
    </div>

    <!-- ══ MOBILE: persistent cart bar (≤768px) ═══════════════════ -->
    <button
      v-if="cart.length"
      class="m-cart-bar"
      @click="cartExpanded = true"
    >
      <span class="m-cart-bar__count">{{ itemsCount }}</span>
      <span class="m-cart-bar__txt">
        <span class="m-cart-bar__items">{{ cart.length }} mahsulot</span>
        <span class="m-cart-bar__sum">{{ fmt(payableSum) }} so'm<template v-if="showUSD"> · {{ toUSD(payableSum) }} $</template></span>
      </span>
      <span class="m-cart-bar__cta">Savat <AppIcon name="chevron-right" :size="16" :stroke-width="2.5"/></span>
    </button>

    <!-- ══ MOBILE: cart bottom-sheet (≤768px) ══════════════════════ -->
    <transition name="m-sheet-backdrop">
      <div v-if="cartExpanded" class="m-sheet-backdrop" @click="cartExpanded = false"></div>
    </transition>
    <transition name="m-sheet-slide">
      <div v-if="cartExpanded" class="m-sheet" role="dialog" aria-label="Savat">
        <div class="m-sheet__handle-wrap" @click="cartExpanded = false">
          <span class="m-sheet__handle"></span>
        </div>

        <!-- Sheet header -->
        <div class="m-sheet__hdr">
          <div class="m-sheet__hdr-l">
            <div class="cart__hdr-icon"><AppIcon name="shopping-cart" :size="16" :stroke-width="2.5"/></div>
            <div class="cart__hdr-titles">
              <span class="cart__title">Savat</span>
              <span class="cart__doc">#{{ docNumber }} · {{ itemsCount }} ta</span>
            </div>
          </div>
          <div class="m-sheet__hdr-acts">
            <div style="position:relative">
              <button class="chdr-btn" :class="selectedClient&&'chdr-btn--on'" @click="clientOpen=!clientOpen" title="Mijoz tanlash">
                <AppIcon name="user" :size="15"/>
              </button>
              <div v-if="clientOpen" class="client-drop client-drop--mob">
                <div v-if="selectedClient" class="cli-sel">
                  <div>
                    <div class="cli-sel__name">{{ selectedClient.name }}</div>
                    <div v-if="selectedClient.balance<0" class="cli-sel__debt">Qarz: {{ fmt(-selectedClient.balance) }} so'm</div>
                  </div>
                  <button class="cli-sel__x" @click="dropClient();clientOpen=false"><AppIcon name="x" :size="12"/></button>
                </div>
                <div class="cli-search">
                  <input v-model="clientQ" class="cli-search__inp" placeholder="Mijoz qidirish..." @input="searchClients(clientQ)"/>
                </div>
                <div v-if="clientList.length" class="cli-list">
                  <button v-for="c in clientList" :key="c.id" class="cli-opt" @mousedown.prevent="pickClient(c);clientOpen=false">
                    <span class="cli-opt__name">{{ c.name }}</span>
                    <span class="cli-opt__sub">{{ c.phone }}<span v-if="c.balance<0" class="cli-opt__debt"> · Qarz: {{ fmt(-c.balance) }}</span></span>
                  </button>
                </div>
              </div>
            </div>
            <button v-if="cart.length" class="chdr-btn chdr-btn--del" @click="clearCart" title="Savatni tozalash">
              <AppIcon name="trash-2" :size="15"/>
            </button>
            <button class="chdr-btn m-sheet__close" @click="cartExpanded = false" title="Yopish">
              <AppIcon name="x" :size="16" :stroke-width="2.5"/>
            </button>
          </div>
        </div>

        <!-- Client bar -->
        <div v-if="selectedClient" class="cart__cli-bar">
          <div class="cli-bar-av">{{ (selectedClient.name[0]||'?').toUpperCase() }}</div>
          <div class="cli-bar-info">
            <span class="cli-bar-name">{{ selectedClient.name }}</span>
            <span v-if="selectedClient.balance<0" class="cli-bar-debt">Qarz: {{ fmt(-selectedClient.balance) }} so'm</span>
            <span v-else class="cli-bar-ok">Qarz yo'q</span>
          </div>
          <button class="cli-bar-x" @click="dropClient"><AppIcon name="x" :size="12"/></button>
        </div>

        <!-- Payment type -->
        <div class="cart__pay-type">
          <button v-for="pt in ['Naqd','Karta',&quot;O\'tkazma&quot;,'Qarz']" :key="pt"
            :class="['pt-chip', paymentType===pt && 'pt-chip--on']" @click="paymentType=pt">
            <AppIcon :name="PAY_ICONS[pt]" :size="11"/>{{ pt }}
          </button>
        </div>

        <!-- Items -->
        <div class="m-sheet__items">
          <div v-if="!cart.length" class="cart__empty">
            <div class="cart__empty-icon"><AppIcon name="shopping-cart" :size="40" :stroke-width="1.1"/></div>
            <p class="cart__empty-title">Savat bo'sh</p>
          </div>
          <div v-else class="cart__list">
            <div
              v-for="(item, idx) in cart" :key="item._key"
              class="cart-item cart-item--mob"
            >
              <div class="ci-top">
                <div class="ci-num">{{ idx+1 }}</div>
                <div class="ci-name">{{ item.productName }}</div>
                <div class="ci-total-badge">{{ fmt(item.totalSum) }} <span>so'm</span></div>
                <button class="ci-del ci-del--mob" @click.stop="removeItem(idx)"><AppIcon name="x" :size="12" :stroke-width="3"/></button>
              </div>
              <div class="ci-bottom">
                <div class="ci-qty-wrap ci-qty-wrap--mob">
                  <button class="ci-q-btn ci-q-btn--mob" @click.stop="setQty(item,item.qty-1)" :disabled="item.qty<=1">−</button>
                  <input class="ci-q-inp ci-q-inp--mob" type="number" :value="item.qty" @change.stop="setQty(item,$event.target.value)" @click.stop/>
                  <button class="ci-q-btn ci-q-btn--mob" @click.stop="setQty(item,item.qty+1)">+</button>
                </div>
                <span v-if="cartItemOverStock(item)" class="ci-over">
                  <AppIcon name="alert-triangle" :size="9" :stroke-width="2.5"/> oshib ketdi
                </span>
                <div class="ci-price-edit" @click.stop>
                  <span class="ci-price-lbl">Narx</span>
                  <input class="ci-p-inp" type="number" :value="item.price" @change.stop="setPrice(item,$event.target.value)"/>
                  <span class="ci-price-cur">so'm</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer: discount + totals + pay -->
        <div class="cart__foot m-sheet__foot">
          <div class="cart__disc-row">
            <span class="cart__disc-lbl"><AppIcon name="percent" :size="11"/> Skidka</span>
            <div class="disc-mode-tabs">
              <button :class="['dmt',discountMode==='sum'&&'dmt--on']" @click="setDiscountMode('sum')">so'm</button>
              <button :class="['dmt',discountMode==='pct'&&'dmt--on']" @click="setDiscountMode('pct')">%</button>
            </div>
            <div class="cart__disc-ctrl">
              <input v-if="discountMode==='pct'" v-model.number="discountPct" type="number" min="0" max="100" class="disc-inp" placeholder="0"/>
              <input v-else v-model.number="discount" type="number" min="0" class="disc-inp" placeholder="0"/>
              <span class="disc-cur">{{ discountMode==='pct'?'%':'so\'m' }}</span>
              <button v-if="discount>0" class="disc-x" @click="discount=0;discountPct=0">×</button>
            </div>
          </div>
          <div class="cart__totals">
            <div class="cart__total-row">
              <span>Mahsulotlar ({{ cart.length }} ta)</span>
              <div class="dual-val">
                <span>{{ fmt(totalSum) }} so'm</span>
                <span v-if="showUSD" class="dual-usd">≈ {{ toUSD(totalSum) }} $</span>
              </div>
            </div>
            <div v-if="discount>0" class="cart__total-row cart__total-disc">
              <span>Skidka</span>
              <div class="dual-val">
                <span>−{{ fmt(discount) }} so'm</span>
                <span v-if="showUSD" class="dual-usd">−{{ toUSD(discount) }} $</span>
              </div>
            </div>
            <div class="cart__total-main">
              <span>To'lash kerak</span>
              <div class="dual-val">
                <span>{{ fmt(payableSum) }} so'm</span>
                <span v-if="showUSD" class="dual-usd-main">{{ toUSD(payableSum) }} $</span>
              </div>
            </div>
          </div>
          <button class="cart__pay-btn" :disabled="!cart.length||saving||!canAdd('sales')" @click="cartExpanded=false; showPayModal=true">
            <AppIcon name="zap" :size="18" :stroke-width="2.5"/>
            <span class="pay-sum">{{ fmt(payableSum) }} so'm</span>
            <span v-if="showUSD" class="pay-usd">≈ {{ toUSD(payableSum) }} $</span>
          </button>
        </div>
      </div>
    </transition>
  </div>

  <!-- HISTORY -->
  <div v-else-if="mode==='history'" class="pg-view">
    <div class="pg-hdr">
      <h2 class="pg-title">Sotuv tarixi</h2>
      <input v-model="histQ" class="pg-search" placeholder="Doc raqam, mijoz..."/>
      <select v-model="histSt" class="pg-sel">
        <option value="all">Barcha</option>
        <option value="completed">Bajarildi</option>
        <option value="cancelled">Bekor</option>
      </select>
      <label class="pg-date-lbl">Dan: <input v-model="histFrom" type="date" class="pg-date"/></label>
      <label class="pg-date-lbl">Gacha: <input v-model="histTo" type="date" class="pg-date"/></label>
      <button v-if="histFrom||histTo" class="pg-clear-btn" @click="histFrom='';histTo=''" title="Filtrni tozalash">
        <AppIcon name="x" :size="12"/>
      </button>
      <button class="pg-refresh" @click="loadHistory" title="Yangilash">
        <AppIcon name="refresh-cw" :size="14" :class="histLoad&&'spin-ico'"/>
      </button>
      <button class="pg-export-btn" @click="exportHistoryCSV" :disabled="!history.length" title="CSV yuklab olish">
        <AppIcon name="download" :size="14"/> CSV
      </button>
    </div>
    <div class="pg-body">
      <div v-if="histLoad" class="pg-loading"><div v-for="i in 8" :key="i" class="skeleton pg-skel"/></div>
      <div v-else-if="!history.length" class="pg-empty">
        <AppIcon name="inbox" :size="40" :stroke-width="1.2"/>
        <p>Sotuv topilmadi</p>
      </div>
      <table v-else class="data-tbl">
        <thead>
          <tr>
            <th>Doc №</th>
            <th>Sana / Vaqt</th>
            <th>Mijoz</th>
            <th>To'lov</th>
            <th class="ta-c">Tovar</th>
            <th class="ta-r">Jami summa</th>
            <th class="ta-r">Qarz</th>
            <th>Holat</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in history" :key="s.id"
            class="data-row hist-row"
            @click="openSaleModal(s)"
          >
            <td><span class="doc-num">#{{ String(s.docNumber).padStart(5,'0') }}</span></td>
            <td>
              <div class="c-dim" style="font-size:12.5px;font-weight:500;color:#374151">{{ s.date?.slice(0,10).split('-').reverse().join('.') }}</div>
              <div class="c-dim" style="font-size:11px;margin-top:1px">{{ s.date?.slice(11,16) }}</div>
            </td>
            <td>
              <div v-if="s.client?.name" class="hist-client">
                <div class="hist-av">{{ s.client.name[0]?.toUpperCase() }}</div>
                <span class="c-bold">{{ s.client.name }}</span>
              </div>
              <span v-else class="c-dim">—</span>
            </td>
            <td>
              <span class="pay-badge">
                <AppIcon :name="PAY_ICONS[s.paymentType]||'dollar-sign'" :size="11"/>
                {{ s.paymentType }}
              </span>
            </td>
            <td class="ta-c"><span class="cnt-badge">{{ s.itemCount }} ta</span></td>
            <td class="ta-r">
              <span class="hist-sum">{{ fmt(s.totalSum) }}</span>
              <span class="c-dim" style="font-size:11px;font-weight:400"> so'm</span>
              <div v-if="showUSD && s.totalUSD>0" class="hist-usd">{{ s.totalUSD.toFixed(2) }} $</div>
            </td>
            <td class="ta-r">
              <span v-if="s.debtSum>0" class="debt-badge">{{ fmt(s.debtSum) }}</span>
              <div v-if="showUSD && s.debtUSD>0" class="hist-usd hist-usd--debt">{{ s.debtUSD.toFixed(2) }} $</div>
              <span v-if="!s.debtSum" class="c-dim">—</span>
            </td>
            <td><span class="st-badge" :class="STATUS_MAP[s.status]?.cls">{{ STATUS_MAP[s.status]?.label }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- CASH REPORT -->
  <div v-else-if="mode==='cash'" class="pg-view">
    <div class="pg-hdr">
      <h2 class="pg-title">Kassa hisobot</h2>
      <label class="pg-date-lbl">Dan: <input v-model="cashFrom" type="date" class="pg-date" @change="loadCash"/></label>
      <label class="pg-date-lbl">Gacha: <input v-model="cashTo" type="date" class="pg-date" @change="loadCash"/></label>
      <button class="pg-refresh" @click="loadCash" :title="cashLoad?'Yuklanmoqda...':'Yangilash'">
        <AppIcon name="refresh-cw" :size="14" :class="cashLoad&&'spin-ico'"/>
      </button>
      <div class="pg-hdr-divider"></div>
      <button class="ce-btn ce-btn--in" @click="openCashEntry('income')">
        <AppIcon name="arrow-down-circle" :size="14"/> Kirim
      </button>
      <button class="ce-btn ce-btn--out" @click="openCashEntry('expense')">
        <AppIcon name="arrow-up-circle" :size="14"/> Chiqim
      </button>
    </div>

    <div v-if="cashLoad" class="pg-body">
      <div class="pg-loading"><div v-for="i in 6" :key="i" class="skeleton pg-skel"/></div>
    </div>

    <div v-else-if="!cashRep" class="pg-body">
      <div class="pg-empty"><AppIcon name="bar-chart-2" :size="40" :stroke-width="1.2"/><p>Ma'lumot topilmadi</p></div>
    </div>

    <div v-else style="display:flex;flex-direction:column;flex:1;overflow:hidden">

      <!-- Summary strip -->
      <div class="cash-summary">
        <div class="cs-card cs-card--green">
          <div class="cs-ico"><AppIcon name="shopping-bag" :size="15"/></div>
          <div>
            <div class="cs-lbl">Sotuvdan tushum</div>
            <div class="cs-val">{{ fmt(cashRep.summary.sale) }} <span>so'm</span></div>
            <div v-if="showUSD && cashRep.summaryUSD?.sale>0" class="cs-usd">≈ {{ cashRep.summaryUSD.sale.toFixed(2) }} $</div>
          </div>
        </div>
        <div class="cs-card cs-card--blue">
          <div class="cs-ico"><AppIcon name="arrow-down-circle" :size="15"/></div>
          <div>
            <div class="cs-lbl">Kirim (boshqa)</div>
            <div class="cs-val">{{ fmt(cashRep.summary.income) }} <span>so'm</span></div>
            <div v-if="showUSD && cashRep.summaryUSD?.income>0" class="cs-usd">≈ {{ cashRep.summaryUSD.income.toFixed(2) }} $</div>
          </div>
        </div>
        <div class="cs-card cs-card--amber">
          <div class="cs-ico"><AppIcon name="clock" :size="15"/></div>
          <div>
            <div class="cs-lbl">Qarz to'lovi</div>
            <div class="cs-val">{{ fmt(cashRep.summary.debt_payment) }} <span>so'm</span></div>
            <div v-if="showUSD && cashRep.summaryUSD?.debt_payment>0" class="cs-usd">≈ {{ cashRep.summaryUSD.debt_payment.toFixed(2) }} $</div>
          </div>
        </div>
        <div class="cs-card cs-card--rose">
          <div class="cs-ico"><AppIcon name="arrow-up-circle" :size="15"/></div>
          <div>
            <div class="cs-lbl">Chiqim / Xarajat</div>
            <div class="cs-val cs-val--rose">{{ fmt(cashRep.summary.expense) }} <span>so'm</span></div>
            <div v-if="showUSD && cashRep.summaryUSD?.expense>0" class="cs-usd cs-usd--rose">≈ {{ cashRep.summaryUSD.expense.toFixed(2) }} $</div>
          </div>
        </div>
        <div class="cs-card cs-card--indigo cs-card--big">
          <div class="cs-ico"><AppIcon name="trending-up" :size="15"/></div>
          <div>
            <div class="cs-lbl">Sof tushum (netto)</div>
            <div class="cs-val cs-val--main">{{ fmt(cashRep.summary.net) }} <span>so'm</span></div>
            <div v-if="showUSD && cashRep.summaryUSD?.net" class="cs-usd cs-usd--main">≈ {{ cashRep.summaryUSD.net.toFixed(2) }} $</div>
          </div>
        </div>
      </div>

      <!-- Transaction table -->
      <div class="pg-body" style="padding-top:0">
        <table class="data-tbl">
          <thead>
            <tr>
              <th>Sana / Vaqt</th>
              <th>Tur</th>
              <th>To'lov usuli</th>
              <th>Mijoz</th>
              <th>Izoh</th>
              <th class="ta-r">Summa</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in cashRep.transactions" :key="t.id"
              class="data-row cash-row--clickable"
              @click="onCashRowClick(t)"
            >
              <td>
                <div style="font-size:12.5px;color:#374151;font-weight:500">{{ t.date?.slice(0,10).split('-').reverse().join('.') }}</div>
                <div class="c-dim" style="font-size:11px;margin-top:1px">{{ t.date?.slice(11,16) }}</div>
              </td>
              <td>
                <span class="txn-badge" :class="`txn--${t.type}`">{{ TXN_LABELS[t.type] || t.type }}</span>
              </td>
              <td>
                <span class="pay-badge" v-if="t.payment_type">
                  <AppIcon :name="PAY_ICONS[t.payment_type]||'dollar-sign'" :size="11"/>
                  {{ t.payment_type }}
                </span>
                <span v-else class="c-dim">—</span>
              </td>
              <td>
                <div v-if="t.client?.name" class="hist-client">
                  <div class="hist-av hist-av--sm">{{ t.client.name[0]?.toUpperCase() }}</div>
                  <span style="font-size:12.5px;font-weight:600;color:#1e293b">{{ t.client.name }}</span>
                </div>
                <span v-else class="c-dim">—</span>
              </td>
              <td class="c-dim" style="font-size:12px;max-width:180px">{{ t.description || '—' }}</td>
              <td class="ta-r">
                <span
                  class="cash-amount"
                  :class="['expense','refund'].includes(t.type) ? 'cash-amount--out' : 'cash-amount--in'"
                >
                  {{ ['expense','refund'].includes(t.type) ? '−' : '+' }}{{ fmt(t.amount) }}
                </span>
                <div class="c-dim" style="font-size:10px;text-align:right">so'm</div>
                <div v-if="showUSD && t.amount_usd>0" class="txn-usd" :class="['expense','refund'].includes(t.type)?'txn-usd--out':'txn-usd--in'">
                  {{ ['expense','refund'].includes(t.type)?'−':'+' }}{{ Number(t.amount_usd).toFixed(2) }} $
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- CLIENTS -->
  <div v-else-if="mode==='clients'" class="pg-view">
    <div class="pg-hdr">
      <h2 class="pg-title">Mijozlar registeri</h2>
      <input v-model="cliQ" class="pg-search" placeholder="Qidirish..."/>
      <button class="pg-add-btn" @click="openCliAdd"><AppIcon name="plus" :size="14"/> Qo'shish</button>
    </div>
    <div class="pg-body">
      <div v-if="cliLoad" class="pg-loading"><div v-for="i in 6" :key="i" class="skeleton pg-skel"></div></div>
      <div v-else-if="!clients.length" class="pg-empty"><AppIcon name="users" :size="36" :stroke-width="1.2"/><p>Mijoz topilmadi</p></div>
      <table v-else class="data-tbl">
        <thead><tr><th>Kod</th><th>Ismi</th><th>Telefon</th><th class="ta-r">Balans</th><th>Izoh</th><th style="width:70px"></th></tr></thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id" class="data-row">
            <td><span class="cl-code">{{ c.code }}</span></td>
            <td>
              <div class="cli-name-row">
                <div class="hist-av hist-av--sm">{{ (c.name[0]||'?').toUpperCase() }}</div>
                <span class="c-bold">{{ c.name }}</span>
              </div>
            </td>
            <td class="c-dim">{{ c.phone||'—' }}</td>
            <td class="ta-r">
              <span :class="c.balance<0?'cl-debt':'cl-ok'">
                {{ c.balance<0?'−':'+' }}{{ fmt(Math.abs(c.balance)) }}
              </span>
              <div class="c-dim" style="font-size:10px">so'm</div>
            </td>
            <td class="c-dim" style="font-size:12px">{{ c.comment||'—' }}</td>
            <td>
              <div class="row-acts">
                <button v-if="c.balance<0" class="row-act row-act--pay" @click="openDebtModal(c)" title="Qarz to'lash">
                  <AppIcon name="dollar-sign" :size="12"/>
                </button>
                <button class="row-act" @click="openCliEdit(c)" title="Tahrirlash"><AppIcon name="edit-2" :size="12"/></button>
                <button class="row-act row-act--del" @click="delCli(c.id)" title="O'chirish"><AppIcon name="trash-2" :size="12"/></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="showCliModal" class="modal-ov" @click.self="showCliModal=false">
      <div class="cl-modal">
        <div class="cl-modal__hdr"><h3>{{ editCli?'Tahrirlash':'Yangi mijoz' }}</h3><button @click="showCliModal=false"><AppIcon name="x" :size="16"/></button></div>
        <div class="cl-modal__body">
          <label class="mf"><span>Ismi *</span><input v-model="cliForm.name" class="mf__inp" placeholder="To'liq ismi..."/></label>
          <label class="mf"><span>Telefon</span><input v-model="cliForm.phone" class="mf__inp" placeholder="+998..."/></label>
          <label class="mf"><span>Manzil</span><input v-model="cliForm.address" class="mf__inp"/></label>
          <label class="mf"><span>Izoh</span><input v-model="cliForm.comment" class="mf__inp"/></label>
        </div>
        <div class="cl-modal__foot"><button class="mf-cancel" @click="showCliModal=false">Bekor</button><button class="mf-save" @click="saveCli">Saqlash</button></div>
      </div>
    </div>
  </div>


  <!-- PAYMENT MODAL -->
  <SalePayModal
    v-if="showPayModal"
    :cart="cart"
    :total-sum="totalSum"
    :payable-sum="payableSum"
    :debt-sum="debtSum"
    :discount="discount"
    :payment-type="paymentType"
    :doc-number="docNumber"
    :warehouse="warehouse"
    :price-type="priceType"
    :selected-client="selectedClient"
    :saving="saving"
    :save-err="saveErr"
    :exchange-rate="exchangeRate"
    :show-u-s-d="showUSD"
    @close="showPayModal=false"
    @complete="completeSale"
    @update:discount="discount=$event"
    @update:payment-type="paymentType=$event"
    @drop-client="dropClient"
  />

  <!-- ══ CASH ENTRY MODAL (Kirim / Chiqim) ═══════════════════════════ -->
  <Teleport to="body">
    <div v-if="showCashEntryModal" class="sm-overlay" @click.self="showCashEntryModal=false">
      <div class="ce-modal">
        <div class="ce-modal__hdr" :class="cashEntryForm.type==='income'?'ce-hdr--in':'ce-hdr--out'">
          <div class="ce-modal__hdr-l">
            <div class="ce-modal__ico">
              <AppIcon :name="cashEntryForm.type==='income'?'arrow-down-circle':'arrow-up-circle'" :size="20"/>
            </div>
            <div>
              <div class="ce-modal__title">{{ cashEntryForm.type==='income'?'Kassa kirimi':'Kassa chiqimi' }}</div>
              <div class="ce-modal__sub">{{ new Date().toLocaleDateString('uz-UZ') }}</div>
            </div>
          </div>
          <button class="sm-close" @click="showCashEntryModal=false"><AppIcon name="x" :size="16" :stroke-width="2.5"/></button>
        </div>
        <div class="ce-modal__body">
          <div class="ce-type-tabs">
            <button :class="['ce-ttab',cashEntryForm.type==='income'&&'ce-ttab--in']" @click="cashEntryForm.type='income'">
              <AppIcon name="arrow-down-circle" :size="14"/> Kirim
            </button>
            <button :class="['ce-ttab',cashEntryForm.type==='expense'&&'ce-ttab--out']" @click="cashEntryForm.type='expense'">
              <AppIcon name="arrow-up-circle" :size="14"/> Chiqim
            </button>
          </div>
          <label class="mf">
            <span>Summa *</span>
            <div class="ce-amount-wrap">
              <input v-model="cashEntryForm.amount" type="number" min="0" class="ce-amount-inp" placeholder="0" autofocus/>
              <span class="ce-amount-cur">so'm</span>
            </div>
          </label>
          <label class="mf">
            <span>To'lov usuli</span>
            <div class="ce-pay-tabs">
              <button v-for="pt in ['Naqd','Karta',&quot;O'tkazma&quot;]" :key="pt"
                :class="['ce-ptab',cashEntryForm.payment_type===pt&&'ce-ptab--on']"
                @click="cashEntryForm.payment_type=pt">
                <AppIcon :name="PAY_ICONS[pt]" :size="11"/> {{ pt }}
              </button>
            </div>
          </label>
          <label class="mf">
            <span>Izoh</span>
            <input v-model="cashEntryForm.description" class="mf__inp" :placeholder="cashEntryForm.type==='income'?'Kirim sababi...':'Chiqim sababi...'"/>
          </label>
        </div>
        <div class="ce-modal__foot">
          <button class="mf-cancel" @click="showCashEntryModal=false">Bekor</button>
          <button
            class="mf-save"
            :class="cashEntryForm.type==='expense'?'mf-save--out':''"
            :disabled="cashEntrySaving||!cashEntryForm.amount"
            @click="saveCashEntry"
          >
            <AppIcon :name="cashEntryForm.type==='income'?'arrow-down-circle':'arrow-up-circle'" :size="14"/>
            {{ cashEntrySaving?'Saqlanmoqda...':cashEntryForm.type==='income'?'Kirim qilish':'Chiqim qilish' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ DEBT PAYMENT MODAL ════════════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showDebtModal" class="sm-overlay" @click.self="showDebtModal=false">
      <div class="ce-modal">
        <div class="ce-modal__hdr ce-hdr--debt">
          <div class="ce-modal__hdr-l">
            <div class="ce-modal__ico"><AppIcon name="dollar-sign" :size="20"/></div>
            <div>
              <div class="ce-modal__title">Qarz to'lash</div>
              <div class="ce-modal__sub" v-if="debtClient">{{ debtClient.name }}</div>
            </div>
          </div>
          <button class="sm-close" @click="showDebtModal=false"><AppIcon name="x" :size="16" :stroke-width="2.5"/></button>
        </div>
        <div class="ce-modal__body" v-if="debtClient">
          <div class="debt-info-banner">
            <div class="dib__lbl">Joriy qarz</div>
            <div class="dib__val">{{ fmt(Math.abs(debtClient.balance)) }} <span>so'm</span></div>
          </div>
          <label class="mf">
            <span>To'lov summasi *</span>
            <div class="ce-amount-wrap">
              <input v-model="debtForm.amount" type="number" min="0" class="ce-amount-inp" placeholder="0" autofocus/>
              <span class="ce-amount-cur">so'm</span>
            </div>
          </label>
          <label class="mf">
            <span>To'lov usuli</span>
            <div class="ce-pay-tabs">
              <button v-for="pt in ['Naqd','Karta',&quot;O'tkazma&quot;]" :key="pt"
                :class="['ce-ptab',debtForm.payment_type===pt&&'ce-ptab--on']"
                @click="debtForm.payment_type=pt">
                <AppIcon :name="PAY_ICONS[pt]" :size="11"/> {{ pt }}
              </button>
            </div>
          </label>
          <label class="mf">
            <span>Izoh</span>
            <input v-model="debtForm.description" class="mf__inp" placeholder="Ixtiyoriy izoh..."/>
          </label>
        </div>
        <div class="ce-modal__foot">
          <button class="mf-cancel" @click="showDebtModal=false">Bekor</button>
          <button class="mf-save mf-save--debt" :disabled="debtSaving||!debtForm.amount" @click="saveDebt">
            <AppIcon name="check-circle" :size="14"/>
            {{ debtSaving?'Saqlanmoqda...':'To\'lovni tasdiqlash' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ TRANSACTION DETAIL MODAL ════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showTxnModal" class="sm-overlay" @click.self="closeTxnModal">
      <div class="txn-modal">

        <!-- Header -->
        <div class="txn-modal__hdr" :style="`border-top:4px solid ${TXN_COLORS[txnModal?.type]||'#6366f1'}`">
          <div class="txn-modal__hdr-l">
            <div class="txn-modal__ico" :style="`background:${TXN_COLORS[txnModal?.type]}22;color:${TXN_COLORS[txnModal?.type]||'#6366f1'}`">
              <AppIcon :name="TXN_ICONS[txnModal?.type]||'file-text'" :size="20"/>
            </div>
            <div>
              <div class="txn-modal__title">{{ TXN_LABELS[txnModal?.type] || txnModal?.type }}</div>
              <div class="txn-modal__date">{{ fmtDateTime(txnModal?.date) }}</div>
            </div>
          </div>
          <button class="sm-close" @click="closeTxnModal"><AppIcon name="x" :size="16" :stroke-width="2.5"/></button>
        </div>

        <!-- Body -->
        <div class="txn-modal__body" v-if="txnModal">

          <!-- Amount block -->
          <div class="txn-amount-block" :class="['expense','refund'].includes(txnModal.type)?'txn-ab--out':'txn-ab--in'">
            <div class="txn-ab__sign">{{ ['expense','refund'].includes(txnModal.type)?'−':'+' }}</div>
            <div class="txn-ab__sum">{{ fmt(txnModal.amount) }}</div>
            <div class="txn-ab__cur">so'm</div>
          </div>

          <!-- Details grid -->
          <div class="txn-detail-grid">
            <div class="txn-detail-row">
              <span class="txn-dr__lbl">Tur</span>
              <span class="txn-badge" :class="`txn--${txnModal.type}`">{{ TXN_LABELS[txnModal.type] }}</span>
            </div>
            <div class="txn-detail-row">
              <span class="txn-dr__lbl">To'lov usuli</span>
              <span class="pay-badge">
                <AppIcon :name="PAY_ICONS[txnModal.payment_type]||'dollar-sign'" :size="11"/>
                {{ txnModal.payment_type || '—' }}
              </span>
            </div>
            <div class="txn-detail-row" v-if="txnModal.client?.name">
              <span class="txn-dr__lbl">Mijoz</span>
              <div class="hist-client">
                <div class="hist-av hist-av--sm">{{ txnModal.client.name[0]?.toUpperCase() }}</div>
                <span style="font-size:13px;font-weight:700;color:#1e293b">{{ txnModal.client.name }}</span>
              </div>
            </div>
            <div class="txn-detail-row">
              <span class="txn-dr__lbl">Sana</span>
              <span class="txn-dr__val">{{ fmtDateTime(txnModal.date) }}</span>
            </div>
            <div class="txn-detail-row" v-if="txnModal.description">
              <span class="txn-dr__lbl">Izoh</span>
              <span class="txn-dr__val">{{ txnModal.description }}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ══ SALE DETAIL MODAL ══════════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showSaleModal" class="sm-overlay" @click.self="closeSaleModal">
      <div class="sm-modal">

        <!-- Loading state -->
        <div v-if="saleModalLoad" class="sm-load">
          <div v-for="i in 6" :key="i" class="skeleton sm-skel"/>
        </div>

        <template v-else-if="saleModal">

          <!-- ── Modal header ───────────────────────────────────── -->
          <div class="sm-hdr">
            <div class="sm-hdr-l">
              <div class="sm-hdr-ico"><AppIcon name="file-text" :size="17" :stroke-width="2"/></div>
              <div>
                <div class="sm-title">
                  Sotuv #{{ String(saleModal.docNumber).padStart(5,'0') }}
                  <span class="st-badge" :class="STATUS_MAP[saleModal.status]?.cls" style="margin-left:8px">
                    {{ STATUS_MAP[saleModal.status]?.label }}
                  </span>
                </div>
                <div class="sm-sub">{{ fmtDateTime(saleModal.date) }}</div>
              </div>
            </div>
            <div class="sm-hdr-r">
              <button class="sm-print-btn" @click="printSaleReceipt(saleModal)" title="Chek chiqarish">
                <AppIcon name="printer" :size="13"/> Chek
              </button>
              <button
                v-if="saleModal.status==='completed'"
                class="sm-cancel-btn"
                @click="cancelSale(saleModal.id)"
              >
                <AppIcon name="x-circle" :size="13"/>
                Bekor qilish
              </button>
              <button class="sm-close" @click="closeSaleModal">
                <AppIcon name="x" :size="16" :stroke-width="2.5"/>
              </button>
            </div>
          </div>

          <!-- ── Body ───────────────────────────────────────────── -->
          <div class="sm-body">

            <!-- Left col: items -->
            <div class="sm-left">
              <div class="sm-section-title">
                <AppIcon name="package" :size="13"/>
                Sotilgan tovarlar ({{ saleModal.items?.length || saleModal.itemCount }} ta)
              </div>
              <div class="sm-items">
                <div
                  v-for="(item, idx) in (saleModal.items || [])"
                  :key="item.id"
                  class="sm-item"
                >
                  <div class="sm-item-num">{{ idx + 1 }}</div>
                  <div class="sm-item-info">
                    <div class="sm-item-name">{{ item.productName || item.product_name }}</div>
                    <div class="sm-item-sub">
                      <span class="sm-item-price">{{ fmt(item.price) }} so'm</span>
                      <span class="sm-item-x">×</span>
                      <span class="sm-item-qty">{{ item.qty }}</span>
                      <span v-if="item.priceType === 'ulgurji'" class="sm-item-type">Ulgurji</span>
                    </div>
                  </div>
                  <div class="sm-item-total">
                    {{ fmt(item.totalSum ?? item.total_sum) }} <span>so'm</span>
                    <div v-if="showUSD && (item.totalUSD||item.total_usd)>0" class="sm-item-usd">{{ Number(item.totalUSD||item.total_usd).toFixed(2) }} $</div>
                  </div>
                </div>

                <div v-if="!saleModal.items?.length" class="sm-items-empty">
                  <AppIcon name="inbox" :size="24" :stroke-width="1.2"/>
                  <span>Tovar ma'lumoti mavjud emas</span>
                </div>
              </div>

              <!-- Totals -->
              <div class="sm-totals">
                <div class="sm-total-row">
                  <span>Tovarlar jami</span>
                  <div class="sm-total-dual">
                    <span>{{ fmt(saleModal.totalSum + (saleModal.discount||0)) }} so'm</span>
                    <span v-if="showUSD && saleModal.exchangeRate>0" class="sm-dual-usd">
                      {{ ((saleModal.totalSum+(saleModal.discount||0))/saleModal.exchangeRate).toFixed(2) }} $
                    </span>
                  </div>
                </div>
                <div v-if="saleModal.discount > 0" class="sm-total-row sm-total-disc">
                  <span>Chegirma</span>
                  <div class="sm-total-dual">
                    <span>− {{ fmt(saleModal.discount) }} so'm</span>
                    <span v-if="showUSD && saleModal.discountUSD>0" class="sm-dual-usd">−{{ saleModal.discountUSD.toFixed(2) }} $</span>
                  </div>
                </div>
                <div class="sm-total-main">
                  <span>To'lash kerak</span>
                  <div class="sm-total-dual">
                    <span>{{ fmt(saleModal.totalSum) }} so'm</span>
                    <span v-if="showUSD && saleModal.totalUSD>0" class="sm-dual-usd-main">{{ saleModal.totalUSD.toFixed(2) }} $</span>
                  </div>
                </div>
                <div v-if="saleModal.paidSum > 0" class="sm-total-row sm-total-paid">
                  <span>To'langan</span>
                  <div class="sm-total-dual">
                    <span>{{ fmt(saleModal.paidSum) }} so'm</span>
                    <span v-if="showUSD && saleModal.paidUSD>0" class="sm-dual-usd">{{ saleModal.paidUSD.toFixed(2) }} $</span>
                  </div>
                </div>
                <div v-if="saleModal.debtSum > 0" class="sm-total-row sm-total-debt">
                  <span>Qarz qoldi</span>
                  <div class="sm-total-dual">
                    <span>{{ fmt(saleModal.debtSum) }} so'm</span>
                    <span v-if="showUSD && saleModal.debtUSD>0" class="sm-dual-usd sm-dual-usd--debt">{{ saleModal.debtUSD.toFixed(2) }} $</span>
                  </div>
                </div>
                <div v-if="showUSD && saleModal.exchangeRate>0" class="sm-total-row sm-kurs-row">
                  <span>Kurs</span>
                  <span>1 $ = {{ fmt(saleModal.exchangeRate) }} so'm</span>
                </div>
              </div>
            </div>

            <!-- Right col: info -->
            <div class="sm-right">

              <!-- Client card -->
              <div class="sm-info-card">
                <div class="sm-info-card-title"><AppIcon name="user" :size="12"/> Mijoz</div>
                <div v-if="saleModal.client?.name" class="sm-client-row">
                  <div class="sm-client-av">{{ saleModal.client.name[0]?.toUpperCase() }}</div>
                  <div>
                    <div class="sm-client-name">{{ saleModal.client.name }}</div>
                    <div v-if="saleModal.client.phone" class="sm-client-phone">{{ saleModal.client.phone }}</div>
                  </div>
                </div>
                <div v-else class="sm-info-empty">Anonim xaridor</div>
              </div>

              <!-- Payment info -->
              <div class="sm-info-card">
                <div class="sm-info-card-title"><AppIcon name="credit-card" :size="12"/> To'lov ma'lumotlari</div>
                <div class="sm-meta-list">
                  <div class="sm-meta-row">
                    <span>To'lov turi</span>
                    <span class="pay-badge">
                      <AppIcon :name="PAY_ICONS[saleModal.paymentType]||'dollar-sign'" :size="11"/>
                      {{ saleModal.paymentType }}
                    </span>
                  </div>
                  <div class="sm-meta-row">
                    <span>Narx turi</span>
                    <span class="sm-meta-val" :class="saleModal.priceType==='ulgurji'?'sm-val--ws':'sm-val--rt'">
                      {{ saleModal.priceType === 'ulgurji' ? 'Ulgurji' : 'Chakana' }}
                    </span>
                  </div>
                  <div v-if="saleModal.debtSum > 0" class="sm-meta-row">
                    <span>Qarz</span>
                    <span class="sm-val--debt">{{ fmt(saleModal.debtSum) }} so'm</span>
                  </div>
                </div>
              </div>

              <!-- Operational info -->
              <div class="sm-info-card">
                <div class="sm-info-card-title"><AppIcon name="settings" :size="12"/> Operatsiya ma'lumotlari</div>
                <div class="sm-meta-list">
                  <div class="sm-meta-row">
                    <span>Sana</span>
                    <span class="sm-meta-val">{{ fmtDateTime(saleModal.date) }}</span>
                  </div>
                  <div class="sm-meta-row">
                    <span>Sklad / Filial</span>
                    <span class="sm-meta-val">{{ saleModal.warehouse || '—' }}</span>
                  </div>
                  <div v-if="saleModal.cashierName" class="sm-meta-row">
                    <span>Kassir</span>
                    <span class="sm-meta-val sm-val--cashier">
                      <AppIcon name="user-check" :size="11"/>
                      {{ saleModal.cashierName }}
                    </span>
                  </div>
                  <div class="sm-meta-row">
                    <span>Doc raqam</span>
                    <span class="doc-num">#{{ String(saleModal.docNumber).padStart(5,'0') }}</span>
                  </div>
                  <div v-if="saleModal.comment" class="sm-meta-row">
                    <span>Izoh</span>
                    <span class="sm-meta-val">{{ saleModal.comment }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </template>
      </div>
    </div>
  </Teleport>

  <BarcodeScannerModal
    v-if="showCameraScanner"
    @close="showCameraScanner = false"
    @detected="onCameraDetected"
  />

  <!-- Mobil: Sotuv oynasining o'z pastki menyusi (POS/Tarix/Kassa/Mijoz) —
       umumiy ilova BottomNav'i o'rniga shu ko'rinadi, chunki Sotuv fullscreen sahifa. -->
  <nav class="sp-mobile-tabbar">
    <button :class="['smt__item', mode==='pos'&&'is-active']" @click="mode='pos'">
      <span class="smt__ico-wrap"><AppIcon name="shopping-cart" :size="19" :stroke-width="mode==='pos'?2.3:1.9"/></span>
      <span class="smt__lbl">Savat</span>
    </button>
    <button :class="['smt__item', mode==='history'&&'is-active']" @click="mode='history'">
      <span class="smt__ico-wrap"><AppIcon name="list" :size="19" :stroke-width="mode==='history'?2.3:1.9"/></span>
      <span class="smt__lbl">Tarix</span>
    </button>
    <button :class="['smt__item', mode==='cash'&&'is-active']" @click="mode='cash'">
      <span class="smt__ico-wrap"><AppIcon name="bar-chart-2" :size="19" :stroke-width="mode==='cash'?2.3:1.9"/></span>
      <span class="smt__lbl">Kassa</span>
    </button>
    <button :class="['smt__item', mode==='clients'&&'is-active']" @click="mode='clients'">
      <span class="smt__ico-wrap"><AppIcon name="users" :size="19" :stroke-width="mode==='clients'?2.3:1.9"/></span>
      <span class="smt__lbl">Mijoz</span>
    </button>
    <button class="smt__item" @click="router.push('/dashboard')">
      <span class="smt__ico-wrap"><AppIcon name="x" :size="19" :stroke-width="2"/></span>
      <span class="smt__lbl">Chiqish</span>
    </button>
  </nav>

</div>
</div>
</template>

<style scoped>
.sales-root{display:contents}
.sp{display:flex;height:100vh;overflow:hidden;background:#f4f6fb}

/* Mobil pastki menyu (POS/Tarix/Kassa/Mijoz) — desktopda yashirin */
.sp-mobile-tabbar{ display: none; }

/* Icon sidebar */
.sp-ico{width:54px;flex-shrink:0;background:linear-gradient(175deg,#1e1b4b 0%,#1a1740 60%,#16143a 100%);display:flex;flex-direction:column;align-items:center;padding:10px 0;gap:4px;border-right:1px solid rgba(99,102,241,.15)}
.sp-ico__logo{width:38px;height:38px;flex-shrink:0;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;margin-bottom:8px}
.sp-ico__nav{display:flex;flex-direction:column;gap:4px;flex:1}
.sp-ico__bot{padding-top:8px;border-top:1px solid rgba(99,102,241,.15);display:flex;flex-direction:column;align-items:center;gap:4px}
.ico-btn{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:rgba(199,210,254,.6);cursor:pointer;transition:all .15s}
.ico-btn:hover{background:rgba(99,102,241,.18);color:white}
.ico-btn--on{background:rgba(99,102,241,.3);color:white}
.ico-btn--warn{background:rgba(245,158,11,.2);color:#fbbf24}

.price-type-btn{width:44px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 4px;border-radius:10px;font-size:9.5px;font-weight:800;letter-spacing:.03em;cursor:pointer;font-family:inherit;transition:all .18s;border:1.5px solid transparent}
.price-type-btn--cha{background:rgba(99,102,241,.18);color:#a5b4fc;border-color:rgba(99,102,241,.25)}
.price-type-btn--cha:hover{background:rgba(99,102,241,.28);color:white}
.price-type-btn--ulg{background:rgba(245,158,11,.22);color:#fbbf24;border-color:rgba(245,158,11,.4)}
.price-type-btn--ulg:hover{background:rgba(245,158,11,.32);color:#fde68a}
.price-type-lbl{line-height:1}

/* POS layout */
.pos{display:flex;flex:1;overflow:hidden;position:relative}

/* Toast */
.pos-toast{position:fixed;top:24px;left:50%;transform:translateX(-50%);z-index:9999;color:white;padding:12px 28px;border-radius:99px;display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;white-space:nowrap;max-width:520px;pointer-events:none}
.pos-toast--ok{background:#10b981;box-shadow:0 6px 24px rgba(16,185,129,.35)}
.pos-toast--err{background:#ef4444;box-shadow:0 6px 24px rgba(239,68,68,.35)}
.pos-toast--hold{background:#f59e0b;box-shadow:0 6px 24px rgba(245,158,11,.35)}
.toast-enter-active,.toast-leave-active{transition:all .25s}
.toast-enter-from,.toast-leave-to{opacity:0;transform:translateX(-50%) translateY(-12px)}

/* Product catalog */
.pos__catalog{display:flex;flex-direction:column;flex:1;overflow:hidden;border-right:1px solid #e2e8f0}
.cat__topbar{display:flex;align-items:center;gap:8px;padding:10px 12px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0}
/* Barcode scan */
.cat__scan-wrap{position:relative;display:flex;align-items:center;flex-shrink:0}
.cat__scan-ico{position:absolute;left:9px;color:#818cf8;pointer-events:none;z-index:1}
.cat__scan-inp{width:170px;height:36px;padding:0 10px 0 28px;border:1.5px solid #c7d2fe;border-radius:10px;font-size:12.5px;font-family:monospace;outline:none;background:#eef2ff;color:#3730a3;transition:all .15s}
.cat__scan-inp:focus{border-color:#818cf8;background:white;box-shadow:0 0 0 3px rgba(129,140,248,.12);width:200px}
.cat__scan-inp::placeholder{color:#a5b4fc;font-family:inherit}
.cat__scan-cam-btn{display:none}
/* Name search */
.cat__search-wrap{display:flex;align-items:center;flex:1;position:relative}
.cat__search-ico{position:absolute;left:10px;color:#94a3b8;pointer-events:none}
.cat__search{width:100%;height:36px;padding:0 12px 0 30px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;outline:none;background:#f8fafc;transition:all .15s}
.cat__search:focus{border-color:#818cf8;background:white;box-shadow:0 0 0 3px rgba(129,140,248,.1)}
.cat__meta{display:flex;align-items:center;gap:6px;flex-shrink:0}
.cat__doc{font-family:monospace;font-size:13px;font-weight:900;color:#6366f1;background:#e0e7ff;padding:3px 9px;border-radius:7px;white-space:nowrap}
.cat__wh{height:34px;padding:0 8px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:12px;font-family:inherit;outline:none;cursor:pointer;background:white}
.cat__oos-btn{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:1.5px solid #e2e8f0;color:#94a3b8;cursor:pointer;flex-shrink:0;transition:all .15s}
.cat__oos-btn:hover{border-color:#818cf8;color:#6366f1;background:#eef2ff}
.cat__oos-btn.on{background:#fef3c7;border-color:#fde68a;color:#d97706}
.cat__price-type-btn{height:32px;padding:0 10px;border-radius:8px;display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:800;letter-spacing:.02em;cursor:pointer;font-family:inherit;transition:all .15s;border:1.5px solid transparent;flex-shrink:0}
.cat__price-type-btn--cha{background:#eef2ff;color:#6366f1;border-color:#c7d2fe}
.cat__price-type-btn--cha:hover{background:#e0e7ff}
.cat__price-type-btn--ulg{background:#fef3c7;color:#d97706;border-color:#fde68a}
.cat__price-type-btn--ulg:hover{background:#fde68a}
.cat__tabs{display:flex;gap:4px;padding:8px 14px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;overflow-x:auto;scrollbar-width:none}
.cat__tabs::-webkit-scrollbar{display:none}
.cat__tab{padding:5px 14px;border-radius:99px;border:1.5px solid #e2e8f0;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;color:#64748b;white-space:nowrap;transition:all .15s}
.cat__tab:hover{border-color:#818cf8;color:#6366f1}
.cat__tab--on{background:#6366f1;border-color:#6366f1;color:white}
.cat__price-banner{display:flex;align-items:center;gap:6px;padding:6px 14px;background:#fef3c7;border-bottom:1px solid #fde68a;font-size:12px;font-weight:600;color:#92400e;flex-shrink:0}
.cat__price-banner button{margin-left:auto;font-size:11px;font-weight:700;font-family:inherit;color:#6366f1;text-decoration:underline;cursor:pointer}
.cat__grid-wrap{flex:1;overflow-y:auto;padding:12px 10px}

/* ── Product grid ────────────────────────────────────────── */
.cat__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:10px}
.cat__empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:60px;color:#94a3b8}
.prod-skel{height:182px;border-radius:16px}

/* ── Product card ────────────────────────────────────────── */
.pcard{
  position:relative; display:flex; flex-direction:column;
  border-radius:16px; border:none; background:white;
  cursor:pointer; transition:all .2s cubic-bezier(.4,0,.2,1);
  text-align:left; overflow:hidden;
  box-shadow:0 1px 3px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04);
}
.pcard:hover{
  transform:translateY(-4px) scale(1.01);
  box-shadow:0 8px 28px rgba(99,102,241,.2), 0 2px 8px rgba(0,0,0,.08);
}
.pcard:active{ transform:translateY(-1px) scale(1); }
.pcard--out{ opacity:.45 }
.pcard--out:hover{ transform:none; box-shadow:0 1px 3px rgba(0,0,0,.06) }
.pcard--bump{ animation: pcard-bump .32s var(--ease-spring); }
@keyframes pcard-bump{
  0%   { transform:scale(1); }
  35%  { transform:scale(.93); }
  70%  { transform:scale(1.045); }
  100% { transform:scale(1); }
}

/* Stock badge */
.pcard__stock{
  position:absolute; top:9px; right:9px; z-index:3;
  padding:3px 8px; border-radius:99px;
  font-size:10px; font-weight:700;
  backdrop-filter:blur(8px);
}
.bq--ok  {background:rgba(236,253,245,.92); color:#065f46; border:1px solid rgba(16,185,129,.35)}
.bq--zero{background:rgba(254,242,242,.92); color:#991b1b; border:1px solid rgba(239,68,68,.35)}

/* Top colored area */
.pcard__top{
  height:104px; display:flex; align-items:center; justify-content:center;
  flex-shrink:0; overflow:hidden; position:relative;
}
.pcard__icon-wrap{
  display:flex; align-items:center; justify-content:center;
  opacity:.8;
}
.pcard__photo{ width:100%; height:100%; object-fit:cover; display:block; }
.pcard__sold-out{
  position:absolute; inset:0;
  display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:800; color:#ef4444; letter-spacing:.04em;
  background:rgba(255,255,255,.55); backdrop-filter:blur(3px);
}

/* Bottom info */
.pcard__info{
  flex:1; display:flex; flex-direction:column;
  background:white; padding:9px 11px 11px;
  border-top:1px solid rgba(0,0,0,.04);
}
.pcard__name{
  font-size:12px; font-weight:700; color:#1e293b; line-height:1.35;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden; flex:1; margin-bottom:6px;
}
.pcard__price-row{ display:flex; align-items:baseline; gap:3px; }
.pcard__price{ font-size:15px; font-weight:900; color:#6366f1; letter-spacing:-.03em; }
.pcard__cur{ font-size:10px; font-weight:500; color:#94a3b8; }
.pcard__usd{ font-size:10px; font-weight:600; color:#16a34a; margin-top:1px; }

/* ── Cart shell ─────────────────────────────────────────── */
.pos__cart{width:clamp(400px,34vw,500px);flex-shrink:0;display:flex;flex-direction:column;background:#f5f7ff;box-shadow:-4px 0 24px rgba(99,102,241,.1);position:relative;border-left:1px solid #e0e4f8}

/* ── Cart header ────────────────────────────────────────── */
.cart__hdr{display:flex;align-items:center;gap:10px;padding:13px 14px;background:linear-gradient(135deg,#eef0ff,#f0ecff);border-bottom:1px solid #ddd8f5;flex-shrink:0}
.cart__hdr-l{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.cart__hdr-icon{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,.3)}
.cart__hdr-titles{display:flex;flex-direction:column;min-width:0}
.cart__title{font-size:14px;font-weight:800;color:#1e1b4b;letter-spacing:-.02em;line-height:1.2}
.cart__doc{font-size:10px;color:#a5a8c8;font-family:monospace;font-weight:600}
.cart__cnt{font-size:10px;background:#e0e7ff;color:#6366f1;padding:2px 8px;border-radius:99px;font-weight:800;border:1px solid #c7d2fe;flex-shrink:0}
.cart__hdr-acts{display:flex;gap:5px;flex-shrink:0}
.chdr-btn{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;cursor:pointer;transition:all .15s;border:1.5px solid #e2e6f5;background:white}
.chdr-btn:hover{background:#eef2ff;color:#6366f1;border-color:#c7d2fe}
.chdr-btn--on{background:#eef2ff;color:#6366f1;border-color:#c7d2fe}
.chdr-btn--del:hover{background:#fef2f2;color:#ef4444;border-color:#fecaca}

/* ── Client dropdown ────────────────────────────────────── */
.client-drop{position:absolute;top:calc(100% + 6px);right:0;z-index:200;background:white;border:1.5px solid #c7d2fe;border-radius:12px;box-shadow:0 8px 32px rgba(99,102,241,.18);width:270px;overflow:hidden}
.cli-sel{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#eef2ff;border-bottom:1px solid #e0e7ff}
.cli-sel__name{font-size:13px;font-weight:700;color:#3730a3}
.cli-sel__debt{font-size:11px;color:#ef4444;margin-top:1px}
.cli-sel__x{margin-left:auto;color:#94a3b8;cursor:pointer;padding:3px;border-radius:4px}
.cli-sel__x:hover{color:#ef4444}
.cli-search{padding:8px}
.cli-search__inp{width:100%;height:32px;padding:0 10px;border:1.5px solid #e2e8f0;border-radius:7px;font-size:12.5px;font-family:inherit;outline:none;background:#f8fafc;color:#1e293b}
.cli-search__inp:focus{border-color:#818cf8}
.cli-list{max-height:180px;overflow-y:auto}
.cli-opt{width:100%;text-align:left;padding:8px 12px;border-top:1px solid #f1f5f9;cursor:pointer;transition:background .1s}
.cli-opt:hover{background:#eef2ff}
.cli-opt__name{display:block;font-size:13px;font-weight:600;color:#1e293b}
.cli-opt__sub{display:block;font-size:11px;color:#94a3b8}
.cli-opt__debt{color:#ef4444;font-weight:600}

/* ── Ajdaniya (park) bar ────────────────────────────────── */
.adj-bar{display:flex;align-items:center;gap:6px;padding:7px 10px;background:#fffbeb;border-bottom:1px solid #fde68a;flex-shrink:0;overflow:hidden}
.adj-park-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:99px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;font-size:11.5px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .15s;flex-shrink:0;white-space:nowrap;box-shadow:0 2px 8px rgba(245,158,11,.3)}
.adj-park-btn:hover{box-shadow:0 4px 14px rgba(245,158,11,.45);transform:translateY(-1px)}
.adj-park-btn--off{opacity:.4;cursor:not-allowed;transform:none}
.adj-pills{display:flex;gap:4px;overflow-x:auto;flex:1;scrollbar-width:none}
.adj-pills::-webkit-scrollbar{display:none}
.adj-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 9px 4px 6px;border-radius:99px;background:#fef3c7;border:1.5px solid #fde68a;color:#92400e;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .15s;white-space:nowrap;flex-shrink:0}
.adj-pill:hover{background:#fde68a;border-color:#f59e0b}
.adj-pill__n{width:16px;height:16px;border-radius:50%;background:#f59e0b;color:white;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.adj-pill__lbl{font-size:11px;font-weight:700;max-width:56px;overflow:hidden;text-overflow:ellipsis}
.adj-pill__sum{font-size:10px;color:#b45309}
.adj-pill__x{display:flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:rgba(245,158,11,.25);color:#92400e;cursor:pointer;flex-shrink:0;margin-left:1px}
.adj-pill__x:hover{background:#fecaca;color:#ef4444}

/* ── Client bar ─────────────────────────────────────────── */
.cart__cli-bar{display:flex;align-items:center;gap:8px;padding:7px 12px;background:#eef2ff;border-bottom:1px solid #c7d2fe;flex-shrink:0}
.cli-bar-av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cli-bar-info{display:flex;flex-direction:column;flex:1;min-width:0}
.cli-bar-name{font-size:12.5px;font-weight:700;color:#1e1b4b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cli-bar-debt{font-size:10.5px;color:#ef4444;font-weight:600}
.cli-bar-ok{font-size:10.5px;color:#059669;font-weight:600}
.cli-bar-x{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;color:#94a3b8;cursor:pointer;transition:all .15s;flex-shrink:0}
.cli-bar-x:hover{background:#fef2f2;color:#ef4444}

/* ── Payment type chips ─────────────────────────────────── */
.cart__pay-type{display:flex;gap:6px;padding:9px 12px;border-bottom:1px solid #e8eaf8;flex-shrink:0;flex-wrap:wrap}
.pt-chip{display:inline-flex;align-items:center;gap:5px;padding:8px 14px;border-radius:99px;border:1.5px solid #e2e6f5;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;color:#64748b;transition:all .15s;background:white;flex:1;justify-content:center}
.pt-chip:hover{border-color:#c7d2fe;color:#6366f1;background:#eef2ff}
.pt-chip--on{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:#6366f1;color:white;font-weight:700}

/* ── Cart items list ────────────────────────────────────── */
.cart__items{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#c7d2fe transparent;background:#f5f7ff}
.cart__items::-webkit-scrollbar{width:4px}
.cart__items::-webkit-scrollbar-thumb{background:#c7d2fe;border-radius:4px}
.cart__empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;height:100%;color:#c7d2fe}
.cart__empty-icon{opacity:.5}
.cart__empty-title{font-size:14px;font-weight:700;color:#94a3b8}
.cart__empty-hint{font-size:11.5px;color:#cbd5e1;text-align:center;line-height:1.6}
.cart__list{padding:8px 10px;display:flex;flex-direction:column;gap:7px}
.cart-item{display:flex;flex-direction:column;gap:9px;padding:11px 12px;border-radius:13px;border:1.5px solid #e8eaf8;cursor:pointer;transition:all .15s;background:white;box-shadow:0 1px 3px rgba(99,102,241,.05)}
.cart-item:hover{border-color:#c7d2fe;background:#fafbff;box-shadow:0 2px 8px rgba(99,102,241,.1)}
.cart-item--active{border-color:#818cf8;background:#eef2ff;box-shadow:0 2px 10px rgba(99,102,241,.15)}

/* Yuqori qator: № + nom + jami-badge + o'chirish */
.ci-top{display:flex;align-items:flex-start;gap:9px}
.ci-num{width:24px;height:24px;border-radius:7px;background:#e0e7ff;color:#6366f1;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ci-name{flex:1;min-width:0;font-size:14px;font-weight:700;color:#1e293b;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-top:2px}
.ci-total-badge{display:inline-flex;align-items:baseline;gap:3px;flex-shrink:0;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:15px;font-weight:900;letter-spacing:-.02em;padding:4px 11px;border-radius:9px;box-shadow:0 2px 8px rgba(99,102,241,.3)}
.ci-total-badge span{font-size:10px;font-weight:600;opacity:.8}
.ci-del{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#fca5a5;cursor:pointer;flex-shrink:0;transition:all .15s}
.ci-del:hover{background:#fef2f2;color:#ef4444}

/* Pastki qator: miqdor + narx tahriri */
.ci-bottom{display:flex;align-items:center;gap:8px}
.ci-over{display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:700;color:#d97706;background:#fef3c7;padding:1px 6px;border-radius:99px;border:1px solid #fde68a}
.ci-qty-wrap{display:flex;align-items:center;gap:4px;flex-shrink:0}
.ci-q-btn{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#6366f1;background:#e0e7ff;cursor:pointer;transition:background .1s;flex-shrink:0}
.ci-q-btn:hover{background:#c7d2fe}
.ci-q-btn:disabled{opacity:.3;cursor:not-allowed}
.ci-q-inp{width:50px;height:30px;padding:0 4px;text-align:center;border:1.5px solid #e0e7ff;border-radius:8px;font-size:14px;font-weight:800;font-family:inherit;outline:none;background:white;color:#1e293b}
.ci-q-inp:focus{border-color:#818cf8}
.ci-price-edit{display:flex;align-items:center;gap:5px;margin-left:auto;background:#f8faff;border:1px solid #e8eaf8;border-radius:9px;padding:3px 8px 3px 10px}
.ci-price-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8}
.ci-p-inp{width:78px;height:24px;padding:0 2px;text-align:right;border:none;font-size:13.5px;font-family:inherit;outline:none;background:transparent;color:#6366f1;font-weight:700}
.ci-price-cur{font-size:10.5px;color:#94a3b8}

/* ── Cart footer ────────────────────────────────────────── */
.cart__foot{background:white;border-top:1.5px solid #e0e4f8;padding:14px;flex-shrink:0}
.cart__disc-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cart__disc-lbl{display:flex;align-items:center;gap:4px;font-size:13px;color:#64748b;font-weight:600;flex-shrink:0}
.cart__disc-ctrl{display:flex;align-items:center;gap:4px;margin-left:auto}
.disc-inp{width:92px;height:32px;padding:0 8px;text-align:right;border:1.5px solid #e0e7ff;border-radius:8px;font-size:14px;font-weight:700;font-family:inherit;outline:none;background:#f8faff;color:#4338ca}
.disc-inp:focus{border-color:#818cf8}
.disc-cur{font-size:11px;color:#94a3b8;flex-shrink:0}
.disc-x{width:20px;height:20px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#ef4444;background:#fef2f2;cursor:pointer;line-height:1;flex-shrink:0}
.disc-x:hover{background:#fecaca}
.cart__disc-chips{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.disc-chip{display:flex;flex-direction:column;align-items:center;padding:6px 9px;border-radius:9px;border:1.5px solid #e0e7ff;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;color:#64748b;transition:all .15s;line-height:1.25;flex:1;background:white}
.disc-chip span{font-size:10.5px;font-weight:500;color:#94a3b8;margin-top:1px}
.disc-chip:hover{border-color:#818cf8;color:#6366f1;background:#eef2ff}
.disc-chip--on{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:#6366f1;color:white}
.disc-chip--on span{color:rgba(255,255,255,.75)}
.cart__totals{display:flex;flex-direction:column;gap:7px;margin-bottom:12px;padding:11px 13px;background:#f5f7ff;border-radius:12px;border:1px solid #e0e4f8}
.cart__total-row{display:flex;justify-content:space-between;font-size:13.5px;color:#64748b}
.cart__total-disc{color:#ef4444}
.cart__total-main{display:flex;justify-content:space-between;font-size:19px;font-weight:900;color:#1e1b4b;margin-top:5px;padding-top:9px;border-top:1.5px solid #e0e4f8;letter-spacing:-.02em}
.cart__err{font-size:12px;color:#ef4444;margin-bottom:6px;text-align:center}
.cart__pay-btn{width:100%;height:58px;border-radius:15px;background:linear-gradient(135deg,#10b981,#059669);color:white;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;transition:all .18s;box-shadow:0 4px 16px rgba(16,185,129,.35);font-family:inherit}
.cart__pay-btn:hover:not(:disabled){box-shadow:0 6px 24px rgba(16,185,129,.5);transform:translateY(-2px)}
.cart__pay-btn:active:not(:disabled){transform:translateY(0)}
.cart__pay-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.pay-sum{font-size:21px;font-weight:900;letter-spacing:-.03em}
.cart__pay-btn kbd{font-size:10px;background:rgba(255,255,255,.2);border-radius:4px;padding:1px 6px;font-family:inherit}
.cart__debt-note{display:flex;align-items:center;gap:5px;margin-top:7px;font-size:11.5px;color:#ef4444;font-weight:600;text-align:center;justify-content:center}

/* ══════════════════════════════════════════════════════════════════
   MOBILE (≤768px) — full-screen catalog + bottom cart bar/sheet
   Desktop split-pane stays exactly as-is above this breakpoint.
   ══════════════════════════════════════════════════════════════════ */

/* Hidden by default (desktop); shown only inside the mobile media query */
.m-cart-bar,
.m-sheet-backdrop,
.m-sheet { display: none; }

@media (max-width: 768px) {

  /* Bottom-nav height reserved by App.vue's BottomNav component */
  :root { --bn-h: calc(64px + env(safe-area-inset-bottom, 0px)); }

  .sp { height: 100vh; flex-direction: column; }

  /* Ikonka-panel mobil holatda butunlay yashiriladi — o'rniga pastdagi
     .sp-mobile-tabbar ko'rinadi (POS/Tarix/Kassa/Mijoz rejimlari). */
  .sp-ico{ display: none; }

  /* POS becomes a single full-bleed column; cart panel is hidden, replaced by bar+sheet */
  .pos { flex-direction: column; }
  .pos__catalog { border-right: none; }
  .pos__cart { display: none; }

  /* ── Pinned search/category header ─────────────────────────────
     .cat__topbar and .cat__tabs are flex siblings of the scrollable
     .cat__grid-wrap inside .pos__catalog, so they stay visually
     pinned above the product list as it scrolls — no JS needed. ── */
  .cat__topbar{
    z-index: 20;
    flex-wrap: wrap; padding: 8px 10px;
    row-gap: 6px;
  }
  .cat__scan-wrap{ order: 3; width: 100%; }
  .cat__scan-inp{ width: 100%; padding-right: 40px; }
  .cat__scan-inp:focus{ width: 100%; }
  .cat__scan-cam-btn{
    display: flex; align-items: center; justify-content: center;
    position: absolute; right: 4px; top: 4px;
    width: 28px; height: 28px; border-radius: 8px;
    background: #6366f1; color: white;
    z-index: 2;
  }
  .cat__scan-cam-btn:active{ background: #4f46e5; }
  .cat__search-wrap{ order: 1; flex: 1 1 auto; min-width: 0; }
  .cat__meta{ order: 2; flex-shrink: 0; }
  .cat__doc{ display: none; } /* save space on small screens */
  .cat__wh{ display: none; }

  .cat__tabs{
    z-index: 19;
    padding: 7px 10px;
  }

  .cat__grid-wrap{
    padding: 10px 8px;
    /* clear the persistent cart bar (when present) + global BottomNav */
    padding-bottom: calc(var(--bn-h) + 76px);
  }
  .cat__grid{
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .pcard__top{ height: 92px; }
  .pcard__name{ font-size: 12.5px; min-height: 32px; }
  .pcard__price{ font-size: 14.5px; }

  /* Comfortable thumb-sized tap target on cards (already large via grid cell,
     but ensure minimum touch height) */
  .pcard{ min-height: 188px; }

  /* ── Persistent bottom cart bar ─────────────────────────────── */
  .m-cart-bar{
    display: flex;
    align-items: center;
    gap: 10px;
    position: fixed;
    left: 10px; right: 10px;
    bottom: calc(var(--bn-h) + 10px);
    z-index: 150;
    height: 58px;
    padding: 0 14px;
    border-radius: var(--r-lg, 14px);
    background: linear-gradient(135deg, var(--indigo-500, #6366f1), #8b5cf6);
    color: white;
    box-shadow: 0 10px 28px rgba(99,102,241,.4), 0 2px 8px rgba(0,0,0,.08);
    border: none;
    font-family: inherit;
    cursor: pointer;
    transition: transform .15s var(--ease-spring, cubic-bezier(.16,1,.3,1)), box-shadow .15s ease;
    animation: m-cart-bar-in .28s var(--ease-spring, cubic-bezier(.16,1,.3,1));
  }
  .m-cart-bar:active{ transform: scale(.97); }
  @keyframes m-cart-bar-in{
    0%   { transform: translateY(16px) scale(.96); opacity: 0; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
  }
  .m-cart-bar__count{
    flex-shrink: 0;
    min-width: 26px; height: 26px; padding: 0 6px;
    border-radius: 99px;
    background: rgba(255,255,255,.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 900;
  }
  .m-cart-bar__txt{
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; align-items: flex-start;
    text-align: left;
  }
  .m-cart-bar__items{ font-size: 11px; opacity: .85; font-weight: 600; line-height: 1.3; }
  .m-cart-bar__sum{ font-size: 15px; font-weight: 900; letter-spacing: -.02em; line-height: 1.3; }
  .m-cart-bar__cta{
    flex-shrink: 0;
    display: flex; align-items: center; gap: 2px;
    font-size: 13px; font-weight: 800;
    background: rgba(255,255,255,.18);
    padding: 6px 10px;
    border-radius: 99px;
  }

  /* ── Backdrop ────────────────────────────────────────────────── */
  .m-sheet-backdrop{
    display: block;
    position: fixed; inset: 0;
    z-index: 300;
    background: rgba(15,23,42,.45);
    backdrop-filter: blur(2px);
  }
  .m-sheet-backdrop-enter-active,
  .m-sheet-backdrop-leave-active{ transition: opacity .25s ease; }
  .m-sheet-backdrop-enter-from,
  .m-sheet-backdrop-leave-to{ opacity: 0; }

  /* ── Bottom sheet ────────────────────────────────────────────── */
  .m-sheet{
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 301;
    max-height: 88vh;
    background: #f5f7ff;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -12px 40px rgba(15,23,42,.25);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    overflow: hidden;
  }
  .m-sheet-slide-enter-active,
  .m-sheet-slide-leave-active{
    transition: transform .3s cubic-bezier(.16,1,.3,1);
  }
  .m-sheet-slide-enter-from,
  .m-sheet-slide-leave-to{
    transform: translateY(100%);
  }

  .m-sheet__handle-wrap{
    display: flex; justify-content: center;
    padding: 10px 0 4px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .m-sheet__handle{
    width: 40px; height: 5px;
    border-radius: 99px;
    background: #d8dcf3;
  }

  .m-sheet__hdr{
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px;
    padding: 4px 14px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid #e2e6f7;
  }
  .m-sheet__hdr-l{ display: flex; align-items: center; gap: 10px; min-width: 0; }
  .m-sheet__hdr-acts{ display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .m-sheet__close{ background: #eef0fb; }

  .client-drop--mob{
    position: fixed;
    left: 12px; right: 12px;
    top: 64px;
    width: auto;
    z-index: 320;
    max-height: 60vh;
  }

  .m-sheet__items{
    flex: 1;
    overflow-y: auto;
    min-height: 120px;
    -webkit-overflow-scrolling: touch;
  }

  /* Larger, thumb-friendly cart row controls inside the sheet */
  .cart-item--mob{ cursor: default; padding: 10px; }
  .ci-qty-wrap--mob{ gap: 6px; }
  .ci-q-btn--mob{ width: 30px; height: 30px; font-size: 16px; border-radius: 8px; }
  .ci-q-inp--mob{ width: 42px; height: 28px; font-size: 13px; }
  .ci-del--mob{ width: 28px; height: 28px; }

  .m-sheet__foot{
    flex-shrink: 0;
    border-top: 1.5px solid #e0e4f8;
    padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .m-sheet__foot .cart__pay-btn{ height: 54px; }

  /* No horizontal overflow anywhere at narrow widths */
  .sales-root, .sp, .pos, .pos__catalog { max-width: 100vw; overflow-x: hidden; }

  /* ── Sotuv oynasining mobil pastki menyusi ──────────────────────
     Umumiy ilova BottomNav'i o'rnini bosadi (Sales fullscreen sahifa,
     App.vue'dagi BottomNav shu yerda ko'rinmaydi). Animatsiyali fon +
     katta, bosish qulay bandlar. ── */
  .sp-mobile-tabbar{
    display: flex;
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 200;
    align-items: stretch;
    overflow: hidden;
    background:
      linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)),
      linear-gradient(120deg, #eef2ff, #fdf2f8, #ecfeff, #eef2ff);
    background-size: 100% 100%, 300% 300%;
    animation: smt-bg-flow 14s ease-in-out infinite;
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-top: 1px solid rgba(15,23,42,0.08);
    box-shadow: 0 -8px 24px rgba(15,23,42,0.06);
    padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px));
    height: calc(64px + env(safe-area-inset-bottom, 0px));
  }
  @keyframes smt-bg-flow {
    0%, 100% { background-position: 0 0, 0% 50%; }
    50%      { background-position: 0 0, 100% 50%; }
  }
  .smt__item{
    flex: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    color: #94a3b8;
    font-family: inherit;
    transition: color 0.2s ease, transform 0.15s ease;
  }
  .smt__item:active{ transform: scale(0.92); }
  .smt__ico-wrap{
    display: flex; align-items: center; justify-content: center;
    width: 38px; height: 26px; border-radius: 14px;
    transition: background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease;
  }
  .smt__lbl{ font-size: 10.5px; font-weight: 600; letter-spacing: -0.01em; }
  .smt__item.is-active{ color: #4f46e5; }
  .smt__item.is-active .smt__ico-wrap{
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    box-shadow: 0 4px 14px rgba(99,102,241,0.45);
  }
  .smt__item.is-active .smt__lbl{ font-weight: 800; }

}

@media (max-width: 420px) {
  .cat__grid{ grid-template-columns: repeat(2, 1fr); gap: 7px; }
  .m-cart-bar__items{ font-size: 10.5px; }
  .m-cart-bar__sum{ font-size: 14px; }
}

/* Other tabs (history / cash / clients) — keep desktop table layout but
   make it horizontally scrollable instead of overflowing the viewport,
   and reserve space for the global BottomNav (this route is fullscreen,
   so App.vue does not add that padding for us). */
@media (max-width: 768px) {
  .pg-view{ max-width: 100vw; }
  .pg-hdr{ flex-wrap: wrap; padding: 12px 14px; row-gap: 8px; }
  .pg-body{ padding: 12px 14px calc(var(--bn-h, 58px) + 14px); -webkit-overflow-scrolling: touch; }
  .data-tbl{ display: block; overflow-x: auto; white-space: nowrap; }
  .rep-cards{ grid-template-columns: repeat(2, 1fr); padding: 12px 14px; }
}

/* Shared page styles */
.pg-view{display:flex;flex-direction:column;flex:1;overflow:hidden;background:#f4f6fb}
.pg-hdr{display:flex;align-items:center;gap:12px;padding:14px 20px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0}
.pg-title{font-size:17px;font-weight:800;flex:1;color:#1e293b}
.pg-search{height:34px;padding:0 12px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:13px;font-family:inherit;outline:none;min-width:200px}
.pg-search:focus{border-color:#818cf8}
.pg-sel{height:34px;padding:0 10px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:13px;font-family:inherit;outline:none;cursor:pointer}
.pg-date-lbl{display:flex;align-items:center;gap:5px;font-size:12px;color:#64748b}
.pg-date{height:32px;padding:0 8px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:inherit;outline:none}
.pg-date:focus{border-color:#818cf8}
.pg-refresh{width:32px;height:32px;border-radius:8px;background:#eff6ff;color:#6366f1;display:flex;align-items:center;justify-content:center;cursor:pointer}
.pg-add-btn{display:flex;align-items:center;gap:5px;padding:0 14px;height:34px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer}
.pg-body{flex:1;overflow-y:auto;padding:16px 20px}
.pg-loading{display:flex;flex-direction:column;gap:8px}
.pg-skel{height:50px;border-radius:8px}
.pg-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:60px;color:#94a3b8;font-size:13px}
.data-tbl{width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.data-tbl thead th{padding:10px 12px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;background:#f8fafc;border-bottom:1px solid #e2e8f0;text-align:left}
.data-row{border-bottom:1px solid #f1f5f9;transition:background .1s}
.data-row:hover td{background:#f5f7ff}
.data-row td{padding:10px 12px;font-size:13px;vertical-align:middle}
.c-bold{font-weight:600;color:#1e293b}.c-dim{color:#94a3b8;font-size:12px}
.ta-c{text-align:center}.ta-r{text-align:right}
.doc-num{font-family:monospace;font-weight:800;color:#6366f1;background:#e0e7ff;padding:2px 8px;border-radius:5px;font-size:12px}
.pay-badge{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;background:#f1f5f9;padding:2px 8px;border-radius:99px;color:#64748b}
.cnt-badge{background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}
.debt-badge{background:#fef2f2;color:#ef4444;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}
.st-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px}
.st--ok{background:#d1fae5;color:#065f46}.st--cancel{background:#fef2f2;color:#ef4444}.st--draft{background:#fef3c7;color:#92400e}
.rep-cards{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:16px 20px;flex-shrink:0}
.rcard{padding:14px;border-radius:12px;border:1px solid}
.rcard--green{background:#f0fdf4;border-color:#bbf7d0}.rcard--blue{background:#eff6ff;border-color:#bfdbfe}
.rcard--rose{background:#fff1f2;border-color:#fecdd3}.rcard--amber{background:#fffbeb;border-color:#fde68a}
.rcard--indigo{background:#eef2ff;border-color:#c7d2fe}
.rc-l{font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em}
.rc-v{font-size:20px;font-weight:900;color:#1e293b;letter-spacing:-.04em;margin-top:4px}
.rc-c{font-size:10px;color:#94a3b8}
.txn-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;text-transform:uppercase}
.txn--sale{background:#d1fae5;color:#065f46}.txn--income{background:#dbeafe;color:#1d4ed8}
.txn--expense{background:#fef2f2;color:#ef4444}.txn--debt_payment{background:#fef3c7;color:#92400e}
.cl-code{font-family:monospace;font-size:11px;background:#f1f5f9;padding:2px 5px;border-radius:4px;color:#94a3b8}
.cl-debt{font-weight:700;color:#ef4444}.cl-ok{font-weight:700;color:#10b981}
.row-acts{display:flex;gap:3px}
.row-act{width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#94a3b8;transition:all .15s}
.row-act:hover{background:#eff6ff;color:#6366f1}
.row-act--del:hover{background:#fef2f2;color:#ef4444}
.modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;display:flex;align-items:center;justify-content:center}
.cl-modal{background:white;border-radius:16px;width:400px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.2)}
.cl-modal__hdr{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid #e2e8f0}
.cl-modal__hdr h3{font-size:15px;font-weight:800;color:#1e293b}
.cl-modal__hdr button{color:#94a3b8;cursor:pointer;padding:4px;border-radius:6px}
.cl-modal__hdr button:hover{background:#f1f5f9}
.cl-modal__body{padding:16px 18px;display:flex;flex-direction:column;gap:11px}
.mf{display:flex;flex-direction:column;gap:4px}
.mf span{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.mf__inp{height:36px;padding:0 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit;outline:none}
.mf__inp:focus{border-color:#818cf8}
.cl-modal__foot{display:flex;gap:8px;padding:12px 18px;background:#f8fafc;border-top:1px solid #e2e8f0}
.mf-cancel{flex:1;height:36px;border-radius:9px;background:white;border:1.5px solid #e2e8f0;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer}
.mf-save{flex:2;height:36px;border-radius:9px;background:#6366f1;color:white;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer}
.mf-save:hover{opacity:.9}
.skeleton{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:10px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* ── Ajdaniya (parked sales) panel ───────────────────────────── */
.parked-panel{
  position:absolute; inset:0; z-index:30;
  background:white; display:flex; flex-direction:column;
}
.parked-panel__hdr{
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 16px; border-bottom:2px solid #fde68a; flex-shrink:0;
  background:linear-gradient(135deg,#fffbeb,#fef3c7);
}
.pp-hdr-l{display:flex;align-items:center;gap:8px}
.pp-hdr-l span{font-size:14px;font-weight:800;color:#92400e}
.pp-cnt{min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:#f59e0b;color:white;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}
.pp-close{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:#92400e;cursor:pointer;transition:background .15s}
.pp-close:hover{background:rgba(0,0,0,.08)}

.parked-panel__list{flex:1;overflow-y:auto;padding:10px 10px 4px}

.parked-item{
  display:flex; align-items:center; gap:10px;
  padding:12px 14px; border:1.5px solid #e2e8f0; border-radius:12px;
  margin-bottom:8px; cursor:pointer; transition:all .15s; background:#fafafa;
}
.parked-item:hover{border-color:#818cf8;background:#f5f7ff;transform:translateX(2px)}

.pi-num{
  width:26px; height:26px; border-radius:7px;
  background:#f1f5f9; color:#64748b;
  font-size:11px; font-weight:800;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.pi-body{flex:1; min-width:0}
.pi-client{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:700;color:#1e293b;margin-bottom:3px}
.pi-meta{font-size:11.5px;color:#6366f1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pi-meta strong{color:#4f46e5}
.pi-time{display:flex;align-items:center;gap:3px;font-size:10.5px;color:#94a3b8;margin-top:2px}

.pi-acts{display:flex;gap:5px;flex-shrink:0}
.pi-restore{
  width:32px; height:32px; border-radius:8px;
  background:#e0e7ff; color:#6366f1;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s;
}
.pi-restore:hover{background:#6366f1;color:white}
.pi-del{
  width:32px; height:32px; border-radius:8px;
  background:#fee2e2; color:#ef4444;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:all .15s;
}
.pi-del:hover{background:#ef4444;color:white}

.pp-new-btn{
  margin:6px 10px 12px; height:42px; border-radius:11px;
  border:1.5px dashed #c7d2fe; color:#6366f1;
  font-size:13px; font-weight:600; font-family:inherit;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
  gap:7px; flex-shrink:0; transition:all .15s; background:transparent;
}
.pp-new-btn:hover{background:#eef2ff;border-color:#818cf8}

/* Slide-up transition */
.slide-up-enter-active,.slide-up-leave-active{transition:all .22s cubic-bezier(.4,0,.2,1)}
.slide-up-enter-from,.slide-up-leave-to{opacity:0;transform:translateY(12px)}

/* ── History table tweaks ─────────────────────────────────────── */
.data-row{cursor:pointer}
.hist-row:hover td{background:#f0f4ff}
.hist-client{display:flex;align-items:center;gap:7px}
.hist-av{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.hist-av--sm{width:22px;height:22px;font-size:9px}
.hist-sum{font-size:14px;font-weight:800;color:#1e293b;letter-spacing:-.02em}
.spin-ico{animation:spin-r .7s linear infinite}
@keyframes spin-r{to{transform:rotate(360deg)}}

/* ── Cash report summary strip ────────────────────────────────── */
.cash-summary{display:flex;gap:10px;padding:14px 20px;border-bottom:1px solid #e2e8f0;flex-shrink:0;flex-wrap:wrap}
.cs-card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;border:1.5px solid transparent;flex:1;min-width:160px}
.cs-card--green {background:#f0fdf4;border-color:#bbf7d0}
.cs-card--blue  {background:#eff6ff;border-color:#bfdbfe}
.cs-card--amber {background:#fffbeb;border-color:#fde68a}
.cs-card--rose  {background:#fff1f2;border-color:#fecdd3}
.cs-card--indigo{background:#eef2ff;border-color:#c7d2fe}
.cs-card--big   {flex:1.4}
.cs-ico{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cs-card--green  .cs-ico{background:#dcfce7;color:#16a34a}
.cs-card--blue   .cs-ico{background:#dbeafe;color:#1d4ed8}
.cs-card--amber  .cs-ico{background:#fef3c7;color:#b45309}
.cs-card--rose   .cs-ico{background:#fecdd3;color:#be123c}
.cs-card--indigo .cs-ico{background:#c7d2fe;color:#4338ca}
.cs-lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:3px}
.cs-val{font-size:17px;font-weight:900;color:#1e293b;letter-spacing:-.03em}
.cs-val span{font-size:11px;font-weight:500;color:#94a3b8}
.cs-val--rose{color:#be123c}
.cs-val--main{font-size:20px;color:#4338ca}

/* Cash table clickable rows */
.cash-row--clickable:hover td{background:#eef2ff;cursor:pointer}
.cash-amount{font-size:14px;font-weight:800;letter-spacing:-.02em}
.cash-amount--in {color:#059669}
.cash-amount--out{color:#dc2626}

/* ── Sale detail modal ────────────────────────────────────────── */
.sm-overlay{position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;animation:ov-in .18s ease}
@keyframes ov-in{from{opacity:0}to{opacity:1}}
.sm-modal{background:white;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.22);width:860px;max-width:96vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;animation:sm-in .22s cubic-bezier(.34,1.56,.64,1)}
@keyframes sm-in{from{opacity:0;transform:scale(.95) translateY(16px)}to{opacity:1;transform:none}}

/* Loading */
.sm-load{display:flex;flex-direction:column;gap:10px;padding:28px}
.sm-skel{height:52px;border-radius:10px}

/* Header */
.sm-hdr{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 16px;border-bottom:1.5px solid #e2e8f0;flex-shrink:0;background:#fafbff}
.sm-hdr-l{display:flex;align-items:center;gap:14px}
.sm-hdr-ico{width:42px;height:42px;border-radius:11px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,.3)}
.sm-title{font-size:17px;font-weight:800;color:#1e293b;letter-spacing:-.02em;display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.sm-sub{font-size:11.5px;color:#94a3b8;margin-top:2px}
.sm-hdr-r{display:flex;align-items:center;gap:8px;flex-shrink:0}
.sm-cancel-btn{display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:9px;background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .15s}
.sm-cancel-btn:hover{background:#fee2e2;border-color:#fca5a5}
.sm-close{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#94a3b8;cursor:pointer;transition:all .15s}
.sm-close:hover{background:#fef2f2;color:#dc2626}

/* Body */
.sm-body{display:flex;flex:1;overflow:hidden;gap:0}

/* Left: items */
.sm-left{flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:1.5px solid #e2e8f0}
.sm-section-title{display:flex;align-items:center;gap:6px;padding:12px 20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;border-bottom:1px solid #f1f5f9;flex-shrink:0;background:#fafbff}
.sm-items{flex:1;overflow-y:auto;padding:8px 0}
.sm-item{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid #f8fafc;transition:background .1s}
.sm-item:last-child{border-bottom:none}
.sm-item:hover{background:#f8faff}
.sm-item-num{width:22px;height:22px;border-radius:6px;background:#e0e7ff;color:#6366f1;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sm-item-info{flex:1;min-width:0}
.sm-item-name{font-size:13.5px;font-weight:700;color:#1e293b;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sm-item-sub{display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8}
.sm-item-price{font-weight:600;color:#6366f1}
.sm-item-x{color:#cbd5e1}
.sm-item-qty{font-weight:700;color:#1e293b}
.sm-item-type{font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;background:#fef3c7;color:#b45309;border:1px solid #fde68a}
.sm-item-total{font-size:14px;font-weight:800;color:#4338ca;white-space:nowrap;letter-spacing:-.02em}
.sm-item-total span{font-size:10px;font-weight:500;color:#94a3b8}
.sm-items-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px;color:#cbd5e1;font-size:13px}

.sm-totals{border-top:2px solid #e2e8f0;padding:14px 20px;background:#f8fafc;flex-shrink:0}
.sm-total-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:3px 0;color:#64748b}
.sm-total-row span:last-child{font-weight:700;color:#1e293b}
.sm-total-disc span:last-child{color:#dc2626}
.sm-total-paid span:last-child{color:#059669}
.sm-total-debt span:last-child{color:#dc2626}
.sm-total-main{display:flex;justify-content:space-between;align-items:center;padding:10px 0 6px;margin-top:4px;border-top:1.5px solid #e2e8f0;font-size:15px;font-weight:900;color:#1e293b;letter-spacing:-.02em}

/* Right: info panels */
.sm-right{width:280px;flex-shrink:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafbff}
.sm-info-card{background:white;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden}
.sm-info-card-title{display:flex;align-items:center;gap:6px;padding:9px 13px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;background:#f8fafc;border-bottom:1px solid #f1f5f9}
.sm-client-row{display:flex;align-items:center;gap:10px;padding:12px 13px}
.sm-client-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sm-client-name{font-size:13.5px;font-weight:700;color:#1e293b}
.sm-client-phone{font-size:11.5px;color:#94a3b8;margin-top:2px}
.sm-info-empty{padding:12px 13px;font-size:12.5px;color:#94a3b8;font-style:italic}
.sm-meta-list{padding:4px 0}
.sm-meta-row{display:flex;justify-content:space-between;align-items:center;padding:8px 13px;border-bottom:1px solid #f8fafc;font-size:12.5px}
.sm-meta-row:last-child{border-bottom:none}
.sm-meta-row span:first-child{color:#94a3b8;font-weight:500}
.sm-meta-val{font-weight:600;color:#1e293b;font-size:12.5px;text-align:right;max-width:150px}
.sm-val--ws{color:#b45309;background:#fef3c7;padding:1px 7px;border-radius:99px;font-size:11px;border:1px solid #fde68a}
.sm-val--rt{color:#059669;background:#dcfce7;padding:1px 7px;border-radius:99px;font-size:11px;border:1px solid #bbf7d0}
.sm-val--debt{font-weight:800;color:#dc2626}
.sm-val--cashier{display:flex;align-items:center;gap:4px;color:#4338ca}

/* ── Transaction detail modal ─────────────────────────────────────── */
.txn-modal{
  background:white;border-radius:18px;
  box-shadow:0 24px 80px rgba(0,0,0,.22);
  width:420px;max-width:96vw;overflow:hidden;
  animation:sm-in .22s cubic-bezier(.34,1.56,.64,1);
}
.txn-modal__hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 20px 16px;background:#fafbff;border-bottom:1.5px solid #e2e8f0;
}
.txn-modal__hdr-l{display:flex;align-items:center;gap:14px}
.txn-modal__ico{
  width:48px;height:48px;border-radius:13px;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
}
.txn-modal__title{font-size:17px;font-weight:800;color:#1e293b;letter-spacing:-.02em}
.txn-modal__date{font-size:11.5px;color:#94a3b8;margin-top:2px}
.txn-modal__body{padding:20px}
.txn-amount-block{
  display:flex;align-items:baseline;justify-content:center;gap:6px;
  padding:20px 16px;border-radius:14px;margin-bottom:20px;
}
.txn-ab--in {background:#f0fdf4;border:1.5px solid #bbf7d0}
.txn-ab--out{background:#fff1f2;border:1.5px solid #fecdd3}
.txn-ab__sign{font-size:28px;font-weight:900;line-height:1}
.txn-ab--in  .txn-ab__sign{color:#16a34a}
.txn-ab--out .txn-ab__sign{color:#dc2626}
.txn-ab__sum{font-size:36px;font-weight:900;letter-spacing:-.04em;line-height:1}
.txn-ab--in  .txn-ab__sum{color:#15803d}
.txn-ab--out .txn-ab__sum{color:#b91c1c}
.txn-ab__cur{font-size:14px;font-weight:500;color:#94a3b8;align-self:flex-end;padding-bottom:4px}
.txn-detail-grid{display:flex;flex-direction:column;gap:0;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden}
.txn-detail-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:11px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;
}
.txn-detail-row:last-child{border-bottom:none}
.txn-dr__lbl{color:#94a3b8;font-weight:500;flex-shrink:0}
.txn-dr__val{font-weight:600;color:#1e293b;text-align:right;max-width:220px}

/* ── History date filter + export ────────────────────────────────── */
.pg-clear-btn{width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fef2f2;color:#ef4444;cursor:pointer;flex-shrink:0;border:1.5px solid #fecaca}
.pg-clear-btn:hover{background:#fecaca}
.pg-export-btn{display:flex;align-items:center;gap:5px;padding:0 13px;height:34px;border-radius:9px;background:#f0fdf4;border:1.5px solid #bbf7d0;color:#16a34a;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;flex-shrink:0;transition:all .15s}
.pg-export-btn:hover{background:#dcfce7;border-color:#86efac}
.pg-export-btn:disabled{opacity:.35;cursor:not-allowed}

/* ── Kassa kirim/chiqim buttons ──────────────────────────────────── */
.pg-hdr-divider{width:1px;height:28px;background:#e2e8f0;flex-shrink:0}
.ce-btn{display:flex;align-items:center;gap:6px;padding:0 14px;height:34px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;flex-shrink:0;transition:all .15s}
.ce-btn--in{background:#f0fdf4;border:1.5px solid #bbf7d0;color:#16a34a}
.ce-btn--in:hover{background:#dcfce7}
.ce-btn--out{background:#fff1f2;border:1.5px solid #fecdd3;color:#dc2626}
.ce-btn--out:hover{background:#fee2e2}

/* ── Cash Entry / Debt modal ─────────────────────────────────────── */
.ce-modal{background:white;border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.22);width:400px;max-width:96vw;overflow:hidden;animation:sm-in .22s cubic-bezier(.34,1.56,.64,1)}
.ce-modal__hdr{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 16px;border-bottom:1.5px solid #e2e8f0}
.ce-hdr--in {background:linear-gradient(135deg,#f0fdf4,#dcfce7)}
.ce-hdr--out{background:linear-gradient(135deg,#fff1f2,#fee2e2)}
.ce-hdr--debt{background:linear-gradient(135deg,#fefce8,#fef9c3)}
.ce-modal__hdr-l{display:flex;align-items:center;gap:14px}
.ce-modal__ico{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ce-hdr--in  .ce-modal__ico{color:#16a34a}
.ce-hdr--out .ce-modal__ico{color:#dc2626}
.ce-hdr--debt .ce-modal__ico{color:#b45309}
.ce-modal__title{font-size:16px;font-weight:800;color:#1e293b;letter-spacing:-.02em}
.ce-modal__sub{font-size:11.5px;color:#94a3b8;margin-top:2px}
.ce-modal__body{padding:20px;display:flex;flex-direction:column;gap:14px}
.ce-modal__foot{display:flex;gap:8px;padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0}

.ce-type-tabs{display:flex;gap:6px}
.ce-ttab{flex:1;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid #e2e8f0;color:#64748b;transition:all .15s}
.ce-ttab--in {background:#f0fdf4;border-color:#bbf7d0;color:#16a34a}
.ce-ttab--out{background:#fff1f2;border-color:#fecdd3;color:#dc2626}

.ce-amount-wrap{display:flex;align-items:center;position:relative}
.ce-amount-inp{width:100%;height:48px;padding:0 52px 0 14px;border:2px solid #e2e8f0;border-radius:11px;font-size:22px;font-weight:800;font-family:inherit;outline:none;color:#1e293b;transition:all .15s}
.ce-amount-inp:focus{border-color:#818cf8;box-shadow:0 0 0 3px rgba(129,140,248,.12)}
.ce-amount-cur{position:absolute;right:14px;font-size:12px;font-weight:600;color:#94a3b8}

.ce-pay-tabs{display:flex;gap:5px}
.ce-ptab{flex:1;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;border:1.5px solid #e2e8f0;color:#64748b;transition:all .15s}
.ce-ptab--on{background:#eef2ff;border-color:#818cf8;color:#4338ca}

.mf-save--out{background:linear-gradient(135deg,#ef4444,#dc2626)}
.mf-save--debt{background:linear-gradient(135deg,#f59e0b,#d97706)}

/* ── Debt info banner ────────────────────────────────────────────── */
.debt-info-banner{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px}
.dib__lbl{font-size:12px;font-weight:600;color:#94a3b8}
.dib__val{font-size:22px;font-weight:900;color:#dc2626;letter-spacing:-.03em}
.dib__val span{font-size:12px;font-weight:500;color:#94a3b8}

/* ── Client tab enhancements ─────────────────────────────────────── */
.cli-name-row{display:flex;align-items:center;gap:7px}
.row-act--pay{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0}
.row-act--pay:hover{background:#dcfce7;border-color:#86efac}

/* ── Discount mode tabs ──────────────────────────────────────────── */
.disc-mode-tabs{display:flex;gap:2px;margin-left:auto;margin-right:6px}
.dmt{height:22px;padding:0 8px;border-radius:6px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;border:1.5px solid #e2e8f0;color:#94a3b8;transition:all .12s}
.dmt--on{background:#eef2ff;border-color:#818cf8;color:#4338ca}

/* ── Cart last-sale button ───────────────────────────────────────── */
.chdr-btn--last{background:#fef3c7;border-color:#fde68a;color:#b45309}
.chdr-btn--last:hover{background:#fde68a}

/* ── Sale modal print button ─────────────────────────────────────── */
.sm-print-btn{display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:9px;background:#f0fdf4;border:1.5px solid #bbf7d0;color:#16a34a;font-size:12.5px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .15s}
.sm-print-btn:hover{background:#dcfce7}

/* ── Dual currency (so'm + $) displays ──────────────────────────── */
.dual-val{display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.dual-usd{font-size:10px;font-weight:600;color:#16a34a;font-family:monospace}
.dual-usd-main{font-size:12px;font-weight:700;color:#16a34a;font-family:monospace}
.pay-usd{font-size:13px;font-weight:700;color:rgba(255,255,255,.75);font-family:monospace;margin-left:-4px}
.hist-usd{font-size:10.5px;font-weight:600;color:#16a34a;font-family:monospace;margin-top:2px}
.hist-usd--debt{color:#dc2626}
.cs-usd{font-size:11px;font-weight:700;color:#16a34a;font-family:monospace;margin-top:2px}
.cs-usd--rose{color:#be123c}
.cs-usd--main{font-size:13px;color:#4338ca}
.txn-usd{font-size:10.5px;font-weight:600;font-family:monospace;text-align:right;margin-top:2px}
.txn-usd--in{color:#16a34a}
.txn-usd--out{color:#dc2626}
.sm-total-dual{display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.sm-dual-usd{font-size:11px;font-weight:600;color:#16a34a;font-family:monospace}
.sm-dual-usd-main{font-size:13px;font-weight:700;color:#16a34a;font-family:monospace}
.sm-dual-usd--debt{color:#dc2626}
.sm-kurs-row{border-top:1px dashed #e2e8f0;margin-top:4px;padding-top:6px;color:#94a3b8;font-size:11.5px}
.sm-kurs-row span:last-child{font-weight:600;color:#6366f1}
.sm-item-usd{font-size:10px;font-weight:600;color:#16a34a;font-family:monospace;margin-top:2px}
</style>
