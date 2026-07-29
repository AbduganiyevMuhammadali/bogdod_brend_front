<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import AppIcon          from '@/components/AppIcon.vue'
import { purchasesApi } from '@/api/purchases.js'
import { productsApi }  from '@/api/products.js'
import { suppliersApi } from '@/api/suppliers.js'
import { beep }         from '@/composables/useBeep.js'
import { canAdd, canEdit } from '@/composables/usePerms.js'
import { printBarcodeLabels, genBarcode } from '@/composables/useBarcodePrint.js'

const WAREHOUSES = ['Asosiy ombor', '2-filial', '3-filial']

// ── List state ───────────────────────────────────────────────────
const docs    = ref([])
const loading = ref(false)
const error   = ref('')
const search  = ref('')
const filterW = ref('all')
const filterS = ref('all')

async function loadDocs() {
  loading.value = true; error.value = ''
  try {
    const params = {}
    if (filterW.value !== 'all') params.warehouse = filterW.value
    if (filterS.value !== 'all') params.status    = filterS.value
    if (search.value.trim())     params.search    = search.value.trim()
    const res = await purchasesApi.getAll(params)
    docs.value = res.data
  } catch (e) {
    error.value = e.response?.data?.message ?? "Serverga ulanib bo'lmadi"
  } finally { loading.value = false }
}

onMounted(loadDocs)
watch([filterW, filterS], loadDocs)
let st = null
watch(search, () => { clearTimeout(st); st = setTimeout(loadDocs, 300) })

const stats = computed(() => {
  const active = docs.value.filter(d => d.status !== 'cancelled')
  const today  = new Date().toISOString().slice(0, 10)
  return {
    total:    docs.value.length,
    today:    docs.value.filter(d => d.date?.slice(0, 10) === today).length,
    totalUSD: active.reduce((s, d) => s + d.totalUsd, 0),
    totalSum: active.reduce((s, d) => s + d.totalSum, 0),
  }
})

// ── Form state ───────────────────────────────────────────────────
const showForm  = ref(false)
const editingId = ref(null)
const saving    = ref(false)
const saveErr   = ref('')

const form = reactive({
  docNumber: 1, date: '', warehouse: 'Asosiy ombor',
  supplier: '', supplierId: null,
  expense: 0, discount: 0, exchangeRate: 11000,
  comment: '', status: 'draft', items: [],
})

function makeItem() {
  return {
    _key: Date.now() + Math.random(),
    productId: null, barcode: '', productName: '', stockQty: 0,
    pkgQty: 0, unitQty: 0, unitsPerPkg: 1,
    pkgPrice: 0, unitPrice: 0, costPrice: 0,
    totalSum: 0, totalCostSum: 0,
    retailMarkupPct: 30, wholesaleMarkupPct: 15,
    retailPriceSum: 0, retailPriceUsd: 0,
    wholesalePriceSum: 0, wholesalePriceUsd: 0,
  }
}

async function openAdd() {
  const nextNum = await purchasesApi.getNextDocNumber().catch(() => 1)
  const firstItem = makeItem()
  Object.assign(form, {
    docNumber: nextNum, date: new Date().toISOString().slice(0, 16),
    warehouse: 'Asosiy ombor', supplier: '', supplierId: null,
    expense: 0, discount: 0, exchangeRate: 11000, comment: '', status: 'draft',
    items: [firstItem],
  })
  supplierQuery.value = ''
  editingId.value = null
  mobileExpanded.value = { [firstItem._key]: true }
  showForm.value  = true
  await nextTick()
  focusFirstNameInput()
}

async function openEdit(id) {
  try {
    const p = await purchasesApi.getById(id)
    Object.assign(form, {
      docNumber: p.docNumber, date: p.date?.slice(0, 16) ?? '',
      warehouse: p.warehouse, supplier: p.supplier, supplierId: p.supplierId ?? null,
      expense: p.expense, discount: p.discount, exchangeRate: p.exchangeRate,
      comment: p.comment, status: p.status,
      items: p.items.length ? p.items.map(i => ({ ...i, _key: i.id })) : [makeItem()],
    })
    supplierQuery.value = p.supplier || ''
    selectedSupplier.value = p.supplierRef ? { id: p.supplierId, name: p.supplier, balance: p.supplierRef.balance } : null
    editingId.value = id
    mobileExpanded.value = {}
    showForm.value  = true
    await nextTick()
    form.items.forEach(i => { productSearch.value[i._key] = i.productName })
  } catch (e) { alert(e.response?.data?.message ?? 'Yuklashda xatolik') }
}

function closeForm() { showForm.value = false; editingId.value = null; saveErr.value = '' }

// ── Item calc ────────────────────────────────────────────────────
function recalcItem(item) {
  const rate = Number(form.exchangeRate) || 11000
  if (item.pkgQty > 0 && item.unitsPerPkg > 0)
    item.unitQty = +(item.pkgQty * item.unitsPerPkg).toFixed(3)
  if (item.pkgPrice > 0 && item.unitsPerPkg > 0)
    item.unitPrice = +(item.pkgPrice / item.unitsPerPkg).toFixed(2)
  item.totalSum = +(item.unitQty * item.unitPrice).toFixed(2)
  const expPerUnit = Number(form.expense) / (formTotalUnits.value || 1)
  item.costPrice    = +(item.unitPrice + expPerUnit).toFixed(2)
  item.totalCostSum = +(item.unitQty * item.costPrice).toFixed(2)
  item.retailPriceSum    = +(item.costPrice * (1 + item.retailMarkupPct    / 100)).toFixed(2)
  item.wholesalePriceSum = +(item.costPrice * (1 + item.wholesaleMarkupPct / 100)).toFixed(2)
  item.retailPriceUsd    = rate > 0 ? +(item.retailPriceSum    / rate).toFixed(4) : 0
  item.wholesalePriceUsd = rate > 0 ? +(item.wholesalePriceSum / rate).toFixed(4) : 0
}

const formTotalUnits = computed(() => form.items.reduce((s, i) => s + (Number(i.unitQty) || 0), 0))
const formTotalSum   = computed(() => form.items.reduce((s, i) => s + (Number(i.totalSum) || 0), 0))
const formTotalCost  = computed(() => form.items.reduce((s, i) => s + (Number(i.totalCostSum) || 0), 0))

// ── Mobile: collapsed/expanded state per item card (tap to edit) ──
const mobileExpanded = ref({})
function toggleMobileCard(item) { mobileExpanded.value[item._key] = !mobileExpanded.value[item._key] }
function isMobileExpanded(item) { return !!mobileExpanded.value[item._key] }

function addRow() {
  const item = makeItem()
  mobileExpanded.value[item._key] = true
  form.items.push(item)
  nextTick(() => focusLastNameInput())
}
function removeRow(idx) {
  if (form.items.length > 1) {
    delete mobileExpanded.value[form.items[idx]._key]
    form.items.splice(idx, 1)
  }
}

function focusFirstNameInput() {
  document.querySelector('.kft__inp--name')?.focus()
}
function focusLastNameInput() {
  const all = document.querySelectorAll('.kft__inp--name')
  all[all.length - 1]?.focus()
}

// Enter on last row → add new row
function onRowEnter(idx) {
  if (idx === form.items.length - 1) addRow()
}

// ── Keyboard global shortcuts ────────────────────────────────────
function onKeydown(e) {
  if (!showForm.value) return
  if (e.key === 'F1') { e.preventDefault(); addRow() }
  if (e.key === 'F9') { e.preventDefault(); save(true) }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(false) }
  if (e.key === 'Escape') closeForm()
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// ── Product search in rows ───────────────────────────────────────
const productSearch  = ref({})
const productResults = ref({})
const productOpen    = ref({})
const dropdownPos    = ref({})
let prodTimers = {}

async function doSearch(key, query) {
  clearTimeout(prodTimers[key])
  prodTimers[key] = setTimeout(async () => {
    try {
      const params = { limit: 15 }
      if (query?.trim().length) params.search = query.trim()
      productResults.value[key] = (await productsApi.getAll(params)).data
    } catch { productResults.value[key] = [] }
  }, query?.trim().length ? 160 : 0)
}

function onProductFocus(item, event) {
  const rect = event.target.getBoundingClientRect()
  dropdownPos.value[item._key] = clampDropX({
    top: rect.bottom + window.scrollY + 2 + 'px',
    left: rect.left + window.scrollX + 'px',
    minWidth: Math.max(rect.width, 300) + 'px',
  })
  productOpen.value[item._key] = true
  doSearch(item._key, productSearch.value[item._key] || '')
}
function onProductInput(item, val) {
  productSearch.value[item._key] = val
  productOpen.value[item._key]   = true
  doSearch(item._key, val)
}
function onProductBlur(item) {
  setTimeout(() => { productOpen.value[item._key] = false }, 220)
}
async function selectProduct(item, product) {
  item.productId   = product.id
  item.productName = product.name
  item.barcode     = await ensureProductBarcode(product)
  item.stockQty    = product.qty ?? 0
  item.unitPrice   = product.retailPrice || 0
  item.costPrice   = product.retailPrice || 0
  productSearch.value[item._key]  = product.name
  productOpen.value[item._key]    = false
  productResults.value[item._key] = []
  recalcItem(item)
}

// Mahsulotda shtrix-kod bo'lmasa — yangi kod generatsiya qilib, mahsulotga saqlaydi
// (shu bilan bir marta generatsiya qilingan kod doim shu mahsulotga tegishli bo'lib qoladi).
async function ensureProductBarcode(product) {
  if (Array.isArray(product.barcodes) && product.barcodes.length) return product.barcodes[0]
  const code = genBarcode()
  product.barcodes = [code]
  try { await productsApi.patch(product.id, { barcodes: [code] }) } catch { /* saqlanmasa ham chop etishda ishlatiladi */ }
  return code
}

// ── Barcode yorliqlarini chop etish ──────────────────────────────
function printRowLabel(item) {
  printBarcodeLabels([{
    name:    item.productName,
    price:   item.retailPriceSum,
    barcode: item.barcode,
    qty:     Math.max(1, Math.round(Number(item.unitQty) || 1)),
  }])
}
function printAllLabels() {
  const rows = form.items
    .filter(i => i.productName && i.barcode)
    .map(i => ({
      name:    i.productName,
      price:   i.retailPriceSum,
      barcode: i.barcode,
      qty:     Math.max(1, Math.round(Number(i.unitQty) || 1)),
    }))
  printBarcodeLabels(rows)
}

// ── Quick barcode scan ───────────────────────────────────────────
const quickBarcode    = ref('')
const quickBarcodeEl  = ref(null)

async function onQuickBarcode() {
  const bc = quickBarcode.value.trim()
  if (!bc) return
  quickBarcode.value = ''
  try {
    const product = await productsApi.getByBarcode(bc)
    if (!product) { beep('error'); return }
    beep('add')
    // find empty row or add new
    let row = form.items.find(i => !i.productName)
    if (!row) { form.items.push(makeItem()); row = form.items[form.items.length - 1] }
    await selectProduct(row, product)
    row.unitQty = 1
    recalcItem(row)
  } catch { /* ignore */ }
  await nextTick()
  quickBarcodeEl.value?.focus()
}

// ── Size matrix quick-add ────────────────────────────────────────
const showSizePanel     = ref(false)
const sizePanelQuery    = ref('')
const sizePanelProds    = ref([])   // search results
const sizePanelQtys     = ref({})   // { productId: qty }
const sizePanelBuyPrice = ref({})   // { productId: kirim narxi (purchase price) }
const sizePanelMarkup   = ref({})   // { productId: retail markup % }
let sizePanelTimer      = null

