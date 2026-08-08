<script setup>
// Do'konni tizimga o'tkazishda ishlatiladi: 1000 ga yaqin mahsulotni
// bittalab oyna ochib emas, jadval ko'rinishida ketma-ket kiritish uchun.
//
// Muhim jihatlar:
//  - Mahsulot bo'limidagi BARCHA xususiyatlar shu yerda ham bor, shuning
//    uchun keyin mahsulotni tahrirlaganda hamma maydon joyida turadi.
//  - To'liq nom ProductFormModal dagi bilan bir xil mantiqda yasaladi:
//    Brend + Umumiy nom + Model/Razmer + Rang.
//  - Saqlash bitta so'rovda ketadi va backend boshlang'ich qoldiq uchun
//    kirim hujjatini ochadi — FIFO tannarx to'g'ri shakllanadi.
import { ref, computed, nextTick, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { productsApi } from '@/api/products.js'
import { suppliersApi } from '@/api/suppliers.js'
import { purchasesApi } from '@/api/purchases.js'
import { genBarcode, printLabels58x40, getLabelSize, setLabelSize } from '@/composables/useBarcodePrint.js'
import { showToast } from '@/composables/useToast.js'
import { fmtDate, fmtTime } from '@/composables/useDateTime.js'
import { getRecent, rememberValues } from '@/composables/useRecentValues.js'

// Ro'yxatlar mahsulot formasi bilan bir xil bo'lishi uchun bitta manbadan
import {
  UNITS, GROUPS, COUNTRIES, COLORS,
  SIZE_ALPHA, SIZE_JEANS, SIZE_EVEN, SIZE_CLASSIC, SIZE_SHOES,
} from '@/constants/catalog.js'

// Chiplar qatori: harfli razmerlar + barcha raqamli o'lchamlar (takrorsiz)
const allSizeChips = [
  ...SIZE_ALPHA,
  ...new Set([...SIZE_JEANS, ...SIZE_EVEN, ...SIZE_CLASSIC, ...SIZE_SHOES]
    .sort((a, b) => Number(a) - Number(b))),
]

// Har qatorga takrorlanmas kalit. Indeks bo'yicha kalit ishlatib
// bo'lmaydi: saqlagandan keyin qatorlar almashsa ham indeks 0 bo'lib
// qolgani uchun Vue eski input'ni qayta ishlatardi va kiritilgan narx
// tashlab yuborilgan qatorga yozilib, "summa kiritilmagan" xatosi chiqardi.
let rowSeq = 0

function blankRow() {
  return {
    _id: ++rowSeq,
    generalName: '', brand: '', model: '', color: '',
    unit: 'Dona', group: '', country: '',
    costPrice: '', retailPrice: '', wholesalePrice: '',
    qty: '', barcode: '',
    minQty: '', extraName1: '',
    nameOverride: '',        // bo'sh bo'lsa avtomatik nom ishlatiladi
    sizes: [],               // [{ size, qty, barcode }]
    _open: false,            // qo'shimcha maydonlar ochiqmi
  }
}

const rows      = ref([blankRow()])
const saving    = ref(false)
const suppliers = ref([])
const supplierId = ref(null)
const savedCount = ref(0)

// Brend takliflari — tayyor ro'yxat emas, do'konning o'z brendlari.
// Ikki manbadan yig'iladi: shu kompyuterda yozilganlar (localStorage) va
// bazada allaqachon mavjud bo'lganlar. Takrorlanmasligi uchun birlashtiramiz.
const brandOptions = ref(getRecent('brand'))

async function loadBrands() {
  const local = getRecent('brand')
  let server = []
  try { server = await productsApi.getBrands() } catch { /* ixtiyoriy */ }

  const seen = new Set()
  const out  = []
  for (const b of [...local, ...server]) {
    const k = String(b || '').trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(b)
  }
  brandOptions.value = out
}

onMounted(async () => {
  try { suppliers.value = await suppliersApi.getAll() } catch { /* ixtiyoriy */ }
  loadBrands()
})

// ── Nom yasash — ProductFormModal.buildName() bilan bir xil tartib ──────
// Nom tartibi: Model + Brend + Umumiy nom + Rang.
// Model birinchi turadi — ro'yxatda va yorliqda qaysi model ekani
// darhol ko'rinsin (razmer tanlanganda uning o'rniga razmer chiqadi).
function autoName(r) {
  return [r.model, r.brand, r.generalName, r.color]
    .map(v => (v || '').trim()).filter(Boolean).join(' ')
}
function displayName(r) { return r.nameOverride.trim() || autoName(r) }

// ── Qatorlar ────────────────────────────────────────────────────────────
function addRow(copyFrom = null) {
  const r = blankRow()
  if (copyFrom) {
    // Takrorlanuvchi ustunlarni nusxalaymiz — ko'p mahsulot bir xil
    // brend/kategoriya bo'ladi, har safar qayta yozish vaqt oladi.
    r.brand = copyFrom.brand; r.group = copyFrom.group
    r.country = copyFrom.country; r.unit = copyFrom.unit
    r.color = copyFrom.color
  }
  rows.value.push(r)
  return r
}
// Qatorni to'liq nusxalab, darhol keyingi qatorga qo'yadi. Shtrix-kodlar
// takrorlanmasligi kerak — har mahsulot o'z kodiga ega bo'lishi shart,
// shuning uchun ular yangidan yasaladi.
async function duplicateRow(i) {
  const src = rows.value[i]
  const copy = {
    ...src,
    _id: ++rowSeq,           // kalit takrorlanmasin
    barcode: src.barcode ? genBarcode() : '',
    sizes: src.sizes.map(s => ({ ...s, barcode: genBarcode() })),
  }
  rows.value.splice(i + 1, 0, copy)
  await nextTick()
  document.querySelector(`[data-cell="name-${i + 1}"]`)?.focus()
}

function removeRow(i) {
  rows.value.splice(i, 1)
  if (!rows.value.length) rows.value.push(blankRow())
}
function clearAll() {
  if (!confirm('Barcha kiritilgan qatorlar o\'chiriladi. Davom etasizmi?')) return
  rows.value = [blankRow()]
}

// Enter bosilganda yangi qator ochib, fokusni unga o'tkazamiz
async function onEnter(i) {
  if (i === rows.value.length - 1) addRow(rows.value[i])
  await nextTick()
  document.querySelector(`[data-cell="name-${i + 1}"]`)?.focus()
}

// ── Razmer rejimi ───────────────────────────────────────────────────────
function toggleSize(r, s) {
  const idx = r.sizes.findIndex(x => x.size === s)
  if (idx >= 0) r.sizes.splice(idx, 1)
  else r.sizes.push({ size: s, qty: 1, barcode: genBarcode() })
}
function addSizeSet(r, list) {
  list.forEach(s => { if (!r.sizes.some(x => x.size === s)) r.sizes.push({ size: s, qty: 1, barcode: genBarcode() }) })
}
function clearSizes(r) { r.sizes = [] }
function sizeQtyTotal(r) { return r.sizes.reduce((a, s) => a + (Number(s.qty) || 0), 0) }

// ── Hisob-kitob ─────────────────────────────────────────────────────────
const filledRows = computed(() =>
  rows.value.filter(r => displayName(r).trim() !== '')
)
const totalItems = computed(() =>
  filledRows.value.reduce((a, r) => a + (r.sizes.length ? r.sizes.length : 1), 0)
)
const totalQty = computed(() =>
  filledRows.value.reduce((a, r) => a + (r.sizes.length ? sizeQtyTotal(r) : Number(r.qty) || 0), 0)
)
const totalCost = computed(() =>
  filledRows.value.reduce((a, r) => {
    const q = r.sizes.length ? sizeQtyTotal(r) : Number(r.qty) || 0
    return a + q * (Number(r.costPrice) || 0)
  }, 0)
)

function fmt(n) { return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0)) }

