<script setup>
// Inventarizatsiya — ombordagi tovarni shtrix-kod bilan sanab chiqish.
//
// Jarayon:
//   1. Hujjat ochiladi — ombordagi barcha tovar "Topilmadi" ro'yxatiga tushadi
//   2. Tovar skanerlanadi → "Topildi" ga o'tadi, yoqimli signal chalinadi
//   3. Ayni tovar qayta urilsa — boshqa (past) signal: "qayta urildi"
//   4. Bazada yo'q yoki hisobdan ko'p chiqsa — "Ortiqcha" ro'yxatiga
//   5. Yakunlanganda sanalgan miqdor haqiqiy qoldiq sifatida yoziladi
//
// Skaner klaviatura emulyatsiyasida ishlaydi: kod tez teriladi va Enter
// bilan tugaydi. Shuning uchun input doim fokusda turishi kerak.
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { inventoriesApi } from '@/api/inventories.js'
import { beep } from '@/composables/useBeep.js'
import { showToast } from '@/composables/useToast.js'
import { canAdd, canEdit } from '@/composables/usePerms.js'

const fmt  = v => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0))
const fmtQ = v => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, '')
}

// ── Ro'yxat / hujjat holati ────────────────────────────────────────────
const docs    = ref([])
const doc     = ref(null)      // ochiq hujjat
const loading = ref(false)
const busy    = ref(false)

const STATUS = {
  draft:     { label: 'Davom etmoqda', cls: 'st--draft'  },
  finished:  { label: 'Yakunlangan',   cls: 'st--done'   },
  cancelled: { label: 'Bekor qilingan',cls: 'st--cancel' },
}

async function loadDocs() {
  loading.value = true
  try {
    docs.value = await inventoriesApi.getAll()
  } catch (e) {
    showToast(e?.response?.data?.message || 'Ro\'yxatni yuklab bo\'lmadi', 'err')
  } finally {
    loading.value = false
  }
}

async function openDoc(id) {
  loading.value = true
  try {
    doc.value = await inventoriesApi.getById(id)
    tab.value = 'notfound'
    await nextTick()
    focusScanner()
  } catch (e) {
    showToast(e?.response?.data?.message || 'Hujjatni ochib bo\'lmadi', 'err')
  } finally {
    loading.value = false
  }
}

function closeDoc() {
  doc.value = null
  loadDocs()
}

async function createDoc() {
  if (!confirm('Yangi inventarizatsiya boshlansinmi?\n\nOmbordagi barcha tovar sanoq ro\'yxatiga qo\'shiladi.')) return
  busy.value = true
  try {
    const created = await inventoriesApi.create({ onlyInStock: true })
    doc.value = created
    tab.value = 'notfound'
    showToast(`Hujjat #${created.docNumber} ochildi — ${created.items.length} ta tovar`, 'ok')
    await nextTick()
    focusScanner()
  } catch (e) {
    showToast(e?.response?.data?.message || 'Hujjat ochishda xatolik', 'err')
  } finally {
    busy.value = false
  }
}

// ── Skanerlash ─────────────────────────────────────────────────────────
const scanInput = ref(null)
const scanCode  = ref('')
const lastScan  = ref(null)   // { holat, item } — ekranda katta ko'rsatiladi

function focusScanner() {
  scanInput.value?.focus()
}

async function onScan() {
  const code = scanCode.value.trim()
  scanCode.value = ''
  if (!code || !doc.value || doc.value.status !== 'draft') return

  try {
    const res = await inventoriesApi.scan(doc.value.id, code)

    // Ovoz — sanoqchi ekranga qaramasdan holatni bilishi uchun
    if (res.holat === 'takror')        beep('duplicate')
    else if (res.holat === 'ortiqcha') beep('extra')
    else if (res.holat === 'notanish') beep('unknown')
    else                               beep('found')

    lastScan.value = { holat: res.holat, item: res.item, at: Date.now() }

    // Hujjatdagi satrni yangilaymiz (qayta yuklamasdan — tez bo'lishi kerak)
    const idx = doc.value.items.findIndex(i => i.id === res.item.id)
    if (idx >= 0) {
      doc.value.items[idx] = { ...doc.value.items[idx], ...res.item, diff: res.item.countedQty - res.item.expectedQty }
    } else {
      doc.value.items.push({ ...res.item, diff: res.item.countedQty - res.item.expectedQty })
    }
  } catch (e) {
    beep('error')
    showToast(e?.response?.data?.message || 'Skanerlashda xatolik', 'err')
  } finally {
    focusScanner()
  }
}

