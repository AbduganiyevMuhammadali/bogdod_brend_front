<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { purchasesApi } from '@/api/purchases.js'

const batches   = ref([])
const loading   = ref(false)
const searchQ   = ref('')

async function load() {
  loading.value = true
  try {
    batches.value = await purchasesApi.getBatches()
  } catch { batches.value = [] }
  finally { loading.value = false }
}

onMounted(load)

// Group by product
const grouped = computed(() => {
  const q = searchQ.value.trim().toLowerCase()
  const map = {}
  batches.value.forEach(b => {
    if (q && !b.productName.toLowerCase().includes(q) && !b.productCode.toLowerCase().includes(q)) return
    const key = b.productId ?? b.productName
    if (!map[key]) map[key] = {
      productId:   b.productId,
      productName: b.productName,
      productCode: b.productCode,
      productUnit: b.productUnit,
      rows: [],
    }
    map[key].rows.push(b)
  })
  return Object.values(map)
})

// Top-level stats
const stats = computed(() => {
  const all = batches.value
  const soldSum   = all.reduce((s, b) => s + b.soldSum,   0)
  const totalCost = all.reduce((s, b) => s + b.totalCost, 0)
  return {
    products:  new Set(all.map(b => b.productId ?? b.productName)).size,
    totalQty:  all.reduce((s, b) => s + b.unitQty,   0),
    remaining: all.reduce((s, b) => s + b.remaining, 0),
    soldSum,
    totalCost,
    profit:    soldSum - totalCost,
  }
})

