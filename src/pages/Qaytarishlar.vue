<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { salesApi } from '@/api/sales.js'
import { todayKey } from '@/composables/useDateTime.js'

// ── State ──────────────────────────────────────────────────────────
const sales       = ref([])
const total       = ref(0)
const loading     = ref(false)
const cancelling  = ref(null)   // sale id being cancelled

// ── Filters ────────────────────────────────────────────────────────
const tab         = ref('completed')   // 'completed' | 'cancelled'
const search      = ref('')
const today       = todayKey()
const dateFrom    = ref(today)
const dateTo      = ref(today)
const page        = ref(1)
const LIMIT       = 50

// ── Load ───────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const params = {
      status:    tab.value,
      date_from: dateFrom.value,
      date_to:   dateTo.value,
      page:      page.value,
      limit:     LIMIT,
    }
    if (search.value.trim()) params.search = search.value.trim()
    const res = await salesApi.getAll(params)
    sales.value = res.data
    total.value = res.total
  } catch {
    sales.value = []
    total.value = 0
  } finally { loading.value = false }
}

watch([tab, dateFrom, dateTo], () => { page.value = 1; load() })
watch(search, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load() }, 300) })
onMounted(load)
let timer = null

// ── Cancel sale ─────────────────────────────────────────────────────
const showConfirm = ref(false)
const confirmSale = ref(null)

function openCancel(sale) {
  confirmSale.value = sale
  showConfirm.value = true
}

async function doCancel() {
  if (!confirmSale.value) return
  cancelling.value = confirmSale.value.id
  showConfirm.value = false
  try {
    await salesApi.cancel(confirmSale.value.id)
    await load()
  } catch { /* silent */ }
  finally { cancelling.value = null; confirmSale.value = null }
}

// ── Detail modal ───────────────────────────────────────────────────
const showDetail = ref(false)
const detail     = ref(null)
const detailLoad = ref(false)

async function openDetail(sale) {
  detailLoad.value = true
  showDetail.value = true
  try {
    const res = await salesApi.getById(sale.id)
    detail.value = res
  } catch { detail.value = null }
  finally { detailLoad.value = false }
}

// ── Stats ──────────────────────────────────────────────────────────
const totalSum = computed(() => sales.value.reduce((s, r) => s + (r.totalSum || 0), 0))