watch(sizePanelQuery, () => {
  clearTimeout(sizePanelTimer)
  if (!sizePanelQuery.value.trim()) { sizePanelProds.value = []; return }
  sizePanelTimer = setTimeout(async () => {
    try {
      const res = await productsApi.getAll({ search: sizePanelQuery.value, limit: 40 })
      sizePanelProds.value = res.data
      res.data.forEach(p => {
        if (sizePanelQtys.value[p.id]     === undefined) sizePanelQtys.value[p.id]     = 0
        if (sizePanelBuyPrice.value[p.id] === undefined) sizePanelBuyPrice.value[p.id] = 0
        if (sizePanelMarkup.value[p.id]   === undefined) sizePanelMarkup.value[p.id]   = 30
      })
    } catch { sizePanelProds.value = [] }
  }, 220)
})

const sizePanelSelected = computed(() =>
  sizePanelProds.value.filter(p => sizePanelQtys.value[p.id] > 0)
)
const sizePanelTotalQty = computed(() =>
  Object.values(sizePanelQtys.value).reduce((s, v) => s + (Number(v) || 0), 0)
)

function szCalcSell(id) {
  const buy    = Number(sizePanelBuyPrice.value[id]) || 0
  const markup = Number(sizePanelMarkup.value[id])   ?? 30
  return buy > 0 ? Math.round(buy * (1 + markup / 100)) : 0
}

async function addSizePanelItems() {
  for (const product of sizePanelSelected.value) {
    const qty = Number(sizePanelQtys.value[product.id]) || 0
    if (qty <= 0) continue
    const item = makeItem()
    item.productId         = product.id
    item.productName       = product.name
    item.barcode           = await ensureProductBarcode(product)
    item.stockQty          = product.qty ?? 0
    item.unitQty           = qty
    item.unitPrice         = Number(sizePanelBuyPrice.value[product.id]) || 0
    item.retailMarkupPct   = Number(sizePanelMarkup.value[product.id])   ?? 30
    productSearch.value[item._key] = product.name
    recalcItem(item)
    form.items.push(item)
  }
  // remove initial empty rows
  form.items = form.items.filter(i => i.productName || i.productId)
  if (!form.items.length) form.items.push(makeItem())
  // clear panel
  sizePanelQtys.value     = {}
  sizePanelBuyPrice.value = {}
  sizePanelMarkup.value   = {}
  sizePanelQuery.value    = ''
  sizePanelProds.value    = []
}

function clearSizePanel() {
  sizePanelQtys.value     = {}
  sizePanelBuyPrice.value = {}
  sizePanelMarkup.value   = {}
}

// ── Supplier autocomplete (DB-backed) ───────────────────────────
const supplierQuery    = ref('')
const supplierResults  = ref([])
const supplierDropdown = ref(false)
const selectedSupplier = ref(null)
const supplierDropPos  = ref({ top: '0px', left: '0px', width: '260px' })
let supTimer = null

async function searchSuppliers(q) {
  clearTimeout(supTimer)
  supTimer = setTimeout(async () => {
    try {
      const params = q?.trim() ? { search: q.trim() } : {}
      supplierResults.value = await suppliersApi.getAll(params)
    } catch { supplierResults.value = [] }
  }, q?.trim() ? 150 : 0)
}

function onSupplierInput(val) {
  form.supplier = val
  supplierQuery.value = val
  supplierDropdown.value = true
  selectedSupplier.value = null
  form.supplierId = null
  searchSuppliers(val)
}
function onSupplierFocus(event) {
  const rect = event.target.getBoundingClientRect()
  supplierDropPos.value = clampDropX({
    top:   (rect.bottom + window.scrollY + 2) + 'px',
    left:  (rect.left + window.scrollX) + 'px',
    width: Math.max(rect.width, 260) + 'px',
  })
  supplierQuery.value = form.supplier
  supplierDropdown.value = true
  searchSuppliers(supplierQuery.value)
}
function onSupplierBlur() { setTimeout(() => { supplierDropdown.value = false }, 200) }
function selectSupplier(s) {
  form.supplier   = s.name
  form.supplierId = s.id
  supplierQuery.value = s.name
  selectedSupplier.value = s
  supplierDropdown.value = false
}
function clearSupplier() {
  form.supplier = ''; form.supplierId = null
  supplierQuery.value = ''; selectedSupplier.value = null
}


// ── Save ─────────────────────────────────────────────────────────
async function save(andConfirm = false) {
  if (!form.items.some(i => i.productName)) { saveErr.value = "Kamida 1 ta mahsulot kiriting"; return }
  saving.value = true; saveErr.value = ''
  try {
    // Ensure all calculated price fields are up-to-date before saving
    form.items.forEach(recalcItem)
    const payload = { ...form, status: andConfirm ? 'confirmed' : 'draft' }
    let result
    if (editingId.value) result = await purchasesApi.update(editingId.value, payload)
    else                 result = await purchasesApi.create(payload)
    if (andConfirm && result.status !== 'confirmed') await purchasesApi.confirm(result.id)
    closeForm(); loadDocs()
  } catch (e) { saveErr.value = e.response?.data?.message ?? 'Saqlashda xatolik' }
  finally { saving.value = false }
}

async function confirmDoc(id) {
  try { await purchasesApi.confirm(id); loadDocs() }
  catch (e) { alert(e.response?.data?.message ?? 'Xatolik') }
}
async function cancelDoc(id) {
  if (!confirm("Hujjatni bekor qilasizmi?")) return
  try { await purchasesApi.cancel(id); loadDocs() }
  catch (e) { alert(e.response?.data?.message ?? 'Xatolik') }
}
async function deleteDoc(id) {
  if (!confirm("Hujjatni o'chirasizmi?")) return
  try { await purchasesApi.remove(id); loadDocs() }
  catch (e) { alert(e.response?.data?.message ?? 'Xatolik') }
}