function groupRemaining(g)  { return g.rows.reduce((s, b) => s + b.remaining, 0) }
function groupSoldSum(g)    { return g.rows.reduce((s, b) => s + b.soldSum,   0) }
function groupTotalCost(g)  { return g.rows.reduce((s, b) => s + b.totalCost, 0) }
function groupProfit(g)     { return groupSoldSum(g) - groupTotalCost(g) }
function batchProfit(b)     { return b.soldSum - (b.costPrice * b.soldQty) }
function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
<div class="pt-root">

  <!-- Header -->
  <div class="pt-hdr">
    <div class="pt-hdr__l">
      <div class="pt-hdr__icon"><AppIcon name="layers" :size="18" :stroke-width="2"/></div>
      <div>
        <h1 class="pt-hdr__title">Partiyalar</h1>
        <p class="pt-hdr__sub">FIFO lot hisobi — kirim narxi va qoldiq partiya bo'yicha</p>
      </div>
    </div>
    <div class="pt-hdr__r">
      <div class="pt-search-wrap">
        <AppIcon name="search" :size="13" class="pt-search-ico"/>
        <input v-model="searchQ" class="pt-search" placeholder="Mahsulot nomi yoki kodi..."/>
      </div>
      <button class="pt-refresh" @click="load" :disabled="loading" title="Yangilash">
        <AppIcon name="refresh-cw" :size="14" :class="loading&&'spin'"/>
      </button>
    </div>
  </div>

  <!-- Stats row -->
  <div class="pt-stats">
    <div class="pt-stat pt-stat--blue">
      <AppIcon name="package" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ stats.products }}</div>
        <div class="pt-stat__l">Mahsulot turi</div>
      </div>
    </div>
    <div class="pt-stat pt-stat--indigo">
      <AppIcon name="layers" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ fmt(stats.totalQty) }}</div>
        <div class="pt-stat__l">Jami keldi</div>
      </div>
    </div>
    <div class="pt-stat pt-stat--green">
      <AppIcon name="archive" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ fmt(stats.remaining) }}</div>
        <div class="pt-stat__l">Omborda qoldi</div>
      </div>
    </div>
    <div class="pt-stat pt-stat--purple">
      <AppIcon name="trending-up" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ fmt(stats.soldSum) }}</div>
        <div class="pt-stat__l">Sotuv summasi</div>
      </div>
    </div>
    <div class="pt-stat pt-stat--amber">
      <AppIcon name="dollar-sign" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ fmt(stats.totalCost) }}</div>
        <div class="pt-stat__l">Tan narxi (jami)</div>
      </div>
    </div>
    <div class="pt-stat" :class="stats.profit>=0?'pt-stat--green':'pt-stat--rose'">
      <AppIcon name="trending-up" :size="16"/>
      <div>
        <div class="pt-stat__v">{{ fmt(stats.profit) }}</div>
        <div class="pt-stat__l">Foyda</div>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="pt-body">
    <div v-if="loading" class="pt-loading">
      <div v-for="i in 4" :key="i" class="skeleton pt-skel"/>
    </div>

    <div v-else-if="!grouped.length" class="pt-empty">
      <AppIcon name="layers" :size="44" :stroke-width="1.2"/>
      <p>Partiya topilmadi</p>
      <p class="pt-empty__sub">Tasdiqlangan xarid hujjatlaridan partiyalar yaratiladi</p>
    </div>

    <div v-else class="pt-list">
      <div v-for="g in grouped" :key="g.productId ?? g.productName" class="pt-group">

        <!-- Product header -->
        <div class="pt-group__hdr">
          <div class="pt-group__name-wrap">
            <span class="pt-group__dot" :class="groupRemaining(g) > 0 ? 'dot--ok' : 'dot--zero'"/>
            <span class="pt-group__name">{{ g.productName }}</span>
            <span v-if="g.productCode" class="pt-group__code">{{ g.productCode }}</span>
          </div>
          <div class="pt-group__badges">
            <span class="pt-gbadge pt-gbadge--rows">{{ g.rows.length }} partiya</span>
            <span class="pt-gbadge" :class="groupRemaining(g)>0 ? 'pt-gbadge--ok' : 'pt-gbadge--zero'">
              Qoldi: {{ fmt(groupRemaining(g)) }} {{ g.productUnit }}
            </span>
            <span class="pt-gbadge pt-gbadge--purple">
              Sotuv: {{ fmt(groupSoldSum(g)) }} so'm
            </span>
            <span class="pt-gbadge pt-gbadge--amber">
              Tan: {{ fmt(groupTotalCost(g)) }} so'm
            </span>
            <span class="pt-gbadge" :class="groupProfit(g)>=0?'pt-gbadge--profit':'pt-gbadge--loss'">
              Foyda: {{ fmt(groupProfit(g)) }} so'm
            </span>
          </div>
        </div>

        <!-- Batch rows table -->
        <div class="pt-tbl-wrap">
          <table class="pt-tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Kirim hujjat</th>
                <th>Sana</th>
                <th>Yetkazuvchi</th>
                <th class="ta-r">Kirim narxi</th>
                <th class="ta-r">Keldi</th>
                <th class="ta-r">Sotildi</th>
                <th class="ta-r">Qoldiq</th>
                <th class="ta-r">Sotuv summasi</th>
                <th class="ta-r">Tan narxi (jami)</th>
                <th class="ta-r">Foyda</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(b, bi) in g.rows" :key="b.id"
                :class="b.remaining === 0 && 'row--depleted'"
              >
                <td class="c-num">{{ bi + 1 }}</td>
                <td>
                  <span class="doc-badge">#KRM-{{ String(b.purchaseDoc).padStart(5,'0') }}</span>
                </td>
                <td class="c-date">{{ fmtDate(b.purchaseDate) }}</td>
                <td class="c-dim">{{ b.supplier || '—' }}</td>
                <td class="ta-r">
                  <span class="cost-val">{{ fmt(b.costPrice) }}</span>
                  <span class="c-dim"> so'm</span>
                </td>
                <td class="ta-r c-bold">{{ fmt(b.unitQty) }} <span class="c-unit">{{ g.productUnit }}</span></td>
                <td class="ta-r">
                  <span :class="b.soldQty > 0 ? 'sold-val' : 'c-dim'">{{ fmt(b.soldQty) }}</span>
                  <span class="c-unit"> {{ g.productUnit }}</span>
                </td>
                <td class="ta-r">
                  <span class="rem-badge" :class="b.remaining > 0 ? 'rem--ok' : 'rem--zero'">
                    {{ fmt(b.remaining) }} {{ g.productUnit }}
                  </span>
                </td>
                <td class="ta-r">
                  <span v-if="b.soldSum > 0" class="sold-sum">{{ fmt(b.soldSum) }} <span class="c-dim" style="font-size:10px">so'm</span></span>
                  <span v-else class="c-dim">—</span>
                </td>
                <td class="ta-r">
                  <span class="cost-sum">{{ fmt(b.totalCost) }} <span class="c-dim" style="font-size:10px">so'm</span></span>
                </td>
                <td class="ta-r">
                  <span v-if="b.soldQty > 0" :class="batchProfit(b)>=0?'profit-val':'loss-val'">
                    {{ batchProfit(b) >= 0 ? '+' : '' }}{{ fmt(batchProfit(b)) }}
                    <span class="c-dim" style="font-size:10px"> so'm</span>
                  </span>
                  <span v-else class="c-dim">—</span>
                </td>
              </tr>
            </tbody>
            <!-- Group totals footer -->
            <tfoot>
              <tr class="ft-row">
                <td colspan="5" class="ft-lbl">Jami:</td>
                <td class="ta-r ft-v">{{ fmt(g.rows.reduce((s,b)=>s+b.unitQty,0)) }} {{ g.productUnit }}</td>
                <td class="ta-r ft-v">{{ fmt(g.rows.reduce((s,b)=>s+b.soldQty,0)) }} {{ g.productUnit }}</td>
                <td class="ta-r ft-v">{{ fmt(groupRemaining(g)) }} {{ g.productUnit }}</td>
                <td class="ta-r ft-v">{{ fmt(groupSoldSum(g)) }} so'm</td>
                <td class="ta-r ft-v">{{ fmt(groupTotalCost(g)) }} so'm</td>
                <td class="ta-r ft-v" :class="groupProfit(g)>=0?'ft-profit':'ft-loss'">
                  {{ groupProfit(g) >= 0 ? '+' : '' }}{{ fmt(groupProfit(g)) }} so'm
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>
    </div>
  </div>

