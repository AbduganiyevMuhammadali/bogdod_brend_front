<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { searchOpen, openSearch, closeSearch } from '@/composables/useGlobalSearch.js'
import { productsApi }  from '@/api/products.js'
import { clientsApi }   from '@/api/clients.js'
import { suppliersApi } from '@/api/suppliers.js'
import { purchasesApi } from '@/api/purchases.js'

const router = useRouter()

const q        = ref('')
const inputEl  = ref(null)
const loading  = ref(false)
const results  = ref({ products: [], clients: [], suppliers: [], docs: [] })
const activeIx = ref(0)
let timer = null
let reqId = 0

const GROUPS = [
  { key: 'products',  label: 'Mahsulotlar',    icon: 'package', route: '/products' },
  { key: 'clients',   label: 'Mijozlar',       icon: 'users',   route: '/partners' },
  { key: 'suppliers', label: 'Yetkazuvchilar', icon: 'truck',   route: '/suppliers' },
  { key: 'docs',      label: 'Kirim hujjatlari', icon: 'download', route: '/purchases' },
]

// Flat ro'yxat — klaviatura navigatsiyasi uchun
const flat = computed(() => {
  const out = []
  GROUPS.forEach(g => {
    results.value[g.key].forEach(item => out.push({ group: g, item }))
  })
  return out
})

const hasResults = computed(() => flat.value.length > 0)

watch(searchOpen, async (open) => {
  if (open) {
    q.value = ''
    results.value = { products: [], clients: [], suppliers: [], docs: [] }
    activeIx.value = 0
    await nextTick()
    inputEl.value?.focus()
  }
})

watch(q, (val) => {
  clearTimeout(timer)
  if (!val.trim()) {
    results.value = { products: [], clients: [], suppliers: [], docs: [] }
    return
  }
  timer = setTimeout(doSearch, 250)
})

async function doSearch() {
  const query = q.value.trim()
  if (!query) return
  const my = ++reqId
  loading.value = true
  try {
    const [prod, cli, sup, doc] = await Promise.all([
      productsApi.getAll({ search: query, limit: 6 }).catch(() => ({ data: [] })),
      clientsApi.getAll({ search: query }).catch(() => ({ data: [] })),
      suppliersApi.getAll({ search: query }).catch(() => []),
      purchasesApi.getAll({ search: query }).catch(() => ({ data: [] })),
    ])
    if (my !== reqId) return  // eskirgan javob
    results.value = {
      products:  prod.data.slice(0, 6),
      clients:   cli.data.slice(0, 5),
      suppliers: sup.slice(0, 5),
      docs:      doc.data.slice(0, 5),
    }
    activeIx.value = 0
  } finally {
    if (my === reqId) loading.value = false
  }
}

function pick(entry) {
  if (!entry) return
  router.push(entry.group.route)
  closeSearch()
}

function onKeydown(e) {
  // Ctrl/Cmd+K — ochish/yopish (istalgan joydan)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchOpen.value ? closeSearch() : openSearch()
    return
  }
  if (!searchOpen.value) return
  if (e.key === 'Escape') { closeSearch(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIx.value = Math.min(activeIx.value + 1, flat.value.length - 1) }
  if (e.key === 'ArrowUp')   { e.preventDefault(); activeIx.value = Math.max(activeIx.value - 1, 0) }
  if (e.key === 'Enter')     { e.preventDefault(); pick(flat.value[activeIx.value]) }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }

const STATUS_MAP = {
  draft:     { label: 'Qoralama',       cls: 'gs-st--draft'  },
  confirmed: { label: 'Tasdiqlangan',   cls: 'gs-st--ok'     },
  cancelled: { label: 'Bekor qilingan', cls: 'gs-st--cancel' },
}

// flat indeksni topish (active highlight uchun)
function flatIndexOf(groupKey, item) {
  return flat.value.findIndex(f => f.group.key === groupKey && f.item === item)
}
</script>

