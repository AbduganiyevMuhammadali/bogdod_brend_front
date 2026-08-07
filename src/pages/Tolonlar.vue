<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { salesApi } from '@/api/sales.js'

// ── Sana ──────────────────────────────────────────────────────────
const today   = todayKey()
const selDate = ref(today)

function prevDay() {
  const d = new Date(selDate.value); d.setDate(d.getDate() - 1)
  selDate.value = toDateKey(d)
}
function nextDay() {
  const d = new Date(selDate.value); d.setDate(d.getDate() + 1)
  if (toDateKey(d) <= today) selDate.value = toDateKey(d)
}
function goToday() { selDate.value = today }

const isToday = computed(() => selDate.value === today)

const dateLabel = computed(() => {
  const d = new Date(selDate.value)
  if (selDate.value === today) return 'Bugun'
  return d.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })
})

// ── Ma'lumotlarni yuklash ─────────────────────────────────────────
const loading = ref(false)
const txns    = ref([])
const summary = ref({ income: 0, expense: 0, sale: 0, refund: 0, debt_payment: 0, net: 0 })

async function load() {
  loading.value = true
  try {
    const res = await salesApi.getCashReport({ date_from: selDate.value, date_to: selDate.value })
    txns.value    = res.transactions ?? []
    summary.value = res.summary ?? { income: 0, expense: 0, sale: 0, refund: 0, debt_payment: 0, net: 0 }
  } catch {
    txns.value    = []
    summary.value = { income: 0, expense: 0, sale: 0, refund: 0, debt_payment: 0, net: 0 }
  } finally { loading.value = false }
}

import { watch } from 'vue'
import { todayKey, toDateKey } from '@/composables/useDateTime.js'
watch(selDate, load)
onMounted(load)

// ── Hisob-kitob ───────────────────────────────────────────────────
const totalKirim  = computed(() =>
  (summary.value.income || 0) + (summary.value.sale || 0) + (summary.value.debt_payment || 0)
)
const totalChiqim = computed(() =>
  (summary.value.expense || 0) + (summary.value.refund || 0)
)
const qoldiq      = computed(() => totalKirim.value - totalChiqim.value)

// ── Kirim/Chiqim modal ────────────────────────────────────────────
const showModal  = ref(false)
const modalType  = ref('income')  // 'income' | 'expense'
const saving     = ref(false)
const entryForm  = reactive({ amount: '', payment_type: 'Naqd', description: '' })
const PAY_TYPES  = ['Naqd', 'Karta', "O'tkazma"]

function openEntry(type) {
  modalType.value = type
  entryForm.amount = ''
  entryForm.payment_type = 'Naqd'
  entryForm.description = ''
  showModal.value = true
}

async function submitEntry() {
  const amt = Number(entryForm.amount)
  if (!amt || amt <= 0) return
  saving.value = true
  try {
    await salesApi.cashEntry({
      type:         modalType.value,
      amount:       amt,
      payment_type: entryForm.payment_type,
      description:  entryForm.description || undefined,
    })
    showModal.value = false
    await load()
  } catch { /* silent */ }
  finally { saving.value = false }
}

// ── Filtrlash ─────────────────────────────────────────────────────
const filterType = ref('all')

const TYPE_LABELS = {
  income:       { label: 'Kirim',          color: '#10b981', bg: '#f0fdf4', icon: 'arrow-down-circle' },
  expense:      { label: 'Chiqim',         color: '#ef4444', bg: '#fff1f2', icon: 'arrow-up-circle'   },
  sale:         { label: 'Sotuv',          color: '#6366f1', bg: '#eef2ff', icon: 'shopping-cart'     },
  refund:       { label: 'Qaytarish',      color: '#f59e0b', bg: '#fffbeb', icon: 'rotate-ccw'        },
  debt_payment: { label: "Qarz to'lovi",   color: '#0ea5e9', bg: '#f0f9ff', icon: 'dollar-sign'       },
  opening:      { label: 'Ochilish',       color: '#8b5cf6', bg: '#f5f3ff', icon: 'unlock'            },
}

