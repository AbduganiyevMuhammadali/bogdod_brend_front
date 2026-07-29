<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { reportsApi } from '@/api/reports.js'
import {
  Chart,
  BarElement, BarController,
  LineElement, PointElement, LineController,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
} from 'chart.js'

Chart.register(
  BarElement, BarController,
  LineElement, PointElement, LineController,
  DoughnutController, ArcElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, Filler,
)

// ── State ─────────────────────────────────────────────────────────
const loading      = ref(false)
const loadingExtra = ref(false)
const error        = ref(null)
const overview     = ref(null)
const extra        = ref(null)
const period       = ref('day')

// ── Animated counter ─────────────────────────────────────────────
function useCounter(target, duration = 800) {
  const display = ref(0)
  let raf = null
  watch(target, (to) => {
    if (to == null) return
    const from  = display.value
    const start = performance.now()
    const step  = (now) => {
      const p    = Math.min((now - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      display.value = Math.round(from + (to - from) * ease)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(step)
  })
  onUnmounted(() => cancelAnimationFrame(raf))
  return display
}

const todayRevenue = computed(() => overview.value?.today?.income      ?? 0)
const todaySales   = computed(() => overview.value?.today?.sales_count  ?? 0)
const todayItems   = computed(() => overview.value?.today?.items        ?? 0)
const todayDebt    = computed(() => overview.value?.today?.debt         ?? 0)
const monthRevenue = computed(() => overview.value?.month?.income       ?? 0)

const cRevenue = useCounter(todayRevenue)
const cSales   = useCounter(todaySales)
const cItems   = useCounter(todayItems)
const cDebt    = useCounter(todayDebt)
const cMonth   = useCounter(monthRevenue)

// ── Chart refs & instances ────────────────────────────────────────
const mainCanvas   = ref(null)
const donutCanvas  = ref(null)
const topCanvas    = ref(null)
let mainChart      = null
let donutChart     = null
let topChart       = null

function destroyAll() {
  mainChart?.destroy();  mainChart  = null
  donutChart?.destroy(); donutChart = null
  topChart?.destroy();   topChart   = null
}

// ── Main combo chart (tushum + tan narxi + foyda) ─────────────────
function buildMainChart() {
  if (!mainCanvas.value || !extra.value?.chart) return
  mainChart?.destroy()

  const { labels, revenue, cost, profit } = extra.value.chart
  const ctx = mainCanvas.value.getContext('2d')

  const gradProfit = ctx.createLinearGradient(0, 0, 0, 280)
  gradProfit.addColorStop(0, 'rgba(16,185,129,0.28)')
  gradProfit.addColorStop(1, 'rgba(16,185,129,0.02)')

  mainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Tushum',
          data: revenue,
          backgroundColor: 'rgba(99,102,241,0.75)',
          borderRadius: 6,
          borderSkipped: false,
          order: 2,
        },
        {
          label: 'Tan narxi',
          data: cost,
          backgroundColor: 'rgba(239,68,68,0.55)',
          borderRadius: 6,
          borderSkipped: false,
          order: 3,
        },
        {
          label: 'Foyda',
          data: profit,
          type: 'line',
          borderColor: '#10b981',
          borderWidth: 2.5,
          backgroundColor: gradProfit,
          fill: true,
          tension: 0.42,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#10b981',
          pointBorderWidth: 2.5,
          pointHoverRadius: 7,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 650, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, borderRadius: 3, font: { size: 11 }, color: '#64748b', padding: 14 },
        },
        tooltip: {
          backgroundColor: '#1e1b4b',
          titleColor: '#a5b4fc',
          bodyColor: '#e2e8f0',
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${Number(c.parsed.y).toLocaleString('uz-UZ')} so'm`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 14 },
        },
        y: {
          grid: { color: '#f1f5f9', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#94a3b8', font: { size: 10 },
            callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v,
          },
        },
      },
    },
  })
}

// ── Donut chart (to'lov turlari) ──────────────────────────────────
const PAY_COLORS = { 'Naqd': '#10b981', 'Karta': '#6366f1', "O'tkazma": '#f59e0b', 'Qarz': '#ef4444' }
const PAY_ORDER  = ['Naqd', 'Karta', "O'tkazma", 'Qarz']

function buildDonutChart() {
  if (!donutCanvas.value || !extra.value?.payTypes) return
  donutChart?.destroy()

  const pt     = extra.value.payTypes
  const map    = Object.fromEntries(pt.map(p => [p.type, p.total]))
  const labels = PAY_ORDER.filter(k => map[k] > 0)
  const data   = labels.map(k => map[k] || 0)
  const colors = labels.map(k => PAY_COLORS[k] || '#94a3b8')

  donutChart = new Chart(donutCanvas.value.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      animation: { animateRotate: true, duration: 800 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          bodyColor: '#fff',
          padding: { x: 12, y: 9 },
          cornerRadius: 9,
          callbacks: {
            label: (c) => ` ${c.label}: ${Number(c.parsed).toLocaleString('uz-UZ')} so'm`,
          },
        },
      },
    },
  })
}

// ── Top products horizontal bar chart ────────────────────────────
function buildTopChart() {
  if (!topCanvas.value || !extra.value?.topProducts?.length) return
  topChart?.destroy()

  const items   = extra.value.topProducts.slice(0, 7)
  const labels  = items.map(p => p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name)
  const revenue = items.map(p => p.revenue)
  const profit  = items.map(p => p.profit)

  topChart = new Chart(topCanvas.value.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Tushum',
          data: revenue,
          backgroundColor: 'rgba(99,102,241,0.75)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Foyda',
          data: profit,
          backgroundColor: 'rgba(16,185,129,0.75)',
          borderRadius: 5,
          borderSkipped: false,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 9, boxHeight: 9, borderRadius: 3, font: { size: 10 }, color: '#64748b' },
        },
        tooltip: {
          backgroundColor: '#1e1b4b',
          titleColor: '#a5b4fc',
          bodyColor: '#e2e8f0',
          cornerRadius: 9,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${Number(c.parsed.x).toLocaleString('uz-UZ')} so'm`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#f1f5f9' },
          border: { display: false },
          ticks: {
            color: '#94a3b8', font: { size: 10 },
            callback: v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v,
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: '#334155', font: { size: 11, weight: '600' } },
        },
      },
    },
  })
}

function buildAllCharts() {
  buildMainChart()
  buildDonutChart()
  buildTopChart()
}

// ── Fetch ─────────────────────────────────────────────────────────
async function fetchOverview() {
  loading.value = true
  error.value   = null
  try   { overview.value = await reportsApi.getOverview() }
  catch { error.value = 'Ma\'lumot yuklanmadi' }
  finally { loading.value = false }
}

