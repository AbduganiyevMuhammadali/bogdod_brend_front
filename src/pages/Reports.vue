<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { reportsApi } from '@/api/reports.js'
import { todayKey } from '@/composables/useDateTime.js'

// ── Tabs ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'today',     label: 'Bugungi sotuvlar',   icon: 'sun'        },
  { key: 'products',  label: 'Tovar hisoboti',     icon: 'package'    },
  { key: 'clients',   label: 'Mijoz hisoboti',     icon: 'users'      },
  { key: 'cashiers',  label: 'Kassir hisoboti',    icon: 'user-check' },
  { key: 'kassa',     label: 'Kassa registeri',    icon: 'credit-card'},
  { key: 'profit',    label: 'Foyda hisoboti',     icon: 'trending-up'},
  { key: 'suppliers', label: 'Yetkazuvchi oldi-berdi', icon: 'truck'  },
]
const tab = ref('today')

// ── Date range ───────────────────────────────────────────────────
const today    = todayKey()
const dateFrom = ref(today)
const dateTo   = ref(today)

// ── Overview ─────────────────────────────────────────────────────
const overview = ref(null)
async function loadOverview() {
  try { overview.value = await reportsApi.getOverview() } catch { overview.value = null }
}

// ── Today's sales ─────────────────────────────────────────────────
const todaySales = ref([])
const todayLoad  = ref(false)
const todayDate  = ref(today)
async function loadToday() {
  todayLoad.value = true
  try { todaySales.value = await reportsApi.getTodaySales({ date: todayDate.value }) }
  catch { todaySales.value = [] }
  finally { todayLoad.value = false }
}
watch(todayDate, loadToday)

// ── Product sales ─────────────────────────────────────────────────
const products    = ref([])
const prodLoad    = ref(false)
const prodSearch  = ref('')
async function loadProducts() {
  prodLoad.value = true
  try { products.value = await reportsApi.getProductSales({ date_from: dateFrom.value, date_to: dateTo.value }) }
  catch { products.value = [] }
  finally { prodLoad.value = false }
}

const filteredProducts = computed(() => {
  const q = prodSearch.value.toLowerCase()
  return q ? products.value.filter(p => p.product_name.toLowerCase().includes(q)) : products.value
})

// ── Client report ─────────────────────────────────────────────────
const clients    = ref([])
const cliLoad    = ref(false)
const cliSearch  = ref('')
async function loadClients() {
  cliLoad.value = true
  try { clients.value = await reportsApi.getClientReport({ date_from: dateFrom.value, date_to: dateTo.value }) }
  catch { clients.value = [] }
  finally { cliLoad.value = false }
}

const filteredClients = computed(() => {
  const q = cliSearch.value.toLowerCase()
  return q ? clients.value.filter(c => (c.client_name||'').toLowerCase().includes(q)) : clients.value
})

// ── Cashier report ────────────────────────────────────────────────
const cashiers  = ref([])
const cashLoad  = ref(false)
async function loadCashiers() {
  cashLoad.value = true
  try { cashiers.value = await reportsApi.getCashierReport({ date_from: dateFrom.value, date_to: dateTo.value }) }
  catch { cashiers.value = [] }
  finally { cashLoad.value = false }
}

// ── Kassa register ────────────────────────────────────────────────
const kassaData = ref(null)
const kassaLoad = ref(false)
async function loadKassa() {
  kassaLoad.value = true
  try { kassaData.value = await reportsApi.getCashRegister({ date_from: dateFrom.value, date_to: dateTo.value }) }
  catch { kassaData.value = null }
  finally { kassaLoad.value = false }
}

// ── Profit report ─────────────────────────────────────────────────
const profitData   = ref(null)
const profitLoad   = ref(false)
const profitGroup  = ref('product')
const profitSearch = ref('')
async function loadProfit() {
  profitLoad.value = true
  try { profitData.value = await reportsApi.getProfitReport({ date_from: dateFrom.value, date_to: dateTo.value, group_by: profitGroup.value }) }
  catch { profitData.value = null }
  finally { profitLoad.value = false }
}
watch(profitGroup, loadProfit)

const filteredProfitRows = computed(() => {
  if (!profitData.value?.rows) return []
  const q = profitSearch.value.toLowerCase()
  if (!q || profitGroup.value === 'date') return profitData.value.rows
  return profitData.value.rows.filter(r => (r.product_name || '').toLowerCase().includes(q))
})

const maxProfitRev = computed(() => Math.max(...(profitData.value?.rows || []).map(r => r.revenue), 1))

// ── Supplier report ───────────────────────────────────────────────
const suppData   = ref(null)
const suppLoad   = ref(false)
const suppSearch = ref('')
async function loadSuppliers() {
  suppLoad.value = true
  try { suppData.value = await reportsApi.getSupplierReport({ date_from: dateFrom.value, date_to: dateTo.value }) }
  catch { suppData.value = null }
  finally { suppLoad.value = false }
}

const filteredSuppliers = computed(() => {
  if (!suppData.value?.all) return []
  const q = suppSearch.value.toLowerCase()
  const list = q
    ? suppData.value.all.filter(s => s.name.toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q))
    : suppData.value.all
  return list.filter(s => s.total_sum > 0 || s.balance !== 0)
})

// ── Load tab data ─────────────────────────────────────────────────
async function refreshTab() {
  if (tab.value === 'today')     loadToday()
  if (tab.value === 'products')  loadProducts()
  if (tab.value === 'clients')   loadClients()
  if (tab.value === 'cashiers')  loadCashiers()
  if (tab.value === 'kassa')     loadKassa()
  if (tab.value === 'profit')    loadProfit()
  if (tab.value === 'suppliers') loadSuppliers()
}

watch(tab, refreshTab)

onMounted(async () => {
  await loadOverview()
  loadToday()
})

// ── Currency ──────────────────────────────────────────────────────
const POS_SETTINGS_KEY = 'pos_settings'
function loadRate() {
  try { const s = JSON.parse(localStorage.getItem(POS_SETTINGS_KEY) || '{}'); return { rate: Number(s.exchangeRate) || 0, show: !!s.showUSD } }
  catch { return { rate: 0, show: false } }
}
const { rate: exchangeRate, show: showUSD } = loadRate()
function toUSD(v) {
  if (!showUSD || exchangeRate <= 0) return null
  return (Number(v) / exchangeRate).toFixed(2)
}