// Foyda foizi — tannarx va sotuv narxi kiritilgan bo'lsa
function marginPct(r) {
  const c = Number(r.costPrice) || 0, s = Number(r.retailPrice) || 0
  if (!c || !s) return null
  return Math.round(((s - c) / c) * 100)
}

// ── Saqlash ─────────────────────────────────────────────────────────────
async function save() {
  const list = filledRows.value
  if (!list.length) { showToast('Kiritilgan mahsulot yo\'q', 'err'); return }

  // Sotuv narxi 0 bo'lganlarni ogohlantiramiz — savdo qilib bo'lmaydi
  const noPrice = list.filter(r => !(Number(r.retailPrice) > 0))
  if (noPrice.length) {
    const ok = confirm(
      `${noPrice.length} ta mahsulotda sotuv narxi kiritilmagan.\n` +
      `Ular 0 narx bilan saqlanadi. Davom etasizmi?`
    )
    if (!ok) return
  }

  saving.value = true
  try {
    // Shtrix-kodsiz mahsulotga yorliq chop etib bo'lmaydi va skanerda ham
    // topilmaydi — shuning uchun bo'sh qolganlariga o'zimiz kod beramiz.
    list.forEach(r => {
      if (!r.sizes.length && !r.barcode.trim()) r.barcode = genBarcode()
      r.sizes.forEach(s => { if (!s.barcode) s.barcode = genBarcode() })
    })

    const payload = list.map(r => ({
      generalName:    r.generalName || displayName(r),
      name:           displayName(r),
      brand:          r.brand,
      model:          r.model,
      color:          r.color,
      unit:           r.unit,
      group:          r.group,
      country:        r.country,
      extraName1:     r.extraName1,
      minQty:         r.minQty,
      costPrice:      r.costPrice,
      retailPrice:    r.retailPrice,
      wholesalePrice: r.wholesalePrice,
      qty:            r.sizes.length ? 0 : r.qty,
      barcodes:       r.barcode ? [r.barcode.trim()] : [],
      sizes:          r.sizes.map(s => ({ size: s.size, qty: Number(s.qty) || 0, barcode: s.barcode })),
    }))

    const res = await productsApi.bulkCreate(payload, { supplierId: supplierId.value })
    savedCount.value += res.yaratildi || 0
    // Qaysi hujjatga tegishli ekanini eslab qolamiz — chop etilgach
    // "chop etilgan" deb belgilash uchun (bir necha saqlash yig'ilishi mumkin)
    if (res.kirim_hujjati) pendingDocIds.value.push(res.kirim_hujjati)

    // Yorliq chop etish uchun saqlab qo'yamiz — foydalanuvchi barcha
    // mahsulotni kiritib bo'lgach, hammasini birdan chop etadi.
    list.forEach(r => {
      const nm = displayName(r)
      const price = Number(r.retailPrice) || 0
      if (r.sizes.length) {
        r.sizes.forEach(s => printQueue.value.push({
          name: `${nm} ${s.size}`.trim(),
          price,
          barcode: s.barcode,
          qty: Number(s.qty) || 1,
        }))
      } else {
        printQueue.value.push({
          name: nm,
          price,
          barcode: r.barcode.trim(),
          qty: Number(r.qty) || 1,
        })
      }
    })

    // Kiritilgan brendlarni eslab qolamiz — keyingi safar taklif bo'ladi
    rememberValues('brand', list.map(r => r.brand))
    loadBrands()

    showToast(`${res.yaratildi} ta mahsulot saqlandi`, 'ok')
    // Tarix eskirdi — keyingi ochilishda qaytadan yuklansin
    history.value = []
    histTotal.value = 0
    histPage.value = 1
    rows.value = [blankRow()]
    await nextTick()
    document.querySelector('[data-cell="name-0"]')?.focus()
  } catch (e) {
    showToast(e?.response?.data?.message || 'Saqlashda xatolik', 'err')
  } finally {
    saving.value = false
  }
}

// ── Yorliq chop etish ───────────────────────────────────────────────────
// Saqlangan mahsulotlar shu ro'yxatda to'planadi. Foydalanuvchi barchasini
// kiritib bo'lgandan keyin bir marta bosib, hammasini chop etadi.
const printQueue = ref([])
// Chop etish navbatidagi yorliqlar qaysi hujjatlardan yig'ilgani
const pendingDocIds = ref([])
const printPerItem = ref(true)   // har dona uchun alohida yorliqmi

const printLabelCount = computed(() =>
  printQueue.value.reduce((a, i) => a + (printPerItem.value ? Math.max(1, i.qty) : 1), 0)
)

async function doPrint() {
  if (!printQueue.value.length) return
  const items = printQueue.value.map(i => ({ ...i, qty: printPerItem.value ? Math.max(1, i.qty) : 1 }))
  const ok = printLabels58x40(items)
  if (!ok) {
    showToast('Chop etish oynasi ochilmadi — brauzer bloklagan bo\'lishi mumkin', 'err')
    return
  }
  // Shu navbatdagi hujjatlarni "chop etilgan" deb belgilaymiz, shunda
  // Tarix bo'limida ular allaqachon bosilgani ko'rinib turadi
  const ids = [...new Set(pendingDocIds.value)]
  pendingDocIds.value = []
  for (const id of ids) {
    try { await purchasesApi.markLabelsPrinted(id, true) } catch { /* muhim emas */ }
  }
}

function clearPrintQueue() {
  if (!confirm('Chop etish ro\'yxati tozalansinmi?')) return
  printQueue.value = []
  pendingDocIds.value = []
}

// ── Yorliq o'lchamini sozlash ───────────────────────────────────────────
// Etiket lentalari har xil bo'ladi va printer sahifa o'lchamini noto'g'ri
// olsa, yorliq siljib chiqadi. Shuning uchun o'lchamni qo'lda kiritish va
// bitta sinov yorlig'ini chop etib tekshirish imkonini beramiz.
const showSize = ref(false)
const labelW = ref(getLabelSize().w)
const labelH = ref(getLabelSize().h)
// Printer qog'ozni bir oz siljitib tortadi. Ilgari buni chop etish
// oynasidan qo'lda ("Поля", "Масштаб") tuzatishga to'g'ri kelardi —
// endi bir marta shu yerda sozlanadi va hamma yorliqqa qo'llanadi.
const labelX = ref(getLabelSize().x)
const labelY = ref(getLabelSize().y)