async function fetchExtra() {
  loadingExtra.value = true
  try   { extra.value = await reportsApi.getDashboardExtra({ period: period.value }) }
  catch { extra.value = null }
  finally { loadingExtra.value = false }
}

async function refresh() {
  await Promise.all([fetchOverview(), fetchExtra()])
}

watch(period, fetchExtra)

watch([extra, loadingExtra], async ([newExtra, isLoading]) => {
  if (isLoading || !newExtra) return
  await nextTick()
  buildAllCharts()
}, { flush: 'post' })

onMounted(refresh)
onUnmounted(destroyAll)

// ── Helpers ───────────────────────────────────────────────────────
function fmt(v)  { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtM(v) {
  const n = Number(v) || 0
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

const PERIOD_LABELS = { day: 'Bugun', week: 'Hafta', month: 'Oy', year: 'Yil' }

const chartTotalRevenue = computed(() => (extra.value?.chart?.revenue || []).reduce((s,v)=>s+v, 0))
const chartTotalProfit  = computed(() => (extra.value?.chart?.profit  || []).reduce((s,v)=>s+v, 0))
const chartTotalCost    = computed(() => (extra.value?.chart?.cost    || []).reduce((s,v)=>s+v, 0))
const chartMargin       = computed(() => {
  const r = chartTotalRevenue.value
  return r > 0 ? +((chartTotalProfit.value / r) * 100).toFixed(1) : 0
})

const lowStockCount = computed(() => extra.value?.lowStock?.length ?? 0)
const totalCliDebt  = computed(() => (extra.value?.debtClients   || []).reduce((s,c) =>s+Math.abs(Number(c.balance)), 0))
const totalSupDebt  = computed(() => (extra.value?.debtSuppliers || []).reduce((s,s2)=>s+Math.abs(Number(s2.balance)), 0))

const payTypesTotal = computed(() => (extra.value?.payTypes || []).reduce((s,p)=>s+p.total, 0))
const maxCashierSum = computed(() => Math.max(...(extra.value?.cashiers || []).map(c=>c.total_sum), 1))
const maxProdRev    = computed(() => Math.max(...(extra.value?.topProducts || []).map(p=>p.revenue), 1))

// ── Qo'shimcha analitika (AOV, sof foyda, qaytarishlar, mijozlar, kategoriyalar) ──
const aov       = computed(() => extra.value?.averageOrderValue ?? { amount: 0, trend: 0 })
const netProfit = computed(() => extra.value?.netProfit ?? { today: 0, month: 0, marginPercentage: 0 })
const returnsA  = computed(() => extra.value?.returnsAnalytics ?? { totalReturnedAmount: 0, returnedCount: 0, topReturnedProducts: [] })
const custA     = computed(() => extra.value?.customerAnalytics ?? { newCustomersCount: 0, returningCustomersCount: 0, activeCustomers: 0 })
const topCats   = computed(() => extra.value?.topCategories ?? [])
function payPct(p) { return payTypesTotal.value > 0 ? Math.round(p.total / payTypesTotal.value * 100) : 0 }
</script>

<template>
<div class="dash">

  <!-- Error -->
  <transition name="fade">
    <div v-if="error" class="dash-error">
      <AppIcon name="alert-circle" :size="16"/> {{ error }}
      <button @click="refresh"><AppIcon name="refresh-cw" :size="13"/> Qayta</button>
    </div>
  </transition>
  <!-- ── Header ────────────────────────────────────────────────── -->
  <div class="dash-hdr">
    <div class="dash-hdr__l">
      <div class="dash-hdr__ico"><AppIcon name="bar-chart-2" :size="18" :stroke-width="2"/></div>
      <div>
        <h1 class="dash-hdr__title">Bosh sahifa</h1>
        <p class="dash-hdr__sub">{{ new Date().toLocaleDateString('uz-UZ', { weekday:'long', day:'numeric', month:'long' }) }}</p>
      </div>
    </div>
    <div class="dash-hdr__r">
      <div class="period-toggle-scroll">
        <div class="period-toggle">
          <button v-for="p in ['day','week','month','year']" :key="p"
            :class="['pt-btn', period===p && 'pt-btn--on']" @click="period = p">
            {{ PERIOD_LABELS[p] }}
          </button>
        </div>
      </div>
      <button class="dash-refresh" :class="(loading||loadingExtra) && 'spinning'" @click="refresh">
        <AppIcon name="refresh-cw" :size="15"/>
      </button>
    </div>
  </div>

  <!-- ── KPI Cards ─────────────────────────────────────────────── -->
  <div class="kpi-grid">

    <div class="kpi-card kpi-card--indigo">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--indigo"><AppIcon name="trending-up" :size="16"/></div>
        <span class="kpi-lbl">Bugungi tushum</span>
      </div>
      <div class="kpi-val">{{ fmtM(cRevenue) }}<span class="kpi-cur"> so'm</span></div>
      <div class="kpi-sub"><AppIcon name="calendar" :size="10"/> Oy: {{ fmtM(cMonth) }} so'm</div>
      <div class="kpi-ghost"><AppIcon name="trending-up" :size="60" :stroke-width="1"/></div>
    </div>

    <div class="kpi-card kpi-card--blue">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--blue"><AppIcon name="shopping-cart" :size="16"/></div>
        <span class="kpi-lbl">Bugungi sotuvlar</span>
      </div>
      <div class="kpi-val">{{ cSales }}<span class="kpi-cur"> ta</span></div>
      <div class="kpi-sub"><AppIcon name="package" :size="10"/> {{ cItems }} dona tovar</div>
      <div class="kpi-ghost"><AppIcon name="shopping-cart" :size="60" :stroke-width="1"/></div>
    </div>

    <div class="kpi-card kpi-card--emerald">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--emerald"><AppIcon name="percent" :size="16"/></div>
        <span class="kpi-lbl">{{ PERIOD_LABELS[period] }} foydasi</span>
      </div>
      <div class="kpi-val">{{ fmtM(chartTotalProfit) }}<span class="kpi-cur"> so'm</span></div>
      <div class="kpi-sub"><AppIcon name="trending-up" :size="10"/> Marj: {{ chartMargin }}%</div>
      <div class="kpi-progress"><div class="kpi-prog-fill kpi-prog-fill--emerald" :style="{ width: Math.min(chartMargin,100)+'%' }"></div></div>
      <div class="kpi-ghost"><AppIcon name="percent" :size="60" :stroke-width="1"/></div>
    </div>

    <div class="kpi-card kpi-card--rose">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--rose"><AppIcon name="clock" :size="16"/></div>
        <span class="kpi-lbl">Bugungi qarz</span>
      </div>
      <div class="kpi-val">{{ fmtM(cDebt) }}<span class="kpi-cur"> so'm</span></div>
      <div class="kpi-sub"><AppIcon name="users" :size="10"/> Hafta: {{ fmtM(overview?.week?.debt ?? 0) }} so'm</div>
      <div class="kpi-ghost"><AppIcon name="clock" :size="60" :stroke-width="1"/></div>
    </div>

    <div class="kpi-card kpi-card--amber">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--amber"><AppIcon name="alert-triangle" :size="16"/></div>
        <span class="kpi-lbl">Kam qolgan tovar</span>
      </div>
      <div class="kpi-val">{{ lowStockCount }}<span class="kpi-cur"> xil</span></div>
      <div class="kpi-sub"><AppIcon name="package" :size="10"/> Zaxira chegarasida</div>
      <div class="kpi-ghost"><AppIcon name="alert-triangle" :size="60" :stroke-width="1"/></div>
    </div>

    <div class="kpi-card kpi-card--orange">
      <div class="kpi-top">
        <div class="kpi-ico kpi-ico--orange"><AppIcon name="arrow-up-right" :size="16"/></div>
        <span class="kpi-lbl">Bugungi xarajat</span>
      </div>
      <div class="kpi-val">{{ fmtM(extra?.totalExpenses ?? 0) }}<span class="kpi-cur"> so'm</span></div>
      <div class="kpi-sub"><AppIcon name="truck" :size="10"/> Yetkazuvchi to'lovlari</div>
      <div class="kpi-ghost"><AppIcon name="arrow-up-right" :size="60" :stroke-width="1"/></div>
    </div>

  </div>

  <!-- ── Analitika strip: AOV / Sof foyda / Qaytarishlar / Mijozlar ── -->
  <div class="ana-grid">

    <div class="ana-card">
      <div class="ana-ico ana-ico--indigo"><AppIcon name="credit-card" :size="15"/></div>
      <div class="ana-body">
        <span class="ana-lbl">O'rtacha chek (bugun)</span>
        <span class="ana-val">{{ fmt(aov.amount) }} <small>so'm</small></span>
        <span class="ana-trend" :class="aov.trend >= 0 ? 'ana-trend--up' : 'ana-trend--down'">
          <AppIcon :name="aov.trend >= 0 ? 'trending-up' : 'trending-down'" :size="11"/>
          {{ aov.trend > 0 ? '+' : '' }}{{ aov.trend }}% kechaga nisbatan
        </span>
      </div>
    </div>

    <div class="ana-card">
      <div class="ana-ico ana-ico--emerald"><AppIcon name="wallet" :size="15"/></div>
      <div class="ana-body">
        <span class="ana-lbl">Sof foyda (bugun)</span>
        <span class="ana-val" :class="netProfit.today < 0 && 'ana-val--neg'">{{ fmt(netProfit.today) }} <small>so'm</small></span>
        <span class="ana-sub">Oy: <strong>{{ fmtM(netProfit.month) }}</strong> so'm · Marja: <strong>{{ netProfit.marginPercentage }}%</strong></span>
      </div>
    </div>

    <div class="ana-card">
      <div class="ana-ico ana-ico--rose"><AppIcon name="rotate-ccw" :size="15"/></div>
      <div class="ana-body">
        <span class="ana-lbl">Qaytarishlar (oy)</span>
        <span class="ana-val">{{ fmt(returnsA.totalReturnedAmount) }} <small>so'm</small></span>
        <span class="ana-sub"><strong>{{ returnsA.returnedCount }}</strong> ta chek bekor qilingan</span>
      </div>
    </div>

    <div class="ana-card">
      <div class="ana-ico ana-ico--blue"><AppIcon name="users" :size="15"/></div>
      <div class="ana-body">
        <span class="ana-lbl">Faol mijozlar (oy)</span>
        <span class="ana-val">{{ custA.activeCustomers }} <small>ta</small></span>
        <span class="ana-sub"><strong>+{{ custA.newCustomersCount }}</strong> yangi · <strong>{{ custA.returningCustomersCount }}</strong> doimiy</span>
      </div>
    </div>

  </div>

  <!-- ── Row 1: Main chart + Donut ─────────────────────────────── -->
  <div class="row-grid row-grid--7-3">

    <!-- Main combo chart -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">
          <span class="dot dot--indigo"></span>
          {{ PERIOD_LABELS[period] }} — savdo va foyda tahlili
        </div>
        <div class="chip-row">
          <span class="chip chip--indigo">Tushum: {{ fmtM(chartTotalRevenue) }} so'm</span>
          <span class="chip chip--red">Tan: {{ fmtM(chartTotalCost) }} so'm</span>
          <span class="chip chip--green">Foyda: {{ fmtM(chartTotalProfit) }} so'm</span>
        </div>
      </div>
      <div class="chart-box" style="height:270px">
        <div v-if="loadingExtra" class="skel skel--full skeleton"></div>
        <div v-else-if="!extra" class="chart-empty"><AppIcon name="bar-chart-2" :size="38" :stroke-width="1.2"/><p>Ma'lumot yo'q</p></div>
        <canvas v-else ref="mainCanvas"></canvas>
      </div>
    </div>

    <!-- To'lov turlari donut -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title"><span class="dot dot--green"></span> To'lov turlari</div>
        <span class="chip chip--slate">Bugun</span>
      </div>
      <div class="donut-wrap">
        <div v-if="loadingExtra" class="skel skeleton" style="width:150px;height:150px;border-radius:50%"></div>
        <template v-else-if="extra?.payTypes?.length">
          <div class="donut-canvas-wrap">
            <canvas ref="donutCanvas" style="max-width:160px;max-height:160px"></canvas>
            <div class="donut-center">
              <div class="donut-center__val">{{ fmtM(payTypesTotal) }}</div>
              <div class="donut-center__lbl">so'm</div>
            </div>
          </div>
        </template>
        <div v-else class="chart-empty" style="height:150px"><AppIcon name="pie-chart" :size="30" :stroke-width="1.2"/><p>Ma'lumot yo'q</p></div>
      </div>
      <!-- Legend -->
      <div v-if="extra?.payTypes?.length" class="donut-legend">
        <div v-for="p in extra.payTypes" :key="p.type" class="dl-row">
          <span class="dl-dot" :style="{ background: PAY_COLORS[p.type] || '#94a3b8' }"></span>
          <span class="dl-type">{{ p.type }}</span>
          <span class="dl-count c-dim">{{ p.count }} ta</span>
          <span class="dl-val">{{ fmtM(p.total) }}</span>
          <span class="dl-pct">{{ payPct(p) }}%</span>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Row 2: Top products chart + Kassirlar + Qarz panellari ── -->
  <div class="row-grid row-grid--5-5">

    <!-- Top tovarlar horizontal bar -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title"><span class="dot dot--violet"></span> Top tovarlar (bugun)</div>
        <span class="chip chip--slate">{{ extra?.topProducts?.length ?? 0 }} ta</span>
      </div>
      <div v-if="loadingExtra" class="skel-list">
        <div v-for="i in 5" :key="i" class="skeleton" style="height:28px;border-radius:6px"></div>
      </div>
      <div v-else-if="!extra?.topProducts?.length" class="chart-empty" style="height:200px">
        <AppIcon name="package" :size="34" :stroke-width="1.2"/><p>Bugun sotuv yo'q</p>
      </div>
      <div v-else class="chart-box" :style="{ height: Math.max(160, extra.topProducts.length * 42) + 'px' }">
        <canvas ref="topCanvas"></canvas>
      </div>
    </div>

    <!-- Kassirlar ranking -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title"><span class="dot dot--blue"></span> Kassirlar (bugun)</div>
        <span class="chip chip--slate">{{ extra?.cashiers?.length ?? 0 }} ta</span>
      </div>
      <div v-if="loadingExtra" class="skel-list">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:52px;border-radius:10px"></div>
      </div>
      <div v-else-if="!extra?.cashiers?.length" class="chart-empty" style="height:160px">
        <AppIcon name="user-check" :size="34" :stroke-width="1.2"/><p>Faol kassir yo'q</p>
      </div>
      <div v-else class="cashier-list">
        <div v-for="(c, idx) in extra.cashiers" :key="c.id || idx" class="cashier-row">
          <div class="cashier-rank" :class="`cashier-rank--${Math.min(idx+1,4)}`">{{ idx+1 }}</div>
          <div class="cashier-av">{{ (c.name||'?')[0].toUpperCase() }}</div>
          <div class="cashier-info">
            <div class="cashier-name">{{ c.name }}</div>
            <div class="cashier-bar-wrap">
              <div class="cashier-bar" :style="{ width: (c.total_sum / maxCashierSum * 100).toFixed(1) + '%' }"></div>
            </div>
            <div class="cashier-meta c-dim">{{ c.sales_count }} sotuv · {{ c.items }} dona</div>
          </div>
          <div class="cashier-sum">
            <div class="cashier-sum__main">{{ fmtM(c.total_sum) }}</div>
            <div class="cashier-sum__cur">so'm</div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Row: Top kategoriyalar + Qaytarilgan tovarlar ──────────── -->
  <div class="row-grid row-grid--5-5">

    <!-- Top kategoriyalar (oy) -->
    <div class="card">
      <div class="card-hdr">
        <div class="card-title"><span class="dot dot--amber"></span> Top kategoriyalar (oy)</div>
        <span class="chip chip--slate">{{ topCats.length }} ta</span>
      </div>
      <div v-if="loadingExtra" class="skel-list">
        <div v-for="i in 5" :key="i" class="skeleton" style="height:40px;border-radius:8px"></div>
      </div>
      <div v-else-if="!topCats.length" class="chart-empty" style="height:160px">
        <AppIcon name="tag" :size="32" :stroke-width="1.2"/><p>Kategoriya ma'lumoti yo'q</p>
      </div>
      <div v-else class="cat-list">
        <div v-for="(c, i) in topCats" :key="c.categoryName" class="cat-row" :style="{ '--i': i }">
          <span class="cat-rank" :class="i < 3 && `cat-rank--${i+1}`">{{ i + 1 }}</span>
          <div class="cat-info">
            <div class="cat-top">
              <span class="cat-name">{{ c.categoryName }}</span>
              <span class="cat-share">{{ c.sharePercentage }}%</span>
            </div>
            <div class="cat-bar-wrap"><div class="cat-bar" :style="{ width: c.sharePercentage + '%' }"></div></div>
            <div class="cat-meta c-dim">{{ c.salesCount }} dona · {{ fmtM(c.totalRevenue) }} so'm</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Qaytarilgan tovarlar (oy) -->
    <div class="card card--nop">
      <div class="panel-hdr panel-hdr--rose">
        <div class="panel-title"><AppIcon name="rotate-ccw" :size="13"/> Qaytarilgan tovarlar (oy)</div>
        <span class="pbadge pbadge--rose">{{ returnsA.returnedCount }} ta · {{ fmtM(returnsA.totalReturnedAmount) }} so'm</span>
      </div>
      <div v-if="loadingExtra" class="skel-list p12">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:32px;border-radius:7px"></div>
      </div>
      <div v-else-if="!returnsA.topReturnedProducts.length" class="panel-empty">
        <AppIcon name="check-circle" :size="26" style="color:#10b981"/><p>Bu oyda qaytarish yo'q</p>
      </div>
      <div v-else class="scroll-list">
        <div v-for="r in returnsA.topReturnedProducts" :key="r.name" class="info-row">
          <div class="exp-ico-sm" style="background:#fff1f2;color:#be123c"><AppIcon name="rotate-ccw" :size="12"/></div>
          <div class="info-main">
            <div class="info-name">{{ r.name }}</div>
            <div class="info-sub c-dim">{{ r.qty }} dona qaytarilgan</div>
          </div>
          <div class="info-right debt-neg">{{ fmt(r.total) }}</div>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Row 3: 4 info panels ──────────────────────────────────── -->
  <div class="row-grid row-grid--4">

    <!-- Kam qolgan tovarlar -->
    <div class="card card--nop">
      <div class="panel-hdr panel-hdr--amber">
        <div class="panel-title"><AppIcon name="alert-triangle" :size="13"/> Kam qolgan tovarlar</div>
        <span class="pbadge pbadge--amber">{{ lowStockCount }} ta</span>
      </div>
      <div v-if="loadingExtra" class="skel-list p12">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:32px;border-radius:7px"></div>
      </div>
      <div v-else-if="!extra?.lowStock?.length" class="panel-empty">
        <AppIcon name="check-circle" :size="26" style="color:#10b981"/><p>Barcha tovarlar yetarli</p>
      </div>
      <div v-else class="scroll-list">
        <div v-for="p in extra.lowStock" :key="p.id" class="info-row">
          <div class="info-main">
            <div class="info-name">{{ p.name }}</div>
            <div class="info-sub c-dim">{{ p.code }}</div>
          </div>
          <div class="info-right">
            <span class="qty-badge" :class="Number(p.qty)<=0?'qty-badge--zero':'qty-badge--warn'">
              {{ Number(p.qty) }} {{ p.unit }}
            </span>
            <span class="c-dim" style="font-size:10px">min {{ Number(p.min_qty) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bugungi xarajatlar -->
    <div class="card card--nop">
      <div class="panel-hdr panel-hdr--orange">
        <div class="panel-title"><AppIcon name="arrow-up-right" :size="13"/> Bugungi xarajatlar</div>
        <span class="pbadge pbadge--orange">{{ fmt(extra?.totalExpenses ?? 0) }} so'm</span>
      </div>
      <div v-if="loadingExtra" class="skel-list p12">
        <div v-for="i in 3" :key="i" class="skeleton" style="height:38px;border-radius:7px"></div>
      </div>
      <div v-else-if="!extra?.expenses?.length" class="panel-empty">
        <AppIcon name="check-circle" :size="26" style="color:#10b981"/><p>Bugun xarajat yo'q</p>
      </div>
      <div v-else class="scroll-list">
        <div v-for="e in extra.expenses" :key="e.id" class="info-row">
          <div class="exp-ico-sm"><AppIcon name="truck" :size="12"/></div>
          <div class="info-main">
            <div class="info-name">{{ e.supplier_name }}</div>
            <div class="info-sub c-dim">{{ fmtTime(e.date) }} · {{ e.payment_type }}</div>
          </div>
          <div class="info-right" style="color:#c2410c;font-weight:700">{{ fmt(e.amount) }}</div>
        </div>
      </div>
    </div>

    <!-- Mijozlar qarzdorligi -->
    <div class="card card--nop">
      <div class="panel-hdr panel-hdr--rose">
        <div class="panel-title"><AppIcon name="users" :size="13"/> Mijozlar qarzdorligi</div>
        <span class="pbadge pbadge--rose">{{ fmt(totalCliDebt) }} so'm</span>
      </div>
      <div v-if="loadingExtra" class="skel-list p12">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:32px;border-radius:7px"></div>
      </div>
      <div v-else-if="!extra?.debtClients?.length" class="panel-empty">
        <AppIcon name="check-circle" :size="26" style="color:#10b981"/><p>Qarzdor mijoz yo'q</p>
      </div>
      <div v-else class="scroll-list">
        <div v-for="c in extra.debtClients" :key="c.id" class="info-row">
          <div class="av av--rose">{{ (c.name||'?')[0].toUpperCase() }}</div>
          <div class="info-main">
            <div class="info-name">{{ c.name }}</div>
            <div class="info-sub c-dim">{{ c.phone || c.code || '—' }}</div>
          </div>
          <div class="info-right debt-neg">{{ fmt(Math.abs(c.balance)) }}</div>
        </div>
      </div>
    </div>

    <!-- Yetkazuvchilarga qarz -->
    <div class="card card--nop">
      <div class="panel-hdr panel-hdr--violet">
        <div class="panel-title"><AppIcon name="truck" :size="13"/> Yetkazuvchilarga qarz</div>
        <span class="pbadge pbadge--violet">{{ fmt(totalSupDebt) }} so'm</span>
      </div>
      <div v-if="loadingExtra" class="skel-list p12">
        <div v-for="i in 4" :key="i" class="skeleton" style="height:32px;border-radius:7px"></div>
      </div>
      <div v-else-if="!extra?.debtSuppliers?.length" class="panel-empty">
        <AppIcon name="check-circle" :size="26" style="color:#10b981"/><p>Qarz yo'q</p>
      </div>
      <div v-else class="scroll-list">
        <div v-for="s in extra.debtSuppliers" :key="s.id" class="info-row">
          <div class="av av--violet">{{ (s.name||'?')[0].toUpperCase() }}</div>
          <div class="info-main">
            <div class="info-name">{{ s.name }}</div>
            <div class="info-sub c-dim">{{ s.phone || s.code || '—' }}</div>
          </div>
          <div class="info-right debt-neg">{{ fmt(Math.abs(s.balance)) }}</div>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Footer strip ───────────────────────────────────────────── -->
  <div v-if="overview" class="footer-strip">
    <div class="fs-item">
      <span class="fs-lbl">Bugungi tushum</span>
      <span class="fs-val" style="color:#6366f1">{{ fmt(overview.today.income) }} so'm</span>
    </div>
    <div class="fs-sep"></div>
    <div class="fs-item">
      <span class="fs-lbl">Sotuv to'lovi</span>
      <span class="fs-val" style="color:#10b981">{{ fmt(overview.today.paid) }} so'm</span>
    </div>
    <div class="fs-sep"></div>
    <div class="fs-item">
      <span class="fs-lbl">Qarz to'lovlari</span>
      <span class="fs-val" style="color:#0ea5e9">{{ fmt(overview.today.debt_payments) }} so'm</span>
    </div>
    <div class="fs-sep"></div>
    <div class="fs-item">
      <span class="fs-lbl">Haftalik tushum</span>
      <span class="fs-val" style="color:#f59e0b">{{ fmt(overview.week.income) }} so'm</span>
    </div>
    <div class="fs-sep"></div>
    <div class="fs-item">
      <span class="fs-lbl">Oylik tushum</span>
      <span class="fs-val" style="color:#8b5cf6">{{ fmt(overview.month.income) }} so'm</span>
    </div>
    <div class="fs-sep"></div>
    <div class="fs-item">
      <span class="fs-lbl">Oylik sotuvlar</span>
      <span class="fs-val" style="color:#475569">{{ overview.month.sales_count }} ta</span>
    </div>
  </div>

</div>
</template>

<style scoped>
.dash { display:flex; flex-direction:column; min-height:100%; background:#f0f2f8; overflow-y:auto; gap:0; }

/* Error */
.dash-error { display:flex; align-items:center; gap:8px; padding:10px 20px; background:#fef2f2; color:#ef4444; font-size:13px; font-weight:600; border-bottom:1px solid #fecdd3; }
.dash-error button { margin-left:auto; display:flex; align-items:center; gap:5px; padding:4px 12px; border-radius:7px; background:#fee2e2; border:1px solid #fca5a5; color:#ef4444; font-size:12px; font-family:inherit; cursor:pointer; }

/* Header */
.dash-hdr { display:flex; align-items:center; justify-content:space-between; padding:14px 24px 12px; background:white; border-bottom:1px solid #e2e8f0; flex-shrink:0; gap:12px; flex-wrap:wrap; }
.dash-hdr__l { display:flex; align-items:center; gap:12px; }
.dash-hdr__ico { width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; color:white; flex-shrink:0; }
.dash-hdr__title { font-size:16px; font-weight:900; color:#0f172a; letter-spacing:-.03em; }
.dash-hdr__sub { font-size:11.5px; color:#94a3b8; margin-top:1px; text-transform:capitalize; }
.dash-hdr__r { display:flex; align-items:center; gap:8px; }
.dash-refresh { width:34px; height:34px; border-radius:9px; background:#f1f5f9; border:1.5px solid #e2e8f0; color:#64748b; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all .2s; flex-shrink:0; }
.dash-refresh:hover { background:#e0e7ff; color:#6366f1; border-color:#c7d2fe; }
.dash-refresh.spinning svg { animation:spin .6s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

/* Period toggle */
.period-toggle { display:flex; gap:2px; background:#f1f5f9; border-radius:9px; padding:3px; }
.pt-btn { padding:5px 14px; border-radius:7px; font-size:12px; font-weight:600; font-family:inherit; cursor:pointer; border:none; background:transparent; color:#64748b; transition:all .15s; white-space:nowrap; }
.pt-btn:hover { color:#4f46e5; }
.pt-btn--on { background:white; color:#4f46e5; box-shadow:0 1px 4px rgba(0,0,0,.12); }

/* ── KPI grid ────────────────────────────────────────────────── */
.kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; padding:16px 24px 0; }
@media(max-width:1400px) { .kpi-grid { grid-template-columns:repeat(3,1fr); } }
@media(max-width:860px)  { .kpi-grid { grid-template-columns:repeat(2,1fr); } }

.kpi-card { position:relative; overflow:hidden; padding:15px 17px 14px; border-radius:14px; border:1.5px solid; display:flex; flex-direction:column; gap:2px; cursor:default; transition:transform .18s,box-shadow .18s; }
.kpi-card:hover { transform:translateY(-2px); box-shadow:0 10px 28px rgba(0,0,0,.09); }
.kpi-card--indigo { background:linear-gradient(145deg,#eef2ff,#e0e7ff); border-color:#c7d2fe; }
.kpi-card--blue   { background:linear-gradient(145deg,#eff6ff,#dbeafe); border-color:#bfdbfe; }
.kpi-card--emerald{ background:linear-gradient(145deg,#f0fdf4,#d1fae5); border-color:#a7f3d0; }
.kpi-card--rose   { background:linear-gradient(145deg,#fff1f2,#fce7f3); border-color:#fecdd3; }
.kpi-card--amber  { background:linear-gradient(145deg,#fffbeb,#fef3c7); border-color:#fde68a; }
.kpi-card--orange { background:linear-gradient(145deg,#fff7ed,#fed7aa); border-color:#fdba74; }

.kpi-top { display:flex; align-items:center; gap:7px; margin-bottom:4px; }
.kpi-ico { width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.kpi-ico--indigo { background:#c7d2fe; color:#4338ca; }
.kpi-ico--blue   { background:#bfdbfe; color:#1d4ed8; }
.kpi-ico--emerald{ background:#a7f3d0; color:#047857; }
.kpi-ico--rose   { background:#fecdd3; color:#be123c; }
.kpi-ico--amber  { background:#fde68a; color:#92400e; }
.kpi-ico--orange { background:#fed7aa; color:#c2410c; }
.kpi-lbl { font-size:10.5px; font-weight:700; color:#475569; }
.kpi-val { font-size:26px; font-weight:900; letter-spacing:-.04em; color:#0f172a; line-height:1.1; }
.kpi-cur { font-size:12px; font-weight:500; color:#64748b; }
.kpi-sub { display:flex; align-items:center; gap:3px; font-size:10.5px; color:#64748b; margin-top:3px; }
.kpi-ghost { position:absolute; right:-8px; bottom:-8px; opacity:.05; color:#334155; pointer-events:none; }
.kpi-progress { height:3px; background:rgba(0,0,0,.08); border-radius:99px; overflow:hidden; margin-top:8px; }
.kpi-prog-fill { height:100%; border-radius:99px; transition:width .9s ease; }
.kpi-prog-fill--emerald { background:#059669; }

/* ── Analitika strip (AOV / sof foyda / qaytarishlar / mijozlar) ── */
.ana-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; padding:12px 24px 0; }
@media(max-width:1300px) { .ana-grid { grid-template-columns:repeat(2,1fr); } }

.ana-card { display:flex; align-items:flex-start; gap:11px; background:white; border:1.5px solid #e2e8f0; border-radius:14px; padding:13px 15px; transition:transform .18s, box-shadow .18s; }
.ana-card:hover { transform:translateY(-2px); box-shadow:0 8px 22px rgba(0,0,0,.07); }
.ana-ico { width:32px; height:32px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
.ana-ico--indigo  { background:#e0e7ff; color:#4338ca; }
.ana-ico--emerald { background:#d1fae5; color:#047857; }
.ana-ico--rose    { background:#ffe4e6; color:#be123c; }
.ana-ico--blue    { background:#dbeafe; color:#1d4ed8; }
.ana-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
.ana-lbl { font-size:10.5px; font-weight:700; color:#64748b; }
.ana-val { font-size:19px; font-weight:900; letter-spacing:-.03em; color:#0f172a; line-height:1.15; }
.ana-val small { font-size:11px; font-weight:500; color:#94a3b8; }
.ana-val--neg { color:#e11d48; }
.ana-sub { font-size:10.5px; color:#64748b; }
.ana-sub strong { color:#334155; font-weight:800; }
.ana-trend { display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:700; margin-top:1px; }
.ana-trend--up   { color:#059669; }
.ana-trend--down { color:#e11d48; }

/* ── Kategoriya ro'yxati ──────────────────────────────────────── */
.cat-list { display:flex; flex-direction:column; gap:10px; }
.cat-row { display:flex; align-items:center; gap:10px; }
.cat-rank { width:22px; height:22px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; flex-shrink:0; background:#f1f5f9; color:#94a3b8; }
.cat-rank--1 { background:#fef3c7; color:#b45309; }
.cat-rank--2 { background:#f1f5f9; color:#475569; }
.cat-rank--3 { background:#fee2e2; color:#b91c1c; }
.cat-info { flex:1; min-width:0; }
.cat-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.cat-name { font-size:12.5px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cat-share { font-size:11.5px; font-weight:800; color:#d97706; flex-shrink:0; }
.cat-bar-wrap { height:5px; background:#f1f5f9; border-radius:99px; overflow:hidden; margin:4px 0 3px; }
.cat-bar { height:100%; background:linear-gradient(90deg,#f59e0b,#fbbf24); border-radius:99px; transition:width .7s ease; }
.cat-meta { font-size:10px; }

/* ── Row grids ───────────────────────────────────────────────── */
.row-grid { display:grid; gap:14px; padding:14px 24px 0; }
.row-grid--7-3 { grid-template-columns:7fr 3fr; }
.row-grid--5-5 { grid-template-columns:1fr 1fr; }
.row-grid--4   { grid-template-columns:repeat(4,1fr); padding-bottom:0; }
@media(max-width:1300px) {
  .row-grid--7-3 { grid-template-columns:1fr; }
  .row-grid--5-5 { grid-template-columns:1fr; }
  .row-grid--4   { grid-template-columns:repeat(2,1fr); }
}
@media(max-width:700px) {
  .row-grid--4 { grid-template-columns:1fr; }
}

/* ── Card ─────────────────────────────────────────────────────── */
.card { background:white; border-radius:14px; border:1.5px solid #e2e8f0; padding:16px; overflow:hidden; }
.card--nop { padding:0; }

.card-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; }
.card-title { display:flex; align-items:center; gap:7px; font-size:13px; font-weight:700; color:#1e293b; }

.dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.dot--indigo { background:#6366f1; }
.dot--green  { background:#10b981; }
.dot--violet { background:#8b5cf6; }
.dot--blue   { background:#3b82f6; }
.dot--amber  { background:#f59e0b; }

.chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.chip { font-size:10.5px; font-weight:600; padding:2px 9px; border-radius:99px; white-space:nowrap; }
.chip--indigo { background:#e0e7ff; color:#4338ca; }
.chip--red    { background:#fee2e2; color:#b91c1c; }
.chip--green  { background:#d1fae5; color:#065f46; }
.chip--slate  { background:#f1f5f9; color:#475569; border:1px solid #e2e8f0; }

/* chart containers */
.chart-box { position:relative; }
.chart-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#94a3b8; font-size:12px; }
.skel-list { display:flex; flex-direction:column; gap:6px; }
.skel--full { width:100%; height:100%; border-radius:10px; }

/* ── Donut ────────────────────────────────────────────────────── */
.donut-wrap { display:flex; justify-content:center; align-items:center; padding:4px 0 8px; }
.donut-canvas-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
.donut-center { position:absolute; text-align:center; pointer-events:none; }
.donut-center__val { font-size:15px; font-weight:900; color:#1e293b; letter-spacing:-.02em; }
.donut-center__lbl { font-size:9.5px; color:#94a3b8; font-weight:600; }
.donut-legend { display:flex; flex-direction:column; gap:5px; margin-top:6px; }
.dl-row { display:flex; align-items:center; gap:7px; font-size:12px; }
.dl-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.dl-type { flex:1; color:#475569; font-weight:600; }
.dl-count { font-size:10.5px; }
.dl-val { font-weight:700; color:#1e293b; font-size:12px; }
.dl-pct { font-size:10.5px; font-weight:800; color:#6366f1; background:#eef2ff; padding:1px 6px; border-radius:99px; flex-shrink:0; min-width:34px; text-align:center; }

/* ── Top products bar ─────────────────────────────────────────── */
/* (canvas fills chart-box) */

/* ── Cashier list ─────────────────────────────────────────────── */
.cashier-list { display:flex; flex-direction:column; gap:8px; }
.cashier-row { display:flex; align-items:center; gap:9px; padding:8px 10px; background:#f8fafc; border-radius:10px; border:1px solid #f1f5f9; }
.cashier-rank { width:22px; height:22px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; flex-shrink:0; }
.cashier-rank--1 { background:#fef3c7; color:#b45309; }
.cashier-rank--2 { background:#f1f5f9; color:#475569; }
.cashier-rank--3 { background:#fee2e2; color:#b91c1c; }
.cashier-rank--4 { background:#f1f5f9; color:#94a3b8; }
.cashier-av { width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.cashier-info { flex:1; min-width:0; }
.cashier-name { font-size:12.5px; font-weight:700; color:#1e293b; }
.cashier-bar-wrap { height:3px; background:#e2e8f0; border-radius:99px; overflow:hidden; margin:4px 0; }
.cashier-bar { height:100%; background:linear-gradient(90deg,#6366f1,#8b5cf6); border-radius:99px; transition:width .6s ease; }
.cashier-meta { font-size:10px; }
.cashier-sum { text-align:right; flex-shrink:0; }
.cashier-sum__main { font-size:14px; font-weight:900; color:#1e293b; letter-spacing:-.03em; }
.cashier-sum__cur { font-size:9.5px; color:#94a3b8; }

/* ── Panel cards ──────────────────────────────────────────────── */
.panel-hdr { display:flex; align-items:center; justify-content:space-between; padding:11px 14px; border-bottom:1px solid #f1f5f9; flex-shrink:0; }
.panel-hdr--amber  { background:#fffbeb; }
.panel-hdr--orange { background:#fff7ed; }
.panel-hdr--rose   { background:#fff1f2; }
.panel-hdr--violet { background:#faf5ff; }
.panel-title { display:flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:#1e293b; }
.pbadge { font-size:10px; font-weight:700; padding:2px 7px; border-radius:99px; white-space:nowrap; }
.pbadge--amber  { background:#fde68a; color:#92400e; }
.pbadge--orange { background:#fed7aa; color:#c2410c; }
.pbadge--rose   { background:#fecdd3; color:#be123c; }
.pbadge--violet { background:#e9d5ff; color:#6d28d9; }

.skel-list.p12 { padding:12px; }
.panel-empty { display:flex; flex-direction:column; align-items:center; gap:7px; padding:24px; color:#94a3b8; font-size:12px; }
.scroll-list { max-height:260px; overflow-y:auto; }

.info-row { display:flex; align-items:center; gap:9px; padding:8px 14px; border-bottom:1px solid #f8fafc; }
.info-row:last-child { border-bottom:none; }
.info-main { flex:1; min-width:0; }
.info-name { font-size:12px; font-weight:600; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.info-sub { font-size:10px; margin-top:1px; }
.info-right { font-size:12px; font-weight:700; white-space:nowrap; flex-shrink:0; }

.qty-badge { font-size:11px; font-weight:700; padding:2px 7px; border-radius:99px; }
.qty-badge--zero { background:#fee2e2; color:#ef4444; }
.qty-badge--warn { background:#fef3c7; color:#d97706; }

.exp-ico-sm { width:26px; height:26px; border-radius:7px; background:#fff7ed; color:#c2410c; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

.av { width:28px; height:28px; border-radius:50%; color:white; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.av--rose   { background:linear-gradient(135deg,#ef4444,#f43f5e); }
.av--violet { background:linear-gradient(135deg,#8b5cf6,#7c3aed); }

.debt-neg { color:#ef4444; }

/* ── Footer strip ─────────────────────────────────────────────── */
.footer-strip { display:flex; align-items:center; background:white; border-top:1px solid #e2e8f0; padding:10px 24px; margin-top:14px; flex-wrap:wrap; }
.fs-item { flex:1; min-width:100px; text-align:center; padding:3px 6px; }
.fs-lbl { display:block; font-size:9.5px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.04em; margin-bottom:2px; }
.fs-val { display:block; font-size:12.5px; font-weight:800; }
.fs-sep { width:1px; height:28px; background:#f1f5f9; flex-shrink:0; }

/* Helpers */
.c-dim { color:#94a3b8; }

/* Skeleton */
.skeleton { background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:shimmer 1.4s infinite; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.fade-enter-active, .fade-leave-active { transition:opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity:0; }

/* ════════════════════════════════════════════════════════════════
   MOBILE (≤768px)
   ════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {

  .dash { overflow-x:hidden; }

  /* entrance animation keyframes */
  @keyframes fadeInUp {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0); }
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .dash-hdr {
    flex-direction:column;
    align-items:stretch;
    padding:12px 14px 10px;
    gap:10px;
  }
  .dash-hdr__l { gap:10px; }
  .dash-hdr__ico { width:34px; height:34px; }
  .dash-hdr__title { font-size:15px; }
  .dash-hdr__sub { font-size:11px; }
  .dash-hdr__r {
    width:100%;
    justify-content:space-between;
    gap:8px;
  }

  .period-toggle-scroll {
    flex:1;
    min-width:0;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
  }
  .period-toggle-scroll::-webkit-scrollbar { display:none; }

  .period-toggle {
    display:inline-flex;
    width:max-content;
    min-width:100%;
  }
  .pt-btn {
    flex:1;
    padding:9px 14px;
    min-height:40px;
    font-size:12.5px;
  }

  .dash-refresh {
    width:40px;
    height:40px;
    flex-shrink:0;
  }

  /* ── KPI grid: clean 2-column, breathing room ──────────────────── */
  .kpi-grid {
    grid-template-columns:repeat(2,1fr);
    gap:10px;
    padding:14px 14px 0;
  }
  .kpi-card {
    padding:13px 14px 12px;
    border-radius:var(--r-lg, 14px);
    opacity:0;
    animation:fadeInUp .45s var(--ease-spring, cubic-bezier(.16,1,.3,1)) both;
  }
  .kpi-card:nth-child(1) { animation-delay:.02s; }
  .kpi-card:nth-child(2) { animation-delay:.07s; }
  .kpi-card:nth-child(3) { animation-delay:.12s; }
  .kpi-card:nth-child(4) { animation-delay:.17s; }
  .kpi-card:nth-child(5) { animation-delay:.22s; }
  .kpi-card:nth-child(6) { animation-delay:.27s; }
  .kpi-card:hover { transform:none; box-shadow:none; }
  .kpi-card:active { transform:scale(.97); }

  .kpi-lbl { font-size:10px; }
  .kpi-val { font-size:21px; }
  .kpi-cur { font-size:11px; }
  .kpi-sub { font-size:10px; }
  .kpi-ico { width:25px; height:25px; }
  .kpi-ghost { display:none; }

  /* ── Analitika strip: 2-col ────────────────────────────────────── */
  .ana-grid { grid-template-columns:repeat(2,1fr); gap:10px; padding:12px 14px 0; }
  .ana-card {
    padding:12px;
    gap:9px;
    opacity:0;
    animation:fadeInUp .45s var(--ease-spring, cubic-bezier(.16,1,.3,1)) both;
  }
  .ana-card:nth-child(1) { animation-delay:.3s; }
  .ana-card:nth-child(2) { animation-delay:.35s; }
  .ana-card:nth-child(3) { animation-delay:.4s; }
  .ana-card:nth-child(4) { animation-delay:.45s; }
  .ana-card:hover { transform:none; box-shadow:none; }
  .ana-card:active { transform:scale(.97); }
  .ana-ico { width:28px; height:28px; }
  .ana-val { font-size:16px; }
  .ana-lbl { font-size:9.5px; }
  .ana-sub, .ana-trend { font-size:9.5px; }

  /* ── Row grids: single column, explicit chart heights ───────────── */
  .row-grid {
    grid-template-columns:1fr !important;
    padding:12px 14px 0;
    gap:12px;
  }

  .card {
    padding:14px;
    border-radius:var(--r-lg, 14px);
    opacity:0;
    animation:fadeInUp .45s var(--ease-spring, cubic-bezier(.16,1,.3,1)) both;
    animation-delay:.1s;
  }
  .card--nop { padding:0; }

  .card-hdr { margin-bottom:12px; }
  .card-title { font-size:12.5px; }
  .chip { font-size:10px; }

  /* explicit, sane heights so canvases never collapse/distort */
  .row-grid--7-3 .card:first-child .chart-box { height:230px !important; }
  .donut-wrap { padding:6px 0; }
  .donut-canvas-wrap canvas { max-width:140px !important; max-height:140px !important; }

  .row-grid--5-5 .chart-box {
    height:auto !important;
    min-height:200px;
    max-height:280px;
  }

  .cashier-row { padding:8px; gap:7px; }
  .cashier-av { width:28px; height:28px; font-size:12px; }
  .cashier-sum__main { font-size:13px; }

  .scroll-list { max-height:220px; }
  .info-row { padding:9px 12px; }

  .panel-hdr { padding:10px 12px; }

  /* ── Footer strip: 2-column wrap ─────────────────────────────────── */
  .footer-strip {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px 8px;
    padding:14px;
    margin-top:12px;
  }
  .fs-sep { display:none; }
  .fs-item {
    min-width:0;
    padding:10px 8px;
    background:var(--slate-50, #f8fafc);
    border-radius:var(--r-md, 10px);
    opacity:0;
    animation:fadeInUp .4s var(--ease-spring, cubic-bezier(.16,1,.3,1)) both;
  }
  .fs-item:nth-child(1) { animation-delay:.05s; }
  .fs-item:nth-child(2) { animation-delay:.1s; }
  .fs-item:nth-child(3) { animation-delay:.15s; }
  .fs-item:nth-child(4) { animation-delay:.2s; }
  .fs-item:nth-child(5) { animation-delay:.25s; }
  .fs-item:nth-child(6) { animation-delay:.3s; }
  .fs-lbl { font-size:9px; }
  .fs-val { font-size:12px; }

  /* error banner */
  .dash-error { padding:9px 14px; font-size:12px; flex-wrap:wrap; }
}

/* ════════════════════════════════════════════════════════════════
   SMALL PHONES (≤480px)
   ════════════════════════════════════════════════════════════════ */
@media (max-width: 480px) {

  .dash-hdr__sub { display:block; }

  .kpi-grid { gap:8px; padding:12px 10px 0; }
  .kpi-card { padding:11px 12px 10px; }
  .kpi-val { font-size:18px; }
  .kpi-lbl { font-size:9.5px; }
  .kpi-sub { font-size:9.5px; }

  .ana-grid { gap:8px; padding:10px 10px 0; }
  .ana-card { padding:10px 11px; }
  .ana-val { font-size:14.5px; }
  .cat-name { font-size:11.5px; }

  .row-grid { padding:10px 10px 0; gap:10px; }
  .card { padding:12px; }

  .row-grid--7-3 .card:first-child .chart-box { height:200px !important; }
  .row-grid--5-5 .chart-box { min-height:180px; max-height:230px; }

  .donut-canvas-wrap canvas { max-width:120px !important; max-height:120px !important; }
  .donut-center__val { font-size:13px; }

  .chip-row { gap:4px; }
  .chip { padding:2px 7px; font-size:9.5px; }

  .footer-strip { padding:12px 10px; gap:8px 6px; }
  .fs-val { font-size:11px; }
  .fs-lbl { font-size:8.5px; }

  .cashier-sum__main { font-size:12px; }
  .info-name { font-size:11.5px; }
}
</style>