</div>
</template>

<style scoped>
.pt-root{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:#f4f6fb}

/* Header */
.pt-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;gap:12px}
.pt-hdr__l{display:flex;align-items:center;gap:12px}
.pt-hdr__icon{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0}
.pt-hdr__title{font-size:17px;font-weight:800;color:#1e293b;line-height:1.2}
.pt-hdr__sub{font-size:11px;color:#94a3b8;margin-top:1px}
.pt-hdr__r{display:flex;align-items:center;gap:8px}
.pt-search-wrap{position:relative;display:flex;align-items:center}
.pt-search-ico{position:absolute;left:10px;color:#94a3b8;pointer-events:none}
.pt-search{width:260px;height:36px;padding:0 12px 0 30px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:inherit;outline:none;background:#f8fafc}
.pt-search:focus{border-color:#818cf8;background:white}
.pt-refresh{width:36px;height:36px;border-radius:9px;background:#eff6ff;color:#6366f1;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1.5px solid #c7d2fe;transition:all .15s}
.pt-refresh:hover{background:#c7d2fe}
.pt-refresh:disabled{opacity:.5;cursor:not-allowed}

/* Stats */
.pt-stats{display:flex;gap:10px;padding:12px 20px;background:white;border-bottom:1px solid #e2e8f0;flex-shrink:0;flex-wrap:wrap}
.pt-stat{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:12px;border:1px solid;flex:1;min-width:130px}
.pt-stat--blue  {background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8}
.pt-stat--indigo{background:#eef2ff;border-color:#c7d2fe;color:#4338ca}
.pt-stat--green {background:#f0fdf4;border-color:#bbf7d0;color:#15803d}
.pt-stat--purple{background:#faf5ff;border-color:#e9d5ff;color:#7e22ce}
.pt-stat--amber {background:#fffbeb;border-color:#fde68a;color:#b45309}
.pt-stat__v{font-size:18px;font-weight:900;letter-spacing:-.03em;line-height:1.1}
.pt-stat__l{font-size:10px;font-weight:600;opacity:.75;text-transform:uppercase;letter-spacing:.04em;margin-top:1px}

/* Body */
.pt-body{flex:1;overflow-y:auto;padding:16px 20px}
.pt-loading{display:flex;flex-direction:column;gap:12px}
.pt-skel{height:120px;border-radius:12px}
.pt-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:80px;color:#94a3b8}
.pt-empty__sub{font-size:12px;color:#cbd5e1}

/* Product groups */
.pt-list{display:flex;flex-direction:column;gap:14px}
.pt-group{background:white;border-radius:14px;border:1.5px solid #e2e8f0;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.04)}

.pt-group__hdr{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;gap:8px}
.pt-group__name-wrap{display:flex;align-items:center;gap:8px}
.pt-group__dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.dot--ok  {background:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.2)}
.dot--zero{background:#e2e8f0}
.pt-group__name{font-size:14px;font-weight:800;color:#1e293b}
.pt-group__code{font-size:11px;font-family:monospace;background:#e0e7ff;color:#4338ca;padding:1px 7px;border-radius:5px}
.pt-group__badges{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.pt-gbadge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;border:1px solid}
.pt-gbadge--rows  {background:#f1f5f9;border-color:#e2e8f0;color:#64748b}
.pt-gbadge--ok    {background:#d1fae5;border-color:#6ee7b7;color:#065f46}
.pt-gbadge--zero  {background:#f1f5f9;border-color:#e2e8f0;color:#94a3b8}
.pt-gbadge--purple{background:#faf5ff;border-color:#e9d5ff;color:#7e22ce}
.pt-gbadge--amber {background:#fffbeb;border-color:#fde68a;color:#92400e}
.pt-gbadge--profit{background:#d1fae5;border-color:#6ee7b7;color:#065f46}
.pt-gbadge--loss  {background:#fef2f2;border-color:#fecaca;color:#991b1b}
.pt-stat--rose    {background:#fff1f2;border-color:#fecdd3;color:#be123c}

/* Table */
.pt-tbl-wrap{overflow-x:auto}
.pt-tbl{width:100%;border-collapse:collapse}
.pt-tbl thead th{padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;text-align:left;background:#fafbff;border-bottom:1px solid #f1f5f9;white-space:nowrap}
.pt-tbl tbody tr{border-bottom:1px solid #f8fafc;transition:background .1s}
.pt-tbl tbody tr:hover td{background:#f8faff}
.pt-tbl tbody tr:last-child{border-bottom:none}
.pt-tbl td{padding:9px 12px;font-size:12.5px;vertical-align:middle}
.row--depleted td{opacity:.55}

.ta-r{text-align:right}
.c-num{font-size:11px;color:#94a3b8;font-family:monospace;width:28px}
.c-date{white-space:nowrap;color:#64748b;font-size:12px}
.c-dim{color:#94a3b8;font-size:12px}
.c-bold{font-weight:700;color:#1e293b}
.c-unit{font-size:10.5px;color:#94a3b8;font-weight:400}
.doc-badge{font-family:monospace;font-size:11.5px;font-weight:800;background:#eef2ff;color:#4338ca;padding:2px 8px;border-radius:5px}
.cost-val{font-weight:700;color:#0369a1}
.sold-val{font-weight:700;color:#7c3aed}
.sold-sum{font-weight:800;color:#7c3aed}
.cost-sum{font-weight:700;color:#b45309}
.rem-badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:700}
.rem--ok  {background:#d1fae5;color:#065f46}
.rem--zero{background:#f1f5f9;color:#94a3b8}

/* Footer totals */
.pt-tbl tfoot .ft-row{background:#f8fafc;border-top:2px solid #e2e8f0}
.ft-lbl{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;padding:8px 12px}
.ft-v{padding:8px 12px;font-size:12.5px;font-weight:800;color:#1e293b;text-align:right}
.ft-profit{color:#065f46}
.ft-loss  {color:#991b1b}
.profit-val{font-weight:800;color:#065f46}
.loss-val  {font-weight:800;color:#991b1b}

.skeleton{background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);background-size:200% 100%;animation:shimmer 1.4s infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.spin{animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