const FILTER_TABS = [
  { key: 'all',          label: 'Barchasi'       },
  { key: 'sale',         label: 'Sotuvlar'       },
  { key: 'debt_payment', label: "Qarz to'lovlari"},
  { key: 'income',       label: 'Kirimlar'       },
  { key: 'expense',      label: 'Chiqimlar'      },
]

const filtered = computed(() =>
  filterType.value === 'all' ? txns.value : txns.value.filter(t => t.type === filterType.value)
)

// ── Yordamchi ─────────────────────────────────────────────────────
function fmt(v)  { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="page">

    <!-- ── Top bar ────────────────────────────────────────────────── -->
    <div class="page__topbar">
      <div class="page__topbar-l">
        <h2 class="page__title">Kassa</h2>
        <div class="date-nav">
          <button class="date-btn" @click="prevDay"><AppIcon name="chevron-left"  :size="14"/></button>
          <span class="date-label">{{ dateLabel }}</span>
          <button class="date-btn" :disabled="isToday" @click="nextDay"><AppIcon name="chevron-right" :size="14"/></button>
          <button v-if="!isToday" class="today-btn" @click="goToday">Bugun</button>
        </div>
      </div>
      <div class="page__topbar-r">
        <button class="entry-btn entry-btn--out" @click="openEntry('expense')">
          <AppIcon name="arrow-up-circle" :size="15"/>
          Chiqim
        </button>
        <button class="entry-btn entry-btn--in" @click="openEntry('income')">
          <AppIcon name="arrow-down-circle" :size="15"/>
          Kirim
        </button>
      </div>
    </div>

    <!-- ── Summary cards ─────────────────────────────────────────── -->
    <div class="page__stats">
      <div class="scard scard--green">
        <div class="scard__ico"><AppIcon name="arrow-down-circle" :size="18"/></div>
        <div class="scard__body">
          <p class="scard__lbl">Jami kirim</p>
          <p class="scard__val">{{ fmt(totalKirim) }} <em>so'm</em></p>
          <p class="scard__sub">
            Sotuv: {{ fmt(summary.sale) }} ·
            Qarz to'lovi: {{ fmt(summary.debt_payment) }} ·
            Kirim: {{ fmt(summary.income) }}
          </p>
        </div>
      </div>
      <div class="scard scard--red">
        <div class="scard__ico"><AppIcon name="arrow-up-circle" :size="18"/></div>
        <div class="scard__body">
          <p class="scard__lbl">Jami chiqim</p>
          <p class="scard__val">{{ fmt(totalChiqim) }} <em>so'm</em></p>
          <p class="scard__sub">
            Chiqim: {{ fmt(summary.expense) }} ·
            Qaytarish: {{ fmt(summary.refund) }}
          </p>
        </div>
      </div>
      <div class="scard" :class="qoldiq >= 0 ? 'scard--indigo' : 'scard--amber'">
        <div class="scard__ico"><AppIcon name="layers" :size="18"/></div>
        <div class="scard__body">
          <p class="scard__lbl">Kassa qoldig'i</p>
          <p class="scard__val">{{ fmt(qoldiq) }} <em>so'm</em></p>
          <p class="scard__sub">{{ txns.length }} ta tranzaksiya</p>
        </div>
      </div>
    </div>

    <!-- ── Filter tabs ────────────────────────────────────────────── -->
    <div class="page__tabs">
      <button
        v-for="tab in FILTER_TABS" :key="tab.key"
        class="page__tab" :class="{ on: filterType === tab.key }"
        @click="filterType = tab.key"
      >
        {{ tab.label }}
        <span class="page__tab-cnt">
          {{ tab.key === 'all' ? txns.length : txns.filter(t => t.type === tab.key).length }}
        </span>
      </button>
    </div>

    <!-- ── Transactions table ─────────────────────────────────────── -->
    <div class="page__table-wrap">
      <div v-if="loading" class="page__empty">
        <AppIcon name="loader" :size="28" :stroke-width="1.5" class="spin"/>
        <p>Yuklanmoqda...</p>
      </div>
      <div v-else-if="filtered.length === 0" class="page__empty">
        <AppIcon name="inbox" :size="36" :stroke-width="1.2"/>
        <p>Bu kunda tranzaksiyalar yo'q</p>
      </div>
      <table v-else class="dtable">
        <thead>
          <tr>
            <th>Vaqt</th>
            <th>Tur</th>
            <th>Tavsif</th>
            <th>To'lov turi</th>
            <th>Mijoz</th>
            <th class="ta-r">Summa</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in filtered" :key="t.id" class="dtable__row">
            <td class="txn-time">{{ fmtTime(t.date) }}</td>
            <td>
              <span class="type-badge"
                :style="{ color: TYPE_LABELS[t.type]?.color, background: TYPE_LABELS[t.type]?.bg }">
                <AppIcon :name="TYPE_LABELS[t.type]?.icon || 'circle'" :size="11"/>
                {{ TYPE_LABELS[t.type]?.label || t.type }}
              </span>
            </td>
            <td class="txn-desc">{{ t.description || '—' }}</td>
            <td class="txn-pay">{{ t.payment_type || '—' }}</td>
            <td class="txn-client">{{ t.client?.name || '—' }}</td>
            <td class="ta-r">
              <span class="txn-amount"
                :class="['income','sale','debt_payment','opening'].includes(t.type) ? 'amount--pos' : 'amount--neg'">
                {{ ['income','sale','debt_payment','opening'].includes(t.type) ? '+' : '−' }}{{ fmt(t.amount) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Kirim / Chiqim modal ───────────────────────────────────── -->
    <teleport to="body">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal">
          <div class="modal__hdr">
            <h3 :class="modalType === 'income' ? 'hdr--green' : 'hdr--red'">
              <AppIcon :name="modalType === 'income' ? 'arrow-down-circle' : 'arrow-up-circle'" :size="18"/>
              {{ modalType === 'income' ? 'Kassa kirimi' : 'Kassa chiqimi' }}
            </h3>
            <button class="modal__close" @click="showModal = false">
              <AppIcon name="x" :size="16"/>
            </button>
          </div>
          <div class="modal__body">
            <div class="mf__field">
              <label>Summa (so'm)</label>
              <input
                v-model="entryForm.amount"
                class="mf__inp mf__inp--lg"
                type="number" min="1" placeholder="0"
                @keydown.enter="submitEntry"
              />
            </div>
            <div class="mf__field">
              <label>To'lov turi</label>
              <div class="pay-type-row">
                <button
                  v-for="pt in PAY_TYPES" :key="pt"
                  class="pay-type-btn" :class="{ on: entryForm.payment_type === pt }"
                  @click="entryForm.payment_type = pt"
                >{{ pt }}</button>
              </div>
            </div>
            <div class="mf__field">
              <label>Izoh (ixtiyoriy)</label>
              <input v-model="entryForm.description" class="mf__inp" placeholder="Sababi..." @keydown.enter="submitEntry"/>
            </div>
          </div>
          <div class="modal__footer">
            <button class="mf__btn mf__btn--cancel" @click="showModal = false">Bekor</button>
            <button
              class="mf__btn"
              :class="modalType === 'income' ? 'mf__btn--in' : 'mf__btn--out'"
              :disabled="saving || !Number(entryForm.amount)"
              @click="submitEntry"
            >
              <AppIcon v-if="saving" name="loader" :size="14" class="spin"/>
              <AppIcon v-else :name="modalType === 'income' ? 'check' : 'check'" :size="14"/>
              Saqlash
            </button>
          </div>
        </div>
      </div>
    </teleport>

  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; height:calc(100vh - var(--header-h)); overflow:hidden; }

/* Top bar */
.page__topbar { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid var(--color-border); flex-shrink:0; gap:16px; }
.page__topbar-l { display:flex; align-items:center; gap:16px; }
.page__topbar-r { display:flex; gap:8px; }
.page__title { font-size:18px; font-weight:800; color:var(--color-text); letter-spacing:-0.03em; }

/* Date nav */
.date-nav { display:flex; align-items:center; gap:6px; }
.date-btn { width:28px; height:28px; border-radius:var(--r-lg); border:1.5px solid var(--color-border); display:flex; align-items:center; justify-content:center; color:var(--color-text-3); cursor:pointer; transition:background var(--t-base); }
.date-btn:hover:not(:disabled) { background:var(--slate-100); color:var(--color-text); }
.date-btn:disabled { opacity:.4; cursor:default; }
.date-label { font-size:13.5px; font-weight:700; color:var(--color-text); min-width:80px; text-align:center; }
.today-btn { padding:0 12px; height:28px; border-radius:var(--r-lg); background:var(--indigo-50); color:var(--indigo-600); font-size:12px; font-weight:700; cursor:pointer; border:1.5px solid var(--indigo-200); font-family:inherit; }

/* Entry buttons */
.entry-btn { display:flex; align-items:center; gap:7px; padding:0 18px; height:38px; border-radius:var(--r-xl); font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity var(--t-base); }
.entry-btn--in  { background:linear-gradient(135deg,#10b981,#059669); color:white; box-shadow:0 4px 12px rgba(16,185,129,.3); }
.entry-btn--out { background:linear-gradient(135deg,#ef4444,#dc2626); color:white; box-shadow:0 4px 12px rgba(239,68,68,.3); }
.entry-btn:hover { opacity:.88; }

/* Summary cards */
.page__stats { display:flex; gap:12px; padding:14px 24px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.scard { flex:1; display:flex; align-items:flex-start; gap:14px; padding:14px 18px; border-radius:var(--r-xl); border:1px solid var(--color-border); background:var(--color-surface); }
.scard--green  { border-color:#bbf7d0; background:#f0fdf4; }
.scard--red    { border-color:#fecdd3; background:#fff1f2; }
.scard--indigo { border-color:var(--indigo-100); background:var(--indigo-50); }
.scard--amber  { border-color:#fde68a; background:#fffbeb; }
.scard__ico { width:40px; height:40px; border-radius:var(--r-xl); background:rgba(255,255,255,.7); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.scard--green  .scard__ico { color:#16a34a; }
.scard--red    .scard__ico { color:#e11d48; }
.scard--indigo .scard__ico { color:var(--indigo-600); }
.scard--amber  .scard__ico { color:#d97706; }
.scard__lbl { font-size:11px; font-weight:600; color:var(--color-text-3); text-transform:uppercase; letter-spacing:.04em; }
.scard__val { font-size:20px; font-weight:800; color:var(--color-text); letter-spacing:-0.03em; margin-top:4px; }
.scard__val em { font-style:normal; font-size:13px; font-weight:500; color:var(--color-text-3); }
.scard__sub { font-size:11px; color:var(--color-text-3); margin-top:4px; }

/* Tabs */
.page__tabs { display:flex; align-items:center; gap:2px; padding:0 24px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.page__tab { display:flex; align-items:center; gap:6px; padding:11px 14px; font-size:13px; font-weight:600; color:var(--color-text-3); border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; transition:color var(--t-base),border-color var(--t-base); font-family:inherit; }
.page__tab:hover { color:var(--color-text-2); }
.page__tab.on { color:var(--indigo-600); border-bottom-color:var(--indigo-500); }
.page__tab-cnt { min-width:18px; height:18px; border-radius:99px; background:var(--slate-100); color:var(--color-text-3); font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; padding:0 5px; }
.page__tab.on .page__tab-cnt { background:var(--indigo-100); color:var(--indigo-600); }

/* Table */
.page__table-wrap { flex:1; overflow-y:auto; padding:14px 24px 20px; }
.page__empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:60px 20px; color:var(--color-text-3); font-size:13px; }
.dtable { width:100%; border-collapse:collapse; }
.dtable thead th { padding:7px 12px; font-size:10.5px; font-weight:700; color:var(--color-text-3); text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--color-border); text-align:left; }
.dtable__row td { padding:10px 12px; border-bottom:1px solid var(--color-border); vertical-align:middle; }
.dtable__row:last-child td { border-bottom:none; }
.dtable__row:hover td { background:var(--slate-50); }

.txn-time   { font-size:12px; color:var(--color-text-3); white-space:nowrap; font-variant-numeric:tabular-nums; }
.txn-desc   { font-size:13px; color:var(--color-text); max-width:240px; }
.txn-pay    { font-size:12px; color:var(--color-text-3); }
.txn-client { font-size:13px; color:var(--color-text-2); }
.type-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:99px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.txn-amount { font-size:13.5px; font-weight:700; }
.amount--pos { color:#16a34a; }
.amount--neg { color:#e11d48; }
.ta-r { text-align:right; }

/* Modal */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:500; padding:20px; animation:ov-in .18s ease; }
@keyframes ov-in { from{opacity:0} to{opacity:1} }
.modal { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--r-2xl); box-shadow:0 20px 60px rgba(0,0,0,.2); width:420px; max-width:95vw; animation:modal-in .2s ease; }
@keyframes modal-in { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:none} }
.modal__hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 16px; border-bottom:1px solid var(--color-border); }
.modal__hdr h3 { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700; }
.hdr--green { color:#16a34a; }
.hdr--red   { color:#e11d48; }
.modal__close { width:30px; height:30px; border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; color:var(--color-text-3); cursor:pointer; }
.modal__close:hover { background:var(--slate-100); }
.modal__body { padding:20px; display:flex; flex-direction:column; gap:14px; }
.modal__footer { padding:14px 20px; border-top:1px solid var(--color-border); display:flex; gap:10px; justify-content:flex-end; }

.mf__field { display:flex; flex-direction:column; gap:5px; }
.mf__field label { font-size:11.5px; font-weight:600; color:var(--color-text-2); }
.mf__inp { height:38px; padding:0 12px; border:1.5px solid var(--color-border); border-radius:var(--r-lg); font-size:13.5px; color:var(--color-text); background:var(--color-surface); outline:none; font-family:inherit; width:100%; transition:border-color var(--t-base); }
.mf__inp--lg { height:50px; font-size:22px; font-weight:700; letter-spacing:-0.02em; }
.mf__inp:focus { border-color:var(--indigo-300); box-shadow:0 0 0 3px rgba(99,102,241,.08); }
.pay-type-row { display:flex; gap:8px; }
.pay-type-btn { flex:1; height:36px; border:1.5px solid var(--color-border); border-radius:var(--r-lg); font-size:13px; font-weight:600; color:var(--color-text-2); cursor:pointer; font-family:inherit; transition:all var(--t-base); }
.pay-type-btn.on { background:var(--indigo-500); border-color:var(--indigo-500); color:white; }
.mf__btn { display:flex; align-items:center; gap:7px; height:38px; padding:0 20px; border-radius:var(--r-lg); font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; transition:opacity var(--t-base); }
.mf__btn:disabled { opacity:.5; cursor:not-allowed; }
.mf__btn--cancel { border:1.5px solid var(--color-border); color:var(--color-text-2); }
.mf__btn--cancel:hover:not(:disabled) { background:var(--slate-50); }
.mf__btn--in  { background:linear-gradient(135deg,#10b981,#059669); color:white; }
.mf__btn--out { background:linear-gradient(135deg,#ef4444,#dc2626); color:white; }

@keyframes spin { to{transform:rotate(360deg)} }
.spin { animation:spin .8s linear infinite; }
</style>