// ── Helpers ────────────────────────────────────────────────────────
function fmt(v)  { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtDate(d) {
  return new Date(d).toLocaleDateString('uz-UZ', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

const TABS = [
  { key: 'completed', label: 'Faol sotuvlar'  },
  { key: 'cancelled', label: 'Qaytarilganlar' },
]
</script>

<template>
  <div class="page">

    <!-- ── Top bar ────────────────────────────────────────────────── -->
    <div class="page__topbar">
      <div class="page__topbar-l">
        <h2 class="page__title">Qaytarishlar</h2>
        <div class="page__search">
          <AppIcon name="search" :size="13" class="page__search-ico"/>
          <input v-model="search" class="page__search-inp" placeholder="Hujjat #, mijoz..."/>
          <button v-if="search" class="page__search-clr" @click="search=''">
            <AppIcon name="x" :size="11" :stroke-width="2.5"/>
          </button>
        </div>
      </div>
      <div class="date-range">
        <input type="date" v-model="dateFrom" class="date-inp"/>
        <span class="date-sep">—</span>
        <input type="date" v-model="dateTo"   class="date-inp"/>
      </div>
    </div>

    <!-- ── Stats ──────────────────────────────────────────────────── -->
    <div class="page__stats">
      <div class="scard scard--indigo">
        <AppIcon name="file-text" :size="15"/>
        <div><p class="scard__val">{{ total }}</p><p class="scard__lbl">Jami hujjat</p></div>
      </div>
      <div class="scard scard--green">
        <AppIcon name="trending-up" :size="15"/>
        <div><p class="scard__val">{{ fmt(totalSum) }}</p><p class="scard__lbl">Jami summa (so'm)</p></div>
      </div>
      <div class="scard scard--rose">
        <AppIcon name="rotate-ccw" :size="15"/>
        <div>
          <p class="scard__val">{{ tab === 'cancelled' ? total : 0 }}</p>
          <p class="scard__lbl">Qaytarilgan</p>
        </div>
      </div>
    </div>

    <!-- ── Tabs ───────────────────────────────────────────────────── -->
    <div class="page__tabs">
      <button
        v-for="t in TABS" :key="t.key"
        class="page__tab" :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >{{ t.label }}</button>
    </div>

    <!-- ── Table ──────────────────────────────────────────────────── -->
    <div class="page__table-wrap">
      <div v-if="loading" class="page__empty">
        <AppIcon name="loader" :size="28" :stroke-width="1.5" class="spin"/>
        <p>Yuklanmoqda...</p>
      </div>
      <div v-else-if="sales.length === 0" class="page__empty">
        <AppIcon name="inbox" :size="36" :stroke-width="1.2"/>
        <p>{{ tab === 'cancelled' ? 'Qaytarilgan sotuvlar yo\'q' : 'Sotuvlar topilmadi' }}</p>
      </div>
      <table v-else class="dtable">
        <thead>
          <tr>
            <th>Hujjat #</th>
            <th>Sana</th>
            <th>Mijoz</th>
            <th>To'lov</th>
            <th class="ta-r">Summa</th>
            <th class="ta-r">To'langan</th>
            <th class="ta-c">Holat</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sales" :key="s.id" class="dtable__row" @click="openDetail(s)">
            <td class="doc-num">#{{ s.docNumber }}</td>
            <td class="doc-date">{{ fmtDate(s.date) }}</td>
            <td class="doc-client">{{ s.client?.name || '—' }}</td>
            <td>
              <span class="pay-badge" :class="`pay--${s.paymentType?.toLowerCase()}`">
                {{ s.paymentType }}
              </span>
            </td>
            <td class="ta-r doc-sum">{{ fmt(s.totalSum) }}</td>
            <td class="ta-r doc-paid">{{ fmt(s.paidSum) }}</td>
            <td class="ta-c">
              <span class="status-badge" :class="s.status === 'completed' ? 'status--ok' : 'status--cancel'">
                {{ s.status === 'completed' ? 'Faol' : 'Bekor' }}
              </span>
            </td>
            <td>
              <div class="row-actions">
                <button
                  v-if="s.status === 'completed'"
                  class="row-act row-act--cancel"
                  title="Qaytarish"
                  :disabled="cancelling === s.id"
                  @click.stop="openCancel(s)"
                >
                  <AppIcon v-if="cancelling === s.id" name="loader" :size="13" class="spin"/>
                  <AppIcon v-else name="rotate-ccw" :size="13"/>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Detail modal ───────────────────────────────────────────── -->
    <teleport to="body">
      <div v-if="showDetail" class="modal-overlay" @click.self="showDetail=false">
        <div class="modal modal--wide">
          <div class="modal__hdr">
            <h3>
              Sotuv #{{ detail?.docNumber ?? '…' }}
              <span v-if="detail" class="status-badge" :class="detail.status==='completed'?'status--ok':'status--cancel'" style="margin-left:8px">
                {{ detail.status==='completed' ? 'Faol' : 'Bekor qilingan' }}
              </span>
            </h3>
            <button class="modal__close" @click="showDetail=false"><AppIcon name="x" :size="16"/></button>
          </div>
          <div class="modal__body">
            <div v-if="detailLoad" class="detail-loading">
              <AppIcon name="loader" :size="24" class="spin"/>
            </div>
            <template v-else-if="detail">
              <div class="detail-meta">
                <div class="dm-item"><span>Sana</span><strong>{{ fmtDate(detail.date) }}</strong></div>
                <div class="dm-item"><span>Mijoz</span><strong>{{ detail.client?.name || '—' }}</strong></div>
                <div class="dm-item"><span>To'lov</span><strong>{{ detail.paymentType }}</strong></div>
                <div class="dm-item"><span>Chegirma</span><strong>{{ fmt(detail.discount) }} so'm</strong></div>
                <div class="dm-item"><span>Jami</span><strong>{{ fmt(detail.totalSum) }} so'm</strong></div>
                <div class="dm-item"><span>To'langan</span><strong>{{ fmt(detail.paidSum) }} so'm</strong></div>
                <div v-if="detail.debtSum" class="dm-item"><span>Qarz</span><strong class="clr-red">{{ fmt(detail.debtSum) }} so'm</strong></div>
              </div>
              <table class="dtable" style="margin-top:12px">
                <thead>
                  <tr>
                    <th>Mahsulot</th>
                    <th class="ta-r">Miqdor</th>
                    <th class="ta-r">Narx</th>
                    <th class="ta-r">Jami</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in detail.items" :key="item.id" class="dtable__row">
                    <td>{{ item.productName }}</td>
                    <td class="ta-r">{{ item.qty }}</td>
                    <td class="ta-r">{{ fmt(item.price) }}</td>
                    <td class="ta-r">{{ fmt(item.totalSum) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
          <div class="modal__footer">
            <button class="mf__btn mf__btn--cancel" @click="showDetail=false">Yopish</button>
            <button
              v-if="detail?.status === 'completed'"
              class="mf__btn mf__btn--return"
              @click="showDetail=false; openCancel(detail)"
            >
              <AppIcon name="rotate-ccw" :size="14"/> Qaytarish
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ── Cancel confirm modal ────────────────────────────────────── -->
    <teleport to="body">
      <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm=false">
        <div class="modal modal--sm">
          <div class="modal__hdr">
            <h3 class="hdr--red"><AppIcon name="alert-triangle" :size="18"/> Qaytarishni tasdiqlang</h3>
            <button class="modal__close" @click="showConfirm=false"><AppIcon name="x" :size="16"/></button>
          </div>
          <div class="modal__body">
            <p class="confirm-text">
              <strong>#{{ confirmSale?.docNumber }}</strong> raqamli sotuv bekor qilinadi.
              Tovar qoldiq ga qaytariladi va mijoz balansi tiklanadi.
            </p>
            <div class="confirm-sum">
              Summa: <strong>{{ fmt(confirmSale?.totalSum) }} so'm</strong>
            </div>
          </div>
          <div class="modal__footer">
            <button class="mf__btn mf__btn--cancel" @click="showConfirm=false">Yo'q</button>
            <button class="mf__btn mf__btn--return" @click="doCancel">
              <AppIcon name="rotate-ccw" :size="14"/> Ha, qaytarish
            </button>
          </div>
        </div>
      </div>
    </teleport>

  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; height:calc(100vh - var(--header-h)); overflow:hidden; }

.page__topbar { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid var(--color-border); flex-shrink:0; gap:16px; }
.page__topbar-l { display:flex; align-items:center; gap:14px; flex:1; min-width:0; }
.page__title { font-size:18px; font-weight:800; color:var(--color-text); letter-spacing:-0.03em; white-space:nowrap; flex-shrink:0; }
.page__search { flex:1; max-width:300px; position:relative; display:flex; align-items:center; }
.page__search-ico { position:absolute; left:11px; color:var(--color-text-3); pointer-events:none; }
.page__search-inp { width:100%; height:36px; padding:0 32px; border:1.5px solid var(--color-border); border-radius:var(--r-lg); font-size:13px; color:var(--color-text); background:var(--color-surface); outline:none; font-family:inherit; }
.page__search-inp:focus { border-color:var(--indigo-300); }
.page__search-clr { position:absolute; right:9px; width:18px; height:18px; border-radius:50%; background:var(--slate-200); color:var(--color-text-3); display:flex; align-items:center; justify-content:center; cursor:pointer; }

.date-range { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.date-inp { height:36px; padding:0 10px; border:1.5px solid var(--color-border); border-radius:var(--r-lg); font-size:13px; color:var(--color-text); background:var(--color-surface); outline:none; font-family:inherit; }
.date-inp:focus { border-color:var(--indigo-300); }
.date-sep { color:var(--color-text-3); font-size:13px; }

.page__stats { display:flex; gap:12px; padding:14px 24px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.scard { flex:1; display:flex; align-items:center; gap:12px; padding:12px 16px; border:1px solid var(--color-border); border-radius:var(--r-xl); background:var(--color-surface); }
.scard--indigo { border-color:var(--indigo-100); background:var(--indigo-50); color:var(--indigo-600); }
.scard--green  { border-color:#bbf7d0; background:#f0fdf4; color:#16a34a; }
.scard--rose   { border-color:#fecdd3; background:#fff1f2; color:#e11d48; }
.scard__val { font-size:16px; font-weight:800; color:var(--color-text); letter-spacing:-0.03em; }
.scard__lbl { font-size:11px; color:var(--color-text-3); margin-top:2px; }

.page__tabs { display:flex; gap:2px; padding:0 24px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.page__tab { padding:11px 20px; font-size:13px; font-weight:600; color:var(--color-text-3); border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; font-family:inherit; transition:color var(--t-base),border-color var(--t-base); }
.page__tab:hover { color:var(--color-text-2); }
.page__tab.on { color:var(--indigo-600); border-bottom-color:var(--indigo-500); }

.page__table-wrap { flex:1; overflow-y:auto; padding:14px 24px 20px; }
.page__empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:60px 20px; color:var(--color-text-3); font-size:13px; }
.dtable { width:100%; border-collapse:collapse; }
.dtable thead th { padding:7px 12px; font-size:10.5px; font-weight:700; color:var(--color-text-3); text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid var(--color-border); text-align:left; }
.dtable__row { cursor:pointer; transition:background var(--t-fast); }
.dtable__row:hover td { background:var(--slate-50); }
.dtable__row td { padding:10px 12px; border-bottom:1px solid var(--color-border); vertical-align:middle; }
.dtable__row:last-child td { border-bottom:none; }

.doc-num    { font-size:13px; font-weight:700; color:var(--indigo-600); }
.doc-date   { font-size:12px; color:var(--color-text-3); white-space:nowrap; }
.doc-client { font-size:13px; color:var(--color-text); }
.doc-sum    { font-size:13px; font-weight:700; color:var(--color-text); }
.doc-paid   { font-size:13px; color:#16a34a; font-weight:600; }
.ta-r { text-align:right; }
.ta-c { text-align:center; }

.pay-badge { display:inline-flex; align-items:center; padding:2px 9px; border-radius:99px; font-size:11px; font-weight:600; background:var(--slate-100); color:var(--color-text-3); }
.pay--naqd    { background:#f0fdf4; color:#16a34a; }
.pay--karta   { background:var(--indigo-50); color:var(--indigo-600); }
.pay--qarz    { background:#fff1f2; color:#e11d48; }
.pay--o\'tkazma { background:#f0f9ff; color:#0284c7; }

.status-badge { display:inline-flex; align-items:center; padding:3px 10px; border-radius:99px; font-size:11px; font-weight:600; }
.status--ok     { background:#f0fdf4; color:#16a34a; }
.status--cancel { background:#fff1f2; color:#e11d48; }

.row-actions { display:flex; gap:4px; justify-content:flex-end; }
.row-act { width:30px; height:30px; border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background var(--t-fast),color var(--t-fast); color:var(--color-text-3); }
.row-act--cancel:hover { background:#fff1f2; color:#e11d48; }
.row-act:disabled { opacity:.5; cursor:default; }

/* Modal */
.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:500; padding:20px; animation:ov-in .18s ease; }
@keyframes ov-in { from{opacity:0} to{opacity:1} }
.modal { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--r-2xl); box-shadow:0 20px 60px rgba(0,0,0,.2); width:480px; max-width:95vw; animation:modal-in .2s ease; }
.modal--wide { width:620px; }
.modal--sm   { width:400px; }
@keyframes modal-in { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:none} }
.modal__hdr { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 16px; border-bottom:1px solid var(--color-border); gap:8px; }
.modal__hdr h3 { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700; color:var(--color-text); }
.hdr--red { color:#e11d48; }
.modal__close { width:30px; height:30px; border-radius:var(--r-md); display:flex; align-items:center; justify-content:center; color:var(--color-text-3); cursor:pointer; flex-shrink:0; }
.modal__close:hover { background:var(--slate-100); }
.modal__body { padding:20px; display:flex; flex-direction:column; gap:12px; max-height:60vh; overflow-y:auto; }
.modal__footer { padding:14px 20px; border-top:1px solid var(--color-border); display:flex; gap:10px; justify-content:flex-end; }

.detail-loading { display:flex; justify-content:center; padding:30px; }
.detail-meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.dm-item { display:flex; flex-direction:column; gap:2px; }
.dm-item span { font-size:11px; color:var(--color-text-3); font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.dm-item strong { font-size:13.5px; color:var(--color-text); }
.clr-red { color:#e11d48 !important; }

.confirm-text { font-size:13.5px; color:var(--color-text); line-height:1.6; }
.confirm-sum { margin-top:8px; padding:12px 16px; background:var(--slate-50); border-radius:var(--r-lg); font-size:13.5px; color:var(--color-text-2); }
.confirm-sum strong { color:var(--color-text); font-size:15px; }

.mf__btn { display:flex; align-items:center; gap:7px; height:38px; padding:0 20px; border-radius:var(--r-lg); font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; }
.mf__btn--cancel { border:1.5px solid var(--color-border); color:var(--color-text-2); }
.mf__btn--cancel:hover { background:var(--slate-50); }
.mf__btn--return { background:linear-gradient(135deg,#ef4444,#dc2626); color:white; }

@keyframes spin { to{transform:rotate(360deg)} }
.spin { animation:spin .8s linear infinite; }
</style>