<template>
  <Teleport to="body">
    <transition name="gs-fade">
      <div v-if="searchOpen" class="gs-backdrop" @click="closeSearch()">
        <div class="gs-modal" @click.stop>

          <!-- Qidiruv input -->
          <div class="gs-input-row">
            <AppIcon name="search" :size="17" class="gs-input-ico"/>
            <input
              ref="inputEl"
              v-model="q"
              class="gs-input"
              placeholder="Mahsulot, mijoz, yetkazuvchi yoki hujjat qidiring..."
              autocomplete="off"
            />
            <span v-if="loading" class="gs-spinner"></span>
            <kbd class="gs-esc" @click="closeSearch()">Esc</kbd>
          </div>

          <!-- Natijalar -->
          <div class="gs-body">
            <div v-if="!q.trim()" class="gs-hint">
              <AppIcon name="search" :size="26" :stroke-width="1.2"/>
              <p>Yozishni boshlang — mahsulotlar, mijozlar, yetkazuvchilar va kirim hujjatlari orasidan qidiradi</p>
              <div class="gs-hint-keys">
                <span><kbd>↑</kbd><kbd>↓</kbd> tanlash</span>
                <span><kbd>Enter</kbd> o'tish</span>
                <span><kbd>Esc</kbd> yopish</span>
              </div>
            </div>

            <div v-else-if="!loading && !hasResults" class="gs-hint">
              <AppIcon name="inbox" :size="26" :stroke-width="1.2"/>
              <p>«{{ q }}» bo'yicha hech narsa topilmadi</p>
            </div>

            <template v-else>
              <!-- Mahsulotlar -->
              <div v-if="results.products.length" class="gs-group">
                <p class="gs-group-lbl"><AppIcon name="package" :size="12"/> Mahsulotlar</p>
                <button
                  v-for="p in results.products" :key="'p'+p.id"
                  class="gs-row" :class="{ 'is-active': flatIndexOf('products', p) === activeIx }"
                  @click="pick({ group: GROUPS[0], item: p })"
                  @mousemove="activeIx = flatIndexOf('products', p)"
                >
                  <span class="gs-row-ico gs-row-ico--sky"><AppIcon name="package" :size="14"/></span>
                  <span class="gs-row-main">
                    <span class="gs-row-name">{{ p.name }}</span>
                    <span class="gs-row-sub">{{ p.code }}{{ p.barcodes?.[0] ? ' · ' + p.barcodes[0] : '' }}</span>
                  </span>
                  <span class="gs-row-qty" :class="p.qty > 0 ? 'gs-qty--ok' : 'gs-qty--zero'">{{ p.qty }} {{ p.unit || 'don' }}</span>
                  <span class="gs-row-val">{{ fmt(p.retailPrice) }} so'm</span>
                </button>
              </div>

              <!-- Mijozlar -->
              <div v-if="results.clients.length" class="gs-group">
                <p class="gs-group-lbl"><AppIcon name="users" :size="12"/> Mijozlar</p>
                <button
                  v-for="c in results.clients" :key="'c'+c.id"
                  class="gs-row" :class="{ 'is-active': flatIndexOf('clients', c) === activeIx }"
                  @click="pick({ group: GROUPS[1], item: c })"
                  @mousemove="activeIx = flatIndexOf('clients', c)"
                >
                  <span class="gs-row-ico gs-row-ico--indigo"><AppIcon name="user" :size="14"/></span>
                  <span class="gs-row-main">
                    <span class="gs-row-name">{{ c.name }}</span>
                    <span class="gs-row-sub">{{ c.phone || c.code || '—' }}</span>
                  </span>
                  <span v-if="c.balance < 0" class="gs-row-val gs-val--debt">Qarz: {{ fmt(Math.abs(c.balance)) }}</span>
                  <span v-else-if="c.balance > 0" class="gs-row-val gs-val--credit">Kredit: {{ fmt(c.balance) }}</span>
                </button>
              </div>

              <!-- Yetkazuvchilar -->
              <div v-if="results.suppliers.length" class="gs-group">
                <p class="gs-group-lbl"><AppIcon name="truck" :size="12"/> Yetkazuvchilar</p>
                <button
                  v-for="s in results.suppliers" :key="'s'+s.id"
                  class="gs-row" :class="{ 'is-active': flatIndexOf('suppliers', s) === activeIx }"
                  @click="pick({ group: GROUPS[2], item: s })"
                  @mousemove="activeIx = flatIndexOf('suppliers', s)"
                >
                  <span class="gs-row-ico gs-row-ico--orange"><AppIcon name="truck" :size="14"/></span>
                  <span class="gs-row-main">
                    <span class="gs-row-name">{{ s.name }}</span>
                    <span class="gs-row-sub">{{ s.phone || s.code || '—' }}</span>
                  </span>
                  <span v-if="s.balance < 0" class="gs-row-val gs-val--debt">Qarzimiz: {{ fmt(Math.abs(s.balance)) }}</span>
                </button>
              </div>

              <!-- Kirim hujjatlari -->
              <div v-if="results.docs.length" class="gs-group">
                <p class="gs-group-lbl"><AppIcon name="download" :size="12"/> Kirim hujjatlari</p>
                <button
                  v-for="d in results.docs" :key="'d'+d.id"
                  class="gs-row" :class="{ 'is-active': flatIndexOf('docs', d) === activeIx }"
                  @click="pick({ group: GROUPS[3], item: d })"
                  @mousemove="activeIx = flatIndexOf('docs', d)"
                >
                  <span class="gs-row-ico gs-row-ico--green"><AppIcon name="download" :size="14"/></span>
                  <span class="gs-row-main">
                    <span class="gs-row-name">#{{ d.docNumber }} — {{ d.supplier || 'Yetkazuvchisiz' }}</span>
                    <span class="gs-row-sub">{{ d.date?.slice(0,10).split('-').reverse().join('.') }} · {{ d.warehouse }}</span>
                  </span>
                  <span class="gs-st" :class="STATUS_MAP[d.status]?.cls">{{ STATUS_MAP[d.status]?.label }}</span>
                  <span class="gs-row-val">{{ fmt(d.totalSum) }} so'm</span>
                </button>
              </div>
            </template>
          </div>

        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.gs-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  display: flex; justify-content: center; align-items: flex-start;
  padding: 12vh 16px 16px;
}
.gs-modal {
  width: 100%; max-width: 600px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.3);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: 70vh;
  animation: gs-pop 0.25s var(--ease-spring, cubic-bezier(.16,1,.3,1));
}
@keyframes gs-pop {
  from { transform: translateY(-14px) scale(0.98); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

.gs-input-row {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  flex-shrink: 0;
}
.gs-input-ico { color: var(--indigo-400, #818cf8); flex-shrink: 0; }
.gs-input {
  flex: 1; border: none; outline: none;
  font-size: 15px; font-family: inherit; color: var(--color-text, #1e293b);
  background: transparent;
}
.gs-input::placeholder { color: var(--slate-400, #94a3b8); }
.gs-esc {
  font-size: 10px; font-weight: 700; color: var(--slate-400, #94a3b8);
  background: var(--slate-100, #f1f5f9); border: 1px solid var(--slate-200, #e2e8f0);
  padding: 2px 7px; border-radius: 5px; cursor: pointer; font-family: inherit;
  flex-shrink: 0;
}
.gs-spinner {
  width: 15px; height: 15px; flex-shrink: 0;
  border: 2px solid var(--indigo-100, #e0e7ff);
  border-top-color: var(--indigo-500, #6366f1);
  border-radius: 50%;
  animation: gs-spin 0.7s linear infinite;
}
@keyframes gs-spin { to { transform: rotate(360deg); } }

.gs-body { overflow-y: auto; flex: 1; padding: 6px 8px 10px; }

.gs-hint {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 36px 24px; text-align: center; color: var(--slate-400, #94a3b8);
}
.gs-hint p { font-size: 13px; line-height: 1.5; max-width: 380px; }
.gs-hint-keys { display: flex; gap: 14px; font-size: 11px; color: var(--slate-400, #94a3b8); }
.gs-hint-keys kbd {
  font-size: 10px; background: var(--slate-100, #f1f5f9);
  border: 1px solid var(--slate-200, #e2e8f0);
  padding: 1px 5px; border-radius: 4px; margin-right: 2px; font-family: inherit;
}

.gs-group { margin-top: 6px; }
.gs-group-lbl {
  display: flex; align-items: center; gap: 5px;
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--slate-400, #94a3b8); padding: 6px 10px 4px;
}

.gs-row {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 46px; padding: 6px 10px;
  border-radius: 10px; text-align: left; cursor: pointer;
  font-family: inherit;
  transition: background 0.1s ease;
}
.gs-row.is-active { background: var(--indigo-50, #eef2ff); }
.gs-row:active { background: var(--indigo-100, #e0e7ff); }

.gs-row-ico {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.gs-row-ico--sky    { background: #e0f2fe; color: #0284c7; }
.gs-row-ico--indigo { background: #e0e7ff; color: #4f46e5; }
.gs-row-ico--orange { background: #ffedd5; color: #ea580c; }
.gs-row-ico--green  { background: #d1fae5; color: #059669; }

.gs-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.gs-row-name {
  font-size: 13.5px; font-weight: 700; color: var(--color-text, #1e293b);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gs-row-sub { font-size: 11px; color: var(--slate-400, #94a3b8); }

.gs-row-qty { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 99px; flex-shrink: 0; }
.gs-qty--ok   { background: #ecfdf5; color: #047857; }
.gs-qty--zero { background: #fef2f2; color: #b91c1c; }

.gs-row-val { font-size: 12px; font-weight: 800; color: var(--color-text, #1e293b); flex-shrink: 0; white-space: nowrap; }
.gs-val--debt   { color: #e11d48; }
.gs-val--credit { color: #059669; }

.gs-st { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 99px; flex-shrink: 0; }
.gs-st--draft  { background: #fffbeb; color: #b45309; }
.gs-st--ok     { background: #ecfdf5; color: #047857; }
.gs-st--cancel { background: #fef2f2; color: #b91c1c; }

.gs-fade-enter-active, .gs-fade-leave-active { transition: opacity 0.18s ease; }
.gs-fade-enter-from,   .gs-fade-leave-to      { opacity: 0; }

/* Mobil */
@media (max-width: 768px) {
  .gs-backdrop { padding: 8vh 10px 10px; }
  .gs-modal { max-height: 78vh; }
  .gs-input { font-size: 16px; } /* iOS zoom'ni oldini oladi */
  .gs-row { min-height: 52px; }
  .gs-row-val { font-size: 11px; }
}
</style>