// ── Helpers ───────────────────────────────────────────────────────
function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('uz-UZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

const PAY_COLORS = { 'Naqd': '#10b981', 'Karta': '#6366f1', "O'tkazma": '#f59e0b', 'Qarz': '#ef4444' }

// Product rank bar width
const maxProdSum = computed(() => Math.max(...filteredProducts.value.map(p => p.total_sum), 1))

// Cashier total for %
const totalCashierRev = computed(() => cashiers.value.reduce((s, c) => s + c.total_sum, 0) || 1)
</script>

<template>
<div class="rep">

  <!-- ── Page header ──────────────────────────────────────────── -->
  <div class="rep__hdr">
    <div class="rep__hdr-l">
      <div class="rep__hdr-ico"><AppIcon name="bar-chart-2" :size="18" :stroke-width="2"/></div>
      <div>
        <h1 class="rep__hdr-title">Hisobotlar</h1>
        <p class="rep__hdr-sub">Savdo tahlili va statistika</p>
      </div>
    </div>
    <!-- Date range -->
    <div class="rep__daterange">
      <label class="dr-lbl">Dan: <input v-model="dateFrom" type="date" class="dr-inp"/></label>
      <label class="dr-lbl">Gacha: <input v-model="dateTo" type="date" class="dr-inp"/></label>
      <button class="dr-btn" @click="refreshTab">
        <AppIcon name="refresh-cw" :size="14"/> Yangilash
      </button>
    </div>
  </div>

  <!-- ── Overview cards ───────────────────────────────────────── -->
  <div v-if="overview" class="ov-cards">
    <div class="ov-card ov-card--indigo">
      <div class="ov-card__ico"><AppIcon name="shopping-cart" :size="18"/></div>
      <div class="ov-card__body">
        <div class="ov-card__val">{{ overview.today.sales_count }}</div>
        <div class="ov-card__lbl">Bugungi sotuvlar</div>
        <div class="ov-card__sub">Oyda: {{ overview.month.sales_count }}</div>
      </div>
    </div>
    <div class="ov-card ov-card--green">
      <div class="ov-card__ico"><AppIcon name="trending-up" :size="18"/></div>
      <div class="ov-card__body">
        <div class="ov-card__val">{{ fmt(overview.today.revenue) }}</div>
        <div class="ov-card__lbl">Bugungi tushum (so'm)</div>
        <div class="ov-card__sub">Oyda: {{ fmt(overview.month.revenue) }}</div>
      </div>
    </div>
    <div class="ov-card ov-card--amber">
      <div class="ov-card__ico"><AppIcon name="package" :size="18"/></div>
      <div class="ov-card__body">
        <div class="ov-card__val">{{ overview.today.items }}</div>
        <div class="ov-card__lbl">Bugun sotilgan tovar</div>
        <div class="ov-card__sub">Hafta: {{ overview.week.items }}</div>
      </div>
    </div>
    <div class="ov-card ov-card--rose">
      <div class="ov-card__ico"><AppIcon name="clock" :size="18"/></div>
      <div class="ov-card__body">
        <div class="ov-card__val">{{ fmt(overview.today.debt) }}</div>
        <div class="ov-card__lbl">Bugungi qarz (so'm)</div>
        <div class="ov-card__sub">Oyda: {{ fmt(overview.month.debt) }}</div>
      </div>
    </div>
    <div class="ov-card ov-card--violet">
      <div class="ov-card__ico"><AppIcon name="calendar" :size="18"/></div>
      <div class="ov-card__body">
        <div class="ov-card__val">{{ overview.week.sales_count }}</div>
        <div class="ov-card__lbl">Haftalik sotuvlar</div>
        <div class="ov-card__sub">{{ fmt(overview.week.revenue) }} so'm</div>
      </div>
    </div>
  </div>

  <!-- ── Tabs ──────────────────────────────────────────────────── -->
  <div class="rep__tabs">
    <button v-for="t in TABS" :key="t.key"
      :class="['rep__tab', tab === t.key && 'rep__tab--on']"
      @click="tab = t.key">
      <AppIcon :name="t.icon" :size="14"/>
      {{ t.label }}
    </button>
  </div>

  <!-- ══ TODAY ════════════════════════════════════════════════════ -->
  <div v-if="tab === 'today'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Bugungi sotuvlar</span>
      <input v-model="todayDate" type="date" class="dr-inp"/>
      <button class="dr-btn" @click="loadToday"><AppIcon name="refresh-cw" :size="13"/></button>
    </div>
    <div v-if="todayLoad" class="rep__loading"><div v-for="i in 6" :key="i" class="skeleton sk-row"></div></div>
    <div v-else-if="!todaySales.length" class="rep__empty">
      <AppIcon name="inbox" :size="40" :stroke-width="1.2"/>
      <p>Bugun sotuv yo'q</p>
    </div>
    <div v-else class="tbl-wrap">
      <table class="rep-tbl">
        <thead>
          <tr><th>№</th><th>Vaqt</th><th>Mijoz</th><th>To'lov</th><th class="ta-c">Tovar</th><th class="ta-r">Summa</th><th class="ta-r">To'landi</th><th class="ta-r">Qarz</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in todaySales" :key="s.id" class="rep-row">
            <td><span class="doc-badge">#{{ s.doc_number }}</span></td>
            <td class="c-dim">{{ fmtDate(s.date) }}</td>
            <td class="c-bold">{{ s.client?.name || '—' }}</td>
            <td>
              <span class="pay-dot" :style="{ background: PAY_COLORS[s.payment_type] || '#94a3b8' }"></span>
              {{ s.payment_type }}
            </td>
            <td class="ta-c">
              <span class="cnt-badge">{{ s.items?.length || 0 }} ta</span>
            </td>
            <td class="ta-r c-bold">{{ fmt(s.total_sum) }} <span class="c-dim sm">so'm</span></td>
            <td class="ta-r" style="color:#10b981;font-weight:600">{{ fmt(s.paid_sum) }}</td>
            <td class="ta-r">
              <span v-if="Number(s.debt_sum)>0" class="debt-badge">{{ fmt(s.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile card list -->
      <div class="rep-cards">
        <div v-for="(s, idx) in todaySales" :key="'m-'+s.id" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
          <div class="rep-card__top">
            <span class="doc-badge">#{{ s.doc_number }}</span>
            <span class="ta-r c-bold">{{ fmt(s.total_sum) }} <span class="c-dim sm">so'm</span></span>
          </div>
          <div class="rep-card__mid">
            <span class="c-bold">{{ s.client?.name || '—' }}</span>
            <span class="rep-card__pay"><span class="pay-dot" :style="{ background: PAY_COLORS[s.payment_type] || '#94a3b8' }"></span>{{ s.payment_type }}</span>
          </div>
          <div class="rep-card__rows">
            <div class="rep-card__field"><span class="c-dim sm">Vaqt</span><span>{{ fmtDate(s.date) }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Tovar</span><span class="cnt-badge">{{ s.items?.length || 0 }} ta</span></div>
            <div class="rep-card__field"><span class="c-dim sm">To'landi</span><span style="color:#10b981;font-weight:600">{{ fmt(s.paid_sum) }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Qarz</span>
              <span v-if="Number(s.debt_sum)>0" class="debt-badge">{{ fmt(s.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Today mini summary -->
    <div v-if="todaySales.length" class="today-summary">
      <div class="ts-item ts-item--green">
        <span>Jami sotuv:</span>
        <span>{{ fmt(todaySales.reduce((s,x)=>s+Number(x.total_sum||0),0)) }} so'm</span>
      </div>
      <div class="ts-item ts-item--indigo">
        <span>To'langan:</span>
        <span>{{ fmt(todaySales.reduce((s,x)=>s+Number(x.paid_sum||0),0)) }} so'm</span>
      </div>
      <div class="ts-item ts-item--rose">
        <span>Qarz:</span>
        <span>{{ fmt(todaySales.reduce((s,x)=>s+Number(x.debt_sum||0),0)) }} so'm</span>
      </div>
      <div class="ts-item ts-item--amber">
        <span>Sotuvlar soni:</span>
        <span>{{ todaySales.length }} ta</span>
      </div>
    </div>
  </div>

  <!-- ══ PRODUCTS ═════════════════════════════════════════════════ -->
  <div v-else-if="tab === 'products'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Tovar hisoboti</span>
      <input v-model="prodSearch" class="panel__search" placeholder="Tovar nomi..."/>
      <button class="dr-btn" @click="loadProducts"><AppIcon name="refresh-cw" :size="13"/></button>
      <span class="panel__count">{{ filteredProducts.length }} ta tovar</span>
    </div>
    <div v-if="prodLoad" class="rep__loading"><div v-for="i in 8" :key="i" class="skeleton sk-row"></div></div>
    <div v-else-if="!filteredProducts.length" class="rep__empty">
      <AppIcon name="package" :size="40" :stroke-width="1.2"/>
      <p>Ma'lumot yo'q</p>
    </div>
    <div v-else class="tbl-wrap">
      <table class="rep-tbl">
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th>Tovar nomi</th>
            <th>Ombor</th>
            <th class="ta-c">Sotuvlar</th>
            <th class="ta-r">Miqdori</th>
            <th class="ta-r">O'rt. narx</th>
            <th class="ta-r">Jami summa</th>
            <th style="width:140px">Ulushi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in filteredProducts" :key="p.product_id + p.product_name" class="rep-row">
            <td><span class="rank-badge" :class="idx<3&&`rank-badge--${idx+1}`">{{ idx+1 }}</span></td>
            <td class="c-bold">{{ p.product_name }}</td>
            <td class="c-dim">{{ p.warehouse || '—' }}</td>
            <td class="ta-c"><span class="cnt-badge">{{ p.sales_count }}</span></td>
            <td class="ta-r">{{ p.total_qty }} dona</td>
            <td class="ta-r c-dim">{{ fmt(p.avg_price) }}</td>
            <td class="ta-r c-bold" style="color:#6366f1">{{ fmt(p.total_sum) }} <span class="sm c-dim">so'm</span></td>
            <td>
              <div class="bar-wrap">
                <div class="bar-fill" :style="{ width: (p.total_sum / maxProdSum * 100).toFixed(1)+'%' }"></div>
                <span class="bar-pct">{{ ((p.total_sum / maxProdSum) * 100).toFixed(0) }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile card list -->
      <div class="rep-cards">
        <div v-for="(p, idx) in filteredProducts" :key="'m-'+p.product_id+p.product_name" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
          <div class="rep-card__top">
            <span class="rep-card__name"><span class="rank-badge" :class="idx<3&&`rank-badge--${idx+1}`">{{ idx+1 }}</span> {{ p.product_name }}</span>
            <span class="ta-r c-bold" style="color:#6366f1">{{ fmt(p.total_sum) }} <span class="sm c-dim">so'm</span></span>
          </div>
          <div class="rep-card__rows">
            <div class="rep-card__field"><span class="c-dim sm">Ombor</span><span>{{ p.warehouse || '—' }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Sotuvlar</span><span class="cnt-badge">{{ p.sales_count }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Miqdori</span><span>{{ p.total_qty }} dona</span></div>
            <div class="rep-card__field"><span class="c-dim sm">O'rt. narx</span><span class="c-dim">{{ fmt(p.avg_price) }}</span></div>
          </div>
          <div class="bar-wrap" style="margin-top:8px">
            <div class="bar-fill" :style="{ width: (p.total_sum / maxProdSum * 100).toFixed(1)+'%' }"></div>
            <span class="bar-pct">{{ ((p.total_sum / maxProdSum) * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>
    </div>
    <!-- Product totals footer -->
    <div v-if="filteredProducts.length" class="tbl-footer">
      <span>Jami: <strong>{{ filteredProducts.length }}</strong> xil tovar</span>
      <span>Jami miqdor: <strong>{{ filteredProducts.reduce((s,p)=>s+p.total_qty,0) }}</strong> dona</span>
      <span>Jami tushum: <strong>{{ fmt(filteredProducts.reduce((s,p)=>s+p.total_sum,0)) }}</strong> so'm</span>
    </div>
  </div>

  <!-- ══ CLIENTS ══════════════════════════════════════════════════ -->
  <div v-else-if="tab === 'clients'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Mijoz hisoboti</span>
      <input v-model="cliSearch" class="panel__search" placeholder="Mijoz nomi..."/>
      <button class="dr-btn" @click="loadClients"><AppIcon name="refresh-cw" :size="13"/></button>
      <span class="panel__count">{{ filteredClients.length }} ta mijoz</span>
    </div>
    <div v-if="cliLoad" class="rep__loading"><div v-for="i in 6" :key="i" class="skeleton sk-row"></div></div>
    <div v-else-if="!filteredClients.length" class="rep__empty">
      <AppIcon name="users" :size="40" :stroke-width="1.2"/>
      <p>Ma'lumot yo'q</p>
    </div>
    <div v-else class="tbl-wrap">
      <table class="rep-tbl">
        <thead>
          <tr>
            <th>#</th><th>Mijoz</th><th>Telefon</th>
            <th class="ta-c">Sotuvlar</th>
            <th class="ta-r">Jami xarid</th>
            <th class="ta-r">To'langan</th>
            <th class="ta-r">Qarz (sotuv)</th>
            <th class="ta-r">Joriy balans</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, idx) in filteredClients" :key="c.client_id || idx" class="rep-row">
            <td class="c-dim">{{ idx+1 }}</td>
            <td>
              <div class="cli-cell">
                <div class="cli-av">{{ (c.client_name||'?')[0].toUpperCase() }}</div>
                <div>
                  <div class="c-bold">{{ c.client_name }}</div>
                  <div class="c-dim sm">{{ c.client_code }}</div>
                </div>
              </div>
            </td>
            <td class="c-dim">{{ c.phone || '—' }}</td>
            <td class="ta-c"><span class="cnt-badge">{{ c.sales_count }}</span></td>
            <td class="ta-r c-bold">{{ fmt(c.total_sum) }} <span class="sm c-dim">so'm</span></td>
            <td class="ta-r" style="color:#10b981;font-weight:600">{{ fmt(c.paid_sum) }}</td>
            <td class="ta-r">
              <span v-if="c.debt_sum > 0" class="debt-badge">{{ fmt(c.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </td>
            <td class="ta-r">
              <span :class="c.balance < 0 ? 'bal-neg' : 'bal-pos'">
                {{ c.balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(c.balance)) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile card list -->
      <div class="rep-cards">
        <div v-for="(c, idx) in filteredClients" :key="'m-'+(c.client_id || idx)" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
          <div class="rep-card__top">
            <span class="rep-card__name"><span class="cli-av cli-av--sm">{{ (c.client_name||'?')[0].toUpperCase() }}</span> {{ c.client_name }}</span>
            <span :class="c.balance < 0 ? 'bal-neg' : 'bal-pos'">{{ c.balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(c.balance)) }}</span>
          </div>
          <div class="rep-card__mid">
            <span class="c-dim sm">{{ c.client_code }}</span>
            <span class="c-dim sm">{{ c.phone || '—' }}</span>
          </div>
          <div class="rep-card__rows">
            <div class="rep-card__field"><span class="c-dim sm">Sotuvlar</span><span class="cnt-badge">{{ c.sales_count }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Jami xarid</span><span class="c-bold">{{ fmt(c.total_sum) }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">To'langan</span><span style="color:#10b981;font-weight:600">{{ fmt(c.paid_sum) }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Qarz</span>
              <span v-if="c.debt_sum > 0" class="debt-badge">{{ fmt(c.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="filteredClients.length" class="tbl-footer">
      <span>Jami xarid: <strong>{{ fmt(filteredClients.reduce((s,c)=>s+c.total_sum,0)) }}</strong> so'm</span>
      <span>Umumiy qarz: <strong style="color:#ef4444">{{ fmt(filteredClients.reduce((s,c)=>s+c.debt_sum,0)) }}</strong> so'm</span>
    </div>
  </div>

  <!-- ══ CASHIERS ═════════════════════════════════════════════════ -->
  <div v-else-if="tab === 'cashiers'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Kassir hisoboti</span>
      <button class="dr-btn" @click="loadCashiers"><AppIcon name="refresh-cw" :size="13"/></button>
    </div>
    <div v-if="cashLoad" class="rep__loading"><div v-for="i in 4" :key="i" class="skeleton sk-row"></div></div>
    <div v-else-if="!cashiers.length" class="rep__empty">
      <AppIcon name="user-check" :size="40" :stroke-width="1.2"/>
      <p>Ma'lumot yo'q</p>
    </div>
    <!-- Cashier cards -->
    <div v-else class="cashier-cards">
      <div v-for="(c, idx) in cashiers" :key="c.cashier_id || idx" class="cashier-card">
        <div class="cc-rank" :class="`cc-rank--${Math.min(idx+1,4)}`">{{ idx+1 }}</div>
        <div class="cc-av">{{ (c.cashier_name||'?')[0].toUpperCase() }}</div>
        <div class="cc-body">
          <div class="cc-name">{{ c.cashier_name }}</div>
          <div class="cc-stats">
            <div class="cc-stat"><AppIcon name="shopping-cart" :size="12"/>{{ c.sales_count }} sotuv</div>
            <div class="cc-stat"><AppIcon name="package" :size="12"/>{{ c.items_sold }} tovar</div>
          </div>
          <div class="cc-progress">
            <div class="cc-prog-bar" :style="{ width: (c.total_sum / totalCashierRev * 100).toFixed(1)+'%' }"></div>
          </div>
        </div>
        <div class="cc-sums">
          <div class="cc-sum-main">{{ fmt(c.total_sum) }} <span>so'm</span></div>
          <div class="cc-sum-sub">
            <span style="color:#10b981">To'landi: {{ fmt(c.paid_sum) }}</span>
            <span v-if="c.debt_sum>0" style="color:#ef4444">Qarz: {{ fmt(c.debt_sum) }}</span>
            <span v-if="c.total_discount>0" style="color:#f59e0b">Skidka: {{ fmt(c.total_discount) }}</span>
          </div>
        </div>
      </div>
    </div>
    <!-- Summary table (desktop only — cashier-cards above already covers mobile) -->
    <div v-if="cashiers.length" class="tbl-wrap tbl-wrap--desktop-only" style="margin-top:16px">
      <table class="rep-tbl">
        <thead>
          <tr><th>#</th><th>Kassir</th><th class="ta-c">Sotuvlar</th><th class="ta-c">Tovarlar</th><th class="ta-r">Jami</th><th class="ta-r">To'landi</th><th class="ta-r">Qarz</th><th class="ta-r">Skidka</th><th>Ulush</th></tr>
        </thead>
        <tbody>
          <tr v-for="(c, idx) in cashiers" :key="c.cashier_id || idx" class="rep-row">
            <td><span class="rank-badge" :class="idx<3&&`rank-badge--${idx+1}`">{{ idx+1 }}</span></td>
            <td class="c-bold">{{ c.cashier_name }}</td>
            <td class="ta-c"><span class="cnt-badge">{{ c.sales_count }}</span></td>
            <td class="ta-c">{{ c.items_sold }}</td>
            <td class="ta-r c-bold" style="color:#6366f1">{{ fmt(c.total_sum) }}</td>
            <td class="ta-r" style="color:#10b981">{{ fmt(c.paid_sum) }}</td>
            <td class="ta-r">
              <span v-if="c.debt_sum>0" class="debt-badge">{{ fmt(c.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </td>
            <td class="ta-r c-dim">{{ fmt(c.total_discount) }}</td>
            <td>
              <div class="bar-wrap">
                <div class="bar-fill bar-fill--violet" :style="{ width: (c.total_sum/totalCashierRev*100).toFixed(1)+'%' }"></div>
                <span class="bar-pct">{{ (c.total_sum/totalCashierRev*100).toFixed(0) }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ══ KASSA REGISTER ═══════════════════════════════════════════ -->
  <div v-else-if="tab === 'kassa'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Kassa registeri</span>
      <button class="dr-btn" @click="loadKassa"><AppIcon name="refresh-cw" :size="13"/></button>
    </div>
    <div v-if="kassaLoad" class="rep__loading"><div v-for="i in 6" :key="i" class="skeleton sk-row"></div></div>
    <template v-else-if="kassaData">
      <!-- Kassa summary cards -->
      <div class="kassa-cards">
        <div class="kassa-card kassa-card--green">
          <AppIcon name="trending-up" :size="16"/>
          <div class="kc-val">{{ fmt(kassaData.summary.completed) }}</div>
          <div class="kc-lbl">Jami sotuv</div>
        </div>
        <div class="kassa-card kassa-card--indigo">
          <AppIcon name="dollar-sign" :size="16"/>
          <div class="kc-val">{{ fmt(kassaData.summary.paid) }}</div>
          <div class="kc-lbl">Naqd / Karta</div>
        </div>
        <div class="kassa-card kassa-card--rose">
          <AppIcon name="clock" :size="16"/>
          <div class="kc-val">{{ fmt(kassaData.summary.debt) }}</div>
          <div class="kc-lbl">Qarz</div>
        </div>
        <div class="kassa-card kassa-card--amber">
          <AppIcon name="percent" :size="16"/>
          <div class="kc-val">{{ fmt(kassaData.summary.discount) }}</div>
          <div class="kc-lbl">Skidkalar</div>
        </div>
        <div class="kassa-card kassa-card--slate">
          <AppIcon name="x-circle" :size="16"/>
          <div class="kc-val">{{ fmt(kassaData.summary.cancelled) }}</div>
          <div class="kc-lbl">Bekor sotuvlar</div>
        </div>
      </div>
      <!-- Kassa rows table -->
      <div class="tbl-wrap">
        <table class="rep-tbl">
          <thead>
            <tr><th>Sana</th><th>№</th><th>Kassir</th><th>Mijoz</th><th>To'lov</th><th class="ta-c">Tovar</th><th class="ta-r">Summa</th><th class="ta-r">To'landi</th><th class="ta-r">Qarz</th><th>Holat</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in kassaData.rows" :key="r.id" class="rep-row" :class="r.status==='cancelled'&&'rep-row--cancelled'">
              <td class="c-dim sm">{{ fmtDate(r.date) }}</td>
              <td><span class="doc-badge">#{{ r.doc_number }}</span></td>
              <td class="c-bold">{{ r.cashier_name || '—' }}</td>
              <td class="c-dim">{{ r.client_name || '—' }}</td>
              <td>
                <span class="pay-dot" :style="{ background: PAY_COLORS[r.payment_type] || '#94a3b8' }"></span>
                {{ r.payment_type }}
              </td>
              <td class="ta-c"><span class="cnt-badge">{{ r.item_count }}</span></td>
              <td class="ta-r c-bold">{{ fmt(r.total_sum) }}</td>
              <td class="ta-r" style="color:#10b981">{{ fmt(r.paid_sum) }}</td>
              <td class="ta-r">
                <span v-if="Number(r.debt_sum)>0" class="debt-badge">{{ fmt(r.debt_sum) }}</span>
                <span v-else class="c-dim">—</span>
              </td>
              <td>
                <span :class="r.status==='completed'?'st-ok':'st-cancel'">
                  {{ r.status==='completed'?'Bajarildi':'Bekor' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- Mobile card list -->
        <div class="rep-cards">
          <div v-for="(r, idx) in kassaData.rows" :key="'m-'+r.id" class="rep-card" :class="r.status==='cancelled'&&'rep-card--cancelled'" :style="{ '--d': idx*0.04+'s' }">
            <div class="rep-card__top">
              <span class="doc-badge">#{{ r.doc_number }}</span>
              <span class="ta-r c-bold">{{ fmt(r.total_sum) }} <span class="c-dim sm">so'm</span></span>
            </div>
            <div class="rep-card__mid">
              <span class="c-bold">{{ r.cashier_name || '—' }}</span>
              <span :class="r.status==='completed'?'st-ok':'st-cancel'">{{ r.status==='completed'?'Bajarildi':'Bekor' }}</span>
            </div>
            <div class="rep-card__rows">
              <div class="rep-card__field"><span class="c-dim sm">Sana</span><span>{{ fmtDate(r.date) }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Mijoz</span><span class="c-dim">{{ r.client_name || '—' }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">To'lov</span><span><span class="pay-dot" :style="{ background: PAY_COLORS[r.payment_type] || '#94a3b8' }"></span>{{ r.payment_type }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Tovar</span><span class="cnt-badge">{{ r.item_count }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">To'landi</span><span style="color:#10b981;font-weight:600">{{ fmt(r.paid_sum) }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Qarz</span>
                <span v-if="Number(r.debt_sum)>0" class="debt-badge">{{ fmt(r.debt_sum) }}</span>
                <span v-else class="c-dim">—</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="rep__empty"><AppIcon name="inbox" :size="40" :stroke-width="1.2"/><p>Ma'lumot yo'q</p></div>
  </div>

  <!-- ══ PROFIT ══════════════════════════════════════════════════ -->
  <div v-else-if="tab === 'profit'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Foyda hisoboti</span>
      <div class="profit-group-toggle">
        <button :class="['pgt-btn', profitGroup==='product' && 'pgt-btn--on']" @click="profitGroup='product'">
          <AppIcon name="package" :size="12"/> Tovar bo'yicha
        </button>
        <button :class="['pgt-btn', profitGroup==='date' && 'pgt-btn--on']" @click="profitGroup='date'">
          <AppIcon name="calendar" :size="12"/> Kun bo'yicha
        </button>
      </div>
      <input v-if="profitGroup==='product'" v-model="profitSearch" class="panel__search" placeholder="Tovar nomi..."/>
      <button class="dr-btn" @click="loadProfit"><AppIcon name="refresh-cw" :size="13"/></button>
    </div>

    <div v-if="profitLoad" class="rep__loading"><div v-for="i in 8" :key="i" class="skeleton sk-row"></div></div>

    <template v-else-if="profitData">
      <!-- Summary cards -->
      <div class="profit-summary">
        <div class="ps-card ps-card--blue">
          <div class="ps-card__ico"><AppIcon name="shopping-cart" :size="16"/></div>
          <div class="ps-card__body">
            <div class="ps-card__val">{{ fmt(profitData.summary.revenue) }}</div>
            <div v-if="toUSD(profitData.summary.revenue)" class="ps-card__usd">≈ {{ toUSD(profitData.summary.revenue) }} $</div>
            <div class="ps-card__lbl">Savdo summasi</div>
          </div>
        </div>
        <div class="ps-card ps-card--rose">
          <div class="ps-card__ico"><AppIcon name="archive" :size="16"/></div>
          <div class="ps-card__body">
            <div class="ps-card__val">{{ fmt(profitData.summary.cost) }}</div>
            <div v-if="toUSD(profitData.summary.cost)" class="ps-card__usd">≈ {{ toUSD(profitData.summary.cost) }} $</div>
            <div class="ps-card__lbl">Tan narxi (xarajat)</div>
          </div>
        </div>
        <div class="ps-card ps-card--green">
          <div class="ps-card__ico"><AppIcon name="trending-up" :size="16"/></div>
          <div class="ps-card__body">
            <div class="ps-card__val">{{ fmt(profitData.summary.profit) }}</div>
            <div v-if="toUSD(profitData.summary.profit)" class="ps-card__usd">≈ {{ toUSD(profitData.summary.profit) }} $</div>
            <div class="ps-card__lbl">Sof foyda</div>
          </div>
        </div>
        <div class="ps-card ps-card--violet">
          <div class="ps-card__ico"><AppIcon name="percent" :size="16"/></div>
          <div class="ps-card__body">
            <div class="ps-card__val">{{ profitData.summary.profit_pct }}%</div>
            <div class="ps-card__lbl">Foyda marjasi</div>
          </div>
          <div class="ps-gauge">
            <div class="ps-gauge__fill" :style="{ width: Math.min(profitData.summary.profit_pct, 100) + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Profit formula hint -->
      <div class="profit-formula">
        <span class="pf-item pf-item--blue">
          Savdo: <strong>{{ fmt(profitData.summary.revenue) }} so'm</strong>
          <em v-if="toUSD(profitData.summary.revenue)"> / {{ toUSD(profitData.summary.revenue) }} $</em>
        </span>
        <span class="pf-op">−</span>
        <span class="pf-item pf-item--rose">
          Tan narx: <strong>{{ fmt(profitData.summary.cost) }} so'm</strong>
          <em v-if="toUSD(profitData.summary.cost)"> / {{ toUSD(profitData.summary.cost) }} $</em>
        </span>
        <span class="pf-op">=</span>
        <span class="pf-item pf-item--green">
          Sof foyda: <strong>{{ fmt(profitData.summary.profit) }} so'm</strong>
          <em v-if="toUSD(profitData.summary.profit)"> / {{ toUSD(profitData.summary.profit) }} $</em>
        </span>
      </div>

      <!-- By product table -->
      <div v-if="profitGroup === 'product'" class="tbl-wrap">
        <div v-if="!filteredProfitRows.length" class="rep__empty">
          <AppIcon name="inbox" :size="36" :stroke-width="1.2"/><p>Ma'lumot yo'q</p>
        </div>
        <table v-else class="rep-tbl">
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Tovar nomi</th>
              <th class="ta-r">Savdo summasi</th>
              <th class="ta-r">Tan narxi</th>
              <th class="ta-r">Sof foyda</th>
              <th class="ta-r">Marj %</th>
              <th class="ta-c">Sotuvlar</th>
              <th class="ta-r">Miqdor</th>
              <th style="width:130px">Tushum ulushi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in filteredProfitRows" :key="r.product_id + r.product_name" class="rep-row">
              <td><span class="rank-badge" :class="idx<3&&`rank-badge--${idx+1}`">{{ idx+1 }}</span></td>
              <td>
                <div class="c-bold">{{ r.product_name }}</div>
                <div class="c-dim sm">O'rt. narx: {{ fmt(r.avg_price) }} / Tan: {{ fmt(r.avg_cost) }}</div>
              </td>
              <td class="ta-r c-bold" style="color:#3b82f6">{{ fmt(r.revenue) }}</td>
              <td class="ta-r c-dim">{{ fmt(r.cost) }}</td>
              <td class="ta-r">
                <span :class="r.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ r.profit >= 0 ? '+' : '' }}{{ fmt(r.profit) }}
                </span>
              </td>
              <td class="ta-r">
                <span class="margin-badge" :class="r.profit_pct >= 20 ? 'margin-badge--hi' : r.profit_pct >= 0 ? 'margin-badge--mid' : 'margin-badge--lo'">
                  {{ r.profit_pct }}%
                </span>
              </td>
              <td class="ta-c"><span class="cnt-badge">{{ r.sales_count }}</span></td>
              <td class="ta-r c-dim">{{ r.total_qty }}</td>
              <td>
                <div class="bar-wrap">
                  <div class="bar-fill bar-fill--blue" :style="{ width: (r.revenue / maxProfitRev * 100).toFixed(1) + '%' }"></div>
                  <span class="bar-pct">{{ (r.revenue / maxProfitRev * 100).toFixed(0) }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <!-- Mobile card list -->
        <div v-if="filteredProfitRows.length" class="rep-cards">
          <div v-for="(r, idx) in filteredProfitRows" :key="'m-'+r.product_id+r.product_name" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
            <div class="rep-card__top">
              <span class="rep-card__name"><span class="rank-badge" :class="idx<3&&`rank-badge--${idx+1}`">{{ idx+1 }}</span> {{ r.product_name }}</span>
              <span class="ta-r c-bold" style="color:#3b82f6">{{ fmt(r.revenue) }}</span>
            </div>
            <div class="rep-card__mid">
              <span :class="r.profit >= 0 ? 'profit-pos' : 'profit-neg'">{{ r.profit >= 0 ? '+' : '' }}{{ fmt(r.profit) }} so'm</span>
              <span class="margin-badge" :class="r.profit_pct >= 20 ? 'margin-badge--hi' : r.profit_pct >= 0 ? 'margin-badge--mid' : 'margin-badge--lo'">{{ r.profit_pct }}%</span>
            </div>
            <div class="rep-card__rows">
              <div class="rep-card__field"><span class="c-dim sm">Tan narxi</span><span class="c-dim">{{ fmt(r.cost) }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Sotuvlar</span><span class="cnt-badge">{{ r.sales_count }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Miqdor</span><span class="c-dim">{{ r.total_qty }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">O'rt/Tan narx</span><span class="c-dim sm">{{ fmt(r.avg_price) }} / {{ fmt(r.avg_cost) }}</span></div>
            </div>
            <div class="bar-wrap" style="margin-top:8px">
              <div class="bar-fill bar-fill--blue" :style="{ width: (r.revenue / maxProfitRev * 100).toFixed(1) + '%' }"></div>
              <span class="bar-pct">{{ (r.revenue / maxProfitRev * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </div>
        <div v-if="filteredProfitRows.length" class="tbl-footer">
          <span>Jami: <strong>{{ filteredProfitRows.length }}</strong> xil tovar</span>
          <span>Tushum: <strong style="color:#3b82f6">{{ fmt(filteredProfitRows.reduce((s,r)=>s+r.revenue,0)) }}</strong> so'm</span>
          <span>Tan narx: <strong style="color:#ef4444">{{ fmt(filteredProfitRows.reduce((s,r)=>s+r.cost,0)) }}</strong> so'm</span>
          <span>Foyda: <strong style="color:#10b981">{{ fmt(filteredProfitRows.reduce((s,r)=>s+r.profit,0)) }}</strong> so'm</span>
        </div>
      </div>

      <!-- By date table -->
      <div v-else class="tbl-wrap">
        <div v-if="!filteredProfitRows.length" class="rep__empty">
          <AppIcon name="inbox" :size="36" :stroke-width="1.2"/><p>Ma'lumot yo'q</p>
        </div>
        <table v-else class="rep-tbl">
          <thead>
            <tr>
              <th>Sana</th>
              <th class="ta-r">Savdo summasi</th>
              <th class="ta-r">Tan narxi</th>
              <th class="ta-r">Sof foyda</th>
              <th class="ta-r">Marj %</th>
              <th class="ta-c">Sotuvlar</th>
              <th class="ta-r">Miqdor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredProfitRows" :key="r.day" class="rep-row">
              <td class="c-bold">{{ r.day }}</td>
              <td class="ta-r" style="color:#3b82f6;font-weight:600">{{ fmt(r.revenue) }}</td>
              <td class="ta-r c-dim">{{ fmt(r.cost) }}</td>
              <td class="ta-r">
                <span :class="r.profit >= 0 ? 'profit-pos' : 'profit-neg'">
                  {{ r.profit >= 0 ? '+' : '' }}{{ fmt(r.profit) }}
                </span>
              </td>
              <td class="ta-r">
                <span class="margin-badge" :class="r.profit_pct >= 20 ? 'margin-badge--hi' : r.profit_pct >= 0 ? 'margin-badge--mid' : 'margin-badge--lo'">
                  {{ r.profit_pct }}%
                </span>
              </td>
              <td class="ta-c"><span class="cnt-badge">{{ r.sales_count }}</span></td>
              <td class="ta-r c-dim">{{ r.total_qty }}</td>
            </tr>
          </tbody>
        </table>
        <!-- Mobile card list -->
        <div v-if="filteredProfitRows.length" class="rep-cards">
          <div v-for="(r, idx) in filteredProfitRows" :key="'m-'+r.day" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
            <div class="rep-card__top">
              <span class="c-bold">{{ r.day }}</span>
              <span class="ta-r c-bold" style="color:#3b82f6">{{ fmt(r.revenue) }}</span>
            </div>
            <div class="rep-card__mid">
              <span :class="r.profit >= 0 ? 'profit-pos' : 'profit-neg'">{{ r.profit >= 0 ? '+' : '' }}{{ fmt(r.profit) }} so'm</span>
              <span class="margin-badge" :class="r.profit_pct >= 20 ? 'margin-badge--hi' : r.profit_pct >= 0 ? 'margin-badge--mid' : 'margin-badge--lo'">{{ r.profit_pct }}%</span>
            </div>
            <div class="rep-card__rows">
              <div class="rep-card__field"><span class="c-dim sm">Tan narxi</span><span class="c-dim">{{ fmt(r.cost) }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Sotuvlar</span><span class="cnt-badge">{{ r.sales_count }}</span></div>
              <div class="rep-card__field"><span class="c-dim sm">Miqdor</span><span class="c-dim">{{ r.total_qty }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="rep__empty"><AppIcon name="trending-up" :size="40" :stroke-width="1.2"/><p>Ma'lumot yo'q</p></div>
  </div>

  <!-- ══ SUPPLIERS ════════════════════════════════════════════════ -->
  <div v-else-if="tab === 'suppliers'" class="rep__panel">
    <div class="panel__hdr">
      <span class="panel__title">Yetkazuvchi oldi-berdi hisoboti</span>
      <input v-model="suppSearch" class="panel__search" placeholder="Yetkazuvchi nomi..."/>
      <button class="dr-btn" @click="loadSuppliers"><AppIcon name="refresh-cw" :size="13"/></button>
      <span class="panel__count">{{ filteredSuppliers.length }} ta</span>
    </div>

    <!-- Summary cards -->
    <div v-if="suppData" class="supp-summary">
      <div class="ss-card ss-card--indigo">
        <AppIcon name="package" :size="15"/>
        <div class="ss-card__body">
          <div class="ss-card__val">{{ fmt(suppData.summary.total_sum) }} <span>so'm</span></div>
          <div class="ss-card__sub">${{ suppData.summary.total_usd?.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}</div>
          <div class="ss-card__lbl">Jami xaridlar</div>
        </div>
      </div>
      <div class="ss-card ss-card--green">
        <AppIcon name="check-circle" :size="15"/>
        <div class="ss-card__body">
          <div class="ss-card__val">{{ fmt(suppData.summary.paid_sum) }} <span>so'm</span></div>
          <div class="ss-card__lbl">Jami to'langan</div>
        </div>
      </div>
      <div class="ss-card ss-card--rose">
        <AppIcon name="alert-circle" :size="15"/>
        <div class="ss-card__body">
          <div class="ss-card__val">{{ fmt(suppData.summary.debt_sum) }} <span>so'm</span></div>
          <div class="ss-card__sub">${{ suppData.summary.debt_usd?.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}</div>
          <div class="ss-card__lbl">Qolgan qarz</div>
        </div>
      </div>
    </div>

    <div v-if="suppLoad" class="rep__loading"><div v-for="i in 6" :key="i" class="skeleton sk-row"></div></div>
    <div v-else-if="!filteredSuppliers.length" class="rep__empty">
      <AppIcon name="truck" :size="40" :stroke-width="1.2"/>
      <p>Ma'lumot yo'q</p>
    </div>
    <div v-else class="tbl-wrap">
      <table class="rep-tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Yetkazuvchi</th>
            <th class="ta-r">Jami xarid (so'm)</th>
            <th class="ta-r">Jami xarid ($)</th>
            <th class="ta-r">To'langan (so'm)</th>
            <th class="ta-r">Qarz (so'm)</th>
            <th class="ta-r">Qarz ($)</th>
            <th class="ta-r">Joriy balans</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, idx) in filteredSuppliers" :key="s.id" class="rep-row">
            <td class="c-dim">{{ idx + 1 }}</td>
            <td>
              <div class="sup-cell">
                <div class="sup-av">{{ (s.name||'?')[0].toUpperCase() }}</div>
                <div>
                  <div class="c-bold">{{ s.name }}</div>
                  <div class="c-dim sm">{{ s.phone || s.code || '—' }}</div>
                </div>
              </div>
            </td>
            <td class="ta-r c-bold" style="color:#6366f1">{{ fmt(s.total_sum) }}</td>
            <td class="ta-r" style="color:#6366f1;font-weight:600">
              ${{ s.total_usd.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}
            </td>
            <td class="ta-r" style="color:#10b981;font-weight:600">{{ fmt(s.paid_sum) }}</td>
            <td class="ta-r">
              <span v-if="s.debt_sum > 0.01" class="debt-badge">{{ fmt(s.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </td>
            <td class="ta-r">
              <span v-if="s.debt_usd > 0.01" class="debt-badge">
                ${{ s.debt_usd.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}
              </span>
              <span v-else class="c-dim">—</span>
            </td>
            <td class="ta-r">
              <span :class="s.balance < 0 ? 'bal-neg' : s.balance > 0 ? 'bal-pos' : 'c-dim'">
                {{ s.balance < 0 ? '−' : s.balance > 0 ? '+' : '' }}{{ fmt(Math.abs(s.balance)) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile card list -->
      <div class="rep-cards">
        <div v-for="(s, idx) in filteredSuppliers" :key="'m-'+s.id" class="rep-card" :style="{ '--d': idx*0.04+'s' }">
          <div class="rep-card__top">
            <span class="rep-card__name"><span class="sup-av sup-av--sm">{{ (s.name||'?')[0].toUpperCase() }}</span> {{ s.name }}</span>
            <span :class="s.balance < 0 ? 'bal-neg' : s.balance > 0 ? 'bal-pos' : 'c-dim'">
              {{ s.balance < 0 ? '−' : s.balance > 0 ? '+' : '' }}{{ fmt(Math.abs(s.balance)) }}
            </span>
          </div>
          <div class="rep-card__mid">
            <span class="c-dim sm">{{ s.phone || s.code || '—' }}</span>
            <span class="c-bold" style="color:#6366f1">{{ fmt(s.total_sum) }} so'm</span>
          </div>
          <div class="ps-card__usd" style="margin-bottom:4px">≈ ${{ s.total_usd.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}</div>
          <div class="rep-card__rows">
            <div class="rep-card__field"><span class="c-dim sm">To'langan</span><span style="color:#10b981;font-weight:600">{{ fmt(s.paid_sum) }}</span></div>
            <div class="rep-card__field"><span class="c-dim sm">Qarz (so'm)</span>
              <span v-if="s.debt_sum > 0.01" class="debt-badge">{{ fmt(s.debt_sum) }}</span>
              <span v-else class="c-dim">—</span>
            </div>
            <div class="rep-card__field"><span class="c-dim sm">Qarz ($)</span>
              <span v-if="s.debt_usd > 0.01" class="debt-badge">${{ s.debt_usd.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }}</span>
              <span v-else class="c-dim">—</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="filteredSuppliers.length" class="tbl-footer">
      <span>Jami xarid: <strong style="color:#6366f1">{{ fmt(filteredSuppliers.reduce((s,r)=>s+r.total_sum,0)) }}</strong> so'm</span>
      <span>Jami xarid ($): <strong style="color:#6366f1">${{ filteredSuppliers.reduce((s,r)=>s+r.total_usd,0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }}</strong></span>
      <span>To'langan: <strong style="color:#10b981">{{ fmt(filteredSuppliers.reduce((s,r)=>s+r.paid_sum,0)) }}</strong> so'm</span>
      <span>Qarz: <strong style="color:#ef4444">{{ fmt(filteredSuppliers.reduce((s,r)=>s+r.debt_sum,0)) }}</strong> so'm</span>
      <span>Qarz ($): <strong style="color:#ef4444">${{ filteredSuppliers.reduce((s,r)=>s+r.debt_usd,0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }}</strong></span>
    </div>
  </div>

</div>
</template>

<style scoped>
.rep { display:flex; flex-direction:column; height:100%; background:#f4f6fb; overflow-y:auto; }

/* Header */
.rep__hdr { display:flex; align-items:center; justify-content:space-between; padding:20px 24px 14px; background:white; border-bottom:1px solid #e2e8f0; flex-shrink:0; gap:16px; flex-wrap:wrap; }
.rep__hdr-l { display:flex; align-items:center; gap:12px; }
.rep__hdr-ico { width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; color:white; }
.rep__hdr-title { font-size:18px; font-weight:900; color:#0f172a; letter-spacing:-.03em; }
.rep__hdr-sub { font-size:12px; color:#94a3b8; margin-top:1px; }

/* Date range */
.rep__daterange { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dr-lbl { display:flex; align-items:center; gap:5px; font-size:12px; color:#64748b; }
.dr-inp { height:32px; padding:0 8px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:12px; font-family:inherit; outline:none; color:#1e293b; }
.dr-inp:focus { border-color:#818cf8; }
.dr-btn { display:flex; align-items:center; gap:5px; height:32px; padding:0 12px; border-radius:8px; background:#eff6ff; border:1.5px solid #c7d2fe; color:#4f46e5; font-size:12px; font-weight:600; font-family:inherit; cursor:pointer; }
.dr-btn:hover { background:#e0e7ff; }

/* Overview cards */
.ov-cards { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; padding:16px 24px; flex-shrink:0; }
@media(max-width:1200px) { .ov-cards { grid-template-columns:repeat(3,1fr); } }
.ov-card { display:flex; align-items:center; gap:12px; padding:14px 16px; border-radius:14px; border:1.5px solid; background:white; }
.ov-card--indigo { border-color:#c7d2fe; background:linear-gradient(135deg,#eef2ff,#fff); }
.ov-card--green  { border-color:#a7f3d0; background:linear-gradient(135deg,#f0fdf4,#fff); }
.ov-card--amber  { border-color:#fde68a; background:linear-gradient(135deg,#fffbeb,#fff); }
.ov-card--rose   { border-color:#fecdd3; background:linear-gradient(135deg,#fff1f2,#fff); }
.ov-card--violet { border-color:#e9d5ff; background:linear-gradient(135deg,#faf5ff,#fff); }
.ov-card__ico { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ov-card--indigo .ov-card__ico { background:#e0e7ff; color:#6366f1; }
.ov-card--green  .ov-card__ico { background:#d1fae5; color:#10b981; }
.ov-card--amber  .ov-card__ico { background:#fef3c7; color:#f59e0b; }
.ov-card--rose   .ov-card__ico { background:#fce7f3; color:#f43f5e; }
.ov-card--violet .ov-card__ico { background:#ede9fe; color:#8b5cf6; }
.ov-card__val { font-size:22px; font-weight:900; color:#0f172a; letter-spacing:-.04em; line-height:1.1; }
.ov-card__lbl { font-size:11px; font-weight:600; color:#64748b; margin-top:2px; }
.ov-card__sub { font-size:10.5px; color:#94a3b8; margin-top:2px; }

/* Tabs */
.rep__tabs { display:flex; gap:4px; padding:0 24px; background:white; border-bottom:1px solid #e2e8f0; flex-shrink:0; overflow-x:auto; scrollbar-width:none; }
.rep__tabs::-webkit-scrollbar { display:none; }
.rep__tab { display:flex; align-items:center; gap:6px; padding:11px 16px; font-size:13px; font-weight:600; font-family:inherit; color:#64748b; cursor:pointer; border-bottom:2.5px solid transparent; transition:all .15s; white-space:nowrap; background:white; }
.rep__tab:hover { color:#6366f1; background:#fafbff; }
.rep__tab--on { color:#6366f1; border-bottom-color:#6366f1; }

/* Panel */
.rep__panel { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.panel__hdr { display:flex; align-items:center; gap:10px; padding:14px 24px; background:white; border-bottom:1px solid #e2e8f0; flex-shrink:0; flex-wrap:wrap; }
.panel__title { font-size:14px; font-weight:800; color:#1e293b; flex:none; }
.panel__search { height:32px; padding:0 10px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:12.5px; font-family:inherit; outline:none; min-width:180px; }
.panel__search:focus { border-color:#818cf8; }
.panel__count { font-size:11.5px; color:#94a3b8; margin-left:auto; }

/* Loading skeletons */
.rep__loading { display:flex; flex-direction:column; gap:6px; padding:16px 24px; }
.sk-row { height:46px; border-radius:8px; }
.skeleton { background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Empty */
.rep__empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:60px; color:#94a3b8; font-size:13px; }

/* Table */
.tbl-wrap { flex:1; overflow:auto; padding:16px 24px 8px; }
.rep-tbl { width:100%; border-collapse:collapse; background:white; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.04); }
.rep-tbl thead th { padding:9px 12px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#94a3b8; background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:left; white-space:nowrap; }
.rep-row { border-bottom:1px solid #f1f5f9; transition:background .1s; }
.rep-row:hover td { background:#f5f7ff; }
.rep-row--cancelled { opacity:.55; }
.rep-tbl td { padding:9px 12px; font-size:13px; vertical-align:middle; }
.c-bold { font-weight:600; color:#1e293b; }
.c-dim  { color:#94a3b8; }
.sm     { font-size:11px; }
.ta-c   { text-align:center; }
.ta-r   { text-align:right; }

/* Badges */
.doc-badge  { font-family:monospace; font-weight:800; color:#6366f1; background:#e0e7ff; padding:2px 7px; border-radius:5px; font-size:11.5px; }
.cnt-badge  { background:#d1fae5; color:#065f46; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.debt-badge { background:#fef2f2; color:#ef4444; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.pay-dot    { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:4px; vertical-align:middle; }
.rank-badge { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; font-size:11px; font-weight:800; background:#f1f5f9; color:#64748b; }
.rank-badge--1 { background:#fef3c7; color:#b45309; }
.rank-badge--2 { background:#f1f5f9; color:#475569; }
.rank-badge--3 { background:#fee2e2; color:#b91c1c; }
.bal-neg { font-weight:700; color:#ef4444; }
.bal-pos { font-weight:700; color:#10b981; }
.st-ok     { font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:#d1fae5; color:#065f46; }
.st-cancel { font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; background:#fef2f2; color:#ef4444; }

/* Progress bar */
.bar-wrap { position:relative; height:18px; background:#f1f5f9; border-radius:99px; overflow:hidden; min-width:80px; }
.bar-fill { height:100%; background:linear-gradient(90deg,#6366f1,#8b5cf6); border-radius:99px; transition:width .4s; }
.bar-fill--violet { background:linear-gradient(90deg,#8b5cf6,#c084fc); }
.bar-pct  { position:absolute; right:5px; top:50%; transform:translateY(-50%); font-size:9.5px; font-weight:700; color:#64748b; }

/* Client cell */
.cli-cell { display:flex; align-items:center; gap:8px; }
.cli-av   { width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

/* Today summary */
.today-summary { display:flex; gap:10px; padding:12px 24px; flex-shrink:0; flex-wrap:wrap; }
.ts-item { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:10px 16px; border-radius:10px; font-size:13px; font-weight:600; flex:1; min-width:160px; }
.ts-item--green  { background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; }
.ts-item--indigo { background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; }
.ts-item--rose   { background:#fff1f2; color:#be123c; border:1px solid #fecdd3; }
.ts-item--amber  { background:#fffbeb; color:#92400e; border:1px solid #fde68a; }

/* Cashier cards */
.cashier-cards { display:flex; flex-direction:column; gap:8px; padding:16px 24px 8px; }
.cashier-card { display:flex; align-items:center; gap:14px; padding:14px 18px; background:white; border:1.5px solid #e2e8f0; border-radius:14px; transition:all .15s; }
.cashier-card:hover { border-color:#c7d2fe; box-shadow:0 4px 12px rgba(99,102,241,.08); }
.cc-rank { width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:900; flex-shrink:0; }
.cc-rank--1 { background:#fef3c7; color:#b45309; }
.cc-rank--2 { background:#f1f5f9; color:#475569; }
.cc-rank--3 { background:#fee2e2; color:#b91c1c; }
.cc-rank--4 { background:#f1f5f9; color:#94a3b8; }
.cc-av { width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; font-size:15px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.cc-body { flex:1; min-width:0; }
.cc-name { font-size:14px; font-weight:700; color:#1e293b; }
.cc-stats { display:flex; gap:12px; margin-top:3px; }
.cc-stat { display:flex; align-items:center; gap:4px; font-size:11.5px; color:#64748b; }
.cc-progress { height:5px; background:#f1f5f9; border-radius:99px; margin-top:7px; overflow:hidden; }
.cc-prog-bar { height:100%; background:linear-gradient(90deg,#6366f1,#8b5cf6); border-radius:99px; }
.cc-sums { text-align:right; flex-shrink:0; }
.cc-sum-main { font-size:18px; font-weight:900; color:#1e293b; letter-spacing:-.03em; }
.cc-sum-main span { font-size:11px; color:#94a3b8; font-weight:500; }
.cc-sum-sub { display:flex; flex-direction:column; gap:1px; margin-top:3px; font-size:10.5px; }

/* Kassa cards */
.kassa-cards { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; padding:16px 24px 0; flex-shrink:0; }
@media(max-width:1100px) { .kassa-cards { grid-template-columns:repeat(3,1fr); } }
.kassa-card { display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding:14px 16px; border-radius:12px; border:1.5px solid; }
.kassa-card--green  { background:#f0fdf4; border-color:#bbf7d0; color:#15803d; }
.kassa-card--indigo { background:#eef2ff; border-color:#c7d2fe; color:#4338ca; }
.kassa-card--rose   { background:#fff1f2; border-color:#fecdd3; color:#be123c; }
.kassa-card--amber  { background:#fffbeb; border-color:#fde68a; color:#92400e; }
.kassa-card--slate  { background:#f8fafc; border-color:#e2e8f0; color:#64748b; }
.kc-val { font-size:22px; font-weight:900; letter-spacing:-.04em; }
.kc-lbl { font-size:10.5px; font-weight:600; opacity:.75; }

/* Footer row */
.tbl-footer { display:flex; gap:20px; padding:10px 24px 16px; font-size:12.5px; color:#64748b; flex-wrap:wrap; }
.tbl-footer strong { color:#1e293b; }

/* Profit tab — group toggle */
.profit-group-toggle { display:flex; gap:3px; background:#f1f5f9; border-radius:8px; padding:3px; }
.pgt-btn { display:flex; align-items:center; gap:5px; padding:5px 12px; border-radius:6px; font-size:12px; font-weight:600; font-family:inherit; cursor:pointer; border:none; background:transparent; color:#64748b; transition:all .15s; }
.pgt-btn--on { background:white; color:#4f46e5; box-shadow:0 1px 3px rgba(0,0,0,.1); }

/* Profit summary cards */
.profit-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:16px 24px 0; flex-shrink:0; }
@media(max-width:900px) { .profit-summary { grid-template-columns:repeat(2,1fr); } }
.ps-card { display:flex; align-items:center; gap:12px; padding:16px; border-radius:14px; border:1.5px solid; position:relative; overflow:hidden; }
.ps-card--blue   { background:linear-gradient(135deg,#eff6ff,#fff); border-color:#bfdbfe; }
.ps-card--rose   { background:linear-gradient(135deg,#fff1f2,#fff); border-color:#fecdd3; }
.ps-card--green  { background:linear-gradient(135deg,#f0fdf4,#fff); border-color:#a7f3d0; }
.ps-card--violet { background:linear-gradient(135deg,#faf5ff,#fff); border-color:#e9d5ff; flex-direction:column; align-items:flex-start; gap:6px; }
.ps-card__ico { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ps-card--blue   .ps-card__ico { background:#dbeafe; color:#2563eb; }
.ps-card--rose   .ps-card__ico { background:#fce7f3; color:#e11d48; }
.ps-card--green  .ps-card__ico { background:#d1fae5; color:#059669; }
.ps-card--violet .ps-card__ico { background:#ede9fe; color:#7c3aed; }
.ps-card__val { font-size:22px; font-weight:900; color:#0f172a; letter-spacing:-.04em; line-height:1.1; }
.ps-card__usd { font-size:11px; font-weight:700; color:#16a34a; margin-top:1px; }
.ps-card__usd em { font-style:normal; }
.ps-card__lbl { font-size:11px; font-weight:600; color:#64748b; margin-top:2px; }
.ps-gauge { width:100%; height:6px; background:#e9d5ff; border-radius:99px; overflow:hidden; }
.ps-gauge__fill { height:100%; background:linear-gradient(90deg,#8b5cf6,#c084fc); border-radius:99px; transition:width .5s; }

/* Profit formula row */
.profit-formula { display:flex; align-items:center; gap:10px; padding:12px 24px; flex-wrap:wrap; flex-shrink:0; }
.pf-item { padding:8px 14px; border-radius:9px; font-size:12.5px; font-weight:500; }
.pf-item--blue   { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; }
.pf-item--rose   { background:#fff1f2; color:#be123c; border:1px solid #fecdd3; }
.pf-item--green  { background:#f0fdf4; color:#15803d; border:1px solid #a7f3d0; }
.pf-op { font-size:18px; font-weight:900; color:#94a3b8; }

/* Profit / margin badges */
.profit-pos { font-weight:700; color:#10b981; }
.profit-neg { font-weight:700; color:#ef4444; }
.margin-badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.margin-badge--hi  { background:#d1fae5; color:#065f46; }
.margin-badge--mid { background:#fef3c7; color:#92400e; }
.margin-badge--lo  { background:#fef2f2; color:#ef4444; }

/* Blue bar variant */
.bar-fill--blue { background:linear-gradient(90deg,#3b82f6,#6366f1); }

/* Supplier report */
.supp-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; padding:16px 24px 0; flex-shrink:0; }
@media(max-width:900px) { .supp-summary { grid-template-columns:1fr; } }
.ss-card { display:flex; align-items:flex-start; gap:12px; padding:16px; border-radius:13px; border:1.5px solid; }
.ss-card--indigo { background:linear-gradient(135deg,#eef2ff,#fff); border-color:#c7d2fe; color:#4338ca; }
.ss-card--green  { background:linear-gradient(135deg,#f0fdf4,#fff); border-color:#a7f3d0; color:#065f46; }
.ss-card--rose   { background:linear-gradient(135deg,#fff1f2,#fff); border-color:#fecdd3; color:#be123c; }
.ss-card__body { flex:1; }
.ss-card__val { font-size:20px; font-weight:900; letter-spacing:-.03em; line-height:1.1; }
.ss-card__val span { font-size:12px; font-weight:600; opacity:.7; }
.ss-card__sub { font-size:13px; font-weight:700; margin-top:2px; opacity:.8; }
.ss-card__lbl { font-size:11px; font-weight:600; margin-top:4px; opacity:.65; }

.sup-cell { display:flex; align-items:center; gap:8px; }
.sup-av   { width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

/* ════════════════════════════════════════════════════════════════
   Mobile card list (hidden on desktop — shown via @media at ≤768px)
   ════════════════════════════════════════════════════════════════ */
.rep-cards { display: none; }
.cli-av--sm, .sup-av--sm { width:20px; height:20px; font-size:10px; display:inline-flex; margin-right:4px; vertical-align:middle; }

/* ════════════════════════════════════════════════════════════════
   MOBILE  ≤ 768px
   ════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .rep { overflow-x: hidden; }

  /* ── Header ─────────────────────────────────────────────── */
  .rep__hdr { padding: 14px 14px 10px; gap: 10px; }
  .rep__hdr-title { font-size: 16px; }
  .rep__hdr-sub { font-size: 11px; }
  .rep__daterange { width: 100%; flex-direction: column; align-items: stretch; gap: 8px; }
  .dr-lbl { width: 100%; justify-content: space-between; font-size: 12.5px; }
  .dr-inp { flex: 1; height: 40px; font-size: 13px; min-width: 0; }
  .dr-btn { width: 100%; height: 40px; justify-content: center; font-size: 13px; }

  /* ── Overview cards ─────────────────────────────────────── */
  .ov-cards { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 10px 12px; }
  .ov-card { padding: 10px 12px; border-radius: 12px; opacity: 0; animation: repCardIn .32s var(--ease-spring) forwards; animation-delay: calc(var(--i, 0) * 0.05s); }
  .ov-card:nth-child(1) { --i: 0; } .ov-card:nth-child(2) { --i: 1; }
  .ov-card:nth-child(3) { --i: 2; } .ov-card:nth-child(4) { --i: 3; }
  .ov-card:nth-child(5) { --i: 4; grid-column: span 2; }
  .ov-card__ico { width: 32px; height: 32px; }
  .ov-card__val { font-size: 17px; }
  .ov-card__lbl { font-size: 10px; }
  .ov-card__sub { font-size: 9.5px; }

  /* ── Tabs: horizontal scroll, snap, tappable ────────────── */
  .rep__tabs {
    padding: 0 10px;
    gap: 6px;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .rep__tab {
    scroll-snap-align: start;
    min-height: 40px;
    padding: 9px 14px;
    font-size: 12.5px;
    border-radius: 10px 10px 0 0;
    flex-shrink: 0;
  }

  /* ── Panel header / filters ──────────────────────────────── */
  .panel__hdr { padding: 10px 12px; gap: 8px; }
  .panel__title { font-size: 13px; width: 100%; }
  .panel__search { width: 100%; height: 40px; font-size: 13.5px; min-width: 0; }
  .panel__count { width: 100%; margin-left: 0; text-align: right; }
  .dr-btn:has(svg) { padding: 0 12px; }
  .panel__hdr .dr-btn { width: auto; height: 36px; }
  .panel__hdr > input[type="date"] { width: 100%; height: 40px; }

  /* ── Profit group toggle: full width, tappable ──────────── */
  .profit-group-toggle { width: 100%; }
  .pgt-btn { flex: 1; justify-content: center; min-height: 38px; font-size: 12px; }

  /* ── Tables → hidden; card lists → shown ─────────────────── */
  .tbl-wrap { padding: 10px 12px 6px; overflow-x: hidden; }
  .rep-tbl { display: none; }
  .tbl-wrap--desktop-only { display: none; }

  .rep-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rep-card {
    background: white;
    border: 1.5px solid #e2e8f0;
    border-radius: var(--r-lg, 14px);
    padding: 12px 14px;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(15,23,42,0.08));
    opacity: 0;
    transform: translateY(10px);
    animation: repCardIn .3s var(--ease-spring, cubic-bezier(0.16,1,0.3,1)) forwards;
    animation-delay: var(--d, 0s);
  }
  .rep-card--cancelled { opacity: .6 !important; }
  .rep-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13.5px; }
  .rep-card__name { display: flex; align-items: center; gap: 4px; font-weight: 700; color: #1e293b; min-width: 0; }
  .rep-card__mid { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 12.5px; }
  .rep-card__pay { display: flex; align-items: center; font-size: 12px; color: #64748b; }
  .rep-card__rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #e2e8f0;
  }
  .rep-card__field { display: flex; flex-direction: column; gap: 1px; font-size: 12px; }
  .rep-card__field > span:first-child { font-size: 10px; }
  .rep-card__field > span:last-child { font-weight: 600; color: #1e293b; }

  /* ── Today summary ───────────────────────────────────────── */
  .today-summary { padding: 8px 12px 12px; gap: 8px; }
  .ts-item { min-width: 100%; font-size: 12.5px; padding: 10px 14px; }

  /* ── Cashier cards (already stacked) — tighten + animate ──── */
  .cashier-cards { padding: 10px 12px 6px; }
  .cashier-card {
    padding: 12px 14px;
    gap: 10px;
    flex-wrap: wrap;
    opacity: 0;
    transform: translateY(10px);
    animation: repCardIn .3s var(--ease-spring, cubic-bezier(0.16,1,0.3,1)) forwards;
    animation-delay: calc(var(--i, 0) * 0.05s);
  }
  .cc-av { width: 34px; height: 34px; font-size: 13px; }
  .cc-name { font-size: 13px; }
  .cc-stats { gap: 8px; flex-wrap: wrap; }
  .cc-stat { font-size: 11px; }
  .cc-sums { width: 100%; text-align: left; margin-top: 4px; padding-top: 8px; border-top: 1px dashed #e2e8f0; }
  .cc-sum-main { font-size: 16px; }
  .cc-sum-sub { flex-direction: row; flex-wrap: wrap; gap: 10px; }

  /* ── Kassa summary cards ─────────────────────────────────── */
  .kassa-cards { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 10px 12px 0; }
  .kassa-card {
    padding: 10px 12px;
    opacity: 0;
    transform: translateY(10px);
    animation: repCardIn .3s var(--ease-spring, cubic-bezier(0.16,1,0.3,1)) forwards;
    animation-delay: calc(var(--i, 0) * 0.05s);
  }
  .kassa-card:nth-child(1) { --i: 0; } .kassa-card:nth-child(2) { --i: 1; }
  .kassa-card:nth-child(3) { --i: 2; } .kassa-card:nth-child(4) { --i: 3; }
  .kassa-card:nth-child(5) { --i: 4; grid-column: span 2; }
  .kc-val { font-size: 18px; }
  .kc-lbl { font-size: 10px; }

  /* ── Footer row ───────────────────────────────────────────── */
  .tbl-footer { padding: 8px 12px 14px; gap: 8px; font-size: 11.5px; flex-direction: column; }

  /* ── Profit summary cards: 2 cols, smaller fonts ─────────── */
  .profit-summary { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 10px 12px 0; }
  .ps-card {
    padding: 12px;
    gap: 8px;
    opacity: 0;
    transform: translateY(10px);
    animation: repCardIn .3s var(--ease-spring, cubic-bezier(0.16,1,0.3,1)) forwards;
    animation-delay: calc(var(--i, 0) * 0.05s);
  }
  .ps-card:nth-child(1) { --i: 0; } .ps-card:nth-child(2) { --i: 1; }
  .ps-card:nth-child(3) { --i: 2; } .ps-card:nth-child(4) { --i: 3; }
  .ps-card__ico { width: 30px; height: 30px; }
  .ps-card__val { font-size: 16px; }
  .ps-card__usd { font-size: 10px; }
  .ps-card__lbl { font-size: 10px; }

  /* ── Profit formula row: stack vertically ────────────────── */
  .profit-formula { padding: 10px 12px; flex-direction: column; align-items: stretch; gap: 6px; }
  .pf-item { font-size: 12px; text-align: center; }
  .pf-op { text-align: center; }

  /* ── Supplier summary cards ──────────────────────────────── */
  .supp-summary { padding: 10px 12px 0; gap: 8px; }
  .ss-card {
    padding: 12px;
    opacity: 0;
    transform: translateY(10px);
    animation: repCardIn .3s var(--ease-spring, cubic-bezier(0.16,1,0.3,1)) forwards;
    animation-delay: calc(var(--i, 0) * 0.05s);
  }
  .ss-card:nth-child(1) { --i: 0; } .ss-card:nth-child(2) { --i: 1; } .ss-card:nth-child(3) { --i: 2; }
  .ss-card__val { font-size: 17px; }

  /* ── Panel transition on tab switch ──────────────────────── */
  .rep__panel {
    animation: repPanelIn .28s var(--ease-spring, cubic-bezier(0.16,1,0.3,1));
  }
}

/* ── 375px-and-down refinements ──────────────────────────── */
@media (max-width: 480px) {
  .rep__hdr { padding: 12px 10px 8px; }
  .rep__hdr-title { font-size: 15px; }
  .rep__hdr-ico { width: 36px; height: 36px; }

  .ov-cards { grid-template-columns: 1fr 1fr; padding: 8px 10px; gap: 6px; }
  .ov-card { gap: 8px; }
  .ov-card__val { font-size: 15px; }

  .rep__tabs { padding: 0 8px; }
  .rep__tab { padding: 8px 12px; font-size: 12px; }

  .tbl-wrap, .panel__hdr, .today-summary, .tbl-footer,
  .cashier-cards, .kassa-cards, .profit-summary, .profit-formula, .supp-summary {
    padding-left: 8px;
    padding-right: 8px;
  }

  .rep-card { padding: 10px 12px; }
  .rep-card__rows { grid-template-columns: 1fr 1fr; gap: 5px 8px; }
  .rep-card__top { font-size: 13px; }

  .kassa-cards { grid-template-columns: 1fr 1fr; }
  .profit-summary { grid-template-columns: 1fr 1fr; }
  .ps-card__val { font-size: 15px; }

  .cc-sum-main { font-size: 15px; }
  .cc-av { width: 32px; height: 32px; font-size: 12px; }

  .bar-wrap { min-width: 0; }
}

@keyframes repCardIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes repPanelIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