function fmt(v)         { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtD(v, d = 2) { return (Number(v) || 0).toFixed(d) }

const STATUS_MAP = {
  draft:     { label: 'Qoralama',      cls: 'st--draft'  },
  confirmed: { label: 'Tasdiqlangan',  cls: 'st--ok'     },
  cancelled: { label: 'Bekor qilingan',cls: 'st--cancel' },
}

// ── Mobile: clamp product/supplier dropdown so it never overflows viewport ─
function clampDropX(pos) {
  const vw = window.innerWidth
  if (vw > 768) return pos
  const width = Math.min(parseFloat(pos.minWidth ?? pos.width) || 300, vw - 24)
  let left = parseFloat(pos.left) || 0
  if (left + width > vw - 12) left = Math.max(12, vw - 12 - width)
  if (left < 12) left = 12
  return { ...pos, left: left + 'px', minWidth: width + 'px', width: width + 'px' }
}
</script>

<template>
<div class="kir">

  <!-- ══ LIST ════════════════════════════════════════════════════ -->
  <div v-if="!showForm" class="kir__list">

    <div class="kir__topbar">
      <div class="kir__topbar-l">
        <h2 class="kir__title">Kirim (Xarid)</h2>
        <div class="kir__search">
          <AppIcon name="search" :size="13" class="kir__search-ico" />
          <input v-model="search" class="kir__search-inp" placeholder="Hujjat № yoki yetkazuvchi..." />
        </div>
      </div>
      <button v-if="canAdd('purchases')" class="kir__add-btn" @click="openAdd">
        <AppIcon name="plus" :size="16" :stroke-width="2.5" /> Kirim qo'shish
      </button>
    </div>

    <div class="kir__stats">
      <div class="kstat"><div class="kstat__ico kstat__ico--indigo"><AppIcon name="inbox" :size="15" :stroke-width="2"/></div><div><p class="kstat__val">{{ stats.total }}</p><p class="kstat__lbl">Jami hujjat</p></div></div>
      <div class="kstat"><div class="kstat__ico kstat__ico--green"><AppIcon name="calendar" :size="15" :stroke-width="2"/></div><div><p class="kstat__val">{{ stats.today }}</p><p class="kstat__lbl">Bugun</p></div></div>
      <div class="kstat"><div class="kstat__ico kstat__ico--amber"><AppIcon name="dollar-sign" :size="15" :stroke-width="2"/></div><div><p class="kstat__val">${{ fmtD(stats.totalUSD) }}</p><p class="kstat__lbl">Jami USD</p></div></div>
      <div class="kstat"><div class="kstat__ico kstat__ico--violet"><AppIcon name="trending-up" :size="15" :stroke-width="2"/></div><div><p class="kstat__val">{{ fmt(stats.totalSum) }}</p><p class="kstat__lbl">Jami so'm</p></div></div>
    </div>

    <div class="kir__filters">
      <select v-model="filterW" class="kir__filter-sel">
        <option value="all">Barcha omborlar</option>
        <option v-for="w in WAREHOUSES" :key="w" :value="w">{{ w }}</option>
      </select>
      <select v-model="filterS" class="kir__filter-sel">
        <option value="all">Barcha holat</option>
        <option value="draft">Qoralama</option>
        <option value="confirmed">Tasdiqlangan</option>
        <option value="cancelled">Bekor qilingan</option>
      </select>
    </div>

    <div v-if="error" class="kir__err">
      <AppIcon name="alert-circle" :size="13" />{{ error }}
      <button class="kir__err-retry" @click="loadDocs">Qayta</button>
    </div>

    <div class="kir__table-wrap">
      <div v-if="loading" class="kir__loading">
        <div v-for="i in 6" :key="i" class="skeleton kir__skel-row"></div>
      </div>
      <div v-else-if="!docs.length" class="kir__empty">
        <AppIcon name="inbox" :size="36" :stroke-width="1.2" />
        <p>Hujjat topilmadi</p>
        <button v-if="canAdd('purchases')" class="kir__add-btn kir__add-btn--sm" @click="openAdd"><AppIcon name="plus" :size="14"/>Qo'shish</button>
      </div>
      <table v-else class="ktbl">
        <thead>
          <tr>
            <th>Hujjat №</th><th>Sana</th><th>Yetkazuvchi</th><th>Ombor</th>
            <th class="ta-c">Tovarlar</th><th class="ta-r">USD</th><th class="ta-r">So'm</th>
            <th>Holat</th><th style="width:110px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id" class="ktbl__row" @click="openEdit(d.id)">
            <td><span class="doc-num">#{{ d.docNumber }}</span></td>
            <td class="ktbl__date">{{ d.date?.slice(0,10).split('-').reverse().join('.') }}</td>
            <td><span class="ktbl__supplier">{{ d.supplier || '—' }}</span></td>
            <td><span class="wh-tag">{{ d.warehouse }}</span></td>
            <td class="ta-c"><span class="items-badge">{{ d.itemCount }} ta</span></td>
            <td class="ta-r ktbl__usd">${{ fmtD(d.totalUsd) }}</td>
            <td class="ta-r ktbl__sum">{{ fmt(d.totalSum) }} <span class="cur">so'm</span></td>
            <td><span class="st-badge" :class="STATUS_MAP[d.status]?.cls">{{ STATUS_MAP[d.status]?.label }}</span></td>
            <td @click.stop>
              <div class="ktbl__acts">
                <button v-if="d.status==='draft' && canAdd('purchases')" class="ktbl__act ktbl__act--ok" @click="confirmDoc(d.id)" title="Tasdiqlash"><AppIcon name="check-circle" :size="13"/></button>
                <button class="ktbl__act ktbl__act--edit" @click="openEdit(d.id)" :title="canEdit('purchases') ? 'Tahrirlash' : 'Ko\'rish'"><AppIcon :name="canEdit('purchases') ? 'edit-2' : 'eye'" :size="13"/></button>
                <button v-if="d.status!=='confirmed' && canEdit('purchases')" class="ktbl__act ktbl__act--del"  @click="deleteDoc(d.id)" title="O'chirish"><AppIcon name="trash-2" :size="13"/></button>
                <button v-if="d.status==='confirmed' && canEdit('purchases')" class="ktbl__act ktbl__act--warn" @click="cancelDoc(d.id)" title="Bekor qilish"><AppIcon name="x-circle" :size="13"/></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Mobile card list (same data, same methods, card markup only) -->
      <div v-if="docs.length" class="ktbl-cards">
        <div
          v-for="(d, i) in docs" :key="'c'+d.id"
          class="kdoc-card" :style="{ '--i': i }"
          @click="openEdit(d.id)"
        >
          <div class="kdoc-card__top">
            <span class="doc-num">#{{ d.docNumber }}</span>
            <span class="st-badge" :class="STATUS_MAP[d.status]?.cls">{{ STATUS_MAP[d.status]?.label }}</span>
          </div>
          <p class="kdoc-card__supplier">{{ d.supplier || '—' }}</p>
          <div class="kdoc-card__rows">
            <div class="kdoc-card__row"><span class="kdoc-card__lbl">Sana</span><span class="kdoc-card__val">{{ d.date?.slice(0,10).split('-').reverse().join('.') }}</span></div>
            <div class="kdoc-card__row"><span class="kdoc-card__lbl">Ombor</span><span class="wh-tag">{{ d.warehouse }}</span></div>
            <div class="kdoc-card__row"><span class="kdoc-card__lbl">Tovarlar</span><span class="items-badge">{{ d.itemCount }} ta</span></div>
          </div>
          <div class="kdoc-card__totals">
            <span class="kdoc-card__usd">${{ fmtD(d.totalUsd) }}</span>
            <span class="kdoc-card__sum">{{ fmt(d.totalSum) }} <span class="cur">so'm</span></span>
          </div>
          <div class="kdoc-card__acts" @click.stop>
            <button v-if="d.status==='draft' && canAdd('purchases')" class="kdoc-card__act kdoc-card__act--ok" @click="confirmDoc(d.id)"><AppIcon name="check-circle" :size="14"/>Tasdiqlash</button>
            <button class="kdoc-card__act kdoc-card__act--edit" @click="openEdit(d.id)"><AppIcon :name="canEdit('purchases') ? 'edit-2' : 'eye'" :size="14"/>{{ canEdit('purchases') ? 'Tahrirlash' : "Ko'rish" }}</button>
            <button v-if="d.status!=='confirmed' && canEdit('purchases')" class="kdoc-card__act kdoc-card__act--del kdoc-card__act--icon"  @click="deleteDoc(d.id)" title="O'chirish"><AppIcon name="trash-2" :size="14"/></button>
            <button v-if="d.status==='confirmed' && canEdit('purchases')" class="kdoc-card__act kdoc-card__act--warn kdoc-card__act--icon" @click="cancelDoc(d.id)" title="Bekor qilish"><AppIcon name="x-circle" :size="14"/></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile FAB: add purchase doc -->
    <button v-if="canAdd('purchases')" class="fab" @click="openAdd" aria-label="Kirim qo'shish">
      <AppIcon name="plus" :size="22" :stroke-width="2.5" />
    </button>
  </div>

  <!-- ══ FORM ════════════════════════════════════════════════════ -->
  <div v-else class="kir__form-page">

    <!-- Header -->
    <div class="kf__hdr">
      <div class="kf__hdr-l">
        <span class="kf__hdr-ico"><AppIcon name="download" :size="18" :stroke-width="2"/></span>
        <h2 class="kf__hdr-title">{{ editingId ? 'Kirimni tahrirlash' : "Kirim qo'shish" }}</h2>
      </div>

      <!-- Mobile: always-reachable close button at top (bottom bar holds Saqlash/Tasdiqlash) -->
      <button class="kf__btn-close-top" @click="closeForm" aria-label="Yopish">
        <AppIcon name="x" :size="16" :stroke-width="2.5"/>
      </button>

      <!-- Kurs -->
      <div class="kf__kurs">
        <span class="kf__kurs-lbl">Kurs $</span>
        <input v-model.number="form.exchangeRate" type="number" class="kf__kurs-inp" />
      </div>

      <!-- Hotkeys hint -->
      <div class="kf__hotkeys">
        <span><kbd>F1</kbd> Qator</span>
        <span><kbd>F9</kbd> Tasdiqlash</span>
        <span><kbd>Ctrl+S</kbd> Saqlash</span>
        <span><kbd>Esc</kbd> Yopish</span>
      </div>

      <div class="kf__hdr-acts">
        <span v-if="saveErr" class="kf__save-err">{{ saveErr }}</span>
        <button v-if="editingId ? canEdit('purchases') : canAdd('purchases')" class="kf__btn kf__btn--save" :disabled="saving" @click="save(false)">
          <AppIcon name="check" :size="14" :stroke-width="2.5"/>
          {{ saving ? 'Saqlanmoqda...' : 'Saqlash' }}
        </button>
        <button v-if="canAdd('purchases')" class="kf__btn kf__btn--confirm" :disabled="saving" @click="save(true)">
          <AppIcon name="check-circle" :size="14" :stroke-width="2.5"/>
          Tasdiqlash
        </button>
        <button class="kf__btn kf__btn--close" @click="closeForm">
          <AppIcon name="x" :size="15" :stroke-width="2.5"/>
        </button>
      </div>
    </div>

    <!-- Meta row -->
    <div class="kf__meta">
      <div class="kf__meta-field">
        <span class="kf__meta-lbl">Fakt №</span>
        <div class="kf__meta-val--num">{{ form.docNumber }}</div>
      </div>
      <div class="kf__meta-field kf__meta-field--wide">
        <span class="kf__meta-lbl">Vaqt</span>
        <input v-model="form.date" type="datetime-local" class="kf__meta-inp" />
      </div>
      <div class="kf__meta-field kf__meta-field--wide">
        <span class="kf__meta-lbl">Ombor</span>
        <select v-model="form.warehouse" class="kf__meta-inp kf__meta-inp--sel">
          <option v-for="w in WAREHOUSES" :key="w">{{ w }}</option>
        </select>
      </div>
      <div class="kf__meta-field kf__meta-field--xl kf__sup-wrap">
        <span class="kf__meta-lbl">Yetkazuvchi</span>
        <div style="position:relative; display:flex; align-items:center; gap:4px;">
          <input
            :value="supplierQuery"
            type="text"
            class="kf__meta-inp kf__sup-inp"
            placeholder="Yetkazuvchini tanlang..."
            autocomplete="off"
            @input="onSupplierInput($event.target.value)"
            @focus="onSupplierFocus($event)"
            @blur="onSupplierBlur"
          />
          <button v-if="form.supplierId" class="kf__sup-x" @mousedown.prevent="clearSupplier" title="Tozalash">
            <AppIcon name="x" :size="11" :stroke-width="3"/>
          </button>
          <Teleport to="body">
            <div v-if="supplierDropdown" class="kf__sugg-drop kf__sugg-drop--db" :style="{ position:'fixed', zIndex:9999, top:supplierDropPos.top, left:supplierDropPos.left, width:supplierDropPos.width, maxHeight:'240px', overflowY:'auto' }">
              <div v-if="!supplierResults.length" class="kf__sugg-empty">Yetkazuvchi topilmadi</div>
              <button
                v-for="s in supplierResults" :key="s.id"
                class="kf__sugg-opt"
                @mousedown.prevent="selectSupplier(s)"
              >
                <span class="kf__sugg-name">{{ s.name }}</span>
                <span v-if="s.balance < 0" class="kf__sugg-debt">Qarzi: {{ fmt(Math.abs(s.balance)) }} so'm</span>
                <span v-else-if="s.balance > 0" class="kf__sugg-credit">Kredit: {{ fmt(s.balance) }} so'm</span>
              </button>
            </div>
          </Teleport>
        </div>
        <div v-if="selectedSupplier && selectedSupplier.balance < 0" class="kf__sup-info kf__sup-info--debt">
          <AppIcon name="alert-circle" :size="11" :stroke-width="2.5"/>
          Mavjud qarz: {{ fmt(Math.abs(selectedSupplier.balance)) }} so'm
        </div>
      </div>
      <div class="kf__meta-field">
        <span class="kf__meta-lbl">Rasxod</span>
        <input v-model.number="form.expense" type="number" class="kf__meta-inp" placeholder="0"
          @change="form.items.forEach(recalcItem)" />
      </div>
      <div class="kf__meta-field">
        <span class="kf__meta-lbl">Skidka</span>
        <input v-model.number="form.discount" type="number" class="kf__meta-inp" placeholder="0" />
      </div>
    </div>

    <!-- Content: table + size panel -->
    <div class="kf__content">

      <!-- Main table area -->
      <div class="kf__table-area">

        <!-- Quick barcode scan bar -->
        <div class="kf__scan-bar">
          <AppIcon name="zap" :size="13" class="kf__scan-ico" />
          <span class="kf__scan-lbl">Tez skanerlash:</span>
          <input
            ref="quickBarcodeEl"
            v-model="quickBarcode"
            class="kf__scan-inp"
            placeholder="Shtrix kodni skanerlang yoki kiriting..."
            autocomplete="off"
            @keyup.enter="onQuickBarcode"
          />
          <button class="kf__scan-btn" @click="onQuickBarcode">
            <AppIcon name="plus" :size="13" :stroke-width="2.5" /> Qo'shish
          </button>
          <div class="kf__scan-sep" />
          <button
            class="kf__size-toggle"
            :class="{ active: showSizePanel }"
            @click="showSizePanel = !showSizePanel"
          >
            <AppIcon name="layers" :size="13" :stroke-width="2" />
            Razmerlar
            <span v-if="sizePanelTotalQty > 0" class="kf__size-badge">{{ sizePanelTotalQty }}</span>
          </button>
          <div class="kf__scan-sep" />
          <button
            class="kf__print-all-btn"
            :disabled="!form.items.some(i => i.productName)"
            @click="printAllLabels"
            title="Jadvaldagi barcha tovarlar uchun yorliq chop etish"
          >
            <AppIcon name="printer" :size="13" :stroke-width="2" />
            Yorliqlarni chop etish
          </button>
        </div>
        

        <!-- Items table -->
        <div class="kf__table-wrap">
          <table class="kft">
            <thead>
              <tr class="kft__hdr-1">
                <th rowspan="2" class="kft__no">№</th>
                <th colspan="3" class="kft__grp kft__grp--neutral">Tovar</th>
                <th colspan="2" class="kft__grp kft__grp--pink">Miqdor</th>
                <th class="kft__grp kft__grp--neutral">1 pach</th>
                <th colspan="3" class="kft__grp kft__grp--blue">Narx</th>
                <th colspan="2" class="kft__grp kft__grp--green">Summa</th>
                <th colspan="2" class="kft__grp kft__grp--yellow">Natsenkа %</th>
                <th colspan="2" class="kft__grp kft__grp--teal">Chakana</th>
                <th colspan="2" class="kft__grp kft__grp--purple">Ulgurji</th>
                <th rowspan="2" class="kft__del-col"></th>
              </tr>
              <tr class="kft__hdr-2">
                <th class="kft__h-bar">Shtrix</th>
                <th class="kft__name-col">Nomi</th>
                <th class="kft__h-sm">Qoldiq</th>
                <th class="kft__grp--pink kft__h-sm">Pach</th>
                <th class="kft__grp--pink kft__h-sm">Dona</th>
                <th class="kft__h-sm">1pach</th>
                <th class="kft__grp--blue kft__h-sm">Pach nar.</th>
                <th class="kft__grp--blue kft__h-sm">Don nar.</th>
                <th class="kft__grp--blue kft__h-sm">Sebes.</th>
                <th class="kft__grp--green kft__h-md">Summa</th>
                <th class="kft__grp--green kft__h-md">Seb.sum</th>
                <th class="kft__grp--yellow kft__h-sm">Chak%</th>
                <th class="kft__grp--yellow kft__h-sm">Ulg%</th>
                <th class="kft__grp--teal kft__h-md">So'm</th>
                <th class="kft__grp--teal kft__h-sm">$</th>
                <th class="kft__grp--purple kft__h-md">So'm</th>
                <th class="kft__grp--purple kft__h-sm">$</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in form.items" :key="item._key" class="kft__row">
                <td class="kft__no ta-c">{{ idx + 1 }}</td>
                <td><input v-model="item.barcode" class="kft__inp" placeholder="..." /></td>
                <td class="kft__name-col">
                  <input
                    :value="productSearch[item._key] ?? item.productName"
                    class="kft__inp kft__inp--name"
                    placeholder="Mahsulot nomi..."
                    autocomplete="off"
                    @input="onProductInput(item, $event.target.value)"
                    @focus="onProductFocus(item, $event)"
                    @blur="onProductBlur(item)"
                    @keydown.enter="onRowEnter(idx)"
                  />
                  <Teleport to="body">
                    <div v-if="productOpen[item._key]" class="kft__prod-drop" :style="dropdownPos[item._key]">
                      <div v-if="!productResults[item._key]?.length" class="kft__prod-loading">Qidirilmoqda...</div>
                      <button v-for="p in productResults[item._key]" :key="p.id" class="kft__prod-opt" @mousedown.prevent="selectProduct(item, p)">
                        <div class="kft__prod-opt-row">
                          <span class="kft__prod-opt-name">{{ p.name }}</span>
                          <span class="kft__prod-opt-qty" :class="p.qty > 0 ? 'qty--ok' : 'qty--zero'">{{ p.qty }}</span>
                        </div>
                        <span class="kft__prod-opt-info">{{ p.code }}{{ p.barcodes?.[0] ? ' · ' + p.barcodes[0] : '' }}</span>
                      </button>
                    </div>
                  </Teleport>
                </td>
                <td class="ta-r kft__stock">{{ item.stockQty }}</td>
                <td><input v-model.number="item.pkgQty"           type="number" class="kft__inp ta-r kft__grp--pink"   @input="recalcItem(item)" /></td>
                <td><input v-model.number="item.unitQty"          type="number" class="kft__inp ta-r kft__grp--pink"   @change="recalcItem(item)" /></td>
                <td><input v-model.number="item.unitsPerPkg"      type="number" class="kft__inp ta-r"                  @change="recalcItem(item)" /></td>
                <td><input v-model.number="item.pkgPrice"         type="number" class="kft__inp ta-r kft__grp--blue"   @input="recalcItem(item)" /></td>
                <td><input v-model.number="item.unitPrice"        type="number" class="kft__inp ta-r kft__grp--blue"   @input="recalcItem(item)" /></td>
                <td class="ta-r kft__grp--blue kft__ro">{{ fmt(item.costPrice) }}</td>
                <td class="ta-r kft__grp--green kft__ro">{{ fmt(item.totalSum) }}</td>
                <td class="ta-r kft__grp--green kft__ro">{{ fmt(item.totalCostSum) }}</td>
                <td><input v-model.number="item.retailMarkupPct"    type="number" class="kft__inp ta-r kft__grp--yellow" @input="recalcItem(item)" /></td>
                <td><input v-model.number="item.wholesaleMarkupPct" type="number" class="kft__inp ta-r kft__grp--yellow" @input="recalcItem(item)" /></td>
                <td class="ta-r kft__grp--teal kft__ro">{{ fmt(item.retailPriceSum) }}</td>
                <td class="ta-r kft__grp--teal kft__ro">{{ fmtD(item.retailPriceUsd, 2) }}</td>
                <td class="ta-r kft__grp--purple kft__ro">{{ fmt(item.wholesalePriceSum) }}</td>
                <td class="ta-r kft__grp--purple kft__ro">{{ fmtD(item.wholesalePriceUsd, 2) }}</td>
                <td>
                  <div class="kft__row-acts">
                    <button
                      v-if="item.productName"
                      class="kft__label-btn"
                      @click="printRowLabel(item)"
                      title="Yorliq chop etish"
                      tabindex="-1"
                    >
                      <AppIcon name="printer" :size="12" :stroke-width="2.3"/>
                    </button>
                    <button class="kft__del-btn" @click="removeRow(idx)" tabindex="-1">
                      <AppIcon name="x" :size="11" :stroke-width="3"/>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="kft__foot">
                <td colspan="4" class="ta-r kft__foot-lbl">Jami:</td>
                <td class="ta-r kft__grp--pink kft__foot-val">{{ fmtD(formTotalUnits, 0) }}</td>
                <td colspan="4"></td>
                <td class="ta-r kft__grp--green kft__foot-val">{{ fmt(formTotalSum) }}</td>
                <td class="ta-r kft__grp--green kft__foot-val">{{ fmt(formTotalCost) }}</td>
                <td colspan="6"></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- Mobile: card-per-item list, replaces .kft table at ≤768px -->
        <div class="kfm-list">
          <div
            v-for="(item, idx) in form.items" :key="'m'+item._key"
            class="kfm-card" :class="{ 'kfm-card--open': isMobileExpanded(item) }" :style="{ '--i': Math.min(idx, 12) }"
          >
            <!-- Collapsed summary row: tap to expand -->
            <button class="kfm-card__summary" @click="toggleMobileCard(item)">
              <span class="kfm-card__no">{{ idx + 1 }}</span>
              <span class="kfm-card__summary-info">
                <span class="kfm-card__summary-name">{{ item.productName || productSearch[item._key] || 'Mahsulot tanlanmagan' }}</span>
                <span class="kfm-card__summary-meta">{{ fmtD(item.unitQty, 0) }} dona · {{ fmt(item.totalSum) }} so'm</span>
              </span>
              <button class="kfm-card__del" @click.stop="removeRow(idx)" tabindex="-1">
                <AppIcon name="x" :size="13" :stroke-width="3"/>
              </button>
              <span class="kfm-card__chevron"><AppIcon name="chevron-down" :size="16" :stroke-width="2.3"/></span>
            </button>

            <div v-if="isMobileExpanded(item)" class="kfm-card__body">
              <div class="kfm-field kfm-field--name">
                <span class="kf__meta-lbl">Mahsulot nomi</span>
                <input
                  :value="productSearch[item._key] ?? item.productName"
                  class="kfm-inp kfm-inp--name"
                  placeholder="Mahsulot nomi..."
                  autocomplete="off"
                  @input="onProductInput(item, $event.target.value)"
                  @focus="onProductFocus(item, $event)"
                  @blur="onProductBlur(item)"
                  @keydown.enter="onRowEnter(idx)"
                />
                <Teleport to="body">
                  <div v-if="productOpen[item._key]" class="kft__prod-drop" :style="dropdownPos[item._key]">
                    <div v-if="!productResults[item._key]?.length" class="kft__prod-loading">Qidirilmoqda...</div>
                    <button v-for="p in productResults[item._key]" :key="p.id" class="kft__prod-opt" @mousedown.prevent="selectProduct(item, p)">
                      <div class="kft__prod-opt-row">
                        <span class="kft__prod-opt-name">{{ p.name }}</span>
                        <span class="kft__prod-opt-qty" :class="p.qty > 0 ? 'qty--ok' : 'qty--zero'">{{ p.qty }}</span>
                      </div>
                      <span class="kft__prod-opt-info">{{ p.code }}{{ p.barcodes?.[0] ? ' · ' + p.barcodes[0] : '' }}</span>
                    </button>
                  </div>
                </Teleport>
              </div>

              <div class="kfm-row2">
                <div class="kfm-field">
                  <span class="kf__meta-lbl">Shtrix</span>
                  <input v-model="item.barcode" class="kfm-inp" placeholder="..." />
                </div>
                <div class="kfm-field">
                  <span class="kf__meta-lbl">Qoldiq</span>
                  <div class="kfm-inp kfm-inp--ro">{{ item.stockQty }}</div>
                </div>
              </div>

              <div class="kfm-grp kfm-grp--pink">
                <p class="kfm-grp__title">Miqdor</p>
                <div class="kfm-grp__row">
                  <div class="kfm-field"><span class="kf__meta-lbl">Pach</span><input v-model.number="item.pkgQty" type="number" class="kfm-inp" @input="recalcItem(item)" /></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">Dona</span><input v-model.number="item.unitQty" type="number" class="kfm-inp" @change="recalcItem(item)" /></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">1 pach</span><input v-model.number="item.unitsPerPkg" type="number" class="kfm-inp" @change="recalcItem(item)" /></div>
                </div>
              </div>

              <div class="kfm-grp kfm-grp--blue">
                <p class="kfm-grp__title">Narx</p>
                <div class="kfm-grp__row">
                  <div class="kfm-field"><span class="kf__meta-lbl">Pach nar.</span><input v-model.number="item.pkgPrice" type="number" class="kfm-inp" @input="recalcItem(item)" /></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">Don nar.</span><input v-model.number="item.unitPrice" type="number" class="kfm-inp" @input="recalcItem(item)" /></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">Sebes.</span><div class="kfm-inp kfm-inp--ro">{{ fmt(item.costPrice) }}</div></div>
                </div>
              </div>

              <div class="kfm-grp kfm-grp--green">
                <p class="kfm-grp__title">Summa</p>
                <div class="kfm-grp__row">
                  <div class="kfm-field"><span class="kf__meta-lbl">Summa</span><div class="kfm-inp kfm-inp--ro">{{ fmt(item.totalSum) }}</div></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">Seb. summa</span><div class="kfm-inp kfm-inp--ro">{{ fmt(item.totalCostSum) }}</div></div>
                </div>
              </div>

              <div class="kfm-grp kfm-grp--yellow">
                <p class="kfm-grp__title">Narx belgilash</p>
                <div class="kfm-grp__row">
                  <div class="kfm-field"><span class="kf__meta-lbl">Chakana %</span><input v-model.number="item.retailMarkupPct" type="number" class="kfm-inp" @input="recalcItem(item)" /></div>
                  <div class="kfm-field"><span class="kf__meta-lbl">Ulgurji %</span><input v-model.number="item.wholesaleMarkupPct" type="number" class="kfm-inp" @input="recalcItem(item)" /></div>
                </div>
                <div class="kfm-preview">
                  <span class="kfm-preview__chip kfm-preview__chip--teal">Chakana: <strong>{{ fmt(item.retailPriceSum) }}</strong> so'm · ${{ fmtD(item.retailPriceUsd, 2) }}</span>
                  <span class="kfm-preview__chip kfm-preview__chip--purple">Ulgurji: <strong>{{ fmt(item.wholesalePriceSum) }}</strong> so'm · ${{ fmtD(item.wholesalePriceUsd, 2) }}</span>
                </div>
              </div>

              <button v-if="item.productName" class="kfm-card__label-btn" @click="printRowLabel(item)">
                <AppIcon name="printer" :size="14" :stroke-width="2.3"/> Yorliq chop etish
              </button>

              <button class="kfm-card__collapse" @click="toggleMobileCard(item)">
                <AppIcon name="chevron-up" :size="14" :stroke-width="2.3"/> Yopish
              </button>
            </div>
          </div>

          <button class="kfm-add-row" @click="addRow">
            <AppIcon name="plus" :size="16" :stroke-width="2.5"/> Qator qo'shish
          </button>
        </div>

        <!-- Footer row -->
        <div class="kf__footer">
          <div class="kf__footer-l">
            <button class="kf__add-row-btn" @click="addRow">
              <AppIcon name="plus" :size="14" :stroke-width="2.5"/> Qator qo'shish
              <kbd>F1</kbd>
            </button>
            <textarea v-model="form.comment" class="kf__comment" placeholder="Kommentariy..." rows="1"></textarea>
          </div>
          <div class="kf__footer-summary">
            <div class="kf__sum-row"><span>Jami summa:</span><strong>{{ fmt(formTotalSum) }} so'm</strong></div>
            <div class="kf__sum-row"><span>Rasxod:</span><strong>{{ fmt(form.expense) }} so'm</strong></div>
            <div class="kf__sum-row kf__sum-row--total"><span>Umumiy:</span><strong>{{ fmt(formTotalSum + Number(form.expense)) }} so'm</strong></div>
          </div>
        </div>
      </div>

      <!-- Mobile backdrop for size bottom-sheet -->
      <div v-if="showSizePanel" class="sz-backdrop" @click="showSizePanel = false"></div>

      <!-- ══ SIZE PANEL ════════════════════════════════════════════ -->
      <div v-if="showSizePanel" class="sz-panel">
        <div class="sz-panel__drag" @click="showSizePanel = false"><span class="sz-panel__handle"></span></div>
        <div class="sz-panel__hdr">
          <span class="sz-panel__title">
            <AppIcon name="layers" :size="14" />
            Razmerlar bo'yicha
          </span>
          <button class="sz-panel__close" @click="showSizePanel = false">
            <AppIcon name="x" :size="13" :stroke-width="2.5" />
          </button>
        </div>

        <div class="sz-panel__desc">
          Tovar nomini yozing → razmerlarni toping → miqdor kiriting → jadvalga qo'shing
        </div>

        <!-- Search -->
        <div class="sz-panel__search">
          <AppIcon name="search" :size="12" class="sz-panel__search-ico" />
          <input
            v-model="sizePanelQuery"
            class="sz-panel__search-inp"
            placeholder="Masalan: Futbolka oq..."
            autocomplete="off"
          />
          <button v-if="sizePanelQuery" class="sz-panel__search-clr" @click="sizePanelQuery = ''; sizePanelProds = []">
            <AppIcon name="x" :size="10" :stroke-width="3" />
          </button>
        </div>

        <!-- Results list -->
        <div class="sz-panel__list">
          <div v-if="!sizePanelQuery.trim()" class="sz-panel__hint">
            <AppIcon name="search" :size="22" :stroke-width="1.2" />
            <p>Tovar nomi yoki razmer kiriting</p>
          </div>
          <div v-else-if="!sizePanelProds.length" class="sz-panel__hint">
            <AppIcon name="package" :size="22" :stroke-width="1.2" />
            <p>Tovar topilmadi</p>
          </div>
          <div v-else class="sz-panel__items">
            <div
              v-for="prod in sizePanelProds"
              :key="prod.id"
              class="sz-panel__item"
              :class="{ 'has-qty': sizePanelQtys[prod.id] > 0 }"
            >
              <!-- Product name + current stock -->
              <div class="sz-panel__item-info">
                <span class="sz-panel__item-name">{{ prod.name }}</span>
                <span class="sz-panel__item-stock" :class="prod.qty > 0 ? 'stock-ok' : 'stock-zero'">
                  {{ prod.qty }} don
                </span>
              </div>

              <!-- Current retail price reference -->
              <div class="sz-panel__item-ref">
                <span class="sz-ref-lbl">Joriy sotuv:</span>
                <span class="sz-ref-val">{{ fmt(prod.retailPrice) }} so'm</span>
              </div>

              <!-- Input fields: qty | kirim narxi | markup % -->
              <div class="sz-panel__item-inputs">
                <div class="sz-inp-col">
                  <label class="sz-inp-lbl">Dona</label>
                  <input
                    v-model.number="sizePanelQtys[prod.id]"
                    type="number" min="0"
                    class="sz-panel__qty"
                    placeholder="0"
                  />
                </div>
                <div class="sz-inp-col sz-inp-col--grow">
                  <label class="sz-inp-lbl">Kirim narxi</label>
                  <input
                    v-model.number="sizePanelBuyPrice[prod.id]"
                    type="number" min="0"
                    class="sz-panel__price"
                    placeholder="0"
                  />
                </div>
                <div class="sz-inp-col sz-inp-col--sm">
                  <label class="sz-inp-lbl">Nats%</label>
                  <input
                    v-model.number="sizePanelMarkup[prod.id]"
                    type="number" min="0"
                    class="sz-panel__markup"
                    placeholder="30"
                  />
                </div>
              </div>

              <!-- Calculated retail price preview -->
              <div v-if="sizePanelBuyPrice[prod.id] > 0" class="sz-panel__sell-preview">
                <AppIcon name="tag" :size="11" :stroke-width="2" />
                Sotuv narxi: <strong>{{ fmt(szCalcSell(prod.id)) }} so'm</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Panel footer -->
        <div class="sz-panel__footer">
          <div v-if="sizePanelSelected.length" class="sz-panel__summary">
            <span class="sz-sum-chip">{{ sizePanelSelected.length }} ta razmer</span>
            <span class="sz-sum-chip sz-sum-chip--green">{{ sizePanelTotalQty }} dona</span>
          </div>
          <div class="sz-panel__footer-btns">
            <button
              v-if="sizePanelSelected.length"
              class="sz-panel__clear-btn"
              @click="clearSizePanel"
            >Tozalash</button>
            <button
              class="sz-panel__add-btn"
              :disabled="!sizePanelSelected.length"
              @click="addSizePanelItems"
            >
              <AppIcon name="plus" :size="13" :stroke-width="2.5" />
              Jadvalga qo'shish
            </button>
          </div>
        </div>
      </div>

    </div><!-- end kf__content -->
  </div><!-- end form page -->

</div>
</template>

<style scoped>
.kir { display: contents; }

/* ═══ LIST ════════════════════════════════════════════════════════ */
.kir__list { display: flex; flex-direction: column; height: calc(100vh - var(--header-h)); overflow: hidden; }
.kir__topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; gap: 16px; }
.kir__topbar-l { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.kir__title { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; white-space: nowrap; }
.kir__search { position: relative; display: flex; align-items: center; max-width: 300px; flex: 1; }
.kir__search-ico { position: absolute; left: 11px; color: var(--color-text-3); pointer-events: none; }
.kir__search-inp { width: 100%; height: 36px; padding: 0 12px 0 32px; border: 1.5px solid var(--color-border); border-radius: var(--r-lg); font-size: 13px; font-family: inherit; color: var(--color-text); background: var(--color-surface); outline: none; transition: border-color var(--t-base); }
.kir__search-inp:focus { border-color: var(--indigo-400); }
.kir__add-btn { display: flex; align-items: center; gap: 7px; padding: 0 18px; height: 38px; border-radius: var(--r-lg); background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); color: white; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; flex-shrink: 0; box-shadow: var(--shadow-indigo); transition: opacity var(--t-base), transform var(--t-base); }
.kir__add-btn:hover { opacity: 0.9; transform: translateY(-1px); }
.kir__add-btn--sm { padding: 0 14px; height: 34px; font-size: 12px; margin-top: 4px; }
.kir__stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; padding: 14px 24px; flex-shrink: 0; }
.kstat { display: flex; align-items: center; gap: 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-lg); padding: 12px 16px; box-shadow: var(--shadow-xs); }
.kstat__ico { width: 36px; height: 36px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kstat__ico--indigo { background: var(--indigo-50);  color: var(--indigo-500); }
.kstat__ico--green  { background: var(--emerald-50); color: var(--emerald-600); }
.kstat__ico--amber  { background: var(--amber-50);   color: var(--amber-600); }
.kstat__ico--violet { background: #f5f3ff;            color: var(--violet-600); }
.kstat__val { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.04em; line-height: 1.1; }
.kstat__lbl { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }
.kir__filters { display: flex; gap: 8px; padding: 10px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.kir__filter-sel { height: 34px; padding: 0 10px; border: 1.5px solid var(--color-border); border-radius: var(--r-md); font-size: 12.5px; font-family: inherit; color: var(--color-text); background: var(--color-surface); outline: none; cursor: pointer; }
.kir__err { display: flex; align-items: center; gap: 8px; margin: 0 24px; padding: 8px 12px; background: var(--rose-50); border: 1px solid var(--rose-100); border-radius: var(--r-md); font-size: 12px; color: var(--rose-600); flex-shrink: 0; }
.kir__err-retry { margin-left: auto; font-size: 11px; font-weight: 700; font-family: inherit; color: var(--rose-600); cursor: pointer; text-decoration: underline; }
.kir__table-wrap { flex: 1; overflow-y: auto; padding: 0 24px 24px; }
.kir__loading { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; }
.kir__skel-row { height: 52px; border-radius: var(--r-md); }
.kir__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px; color: var(--color-text-3); font-size: 13px; }
.ktbl { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.ktbl thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); background: var(--slate-50); border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
.ktbl__row { cursor: pointer; transition: background var(--t-fast); border-bottom: 1px solid var(--color-border-sub); }
.ktbl__row:last-child { border-bottom: none; }
.ktbl__row:hover td { background: var(--indigo-50); }
.ktbl__row td { padding: 11px 12px; font-size: 13px; vertical-align: middle; }
.doc-num { font-family: monospace; font-weight: 800; color: var(--indigo-600); background: var(--indigo-50); padding: 2px 8px; border-radius: var(--r-xs); }
.ktbl__date { color: var(--color-text-2); font-size: 12.5px; }
.ktbl__supplier { font-weight: 600; color: var(--color-text); }
.wh-tag { background: var(--slate-100); color: var(--color-text-2); padding: 3px 8px; border-radius: var(--r-sm); font-size: 12px; }
.items-badge { background: var(--emerald-50); color: var(--emerald-700); padding: 2px 8px; border-radius: 99px; font-size: 11.5px; font-weight: 700; }
.ktbl__usd { font-weight: 700; color: var(--emerald-600); }
.ktbl__sum { font-weight: 800; color: var(--color-text); }
.cur { font-size: 11px; color: var(--color-text-3); font-weight: 400; }
.st-badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; }
.st--draft  { background: var(--amber-50);   color: var(--amber-600);   border: 1px solid var(--amber-100); }
.st--ok     { background: var(--emerald-50); color: var(--emerald-700); border: 1px solid var(--emerald-100); }
.st--cancel { background: var(--rose-50);    color: var(--rose-600);    border: 1px solid var(--rose-100); }
.ktbl__acts { display: flex; gap: 3px; }
.ktbl__act { width: 28px; height: 28px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--t-fast); color: var(--color-text-3); }
.ktbl__act--edit:hover  { background: var(--indigo-50);  color: var(--indigo-500); }
.ktbl__act--ok:hover    { background: var(--emerald-50); color: var(--emerald-600); }
.ktbl__act--del:hover   { background: var(--rose-50);    color: var(--rose-500); }
.ktbl__act--warn:hover  { background: var(--amber-50);   color: var(--amber-600); }
.ta-c { text-align: center; }
.ta-r { text-align: right; }