// Sahifa ochiq turganda fokus doim skanerda bo'lsin — foydalanuvchi
// boshqa joyni bosib qo'ysa ham keyingi skan yo'qolmaydi.
function onGlobalKey(e) {
  if (!doc.value || doc.value.status !== 'draft') return
  const el = document.activeElement
  const isInput = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
  if (!isInput && /^[\w\d]$/.test(e.key)) focusScanner()
}
onMounted(() => { loadDocs(); window.addEventListener('keydown', onGlobalKey) })
onUnmounted(() => window.removeEventListener('keydown', onGlobalKey))

// ── Guruhlash: Topilmadi / Topildi / Ortiqcha ──────────────────────────
const tab = ref('notfound')

const notFound = computed(() =>
  (doc.value?.items || []).filter(i => i.countedQty < i.expectedQty)
)
const found = computed(() =>
  (doc.value?.items || []).filter(i => i.countedQty > 0 && i.countedQty === i.expectedQty)
)
const extra = computed(() =>
  (doc.value?.items || []).filter(i => i.countedQty > i.expectedQty)
)

const visibleItems = computed(() => {
  if (tab.value === 'found')  return found.value
  if (tab.value === 'extra')  return extra.value
  return notFound.value
})

const progress = computed(() => {
  const total = doc.value?.items?.length || 0
  if (!total) return 0
  return Math.round((found.value.length + extra.value.length) / total * 100)
})

// ── Qo'lda tuzatish ────────────────────────────────────────────────────
async function setCounted(item, value) {
  const v = Math.max(0, Number(value) || 0)
  try {
    const updated = await inventoriesApi.updateItem(item.id, v)
    const idx = doc.value.items.findIndex(i => i.id === item.id)
    if (idx >= 0) doc.value.items[idx] = { ...doc.value.items[idx], ...updated }
  } catch (e) {
    showToast(e?.response?.data?.message || 'Saqlashda xatolik', 'err')
  }
}

async function removeItem(item) {
  if (!confirm(`"${item.productName}" satri o'chirilsinmi?`)) return
  try {
    await inventoriesApi.deleteItem(item.id)
    doc.value.items = doc.value.items.filter(i => i.id !== item.id)
  } catch (e) {
    showToast(e?.response?.data?.message || 'O\'chirishda xatolik', 'err')
  }
}