function saveLabelSize() {
  setLabelSize(Number(labelW.value), Number(labelH.value), Number(labelX.value), Number(labelY.value))
  showToast(`Yorliq o'lchami: ${labelW.value}×${labelH.value} mm`, 'ok')
}

// Sinov yorlig'i eng yomon holatni ko'rsatadi — uzun nom 2 qatorga
// chiqqanda ham hech narsa kesilmasligini shu yerda tekshirasiz.
function printTestLabel() {
  saveLabelSize()
  printLabels58x40([
    {
      name: 'SINOV — chetlarni tekshiring',
      price: 199000,
      barcode: genBarcode(),
      qty: 1,
    },
    {
      name: 'Stefano Ricci Finka M To\'q ko\'k — uzun nom sinovi',
      price: 225000,
      barcode: genBarcode(),
      qty: 1,
    },
  ])
}

// ── Tarix ───────────────────────────────────────────────────────────────
// Har saqlash bitta "Boshlang'ich qoldiq" kirim hujjatini yaratadi, shuning
// uchun tarix o'sha hujjatlar ustiga quriladi — sahifa yopilsa ham yo'qolmaydi
// va istalgan vaqtda ochib yorliq chop etish mumkin.
const tab         = ref('kiritish')   // 'kiritish' | 'tarix'
const history     = ref([])
const historyBusy = ref(false)
const openDocId   = ref(null)
const openDocItems = ref([])
const docBusy     = ref(false)

// Tarix sahifama-sahifa yuklanadi. Ilgari 100 ta hujjat birdan olinib,
// keraksizlari brauzerda tashlanardi — hujjat 200 dan oshgach bu sezilarli
// kechikish berardi. Endi filtr backendda va bir marta 30 tadan keladi.
const HIST_PAGE = 30
const histPage  = ref(1)
const histTotal = ref(0)
const histMore  = computed(() => history.value.length < histTotal.value)

async function loadHistory(append = false) {
  historyBusy.value = true
  try {
    const page = append ? histPage.value + 1 : 1
    const res = await purchasesApi.getAll({
      comment: 'Boshlang\'ich qoldiq',   // filtr backendda
      limit:   HIST_PAGE,
      page,
    })
    const list = Array.isArray(res) ? res : (res.rows || res.data || [])
    history.value  = append ? [...history.value, ...list] : list
    histTotal.value = res.total ?? list.length
    histPage.value  = page
  } catch (e) {
    showToast('Tarixni yuklab bo\'lmadi', 'err')
  } finally {
    historyBusy.value = false
  }
}

async function openDoc(id) {
  if (openDocId.value === id) { openDocId.value = null; openDocItems.value = []; return }
  docBusy.value = true
  openDocId.value = id
  try {
    const doc = await purchasesApi.getById(id)
    // Shtrix-kodsizlari ham ko'rinadi — narxini tahrirlash kerak bo'lishi mumkin
    openDocItems.value = doc.items || []
  } catch {
    showToast('Hujjatni ochib bo\'lmadi', 'err')
    openDocId.value = null
  } finally {
    docBusy.value = false
  }
}

// Hujjatdagi barcha yorliqlarni chop etish
async function printDoc(id, perItem = true) {
  docBusy.value = true
  try {
    const doc = await purchasesApi.getById(id)
    const items = (doc.items || [])
      .filter(i => i.barcode)
      .map(i => ({
        name:    itemName(i),
        price:   i.retailPriceSum,
        barcode: i.barcode,
        qty:     perItem ? Math.max(1, Math.round(Number(i.unitQty) || 1)) : 1,
      }))
    if (!items.length) { showToast('Bu hujjatda shtrix-kodli mahsulot yo\'q', 'err'); return }
    printLabels58x40(items)

    // Chop etilgani belgilanadi — tarixda qaysi hujjat bosilgani ko'rinsin
    await markPrinted(id, true)
  } catch {
    showToast('Chop etishda xatolik', 'err')
  } finally {
    docBusy.value = false
  }
}

// Yorliq/tarix uchun nom. Mahsulotning JORIY nomi ustun turadi — unda
// model boshida bo'ladi. `productName` saqlangan paytdagi nom, eski
// hujjatlarda modelsiz qolgan bo'lishi mumkin.
function itemName(it) {
  return (it.currentName || '').trim() || it.productName || ''
}

// Chop etilgan belgisini qo'yish / olib tashlash
async function markPrinted(id, printed) {
  try {
    const upd = await purchasesApi.markLabelsPrinted(id, printed)
    // Ro'yxatni qayta yuklamasdan joyida yangilaymiz
    const d = history.value.find(x => x.id === id)
    if (d) {
      d.labelsPrintedAt = upd.labelsPrintedAt
      d.printerName     = upd.printerName
    }
  } catch {
    showToast('Belgilashda xatolik', 'err')
  }
}

// Belgini qo'lda o'zgartirish (masalan noto'g'ri bosilgan bo'lsa)
async function togglePrinted(d) {
  const on = !!d.labelsPrintedAt
  if (on && !confirm('“Chop etilgan” belgisi olib tashlansinmi?')) return
  await markPrinted(d.id, !on)
}

// ── Tarixdagi narxlarni tahrirlash ──────────────────────────────────────
// Tezkor kiritishda tannarx ko'pincha "keyin kiritamiz" deb bo'sh qoldiriladi.
// Shu sabab saqlangandan keyin ham tannarx va sotuv narxini shu yerdan
// to'g'rilash mumkin — backend shu partiyadan sotilganlarning tannarxini ham
// yangilaydi, shunda foyda hisoboti to'g'ri chiqadi.
const editItemId  = ref(null)
const editCost    = ref('')
const editRetail  = ref('')
const editBusy    = ref(false)

function startEdit(item) {
  editItemId.value = item.id
  editCost.value   = item.costPrice      || ''
  editRetail.value = item.retailPriceSum || ''
}
function cancelEdit() {
  editItemId.value = null
  editCost.value = ''
  editRetail.value = ''
}

async function saveEdit(item) {
  const cost   = Number(editCost.value)   || 0
  const retail = Number(editRetail.value) || 0
  if (cost < 0 || retail < 0) { showToast('Narx manfiy bo\'la olmaydi', 'err'); return }

  editBusy.value = true
  try {
    const updated = await purchasesApi.updateItemPrices(openDocId.value, item.id, {
      costPrice:   cost,
      retailPrice: retail,
    })
    // Jadvalni qayta yuklamasdan joyida yangilaymiz
    Object.assign(item, {
      costPrice:      updated.costPrice,
      retailPriceSum: updated.retailPriceSum,
      totalSum:       updated.totalSum,
    })
    cancelEdit()
    showToast('Narx yangilandi', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Narxni saqlab bo\'lmadi', 'err')
  } finally {
    editBusy.value = false
  }
}