/* ═══ FORM ════════════════════════════════════════════════════════ */
.kir__form-page { position: fixed; inset: 0; z-index: 200; display: flex; flex-direction: column; background: #f0f2f7; overflow: hidden; }

/* Header */
.kf__hdr { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: white; border-bottom: 1px solid var(--color-border); flex-shrink: 0; box-shadow: var(--shadow-sm); }
.kf__hdr-l { display: flex; align-items: center; gap: 10px; }
.kf__hdr-ico { width: 34px; height: 34px; border-radius: var(--r-md); background: linear-gradient(135deg, var(--emerald-500), var(--cyan-500)); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
.kf__hdr-title { font-size: 14px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; white-space: nowrap; }
.kf__kurs { display: flex; align-items: center; gap: 7px; padding: 0 12px; border-left: 1px solid var(--color-border); border-right: 1px solid var(--color-border); }
.kf__kurs-lbl { font-size: 11.5px; font-weight: 600; color: var(--color-text-3); white-space: nowrap; }
.kf__kurs-inp { width: 80px; height: 30px; padding: 0 8px; text-align: right; border: 1.5px solid var(--color-border); border-radius: var(--r-sm); font-size: 13px; font-weight: 700; font-family: inherit; outline: none; transition: border-color var(--t-base); }
.kf__kurs-inp:focus { border-color: var(--indigo-400); }
.kf__hotkeys { display: flex; align-items: center; gap: 10px; padding: 0 10px; flex: 1; }
.kf__hotkeys span { font-size: 11px; color: var(--color-text-3); white-space: nowrap; }
.kf__hotkeys kbd { display: inline-block; padding: 1px 5px; font-size: 10px; background: var(--slate-100); border: 1px solid var(--slate-300); border-radius: 4px; color: var(--color-text-2); margin-right: 3px; font-family: inherit; }
.kf__hdr-acts { display: flex; align-items: center; gap: 6px; }
.kf__save-err { font-size: 11px; color: var(--rose-500); max-width: 160px; }
.kf__btn { display: flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: var(--r-md); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: opacity var(--t-base), transform var(--t-base); white-space: nowrap; }
.kf__btn:disabled { opacity: 0.6; cursor: not-allowed; }
.kf__btn--save    { background: var(--indigo-500); color: white; }
.kf__btn--save:not(:disabled):hover { opacity: 0.88; }
.kf__btn--confirm { background: linear-gradient(135deg, var(--emerald-500), var(--cyan-500)); color: white; }
.kf__btn--confirm:not(:disabled):hover { opacity: 0.88; }
.kf__btn--close   { background: var(--rose-50); color: var(--rose-500); border: 1px solid var(--rose-100); padding: 0 10px; }
.kf__btn--close:hover { background: var(--rose-100); }
.kf__btn-close-top { display: none; }

/* Meta row */
.kf__meta { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; padding: 8px 14px; background: white; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.kf__meta-field { display: flex; flex-direction: column; gap: 3px; }
.kf__meta-field--wide { min-width: 130px; }
.kf__meta-field--xl   { flex: 1; min-width: 150px; }
.kf__meta-lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-text-3); }
.kf__meta-val--num { height: 34px; min-width: 56px; display: flex; align-items: center; justify-content: center; background: var(--indigo-50); border: 1.5px solid var(--indigo-100); border-radius: var(--r-md); font-size: 15px; font-weight: 900; color: var(--indigo-600); padding: 0 10px; }
.kf__meta-inp { height: 34px; padding: 0 9px; border: 1.5px solid var(--color-border); border-radius: var(--r-md); font-size: 12.5px; font-family: inherit; color: var(--color-text); background: white; outline: none; transition: border-color var(--t-base); }
.kf__meta-inp:focus { border-color: var(--indigo-400); }
.kf__meta-inp--sel { cursor: pointer; }

/* Content area: table + size panel */
.kf__content { flex: 1; display: flex; overflow: hidden; }
.kf__table-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* Scan bar */
.kf__scan-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  background: white;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.kf__scan-ico { color: var(--indigo-400); flex-shrink: 0; }
.kf__scan-lbl { font-size: 11.5px; font-weight: 600; color: var(--color-text-3); white-space: nowrap; }
.kf__scan-inp {
  flex: 1; max-width: 320px; height: 30px; padding: 0 10px;
  border: 1.5px solid var(--indigo-200); border-radius: var(--r-md);
  font-size: 12.5px; font-family: inherit; outline: none;
  background: var(--indigo-50); color: var(--color-text);
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.kf__scan-inp:focus { border-color: var(--indigo-400); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); background: white; }
.kf__scan-inp::placeholder { color: var(--indigo-300); }
.kf__scan-btn {
  display: flex; align-items: center; gap: 5px;
  height: 30px; padding: 0 12px; border-radius: var(--r-md);
  background: var(--indigo-500); color: white;
  font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: opacity var(--t-base);
}
.kf__scan-btn:hover { opacity: 0.85; }
.kf__scan-sep { width: 1px; height: 20px; background: var(--color-border); flex-shrink: 0; }
.kf__size-toggle {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px; border-radius: var(--r-md);
  background: var(--color-surface); color: var(--color-text-2);
  border: 1.5px solid var(--color-border);
  font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  white-space: nowrap;
}
.kf__size-toggle:hover  { background: var(--indigo-50); color: var(--indigo-600); border-color: var(--indigo-200); }
.kf__size-toggle.active { background: var(--indigo-500); color: white; border-color: var(--indigo-500); }
.kf__size-badge {
  min-width: 18px; height: 18px; border-radius: 99px; padding: 0 4px;
  background: white; color: var(--indigo-600); font-size: 10px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
}
.kf__size-toggle.active .kf__size-badge { background: rgba(255,255,255,0.25); color: white; }
.kf__print-all-btn {
  display: flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px; border-radius: var(--r-md);
  background: var(--color-surface); color: var(--color-text-2);
  border: 1.5px solid var(--color-border);
  font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  white-space: nowrap;
}
.kf__print-all-btn:hover:not(:disabled) { background: var(--indigo-50); color: var(--indigo-600); border-color: var(--indigo-200); }
.kf__print-all-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* Items table */
.kf__table-wrap { flex: 1; overflow: auto; scrollbar-width: thin; scrollbar-color: #c7d2fe #f0f2f7; }
.kf__table-wrap::-webkit-scrollbar { width: 5px; height: 5px; }
.kf__table-wrap::-webkit-scrollbar-track { background: #f0f2f7; }
.kf__table-wrap::-webkit-scrollbar-thumb { background: #c7d2fe; border-radius: 4px; }
.kft { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: fixed; }
.kft__hdr-1 th, .kft__hdr-2 th { padding: 4px; border: 1px solid #d1d5db; white-space: nowrap; font-size: 10px; font-weight: 700; text-align: center; position: sticky; z-index: 2; overflow: hidden; }
.kft__hdr-1 th { background: #e2e5ef; top: 0; }
.kft__hdr-2 th { background: #ebeef5; top: 24px; }
.kft__grp { text-align: center; font-weight: 800; letter-spacing: 0.02em; }
.kft__grp--neutral { background: #e2e5ef !important; }
.kft__grp--pink    { background: #fce7f3 !important; }
.kft__grp--blue    { background: #dbeafe !important; }
.kft__grp--green   { background: #d1fae5 !important; }
.kft__grp--yellow  { background: #fef9c3 !important; }
.kft__grp--teal    { background: #ccfbf1 !important; }
.kft__grp--purple  { background: #ede9fe !important; }
.kft__no       { width: 30px; text-align: center; }
.kft__h-bar    { width: 76px; }
.kft__name-col { width: auto; min-width: 160px; }
.kft__h-sm     { width: 52px; }
.kft__h-md     { width: 74px; }
.kft__del-col  { width: 46px; }
.kft__row { border-bottom: 1px solid #e5e7eb; }
.kft__row:hover td { background: #f5f7ff; }
.kft__row td { padding: 0; border-right: 1px solid #e5e7eb; vertical-align: middle; }
.kft__inp { width: 100%; height: 30px; padding: 0 4px; border: none; outline: none; background: transparent; font-size: 11.5px; font-family: inherit; color: var(--color-text); text-align: inherit; min-width: 0; }
.kft__inp:focus { background: #eff6ff; box-shadow: inset 0 0 0 1.5px #818cf8; }
.kft__inp--name { padding: 0 6px; }
.kft__stock { padding: 0 5px; color: var(--color-text-2); font-size: 11px; text-align: right; }
.kft__ro    { padding: 0 5px; color: var(--color-text); font-weight: 600; font-size: 11.5px; white-space: nowrap; text-align: right; }
.kft__prod-drop { position: fixed; z-index: 9999; background: white; border: 1.5px solid var(--indigo-200); border-radius: var(--r-md); box-shadow: 0 8px 32px rgba(99,102,241,0.18); max-height: 260px; overflow-y: auto; }
.kft__prod-loading { padding: 10px 14px; font-size: 12px; color: var(--color-text-3); }
.kft__prod-opt { width: 100%; display: flex; flex-direction: column; align-items: flex-start; padding: 7px 12px; cursor: pointer; border-bottom: 1px solid var(--color-border-sub); transition: background var(--t-fast); text-align: left; }
.kft__prod-opt:last-child { border-bottom: none; }
.kft__prod-opt:hover { background: var(--indigo-50); }
.kft__prod-opt-row { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; }
.kft__prod-opt-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.kft__prod-opt-qty { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 99px; white-space: nowrap; }
.qty--ok   { background: var(--emerald-50); color: var(--emerald-700); }
.qty--zero { background: var(--rose-50);    color: var(--rose-500); }
.kft__prod-opt-info { font-size: 11px; color: var(--color-text-3); margin-top: 1px; }
.kf__sugg-drop { background: white; border: 1.5px solid var(--indigo-200); border-radius: var(--r-md); box-shadow: 0 8px 28px rgba(99,102,241,0.12); margin-top: 2px; }
.kf__sugg-opt { width: 100%; text-align: left; padding: 7px 12px; font-size: 13px; font-weight: 500; color: var(--color-text); cursor: pointer; border-bottom: 1px solid var(--color-border-sub); transition: background var(--t-fast); display: flex; flex-direction: column; gap: 1px; }
.kf__sugg-opt:last-child { border-bottom: none; }
.kf__sugg-opt:hover { background: var(--indigo-50); }
.kf__sugg-empty { padding: 10px 14px; font-size: 12px; color: var(--color-text-3); text-align: center; }
.kf__sugg-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.kf__sugg-debt { font-size: 10.5px; color: var(--rose-500); font-weight: 600; }
.kf__sugg-credit { font-size: 10.5px; color: var(--emerald-600); font-weight: 600; }
.kf__sup-wrap { }
.kf__sup-inp { flex: 1; min-width: 0; }
.kf__sup-x { width: 22px; height: 22px; border-radius: 50%; background: var(--slate-100); color: var(--color-text-3); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: background var(--t-fast), color var(--t-fast); }
.kf__sup-x:hover { background: var(--rose-100); color: var(--rose-500); }
.kf__sup-info { display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 600; padding: 3px 6px; border-radius: var(--r-sm); margin-top: 3px; }
.kf__sup-info--debt { background: var(--rose-50); color: var(--rose-600); border: 1px solid var(--rose-100); }
.kf__sup-info--warn { background: var(--amber-50); color: var(--amber-700); border: 1px solid var(--amber-100); }
/* Pay button in list */
.ktbl__act--pay { }
.ktbl__act--pay:hover { background: var(--emerald-50); color: var(--emerald-600); }
.kft__del-btn { width: 24px; height: 24px; border-radius: var(--r-sm); margin: 0 1px; display: flex; align-items: center; justify-content: center; color: var(--rose-400); cursor: pointer; transition: all var(--t-fast); }
.kft__del-btn:hover { background: var(--rose-50); color: var(--rose-600); }
.kft__row-acts { display: flex; align-items: center; justify-content: center; gap: 2px; }
.kft__label-btn { width: 24px; height: 24px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; color: var(--indigo-400); cursor: pointer; transition: all var(--t-fast); }
.kft__label-btn:hover { background: var(--indigo-50); color: var(--indigo-600); }
.kft__foot td { background: #f1f5f9; font-weight: 800; padding: 6px 8px; border-top: 2px solid var(--color-border); }
.kft__foot-lbl { color: var(--color-text-2); font-size: 12px; }
.kft__foot-val { color: var(--color-text); font-size: 13px; }

/* Footer */
.kf__footer { display: flex; align-items: flex-start; gap: 16px; padding: 8px 14px; background: white; border-top: 1px solid var(--color-border); flex-shrink: 0; }
.kf__footer-l { display: flex; align-items: center; gap: 10px; flex: 1; }
.kf__add-row-btn { display: flex; align-items: center; gap: 6px; padding: 0 14px; height: 32px; border-radius: var(--r-md); background: var(--indigo-50); color: var(--indigo-600); border: 1.5px solid var(--indigo-200); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; transition: background var(--t-base); }
.kf__add-row-btn:hover { background: var(--indigo-100); }
.kf__add-row-btn kbd { display: inline-block; padding: 1px 5px; font-size: 10px; background: var(--indigo-100); border-radius: 4px; color: var(--indigo-600); margin-left: 2px; font-family: inherit; }
.kf__comment { flex: 1; resize: none; height: 32px; padding: 7px 10px; border: 1.5px solid var(--color-border); border-radius: var(--r-md); font-size: 12px; font-family: inherit; outline: none; transition: border-color var(--t-base); }
.kf__comment:focus { border-color: var(--indigo-400); }
.kf__footer-summary { display: flex; flex-direction: column; gap: 3px; min-width: 220px; padding: 5px 12px; background: var(--slate-50); border-radius: var(--r-md); border: 1px solid var(--color-border); }
.kf__sum-row { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: var(--color-text-2); }
.kf__sum-row strong { color: var(--color-text); font-weight: 700; }
.kf__sum-row--total { border-top: 1px solid var(--color-border); padding-top: 3px; margin-top: 2px; }
.kf__sum-row--total strong { color: var(--indigo-600); font-size: 13px; }

/* ═══ SIZE PANEL ══════════════════════════════════════════════════ */
.sz-panel {
  width: 340px; flex-shrink: 0;
  border-left: 1px solid var(--color-border);
  background: white;
  display: flex; flex-direction: column;
  overflow: hidden;
  animation: panel-in 0.18s ease;
}
@keyframes panel-in {
  from { transform: translateX(20px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
.sz-panel__hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.sz-panel__title {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 800; color: var(--color-text);
}
.sz-panel__close {
  width: 26px; height: 26px; border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-3); cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.sz-panel__close:hover { background: var(--rose-50); color: var(--rose-500); }
.sz-panel__desc {
  padding: 8px 14px; font-size: 11px; color: var(--color-text-3);
  background: var(--indigo-50); border-bottom: 1px solid var(--indigo-100);
  line-height: 1.5; flex-shrink: 0;
}
.sz-panel__search {
  position: relative; display: flex; align-items: center;
  padding: 10px 12px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
}
.sz-panel__search-ico { position: absolute; left: 22px; color: var(--color-text-3); pointer-events: none; }
.sz-panel__search-inp {
  width: 100%; height: 34px; padding: 0 28px 0 28px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-lg);
  font-size: 12.5px; font-family: inherit; outline: none;
  transition: border-color var(--t-base);
}
.sz-panel__search-inp:focus { border-color: var(--indigo-400); }
.sz-panel__search-clr { position: absolute; right: 20px; width: 16px; height: 16px; border-radius: 50%; background: var(--slate-200); color: var(--color-text-3); display: flex; align-items: center; justify-content: center; cursor: pointer; }

.sz-panel__list { flex: 1; overflow-y: auto; }
.sz-panel__hint { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--color-text-3); text-align: center; }
.sz-panel__hint p { font-size: 12px; }
.sz-panel__items { padding: 6px; }
.sz-panel__item {
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px 10px; border-radius: var(--r-md);
  border: 1.5px solid transparent;
  transition: background var(--t-fast), border-color var(--t-fast);
  margin-bottom: 2px;
}
.sz-panel__item:hover { background: var(--slate-50); }
.sz-panel__item.has-qty { background: var(--indigo-50); border-color: var(--indigo-200); }
.sz-panel__item-info { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.sz-panel__item-name { font-size: 12.5px; font-weight: 600; color: var(--color-text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sz-panel__item-stock { font-size: 10.5px; font-weight: 700; padding: 1px 6px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
.stock-ok   { background: var(--emerald-50); color: var(--emerald-700); }
.stock-zero { background: var(--rose-50);    color: var(--rose-500); }
.sz-panel__item-ref {
  display: flex; align-items: center; gap: 5px;
  font-size: 10.5px; color: var(--color-text-3);
}
.sz-ref-val { font-weight: 600; color: var(--color-text-2); }

.sz-panel__item-inputs { display: flex; gap: 5px; align-items: flex-end; }
.sz-inp-col { display: flex; flex-direction: column; gap: 2px; }
.sz-inp-col--grow { flex: 1; }
.sz-inp-col--sm { width: 52px; }
.sz-inp-lbl {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--color-text-3); padding: 0 2px;
}
.sz-panel__qty {
  width: 52px; height: 30px; padding: 0 6px; text-align: center;
  border: 1.5px solid var(--color-border); border-radius: var(--r-sm);
  font-size: 13px; font-weight: 700; font-family: inherit; outline: none;
  transition: border-color var(--t-base);
}
.sz-panel__qty:focus { border-color: var(--indigo-400); }
.sz-panel__price {
  width: 100%; height: 30px; padding: 0 6px; text-align: right;
  border: 1.5px solid var(--emerald-300); border-radius: var(--r-sm);
  font-size: 12px; font-weight: 600; font-family: inherit; outline: none;
  background: var(--emerald-50);
  transition: border-color var(--t-base), background var(--t-base);
}
.sz-panel__price:focus { border-color: var(--emerald-500); background: white; }
.sz-panel__markup {
  width: 100%; height: 30px; padding: 0 4px; text-align: center;
  border: 1.5px solid var(--color-border); border-radius: var(--r-sm);
  font-size: 11.5px; font-family: inherit; outline: none;
  transition: border-color var(--t-base);
}
.sz-panel__markup:focus { border-color: var(--indigo-400); }
.sz-panel__sell-preview {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--indigo-600);
  background: var(--indigo-50); border: 1px solid var(--indigo-100);
  border-radius: var(--r-sm); padding: 3px 8px;
}
.sz-panel__sell-preview strong { font-weight: 800; }

.sz-panel__footer {
  border-top: 1px solid var(--color-border);
  padding: 10px 12px;
  flex-shrink: 0;
  background: var(--slate-50);
  display: flex; flex-direction: column; gap: 8px;
}
.sz-panel__summary { display: flex; gap: 6px; flex-wrap: wrap; }
.sz-sum-chip { padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; background: var(--indigo-50); color: var(--indigo-700); border: 1px solid var(--indigo-100); }
.sz-sum-chip--green { background: var(--emerald-50); color: var(--emerald-700); border-color: var(--emerald-100); }
.sz-panel__footer-btns { display: flex; gap: 6px; }
.sz-panel__clear-btn { height: 34px; padding: 0 12px; border-radius: var(--r-md); border: 1.5px solid var(--color-border); color: var(--color-text-2); font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background var(--t-fast); }
.sz-panel__clear-btn:hover { background: var(--slate-100); }
.sz-panel__add-btn {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white; font-size: 12.5px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: opacity var(--t-base), transform var(--t-fast);
  box-shadow: 0 3px 12px rgba(99,102,241,0.3);
}
.sz-panel__add-btn:hover:not(:disabled)  { opacity: 0.9; transform: translateY(-1px); }
.sz-panel__add-btn:active:not(:disabled) { transform: scale(0.98); }
.sz-panel__add-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

/* ═══ MOBILE (≤768px) ════════════════════════════════════════════ */
.ktbl-cards { display: none; }
.fab { display: none; }
.kfm-list { display: none; }
.sz-backdrop { display: none; }
.sz-panel__drag { display: none; }

@media (max-width: 768px) {
  :root { --bn-h: calc(58px + env(safe-area-inset-bottom, 0px)); }

  @keyframes kfm-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── LIST VIEW ─────────────────────────────────────────────── */
  .kir__list { height: calc(100vh - var(--header-h) - var(--bn-h)); }
  .kir__topbar { flex-direction: column; align-items: stretch; padding: 14px 14px 10px; gap: 10px; }
  .kir__topbar-l { flex-direction: column; align-items: stretch; gap: 10px; }
  .kir__title { font-size: 16px; }
  .kir__search { max-width: none; }
  .kir__search-inp { height: 44px; font-size: 14px; }
  .kir__add-btn { display: none; } /* replaced by FAB */

  .kir__stats { grid-template-columns: repeat(2, 1fr); padding: 12px 14px; gap: 10px; }
  .kstat { padding: 12px; }

  .kir__filters { flex-direction: column; padding: 10px 14px; gap: 8px; }
  .kir__filter-sel { width: 100%; height: 44px; font-size: 13.5px; }

  .kir__table-wrap { padding: 0 14px calc(24px + var(--bn-h)); overflow-x: hidden; }

  /* hide desktop table, show card list */
  .ktbl { display: none; }
  .ktbl-cards { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }

  .kdoc-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-sm);
    padding: 13px 14px;
    cursor: pointer;
    opacity: 0;
    animation: kfm-fade-up 0.3s var(--ease-spring) both;
    animation-delay: calc(var(--i, 0) * 45ms);
    transition: transform var(--t-fast), box-shadow var(--t-base);
  }
  .kdoc-card:active { transform: scale(0.97); box-shadow: var(--shadow-xs); }
  .kdoc-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .kdoc-card__supplier { font-size: 14px; font-weight: 700; color: var(--color-text); margin-bottom: 8px; }
  .kdoc-card__rows { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
  .kdoc-card__row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kdoc-card__lbl { font-size: 11px; color: var(--color-text-3); }
  .kdoc-card__val { font-size: 12.5px; color: var(--color-text-2); font-weight: 600; }
  .kdoc-card__totals {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px; border-radius: var(--r-md);
    background: var(--slate-50); margin-bottom: 10px;
  }
  .kdoc-card__usd { font-size: 13px; font-weight: 700; color: var(--emerald-600); }
  .kdoc-card__sum { font-size: 13.5px; font-weight: 800; color: var(--color-text); }
  .kdoc-card__acts { display: flex; gap: 8px; }
  .kdoc-card__act {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 40px; border-radius: var(--r-lg); border: 1.5px solid var(--color-border);
    background: var(--color-surface); color: var(--color-text-2);
    font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer;
    transition: transform var(--t-fast), background var(--t-base);
  }
  .kdoc-card__act:active { transform: scale(0.94); }
  .kdoc-card__act--icon { flex: 0 0 40px; }
  .kdoc-card__act--ok   { border-color: var(--emerald-100); background: var(--emerald-50); color: var(--emerald-700); }
  .kdoc-card__act--edit { border-color: var(--indigo-100);  background: var(--indigo-50);  color: var(--indigo-600); }
  .kdoc-card__act--del  { border-color: var(--rose-100);    background: var(--rose-50);    color: var(--rose-500); }
  .kdoc-card__act--warn { border-color: var(--amber-100);   background: var(--amber-50);   color: var(--amber-600); }

  /* FAB */
  @keyframes fab-in { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  .fab {
    display: flex; align-items: center; justify-content: center;
    position: fixed;
    right: 16px;
    bottom: calc(16px + 58px + env(safe-area-inset-bottom, 0px));
    width: 54px; height: 54px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
    color: white;
    border: none;
    box-shadow: 0 8px 22px rgba(99,102,241,0.4);
    cursor: pointer;
    z-index: 60;
    opacity: 0;
    animation: fab-in 0.3s var(--ease-spring) 0.2s both;
    transition: transform var(--t-fast);
  }
  .fab:active { transform: scale(0.9); }

  /* ── FORM VIEW ─────────────────────────────────────────────── */
  .kir__form-page { padding-bottom: var(--bn-h); }

  .kf__hdr {
    flex-wrap: wrap;
    position: sticky; top: 0; z-index: 5;
    padding: 8px 10px;
    gap: 8px;
  }
  .kf__hdr-l { flex: 1; min-width: 0; }
  .kf__hdr-title { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kf__btn-close-top {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: var(--r-md);
    background: var(--rose-50); color: var(--rose-500);
    border: 1px solid var(--rose-100); cursor: pointer; flex-shrink: 0;
    transition: transform var(--t-fast);
  }
  .kf__btn-close-top:active { transform: scale(0.92); }
  .kf__kurs { border-left: none; padding: 0 6px; order: 3; flex: 1 1 100%; justify-content: flex-start; }
  .kf__hotkeys { display: none; }
  .kf__hdr-acts {
    order: 4;
    flex: 1 1 100%;
    position: sticky;
    bottom: 0;
    left: 0; right: 0;
    background: white;
    padding: 8px 0 calc(8px + var(--bn-h));
    margin: 0 -10px -8px;
    box-shadow: 0 -4px 16px rgba(15,23,42,0.08);
    z-index: 4;
  }
  .kf__hdr-acts .kf__btn--close { display: none; } /* top close button used instead on mobile */
  .kf__btn { height: 44px; flex: 1; font-size: 13px; }
  .kf__save-err { width: 100%; flex: 1 1 100%; order: -1; }

  /* Meta row: stack 2-col grid */
  .kf__meta {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    padding: 10px;
  }
  .kf__meta-field--wide, .kf__meta-field--xl { grid-column: 1 / -1; }
  .kf__meta-inp, .kf__meta-val--num { height: 44px; font-size: 14px; width: 100%; }
  .kf__sup-wrap { position: relative; }

  /* Scan bar */
  .kf__scan-bar { flex-wrap: wrap; padding: 8px 10px; position: sticky; top: 0; z-index: 3; }
  .kf__scan-inp { max-width: none; flex: 1 1 100%; height: 44px; font-size: 14px; order: 1; }
  .kf__scan-lbl { order: 0; }
  .kf__scan-btn { height: 40px; order: 2; }
  .kf__scan-sep { display: none; }
  .kf__size-toggle { height: 40px; order: 3; flex: 1; justify-content: center; }

  /* Hide desktop spreadsheet table, show card list */
  .kf__table-wrap { display: none; }
  .kfm-list { display: flex; flex-direction: column; gap: 12px; padding: 10px; overflow-y: auto; flex: 1; }

  .kfm-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-sm);
    opacity: 0;
    overflow: hidden;
    animation: kfm-fade-up 0.28s var(--ease-spring) both;
    animation-delay: calc(var(--i, 0) * 40ms);
    transition: box-shadow var(--t-base), border-color var(--t-base);
  }
  .kfm-card--open { box-shadow: var(--shadow-md); border-color: var(--indigo-200); }

  /* Collapsed summary row — tap to expand */
  .kfm-card__summary {
    display: flex; align-items: center; gap: 10px;
    width: 100%; min-height: 56px; padding: 10px 12px;
    text-align: left; cursor: pointer;
    transition: background var(--t-fast);
  }
  .kfm-card__summary:active { background: var(--slate-50); }
  .kfm-card__no {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--indigo-50); color: var(--indigo-600);
    font-size: 11px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .kfm-card__summary-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .kfm-card__summary-name {
    font-size: 13.5px; font-weight: 700; color: var(--color-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .kfm-card__summary-meta { font-size: 11.5px; color: var(--color-text-3); font-weight: 600; }
  .kfm-card__chevron {
    display: flex; align-items: center; justify-content: center;
    color: var(--color-text-3); flex-shrink: 0;
    transition: transform var(--t-base);
  }
  .kfm-card--open .kfm-card__chevron { transform: rotate(180deg); color: var(--indigo-500); }
  .kfm-card__del {
    width: 32px; height: 32px; border-radius: var(--r-md);
    display: flex; align-items: center; justify-content: center;
    color: var(--rose-500); background: var(--rose-50);
    cursor: pointer; transition: transform var(--t-fast);
    flex-shrink: 0;
  }
  .kfm-card__del:active { transform: scale(0.9); }

  .kfm-card__body {
    padding: 0 12px 12px;
    border-top: 1px solid var(--color-border-sub);
    padding-top: 12px;
    animation: kfm-fade-up 0.22s var(--ease-spring) both;
  }
  .kfm-card__collapse {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; height: 38px; margin-top: 4px;
    border-radius: var(--r-md); background: var(--slate-50);
    color: var(--color-text-3); font-size: 12.5px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background var(--t-fast);
  }
  .kfm-card__collapse:active { background: var(--slate-100); }
  .kfm-card__label-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; height: 38px; margin-top: 10px;
    border-radius: var(--r-md); background: var(--indigo-50);
    color: var(--indigo-600); font-size: 12.5px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background var(--t-fast);
  }
  .kfm-card__label-btn:active { background: var(--indigo-100); }

  .kfm-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .kfm-field--name { margin-bottom: 10px; position: relative; }
  .kfm-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .kfm-inp {
    height: 44px; padding: 0 10px;
    border: 1.5px solid var(--color-border); border-radius: var(--r-md);
    font-size: 14px; font-family: inherit; color: var(--color-text);
    background: white; outline: none; width: 100%; min-width: 0;
    transition: border-color var(--t-base);
  }
  .kfm-inp:focus { border-color: var(--indigo-400); }
  .kfm-inp--name { font-weight: 600; }
  .kfm-inp--ro {
    display: flex; align-items: center;
    background: var(--slate-50); color: var(--color-text-2); font-weight: 700;
  }

  .kfm-grp {
    border-radius: var(--r-lg);
    padding: 10px;
    margin-bottom: 8px;
  }
  .kfm-grp:last-child { margin-bottom: 0; }
  .kfm-grp--pink   { background: #fdf2f8; }
  .kfm-grp--blue   { background: #eff6ff; }
  .kfm-grp--green  { background: #ecfdf5; }
  .kfm-grp--yellow { background: #fefce8; }
  .kfm-grp__title {
    font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--color-text-3); margin-bottom: 8px;
  }
  .kfm-grp__row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .kfm-grp--green .kfm-grp__row { grid-template-columns: 1fr 1fr; }
  .kfm-grp--yellow .kfm-grp__row { grid-template-columns: 1fr 1fr; }
  .kfm-grp .kfm-inp { height: 40px; font-size: 13px; padding: 0 6px; text-align: right; }
  .kfm-grp .kf__meta-lbl { font-size: 9px; }

  .kfm-preview { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .kfm-preview__chip {
    font-size: 11.5px; padding: 6px 9px; border-radius: var(--r-md);
    font-weight: 600; color: var(--color-text-2);
  }
  .kfm-preview__chip strong { font-weight: 800; color: var(--color-text); }
  .kfm-preview__chip--teal   { background: #ccfbf1; }
  .kfm-preview__chip--purple { background: #ede9fe; }

  .kfm-add-row {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 48px; border-radius: var(--r-lg);
    background: var(--indigo-50); color: var(--indigo-600);
    border: 1.5px dashed var(--indigo-200);
    font-size: 13.5px; font-weight: 700; font-family: inherit; cursor: pointer;
    transition: background var(--t-base), transform var(--t-fast);
  }
  .kfm-add-row:active { transform: scale(0.97); }

  /* Footer (comment + summary) */
  .kf__footer { flex-direction: column; gap: 10px; padding: 10px; }
  .kf__footer-l { flex-direction: column; align-items: stretch; gap: 8px; }
  .kf__add-row-btn { display: none; } /* replaced by .kfm-add-row above the list */
  .kf__comment { height: 40px; }
  .kf__footer-summary { min-width: 0; width: 100%; }

  /* ── SIZE PANEL → bottom sheet ───────────────────────────────── */
  .kf__content { position: relative; }
  .sz-backdrop {
    display: block;
    position: fixed; inset: 0; z-index: 300;
    background: rgba(15,23,42,0.45);
    animation: sz-backdrop-in 0.22s ease;
  }
  @keyframes sz-backdrop-in { from { opacity: 0; } to { opacity: 1; } }

  .sz-panel {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 301;
    width: 100%;
    max-height: 92vh;
    height: 92vh;
    border-left: none;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -12px 40px rgba(15,23,42,0.25);
    animation: sz-sheet-up 0.3s var(--ease-spring);
    padding-bottom: var(--bn-h);
  }
  @keyframes sz-sheet-up {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  .sz-panel__drag { display: flex; justify-content: center; padding: 10px 0 2px; cursor: pointer; flex-shrink: 0; }
  .sz-panel__handle { width: 40px; height: 5px; border-radius: 99px; background: var(--slate-300); }
  .sz-panel__search-inp,
  .sz-panel__qty,
  .sz-panel__price,
  .sz-panel__markup { height: 40px; font-size: 14px; }
  .sz-panel__add-btn,
  .sz-panel__clear-btn { height: 44px; }
}

@media (max-width: 480px) {
  .kir__stats { grid-template-columns: repeat(2, 1fr); }
  .kdoc-card__acts { flex-wrap: wrap; }
  .kfm-grp__row { grid-template-columns: 1fr 1fr !important; }
  .fab { width: 50px; height: 50px; right: 12px; }
}
</style>