// ── Yakunlash ──────────────────────────────────────────────────────────
async function finishDoc() {
  const nf = notFound.value.length, ex = extra.value.length
  const msg =
    `Inventarizatsiya yakunlansinmi?\n\n` +
    `Topildi: ${found.value.length}\n` +
    `Topilmadi / kam: ${nf}\n` +
    `Ortiqcha: ${ex}\n\n` +
    `Sanalgan miqdor haqiqiy qoldiq sifatida yoziladi. Bu amalni ortga qaytarib bo'lmaydi.`
  if (!confirm(msg)) return

  busy.value = true
  try {
    doc.value = await inventoriesApi.finish(doc.value.id)
    beep('finish')
    showToast('Inventarizatsiya yakunlandi, qoldiqlar yangilandi', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Yakunlashda xatolik', 'err')
  } finally {
    busy.value = false
  }
}

async function deleteDoc(id) {
  if (!confirm('Hujjat o\'chirilsinmi?')) return
  try {
    await inventoriesApi.remove(id)
    showToast('Hujjat o\'chirildi', 'ok')
    loadDocs()
  } catch (e) {
    showToast(e?.response?.data?.message || 'O\'chirishda xatolik', 'err')
  }
}
</script>

<template>
  <div class="inv">

    <!-- ══ Hujjatlar ro'yxati ══════════════════════════════════════ -->
    <template v-if="!doc">
      <div class="inv__head">
        <div>
          <h1 class="inv__title">Inventarizatsiya</h1>
          <p class="inv__sub">Ombordagi tovarlarni skanerlab, haqiqiy qoldiqni aniqlash</p>
        </div>
        <button v-if="canAdd('products')" class="inv__btn inv__btn--primary" :disabled="busy" @click="createDoc">
          <AppIcon name="plus" :size="15" /> Yangi inventarizatsiya
        </button>
      </div>

      <div v-if="loading" class="inv__empty">Yuklanmoqda...</div>
      <div v-else-if="!docs.length" class="inv__empty">
        <AppIcon name="package" :size="40" />
        <p>Hali inventarizatsiya o'tkazilmagan</p>
      </div>

      <table v-else class="inv__table">
        <thead>
          <tr>
            <th>Hujjat №</th><th>Sana</th><th>Ombor</th>
            <th class="ta-c">Tovarlar</th><th class="ta-r">Farq</th>
            <th>Holat</th><th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in docs" :key="d.id" class="inv__row" @click="openDoc(d.id)">
            <td><span class="inv__num">#{{ d.docNumber }}</span></td>
            <td>{{ d.date?.slice(0,10).split('-').reverse().join('.') }}</td>
            <td>{{ d.warehouse }}</td>
            <td class="ta-c"><span class="inv__badge">{{ d.itemCount }} ta</span></td>
            <td class="ta-r" :class="d.totalDiffSum < 0 ? 'neg' : (d.totalDiffSum > 0 ? 'pos' : '')">
              {{ d.status === 'finished' ? fmt(d.totalDiffSum) + ' so\'m' : '—' }}
            </td>
            <td><span class="st" :class="STATUS[d.status]?.cls">{{ STATUS[d.status]?.label }}</span></td>
            <td @click.stop>
              <button v-if="d.status !== 'finished' && canEdit('products')"
                      class="inv__mini inv__mini--del" title="O'chirish" @click="deleteDoc(d.id)">
                <AppIcon name="trash-2" :size="13" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- ══ Ochiq hujjat — sanoq ekrani ═════════════════════════════ -->
    <template v-else>
      <div class="inv__head">
        <div class="inv__head-l">
          <button class="inv__back" @click="closeDoc"><AppIcon name="arrow-left" :size="16" /></button>
          <div>
            <h1 class="inv__title">Inventarizatsiya #{{ doc.docNumber }}</h1>
            <p class="inv__sub">
              {{ doc.warehouse }} ·
              <span class="st" :class="STATUS[doc.status]?.cls">{{ STATUS[doc.status]?.label }}</span>
            </p>
          </div>
        </div>
        <button v-if="doc.status === 'draft' && canEdit('products')"
                class="inv__btn inv__btn--primary" :disabled="busy" @click="finishDoc">
          <AppIcon name="check-circle" :size="15" /> Tugatish
        </button>
      </div>

      <!-- Skaner maydoni — doim fokusda -->
      <div v-if="doc.status === 'draft'" class="scan">
        <div class="scan__l">
          <AppIcon name="camera" :size="20" />
          <input
            ref="scanInput"
            v-model="scanCode"
            class="scan__inp"
            placeholder="Shtrix-kodni skanerlang..."
            autocomplete="off"
            @keyup.enter="onScan"
            @blur="focusScanner"
          />
        </div>

        <!-- Oxirgi skan natijasi: katta va rangli, uzoqdan ko'rinadi -->
        <div v-if="lastScan" class="scan__last" :class="`scan__last--${lastScan.holat}`">
          <div class="scan__last-badge">
            {{ lastScan.holat === 'takror'   ? 'QAYTA URILDI'
             : lastScan.holat === 'ortiqcha' ? 'ORTIQCHA'
             : lastScan.holat === 'notanish' ? 'NOMA\'LUM TOVAR'
             : 'TOPILDI' }}
          </div>
          <div class="scan__last-name">{{ lastScan.item.productName }}</div>
          <div class="scan__last-qty">
            {{ fmtQ(lastScan.item.countedQty) }} / {{ fmtQ(lastScan.item.expectedQty) }}
          </div>
        </div>
      </div>

      <!-- Jarayon ko'rsatkichi -->
      <div class="prog">
        <div class="prog__bar"><div class="prog__fill" :style="{ width: progress + '%' }"></div></div>
        <span class="prog__txt">{{ progress }}% sanaldi</span>
      </div>

      <!-- Guruhlar: rasmda ko'rsatilganidek -->
      <div class="tabs">
        <button class="tabs__b" :class="{ on: tab==='notfound' }" @click="tab='notfound'">
          Topilmadi <span class="tabs__n">{{ notFound.length }}</span>
        </button>
        <button class="tabs__b" :class="{ on: tab==='found' }" @click="tab='found'">
          Topildi <span class="tabs__n tabs__n--ok">{{ found.length }}</span>
        </button>
        <button class="tabs__b" :class="{ on: tab==='extra' }" @click="tab='extra'">
          Ortiqcha <span class="tabs__n tabs__n--warn">{{ extra.length }}</span>
        </button>
      </div>

      <div v-if="!visibleItems.length" class="inv__empty inv__empty--sm">
        <AppIcon name="check-circle" :size="32" />
        <p>{{ tab === 'notfound' ? 'Hammasi topildi' : 'Bu ro\'yxat bo\'sh' }}</p>
      </div>

      <table v-else class="inv__table">
        <thead>
          <tr>
            <th>Tovar</th><th>Shtrix-kod</th>
            <th class="ta-c">Hisobda</th><th class="ta-c">Sanaldi</th>
            <th class="ta-c">Farq</th><th style="width:60px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in visibleItems" :key="it.id">
            <td>
              <span class="inv__pname">{{ it.productName }}</span>
              <span v-if="!it.productId" class="inv__tag">bazada yo'q</span>
            </td>
            <td class="inv__bc">{{ it.barcode || '—' }}</td>
            <td class="ta-c">{{ fmtQ(it.expectedQty) }}</td>
            <td class="ta-c">
              <input
                v-if="doc.status === 'draft' && canEdit('products')"
                class="inv__qty" type="number" min="0" step="1"
                :value="it.countedQty"
                @change="e => setCounted(it, e.target.value)"
              />
              <span v-else>{{ fmtQ(it.countedQty) }}</span>
            </td>
            <td class="ta-c" :class="it.diff < 0 ? 'neg' : (it.diff > 0 ? 'pos' : '')">
              {{ it.diff > 0 ? '+' : '' }}{{ fmtQ(it.diff) }}
            </td>
            <td>
              <button v-if="doc.status === 'draft' && !it.productId && canEdit('products')"
                      class="inv__mini inv__mini--del" title="O'chirish" @click="removeItem(it)">
                <AppIcon name="x" :size="13" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Yakunlangan hujjat xulosasi -->
      <div v-if="doc.status === 'finished'" class="summary">
        <div class="summary__i"><span>Hisobda edi</span><strong>{{ fmtQ(doc.totalExpected) }}</strong></div>
        <div class="summary__i"><span>Sanaldi</span><strong>{{ fmtQ(doc.totalCounted) }}</strong></div>
        <div class="summary__i">
          <span>Farq summasi</span>
          <strong :class="doc.totalDiffSum < 0 ? 'neg' : (doc.totalDiffSum > 0 ? 'pos' : '')">
            {{ fmt(doc.totalDiffSum) }} so'm
          </strong>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.inv { padding: 18px 22px; }

.inv__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px; }
.inv__head-l { display: flex; align-items: flex-start; gap: 12px; }
.inv__title { font-size: 20px; font-weight: 700; color: var(--color-text); }
.inv__sub { font-size: 12.5px; color: var(--color-text-muted, #64748b); margin-top: 3px; }

.inv__back {
  width: 34px; height: 34px; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px;
  background: #fff; cursor: pointer; color: #475569;
}
.inv__back:hover { background: #f8fafc; }

.inv__btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 15px; border-radius: 9px; border: 1px solid var(--color-border, #e2e8f0);
  background: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.inv__btn--primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.inv__btn--primary:hover:not(:disabled) { background: #4338ca; }
.inv__btn:disabled { opacity: .6; cursor: default; }

/* ── Skaner ── */
.scan {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px; margin-bottom: 14px;
  background: #f8fafc; border: 2px solid #4f46e5; border-radius: 12px;
}
.scan__l { display: flex; align-items: center; gap: 11px; flex: 1; color: #4f46e5; }
.scan__inp {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: 17px; font-weight: 600; color: var(--color-text);
}
.scan__inp::placeholder { color: #94a3b8; font-weight: 400; }

.scan__last {
  min-width: 260px; padding: 9px 14px; border-radius: 10px;
  border: 1px solid transparent;
}
.scan__last--topildi  { background: #ecfdf5; border-color: #a7f3d0; }
.scan__last--takror   { background: #fffbeb; border-color: #fde68a; }
.scan__last--ortiqcha { background: #fff7ed; border-color: #fed7aa; }
.scan__last--notanish { background: #fef2f2; border-color: #fecaca; }

.scan__last-badge { font-size: 10.5px; font-weight: 800; letter-spacing: .6px; }
.scan__last--topildi  .scan__last-badge { color: #059669; }
.scan__last--takror   .scan__last-badge { color: #d97706; }
.scan__last--ortiqcha .scan__last-badge { color: #ea580c; }
.scan__last--notanish .scan__last-badge { color: #dc2626; }

.scan__last-name { font-size: 13px; font-weight: 600; margin-top: 2px; color: var(--color-text); }
.scan__last-qty  { font-size: 12px; color: #64748b; margin-top: 1px; font-variant-numeric: tabular-nums; }

/* ── Progress ── */
.prog { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.prog__bar { flex: 1; height: 7px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
.prog__fill { height: 100%; background: linear-gradient(90deg, #6366f1, #22c55e); transition: width .25s; }
.prog__txt { font-size: 12px; color: #64748b; font-weight: 600; min-width: 92px; }

/* ── Tabs ── */
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--color-border, #e2e8f0); margin-bottom: 14px; }
.tabs__b {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 15px; border: none; background: none; cursor: pointer;
  font-size: 13px; font-weight: 600; color: #64748b;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tabs__b.on { color: #4f46e5; border-bottom-color: #4f46e5; }
.tabs__n {
  padding: 1px 7px; border-radius: 99px; background: #e2e8f0;
  font-size: 11px; font-weight: 700; color: #475569;
}
.tabs__n--ok   { background: #d1fae5; color: #047857; }
.tabs__n--warn { background: #ffedd5; color: #c2410c; }

/* ── Jadval ── */
.inv__table { width: 100%; border-collapse: collapse; font-size: 13px; }
.inv__table th {
  text-align: left; padding: 9px 11px; font-size: 11.5px; font-weight: 600;
  color: #64748b; border-bottom: 1px solid var(--color-border, #e2e8f0);
  text-transform: uppercase; letter-spacing: .3px;
}
.inv__table td { padding: 9px 11px; border-bottom: 1px solid #f1f5f9; }
.inv__row { cursor: pointer; }
.inv__row:hover { background: #f8fafc; }

.ta-c { text-align: center; }
.ta-r { text-align: right; }
.neg  { color: #dc2626; font-weight: 700; }
.pos  { color: #059669; font-weight: 700; }

.inv__num  { font-weight: 700; color: #4f46e5; }
.inv__pname{ font-weight: 600; }
.inv__bc   { font-family: ui-monospace, monospace; font-size: 12px; color: #64748b; }
.inv__badge{ padding: 2px 9px; border-radius: 99px; background: #eef2ff; color: #4338ca; font-size: 11.5px; font-weight: 600; }
.inv__tag  { margin-left: 7px; padding: 1px 7px; border-radius: 5px; background: #fef2f2; color: #dc2626; font-size: 10.5px; font-weight: 600; }

.inv__qty {
  width: 68px; padding: 4px 7px; text-align: center;
  border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12.5px; font-weight: 600;
}

.inv__mini {
  width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--color-border, #e2e8f0); border-radius: 6px;
  background: #fff; cursor: pointer; color: #64748b;
}
.inv__mini--del:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

.st { padding: 2px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; }
.st--draft  { background: #fef3c7; color: #b45309; }
.st--done   { background: #d1fae5; color: #047857; }
.st--cancel { background: #f1f5f9; color: #64748b; }

.inv__empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 56px 20px; color: #94a3b8; font-size: 13.5px;
}
.inv__empty--sm { padding: 34px 20px; }

.summary {
  display: flex; gap: 28px; margin-top: 16px; padding: 14px 18px;
  background: #f8fafc; border: 1px solid var(--color-border, #e2e8f0); border-radius: 10px;
}
.summary__i { display: flex; flex-direction: column; gap: 3px; }
.summary__i span { font-size: 11.5px; color: #64748b; }
.summary__i strong { font-size: 15px; font-weight: 700; }
</style>