// Qatordagi foyda foizi — tannarx kiritilganini ko'z bilan tekshirish uchun
function itemMargin(it) {
  const c = Number(it.costPrice) || 0, s = Number(it.retailPriceSum) || 0
  if (!c || !s) return null
  return Math.round(((s - c) / c) * 100)
}

function printOneFromDoc(item) {
  printLabels58x40([{
    name:    itemName(item),
    price:   item.retailPriceSum,
    barcode: item.barcode,
    qty:     Math.max(1, Math.round(Number(item.unitQty) || 1)),
  }])
}

function switchTab(t) {
  tab.value = t
  if (t === 'tarix' && !history.value.length) loadHistory()
}

function docLabelCount(d) {
  return d.itemCount || 0
}
// fmtDate / fmtTime useDateTime.js dan — vaqt mahalliy zonada ko'rsatiladi
</script>

<template>
  <div class="qi">

    <!-- Sarlavha -->
    <div class="qi__head">
      <div>
        <h1 class="qi__title">Tezkor kiritish</h1>
        <p class="qi__sub">
          Jadval bo'ylab <kbd>Tab</kbd> bilan yuring, <kbd>Enter</kbd> yangi qator ochadi.
          Saqlaganda boshlang'ich qoldiq kirimi avtomatik yaratiladi.
        </p>
      </div>
      <div class="qi__head-r">
        <!-- Yorliq o'lchamini oldindan sozlash uchun — chop etish
             ro'yxati bo'sh bo'lganda ham kerak bo'ladi -->
        <button class="qi__btn qi__btn--ghost" title="Yorliq o'lchamini sozlash" @click="showSize = !showSize">
          <AppIcon name="printer" :size="14" /> {{ labelW }}×{{ labelH }} mm
        </button>

        <div v-if="savedCount" class="qi__saved">
          <AppIcon name="check-circle" :size="15" />
          <span>Bu sessiyada saqlandi: <strong>{{ savedCount }}</strong></span>
          <router-link to="/products" class="qi__link">Mahsulotlar</router-link>
          <router-link to="/purchases" class="qi__link">Kirim hujjatlari</router-link>
        </div>
      </div>
    </div>

    <!-- Yorliq o'lchamini sozlash — sarlavhadagi tugma orqali ochiladi -->
    <div v-if="showSize" class="qi__size qi__size--top">
      <div class="qi__size-row">
        <label>Kenglik <input type="number" v-model.number="labelW" min="20" max="120" /> mm</label>
        <label>Balandlik <input type="number" v-model.number="labelH" min="15" max="120" /> mm</label>
        <label title="Manfiy — chapga, musbat — o'ngga suradi">
          Gorizontal siljish <input type="number" v-model.number="labelX" min="-15" max="15" step="0.5" /> mm
        </label>
        <label title="Manfiy — yuqoriga, musbat — pastga suradi">
          Vertikal siljish <input type="number" v-model.number="labelY" min="-15" max="15" step="0.5" /> mm
        </label>
        <button class="qi__btn qi__btn--ghost" @click="printTestLabel">Sinov yorlig'i</button>
        <button class="qi__btn qi__btn--print" @click="saveLabelSize">Saqlash</button>
      </div>
      <p class="qi__size-hint">
        Lentadagi bitta yorliqni lineyka bilan o'lchang va shu yerga yozing.
        Chop etish oynasida <strong>Margins: None</strong>, <strong>Scale: 100</strong> bo'lsin —
        masshtabni 98% qilish shart emas.
        <br />
        Yozuv chetga surilib chiqsa, <strong>siljish</strong> maydonlaridan to'g'rilang:
        chapga surish uchun manfiy qiymat (masalan <strong>−6</strong>), yuqoriga surish uchun ham manfiy.
        Sinov yorlig'i ikkita bo'lib chiqadi — ikkinchisi uzun nomli, shuni tekshiring.
      </p>
    </div>

    <!-- Rejim tanlash -->
    <div class="qi__tabs">
      <button class="qi__tab" :class="{ on: tab === 'kiritish' }" @click="switchTab('kiritish')">
        <AppIcon name="edit-2" :size="14" /> Kiritish
      </button>
      <button class="qi__tab" :class="{ on: tab === 'tarix' }" @click="switchTab('tarix')">
        <AppIcon name="archive" :size="14" /> Tarix
        <span v-if="histTotal" class="qi__tab-badge">{{ histTotal }}</span>
      </button>
    </div>

    <!-- ══ TARIX ══════════════════════════════════════════════════ -->
    <div v-if="tab === 'tarix'" class="qi__hist">
      <div class="qi__hist-head">
        <p class="qi__hist-note">
          Har bir saqlash alohida yozuv bo'lib qoladi. Istalgan vaqtda ochib,
          yorliqlarni qayta chop etish yoki tannarx / sotuv narxini to'g'rilash mumkin.
        </p>
        <button class="qi__btn qi__btn--ghost" :disabled="historyBusy" @click="loadHistory">
          <AppIcon name="refresh-cw" :size="13" /> Yangilash
        </button>
      </div>

      <div v-if="historyBusy && !history.length" class="qi__empty">Yuklanmoqda...</div>
      <div v-else-if="!history.length" class="qi__empty">
        Hali hech narsa kiritilmagan. "Kiritish" bo'limidan boshlang.
      </div>

      <div v-else class="qi__hist-list">
        <div v-for="d in history" :key="d.id" class="qi__hcard">
          <div class="qi__hcard-main" @click="openDoc(d.id)">
            <div class="qi__hcard-l">
              <span class="qi__hdoc">#{{ d.docNumber }}</span>
              <div>
                <div class="qi__hdate">{{ fmtDate(d.date) }} <em>{{ fmtTime(d.date) }}</em></div>
                <!-- Kim kiritgani oldinda turadi — kim nima kiritganini
                     tarixdan darhol ko'rish uchun -->
                <div class="qi__hsub">
                  <span v-if="d.creatorName" class="qi__hwho">
                    <AppIcon name="user" :size="11" /> {{ d.creatorName }}
                  </span>
                  {{ d.supplier || 'Boshlang\'ich qoldiq' }}
                </div>
              </div>
            </div>
            <div class="qi__hcard-r">
              <span class="qi__hcount">{{ docLabelCount(d) }} ta mahsulot</span>

              <!-- Chop etilganmi — bosib belgini o'zgartirish mumkin -->
              <button
                class="qi__hprint"
                :class="d.labelsPrintedAt ? 'is-on' : 'is-off'"
                :title="d.labelsPrintedAt
                  ? `Chop etilgan${d.printerName ? ' — ' + d.printerName : ''} · ${fmtDate(d.labelsPrintedAt)} ${fmtTime(d.labelsPrintedAt)}\nBelgini olib tashlash uchun bosing`
                  : 'Hali chop etilmagan — belgilash uchun bosing'"
                @click.stop="togglePrinted(d)"
              >
                <AppIcon :name="d.labelsPrintedAt ? 'check-circle' : 'circle'" :size="12" />
                {{ d.labelsPrintedAt ? 'Chop etilgan' : 'Chop etilmagan' }}
              </button>

              <button class="qi__btn qi__btn--print qi__btn--sm" :disabled="docBusy" @click.stop="printDoc(d.id)">
                <AppIcon name="printer" :size="13" />
                {{ d.labelsPrintedAt ? 'Qayta' : 'Yorliqlar' }}
              </button>
              <AppIcon :name="openDocId === d.id ? 'chevron-up' : 'chevron-down'" :size="15" class="qi__hchev" />
            </div>
          </div>

          <!-- Ochilgan hujjat tarkibi -->
          <div v-if="openDocId === d.id" class="qi__hitems">
            <div v-if="docBusy" class="qi__empty qi__empty--sm">Yuklanmoqda...</div>
            <table v-else-if="openDocItems.length" class="qi__hitems-tbl">
              <thead>
                <tr>
                  <th>Mahsulot</th>
                  <th class="ta-r">Tannarx</th>
                  <th class="ta-r">Sotuv narxi</th>
                  <th class="ta-c">Soni</th>
                  <th>Shtrix-kod</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in openDocItems" :key="it.id" :class="{ 'is-edit': editItemId === it.id }">
                  <td>
                    {{ itemName(it) }}
                    <span v-if="it.productModel" class="qi__hmodel">{{ it.productModel }}</span>
                  </td>

                  <!-- Tannarx: bo'sh qolgan bo'lsa ko'zga tashlanadi -->
                  <td class="ta-r">
                    <input
                      v-if="editItemId === it.id"
                      v-money="{ get: () => editCost, set: v => editCost = v }"
                      class="qi__inp qi__inp--num qi__inp--sm"
                      placeholder="0"
                      @keydown.enter.prevent="saveEdit(it)"
                      @keydown.esc="cancelEdit()"
                    />
                    <span v-else-if="Number(it.costPrice) > 0">{{ fmt(it.costPrice) }}</span>
                    <span v-else class="qi__nocost" title="Tannarx kiritilmagan">kiritilmagan</span>
                  </td>

                  <td class="ta-r">
                    <input
                      v-if="editItemId === it.id"
                      v-money="{ get: () => editRetail, set: v => editRetail = v }"
                      class="qi__inp qi__inp--num qi__inp--sm"
                      placeholder="0"
                      @keydown.enter.prevent="saveEdit(it)"
                      @keydown.esc="cancelEdit()"
                    />
                    <template v-else>
                      {{ fmt(it.retailPriceSum) }}
                      <span v-if="itemMargin(it) !== null" class="qi__hmargin" :class="{ neg: itemMargin(it) < 0 }">
                        {{ itemMargin(it) > 0 ? '+' : '' }}{{ itemMargin(it) }}%
                      </span>
                    </template>
                  </td>

                  <td class="ta-c">{{ Math.round(Number(it.unitQty) || 0) }}</td>
                  <td class="qi__hbc">{{ it.barcode }}</td>

                  <td class="ta-r qi__hact">
                    <template v-if="editItemId === it.id">
                      <button class="qi__mini qi__mini--ok" title="Saqlash" :disabled="editBusy" @click="saveEdit(it)">
                        <AppIcon name="check" :size="11" />
                      </button>
                      <button class="qi__mini qi__mini--del" title="Bekor qilish" :disabled="editBusy" @click="cancelEdit()">
                        <AppIcon name="x" :size="11" />
                      </button>
                    </template>
                    <template v-else>
                      <button class="qi__mini qi__mini--copy" title="Narxlarni tahrirlash" @click="startEdit(it)">
                        <AppIcon name="edit-2" :size="11" />
                      </button>
                      <button
                        v-if="it.barcode"
                        class="qi__mini" title="Shu mahsulot yorlig'i"
                        @click="printOneFromDoc(it)"
                      >
                        <AppIcon name="printer" :size="11" />
                      </button>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="qi__empty qi__empty--sm">Bu hujjatda mahsulot yo'q.</div>
          </div>
        </div>

        <!-- Qolganini talab bo'yicha yuklaymiz — hammasi birdan kelsa
             hujjat ko'payganda sahifa sekinlashadi -->
        <button v-if="histMore" class="qi__hmore" :disabled="historyBusy" @click="loadHistory(true)">
          <span v-if="historyBusy" class="qi__spin qi__spin--dark"></span>
          <AppIcon v-else name="chevron-down" :size="14" />
          {{ historyBusy ? 'Yuklanmoqda...' : `Yana yuklash (${histTotal - history.length} ta qoldi)` }}
        </button>
      </div>
    </div>

    <!-- ══ KIRITISH ═══════════════════════════════════════════════ -->
    <template v-else>

    <!-- Yorliq chop etish: barcha mahsulot kiritilgach bir marta bosiladi -->
    <div v-if="printQueue.length" class="qi__print">
      <div class="qi__print-l">
        <AppIcon name="printer" :size="16" />
        <div>
          <div class="qi__print-title">Yorliqlar tayyor — 58 × 40 mm</div>
          <div class="qi__print-sub">
            {{ printQueue.length }} ta mahsulot ·
            <strong>{{ printLabelCount }}</strong> ta yorliq chop etiladi
          </div>
        </div>
      </div>
      <div class="qi__print-r">
        <label class="qi__check">
          <input type="checkbox" v-model="printPerItem" />
          Har dona uchun alohida yorliq
        </label>
        <button class="qi__btn qi__btn--ghost" @click="clearPrintQueue">Tozalash</button>
        <button class="qi__btn qi__btn--print" @click="doPrint">
          <AppIcon name="printer" :size="15" /> Chop etish
        </button>
      </div>
    </div>

    <!-- Yetkazuvchi -->
    <div class="qi__toolbar">
      <label class="qi__sup">
        <span>Yetkazuvchi <em>(ixtiyoriy)</em></span>
        <select v-model="supplierId">
          <option :value="null">— tanlanmagan —</option>
          <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>
      <button class="qi__btn qi__btn--ghost" @click="clearAll">
        <AppIcon name="trash-2" :size="14" /> Tozalash
      </button>
    </div>

    <!-- Jadval -->
    <div class="qi__table-wrap">
      <table class="qi__table">
        <thead>
          <tr>
            <th class="c-num">#</th>
            <th class="c-name">Umumiy nom <span class="req">*</span></th>
            <th class="c-txt">Brend</th>
            <th class="c-sz">Model / Razmer</th>
            <th class="c-txt">Rang</th>
            <th class="c-num2">Tannarx</th>
            <th class="c-num2">Sotuv narxi <span class="req">*</span></th>
            <th class="c-qty">Soni</th>
            <th class="c-bc">Shtrix-kod</th>
            <th class="c-act"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(r, i) in rows" :key="r._id">
            <tr :class="{ 'is-filled': displayName(r).trim() }">
              <td class="c-num">{{ i + 1 }}</td>

              <td>
                <input
                  v-model="r.generalName"
                  :data-cell="`name-${i}`"
                  class="qi__inp qi__inp--main"
                  placeholder="Shim, Futbolka..."
                  @keydown.enter.prevent="onEnter(i)"
                />
                <div v-if="displayName(r).trim()" class="qi__preview">
                  {{ displayName(r) }}
                </div>
              </td>

              <td><input v-model="r.brand" class="qi__inp" list="qi-brands" placeholder="—" @keydown.enter.prevent="onEnter(i)" /></td>

              <td>
                <input
                  v-model="r.model"
                  class="qi__inp"
                  :disabled="r.sizes.length > 0"
                  :placeholder="r.sizes.length ? `${r.sizes.length} razmer` : '—'"
                  @keydown.enter.prevent="onEnter(i)"
                />
              </td>

              <td><input v-model="r.color" class="qi__inp" list="qi-colors" placeholder="—" @keydown.enter.prevent="onEnter(i)" /></td>

              <td>
                <input v-money="{ get: () => r.costPrice, set: v => r.costPrice = v }"
                       class="qi__inp qi__inp--num" placeholder="0" @keydown.enter.prevent="onEnter(i)" />
              </td>

              <td>
                <input v-money="{ get: () => r.retailPrice, set: v => r.retailPrice = v }"
                       class="qi__inp qi__inp--num" placeholder="0" @keydown.enter.prevent="onEnter(i)" />
                <div v-if="marginPct(r) !== null" class="qi__margin" :class="{ neg: marginPct(r) < 0 }">
                  {{ marginPct(r) > 0 ? '+' : '' }}{{ marginPct(r) }}%
                </div>
              </td>

              <td>
                <input
                  v-if="!r.sizes.length"
                  v-model="r.qty" type="number" min="0"
                  class="qi__inp qi__inp--num" placeholder="0"
                  @keydown.enter.prevent="onEnter(i)"
                />
                <span v-else class="qi__sz-total">{{ sizeQtyTotal(r) }}</span>
              </td>

              <td>
                <div class="qi__bc">
                  <input v-model="r.barcode" class="qi__inp qi__inp--bc" placeholder="skaner..." @keydown.enter.prevent="onEnter(i)" />
                  <button class="qi__mini" title="Shtrix-kod yasash" @click="r.barcode = genBarcode()">
                    <AppIcon name="refresh-cw" :size="11" />
                  </button>
                </div>
              </td>

              <td class="c-act">
                <button class="qi__mini qi__mini--copy" title="Shu qatorni nusxalash" @click="duplicateRow(i)">
                  <AppIcon name="copy" :size="12" />
                </button>
                <button class="qi__mini" :class="{ on: r._open }" title="Razmer va qo'shimcha maydonlar" @click="r._open = !r._open">
                  <AppIcon name="settings" :size="12" />
                </button>
                <button class="qi__mini qi__mini--del" title="Qatorni o'chirish" @click="removeRow(i)">
                  <AppIcon name="x" :size="12" />
                </button>
              </td>
            </tr>

            <!-- Qo'shimcha: razmerlar va qolgan maydonlar -->
            <tr v-if="r._open" class="qi__extra">
              <td></td>
              <td colspan="9">
                <div class="qi__extra-box">

                  <div class="qi__extra-sec">
                    <div class="qi__extra-lbl">Razmerlar
                      <em>— tanlansa, har biri alohida mahsulot bo'lib yaratiladi</em>
                    </div>
                    <div class="qi__sets">
                      <button class="qi__set" @click="addSizeSet(r, SIZE_JEANS)">Jinsi 29–34</button>
                      <button class="qi__set" @click="addSizeSet(r, SIZE_EVEN)">Shim 36–46</button>
                      <button class="qi__set" @click="addSizeSet(r, SIZE_CLASSIC)">Klassik 44–60</button>
                      <button class="qi__set" @click="addSizeSet(r, SIZE_ALPHA)">Harfli S–10XL</button>
                      <button class="qi__set" @click="addSizeSet(r, SIZE_SHOES)">Oyoq kiyim 35–46</button>
                      <button v-if="r.sizes.length" class="qi__set qi__set--clear" @click="clearSizes(r)">Tozalash</button>
                    </div>

                    <div class="qi__chips">
                      <button
                        v-for="s in allSizeChips"
                        :key="s"
                        class="qi__chip"
                        :class="{ on: r.sizes.some(x => x.size === s) }"
                        @click="toggleSize(r, s)"
                      >{{ s }}</button>
                    </div>

                    <div v-if="r.sizes.length" class="qi__sz-rows">
                      <div v-for="(s, si) in r.sizes" :key="si" class="qi__sz-row">
                        <span class="qi__sz-name">{{ s.size }}</span>
                        <input v-model="s.qty" type="number" min="0" class="qi__inp qi__inp--num qi__inp--sm" />
                        <span class="qi__sz-bc">{{ s.barcode }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="qi__extra-sec">
                    <div class="qi__extra-lbl">Qo'shimcha xususiyatlar</div>
                    <div class="qi__grid">
                      <label>Birlik
                        <select v-model="r.unit" class="qi__inp">
                          <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
                        </select>
                      </label>
                      <label>Kategoriya
                        <input v-model="r.group" class="qi__inp" list="qi-groups" placeholder="—" />
                      </label>
                      <label>Davlat
                        <input v-model="r.country" class="qi__inp" list="qi-countries" placeholder="—" />
                      </label>
                      <label>Optom narx
                        <input v-money="{ get: () => r.wholesalePrice, set: v => r.wholesalePrice = v }"
                               class="qi__inp qi__inp--num" placeholder="0" />
                      </label>
                      <label>Minimal zaxira
                        <input v-model="r.minQty" type="number" min="0" class="qi__inp qi__inp--num" placeholder="0" />
                      </label>
                      <label>Muqobil nom
                        <input v-model="r.extraName1" class="qi__inp" placeholder="Ruscha, inglizcha..." />
                      </label>
                      <label class="qi__grid-wide">To'liq nomni qo'lda yozish
                        <input v-model="r.nameOverride" class="qi__inp" :placeholder="autoName(r) || 'Avtomatik'" />
                      </label>
                    </div>
                  </div>

                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <datalist id="qi-brands"><option v-for="b in brandOptions" :key="b" :value="b" /></datalist>
    <datalist id="qi-colors"><option v-for="c in COLORS" :key="c" :value="c" /></datalist>
    <datalist id="qi-groups"><option v-for="g in GROUPS" :key="g" :value="g" /></datalist>
    <datalist id="qi-countries"><option v-for="c in COUNTRIES" :key="c" :value="c" /></datalist>

    <button class="qi__addrow" @click="addRow(rows[rows.length - 1])">
      <AppIcon name="plus" :size="14" /> Yangi qator
    </button>

    <!-- Pastki panel -->
    <div class="qi__footer">
      <div class="qi__stats">
        <div class="qi__stat"><span>Mahsulot</span><strong>{{ totalItems }}</strong></div>
        <div class="qi__stat"><span>Jami dona</span><strong>{{ totalQty }}</strong></div>
        <div class="qi__stat"><span>Tannarx summasi</span><strong>{{ fmt(totalCost) }}</strong></div>
      </div>
      <button class="qi__btn qi__btn--save" :disabled="saving || !totalItems" @click="save">
        <span v-if="saving" class="qi__spin"></span>
        <AppIcon v-else name="save" :size="16" />
        {{ saving ? 'Saqlanmoqda...' : `Saqlash (${totalItems})` }}
      </button>
    </div>

    </template>

  </div>
</template>

<style scoped>
.qi { padding: 20px 22px 120px; max-width: 100%; }

.qi__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.qi__title { margin: 0 0 4px; font-size: 21px; font-weight: 700; color: #0f172a; }
.qi__sub { margin: 0; font-size: 12.5px; color: #64748b; }
.qi__sub kbd {
  padding: 1px 5px; border: 1px solid #cbd5e1; border-bottom-width: 2px;
  border-radius: 4px; background: #f8fafc; font-size: 11px; font-family: inherit;
}
.qi__saved {
  display: flex; align-items: center; gap: 6px; padding: 7px 12px;
  background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;
  font-size: 12.5px; color: #047857; white-space: nowrap;
}

.qi__link {
  padding: 3px 9px; border: 1px solid #a7f3d0; border-radius: 6px;
  background: #fff; font-size: 11.5px; color: #047857; text-decoration: none;
}
.qi__link:hover { background: #d1fae5; }

/* Rejim tanlash */
.qi__tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; }
.qi__tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 16px; margin-bottom: -1px;
  border: none; border-bottom: 2px solid transparent; background: none;
  font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer;
}
.qi__tab:hover { color: #0f172a; }
.qi__tab.on { color: #7c42eb; border-bottom-color: #7c42eb; font-weight: 600; }
.qi__tab-badge {
  padding: 1px 6px; border-radius: 9px; background: #ede9fe;
  font-size: 10.5px; font-weight: 700; color: #6d28d9;
}

/* Tarix */
.qi__hist-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 12px; }
.qi__hist-note { margin: 0; font-size: 12.5px; color: #64748b; }

.qi__empty {
  padding: 36px 20px; text-align: center; font-size: 13px; color: #94a3b8;
  border: 1px dashed #e2e8f0; border-radius: 10px; background: #fafbfc;
}
.qi__empty--sm { padding: 16px; border: none; background: none; }

.qi__hist-list { display: flex; flex-direction: column; gap: 8px; }
.qi__hcard { border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; overflow: hidden; }
.qi__hcard-main {
  display: flex; justify-content: space-between; align-items: center; gap: 14px;
  padding: 11px 14px; cursor: pointer;
}
.qi__hcard-main:hover { background: #fafbff; }
.qi__hcard-l { display: flex; align-items: center; gap: 12px; }
.qi__hdoc {
  padding: 4px 9px; border-radius: 7px; background: #f1f5f9;
  font-size: 12px; font-weight: 700; color: #475569;
}
.qi__hdate { font-size: 13px; font-weight: 600; color: #0f172a; }
.qi__hdate em { font-style: normal; font-weight: 400; color: #94a3b8; font-size: 12px; }
.qi__hsub { font-size: 11.5px; color: #94a3b8; margin-top: 1px; }
/* Kim kiritgani — ko'zga tashlanib tursin */
.qi__hwho {
  display: inline-flex; align-items: center; gap: 3px;
  margin-right: 6px; padding: 1px 7px;
  border-radius: 5px; background: #eef2ff; color: #4f46e5; font-weight: 600;
}

/* "Yana yuklash" */
.qi__hmore {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; margin-top: 8px; padding: 11px;
  border: 1px dashed #cbd5e1; border-radius: 10px; background: #fff;
  font-size: 12.5px; font-weight: 500; color: #475569; cursor: pointer;
}
.qi__hmore:hover:not(:disabled) { border-color: #8b5cf6; color: #7c42eb; background: #faf5ff; }
.qi__hmore:disabled { opacity: .6; cursor: default; }
.qi__spin--dark { border-color: rgba(124,66,235,.3); border-top-color: #7c42eb; }
.qi__hcard-r { display: flex; align-items: center; gap: 10px; }
.qi__hcount { font-size: 12px; color: #64748b; white-space: nowrap; }

/* Chop etilgan / etilmagan belgisi */
.qi__hprint {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 99px; border: 1px solid transparent;
  font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.qi__hprint.is-on  { background: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.qi__hprint.is-on:hover  { background: #d1fae5; }
.qi__hprint.is-off { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.qi__hprint.is-off:hover { background: #ffedd5; }
.qi__hchev { color: #94a3b8; }
.qi__btn--sm { height: 30px; padding: 0 11px; font-size: 12px; }

.qi__hitems { border-top: 1px solid #f1f5f9; background: #fafbfc; padding: 4px 14px 10px; }
.qi__hitems-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.qi__hitems-tbl th {
  padding: 7px 6px; border-bottom: 1px solid #e2e8f0;
  font-size: 11px; font-weight: 600; color: #64748b; text-align: left;
}
.qi__hitems-tbl td { padding: 6px; border-bottom: 1px solid #f1f5f9; color: #0f172a; }
.qi__hitems-tbl tr:last-child td { border-bottom: none; }
.qi__hbc { font-size: 11.5px; color: #64748b; font-variant-numeric: tabular-nums; }
/* Model — nom yonida ajratib ko'rsatiladi */
.qi__hmodel {
  margin-left: 6px; padding: 1px 7px; border-radius: 5px;
  background: #f1f5f9; font-size: 10.5px; font-weight: 700; color: #475569;
}
.ta-r { text-align: right; }
.ta-c { text-align: center; }

/* Tarixdagi narx tahriri */
.qi__hitems-tbl tr.is-edit td { background: #faf5ff; }
.qi__hitems-tbl .qi__inp--sm { display: inline-block; width: 100px; height: 27px; }
.qi__nocost {
  padding: 1px 7px; border-radius: 5px; background: #fef3c7;
  font-size: 11px; color: #b45309;
}
.qi__hmargin { margin-left: 5px; font-size: 10.5px; font-weight: 600; color: #059669; }
.qi__hmargin.neg { color: #dc2626; }
.qi__hact { white-space: nowrap; }
.qi__hact .qi__mini + .qi__mini { margin-left: 3px; }
.qi__mini--ok { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
.qi__mini--ok:hover { background: #d1fae5; color: #065f46; }
.qi__mini:disabled { opacity: .5; cursor: default; }

/* Yorliq chop etish paneli */
.qi__print {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  margin-bottom: 12px; padding: 11px 14px;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;
}
.qi__print-l { display: flex; align-items: center; gap: 10px; color: #1d4ed8; }
.qi__print-title { font-size: 13px; font-weight: 600; color: #1e3a8a; }
.qi__print-sub { font-size: 11.5px; color: #3b82f6; margin-top: 1px; }
.qi__print-r { display: flex; align-items: center; gap: 10px; }
.qi__check {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #1e40af; cursor: pointer; user-select: none;
}
.qi__check input { width: 14px; height: 14px; cursor: pointer; }
.qi__btn--print {
  border: none; background: #2563eb; color: #fff; font-weight: 600;
}
.qi__btn--print:hover { background: #1d4ed8; }

.qi__head-r { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

/* Yorliq o'lchamini sozlash paneli */
.qi__size--top {
  margin: 0 0 14px;
  border: 1px solid #bfdbfe; border-radius: 10px;
}
.qi__size {
  margin: -6px 0 12px; padding: 11px 14px;
  background: #fff; border: 1px solid #bfdbfe; border-radius: 0 0 10px 10px;
}
.qi__size-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.qi__size-row label {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: #334155;
}
.qi__size-row input {
  width: 62px; padding: 5px 7px;
  border: 1px solid #cbd5e1; border-radius: 6px;
  font-size: 12.5px; text-align: center;
}
.qi__size-hint {
  margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: #64748b;
}

.qi__toolbar { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 12px; }
.qi__sup { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #475569; }
.qi__sup em { color: #94a3b8; font-style: normal; }
.qi__sup select {
  height: 34px; min-width: 220px; padding: 0 10px;
  border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; font-size: 13px;
}

.qi__table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
.qi__table { width: 100%; border-collapse: collapse; font-size: 13px; }
.qi__table thead th {
  position: sticky; top: 0; z-index: 2;
  padding: 9px 8px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
  font-size: 11.5px; font-weight: 600; color: #475569; text-align: left; white-space: nowrap;
}
.req { color: #ef4444; }
.qi__table tbody td { padding: 5px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.qi__table tbody tr.is-filled { background: #fcfdff; }

.c-num  { width: 34px; text-align: center; color: #94a3b8; font-size: 11.5px; padding-top: 12px !important; }
.c-name { min-width: 190px; }
.c-txt  { min-width: 110px; }
.c-sz   { min-width: 120px; }
.c-num2 { width: 110px; }
.c-qty  { width: 80px; }
.c-bc   { width: 150px; }
.c-act  { width: 92px; white-space: nowrap; }

.qi__inp {
  width: 100%; height: 32px; padding: 0 8px;
  border: 1px solid #e2e8f0; border-radius: 6px; background: #fff;
  font-size: 13px; color: #0f172a; font-family: inherit;
}
.qi__inp:focus { outline: none; border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,.12); }
.qi__inp:disabled { background: #f8fafc; color: #94a3b8; }
.qi__inp--main { font-weight: 500; }
.qi__inp--num { text-align: right; }
.qi__inp--bc { font-size: 12px; }
.qi__inp--sm { height: 28px; width: 70px; }

.qi__preview {
  margin-top: 3px; padding-left: 2px;
  font-size: 11px; color: #7c42eb; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.qi__margin { margin-top: 3px; text-align: right; font-size: 10.5px; color: #059669; font-weight: 600; }
.qi__margin.neg { color: #dc2626; }
.qi__sz-total { display: block; padding-top: 7px; text-align: right; font-weight: 600; color: #7c42eb; }

.qi__bc { display: flex; gap: 3px; align-items: center; }
.qi__mini {
  flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center;
  border: 1px solid #e2e8f0; border-radius: 5px; background: #fff;
  color: #64748b; cursor: pointer;
}
.qi__mini:hover { background: #f1f5f9; color: #0f172a; }
.qi__mini.on { background: #f3e8ff; border-color: #d8b4fe; color: #7c42eb; }
.qi__mini--copy:hover { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
.qi__mini--del:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
.c-act .qi__mini { margin-top: 4px; }
.c-act .qi__mini + .qi__mini { margin-left: 3px; }

/* Qo'shimcha panel */
.qi__extra > td { background: #fafbfe; padding: 0 8px 12px !important; }
.qi__extra-box { display: grid; grid-template-columns: 1.15fr 1fr; gap: 18px; padding: 10px 4px 2px; }
@media (max-width: 1100px) { .qi__extra-box { grid-template-columns: 1fr; } }
.qi__extra-lbl { margin-bottom: 7px; font-size: 11.5px; font-weight: 600; color: #475569; }
.qi__extra-lbl em { font-weight: 400; color: #94a3b8; font-style: normal; }

.qi__sets { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.qi__set {
  padding: 4px 10px; border: 1px solid #ddd6fe; border-radius: 6px;
  background: #f5f3ff; font-size: 11.5px; color: #6d28d9; cursor: pointer;
}
.qi__set:hover { background: #ede9fe; }
.qi__set--clear { border-color: #fecaca; background: #fef2f2; color: #dc2626; }

.qi__chips { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.qi__chip {
  min-width: 34px; padding: 3px 7px; border: 1px solid #e2e8f0; border-radius: 5px;
  background: #fff; font-size: 11.5px; color: #475569; cursor: pointer;
}
.qi__chip:hover { border-color: #c4b5fd; }
.qi__chip.on { background: #7c42eb; border-color: #7c42eb; color: #fff; font-weight: 600; }

.qi__sz-rows { display: flex; flex-wrap: wrap; gap: 6px; }
.qi__sz-row {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px;
  border: 1px solid #e2e8f0; border-radius: 6px; background: #fff;
}
.qi__sz-name { min-width: 32px; font-size: 12px; font-weight: 600; color: #0f172a; }
.qi__sz-bc { font-size: 10.5px; color: #94a3b8; font-variant-numeric: tabular-nums; }

.qi__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 10px; }
@media (max-width: 900px) { .qi__grid { grid-template-columns: repeat(2, 1fr); } }
.qi__grid label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: #64748b; }
.qi__grid-wide { grid-column: 1 / -1; }

.qi__addrow {
  margin-top: 10px; padding: 8px 14px;
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px dashed #cbd5e1; border-radius: 8px; background: #fff;
  font-size: 12.5px; color: #475569; cursor: pointer;
}
.qi__addrow:hover { border-color: #8b5cf6; color: #7c42eb; background: #faf5ff; }

.qi__footer {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 12px 22px; background: #fff; border-top: 1px solid #e2e8f0;
  box-shadow: 0 -4px 16px rgba(15,23,42,.06);
}
.qi__stats { display: flex; gap: 22px; }
.qi__stat { display: flex; flex-direction: column; gap: 1px; }
.qi__stat span { font-size: 11px; color: #94a3b8; }
.qi__stat strong { font-size: 15px; color: #0f172a; font-variant-numeric: tabular-nums; }

.qi__btn {
  display: inline-flex; align-items: center; gap: 7px;
  height: 38px; padding: 0 16px; border-radius: 9px;
  border: 1px solid #e2e8f0; background: #fff;
  font-size: 13px; font-weight: 500; color: #475569; cursor: pointer;
}
.qi__btn--ghost:hover { background: #f8fafc; }
.qi__btn--save {
  border: none; padding: 0 22px;
  background: linear-gradient(135deg, #7c42eb, #8b5cf6); color: #fff; font-weight: 600;
}
.qi__btn--save:disabled { opacity: .5; cursor: default; }

.qi__spin {
  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.35);
  border-top-color: #fff; border-radius: 50%; animation: qi-spin .7s linear infinite;
}
@keyframes qi-spin { to { transform: rotate(360deg); } }
</style>
