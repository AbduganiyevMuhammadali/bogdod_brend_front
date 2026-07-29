<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import AppIcon          from '@/components/AppIcon.vue'
import ProductFormModal from '@/components/products/ProductFormModal.vue'
import { productsApi }  from '@/api/products.js'

// ── State ────────────────────────────────────────────────
const products   = ref([])
const categories = ref([])
const loading    = ref(false)
const saving     = ref(false)
const error      = ref('')

const search    = ref('')
const filterCat = ref('all')
const showForm  = ref(false)
const editing   = ref(null)

// ── Load ─────────────────────────────────────────────────
async function loadProducts() {
  loading.value = true
  error.value   = ''
  try {
    const params = {}
    if (filterCat.value !== 'all') params.category = filterCat.value
    if (search.value.trim())       params.search    = search.value.trim()

    const res = await productsApi.getAll(params)
    products.value = res.data
  } catch (e) {
    error.value = e.response?.data?.message ?? "Serverga ulanib bo'lmadi"
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const cats = await productsApi.getCategories()
    categories.value = cats.filter(Boolean)
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadProducts()
  await loadCategories()
})

// Re-fetch when filter/search changes (debounced)
let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadProducts, 350)
})
watch(filterCat, loadProducts)

// ── Stats ─────────────────────────────────────────────────
const stats = computed(() => ({
  total:    products.value.length,
  lowStock: products.value.filter(p => p.qty <= p.minQty).length,
  cats:     categories.value.length,
  revenue:  products.value.reduce((s, p) => s + p.retailPrice, 0),
}))

// ── View toggle ───────────────────────────────────────────
const showLowStockOnly = ref(false)
const filteredView = computed(() =>
  showLowStockOnly.value ? products.value.filter(p => p.qty <= p.minQty) : products.value
)

// Product avatar colors
const AVATAR_COLORS = [
  ['#e0e7ff','#4338ca'], ['#fce7f3','#be185d'], ['#d1fae5','#047857'],
  ['#fef3c7','#b45309'], ['#dbeafe','#1d4ed8'], ['#f3e8ff','#6d28d9'],
  ['#ccfbf1','#0f766e'], ['#fff7ed','#c2410c'], ['#fef2f2','#b91c1c'],
  ['#e0f2fe','#0369a1'],
]
function avatarStyle(name) {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length
  return { background: AVATAR_COLORS[idx][0], color: AVATAR_COLORS[idx][1] }
}

// ── Category tabs ─────────────────────────────────────────
const allCats = computed(() => ['all', ...categories.value])

function catLabel(c) {
  if (c === 'all') return 'Barchasi'
  return c
}

function catCount(c) {
  if (c === 'all') return products.value.length
  return products.value.filter(p => p.category === c).length
}

// ── CRUD ──────────────────────────────────────────────────
function openAdd() {
  editing.value  = null
  showForm.value = true
}

function openEdit(p) {
  editing.value  = p
  showForm.value = true
}

async function onSave(data) {
  saving.value = true
  try {
    // Upload photo first if a new file was chosen
    if (data.photoFile) {
      data.photo = await productsApi.uploadPhoto(data.photoFile)
    }

    if (editing.value) {
      // Update existing product (no multi-size in edit mode)
      const updated = await productsApi.update(editing.value.id, data)
      const idx = products.value.findIndex(p => p.id === editing.value.id)
      if (idx !== -1) products.value[idx] = updated
    } else if (data.sizes && data.sizes.length > 0) {
      // Multi-size: create sequentially to avoid code auto-generate race condition
      const baseName = data.name || data.generalName
      const created = []
      for (const sz of data.sizes) {
        const p = await productsApi.create({
          ...data,
          code:        data.code ? `${data.code}-${sz.size}` : '',
          name:        `${baseName} ${sz.size}`.trim(),
          generalName: data.generalName,
          barcodes:    sz.barcode ? [sz.barcode] : [],
          qty:         Number(sz.qty) || 0,
          sizes:       [],
        })
        created.push(p)
      }
      created.forEach(p => products.value.unshift(p))
    } else {
      // Single product create
      const created = await productsApi.create(data)
      products.value.unshift(created)
    }
    loadCategories()
    showForm.value = false
    editing.value  = null
  } catch (e) {
    alert(e.response?.data?.message ?? 'Saqlashda xatolik yuz berdi')
  } finally {
    saving.value = false
  }
}

async function onDelete(id) {
  if (!confirm("Mahsulotni o'chirishni tasdiqlaysizmi?")) return
  try {
    await productsApi.remove(id)
    products.value = products.value.filter(p => p.id !== id)
  } catch (e) {
    alert(e.response?.data?.message ?? "O'chirishda xatolik")
  }
}

// ── Helpers ───────────────────────────────────────────────
function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.round(v)) }

function stockStatus(p) {
  if (p.qty <= 0)        return { label: 'Tugagan',    cls: 'stock--out' }
  if (p.qty <= p.minQty) return { label: 'Kam zaxira', cls: 'stock--low' }
  return                        { label: 'Mavjud',      cls: 'stock--ok'  }
}
</script>

<template>
  <div class="prod-page">

    <!-- Top bar -->
    <div class="prod-page__topbar">
      <div class="prod-page__topbar-l">
        <h2 class="prod-page__title">Mahsulotlar</h2>

        <div class="prod-page__search">
          <AppIcon name="search" :size="13" class="prod-page__search-ico" />
          <input
            v-model="search"
            type="text"
            class="prod-page__search-inp"
            placeholder="Nom yoki kod bo'yicha..."
          />
          <button v-if="search" class="prod-page__search-clr" @click="search = ''">
            <AppIcon name="x" :size="11" :stroke-width="2.5" />
          </button>
        </div>
      </div>

      <button class="prod-page__add-btn" @click="openAdd">
        <AppIcon name="plus" :size="16" :stroke-width="2.5" />
        Mahsulot qo'shish
      </button>
    </div>

    <!-- Stats -->
    <div class="prod-page__stats">
      <div class="pstat">
        <div class="pstat__ico pstat__ico--indigo">
          <AppIcon name="package" :size="15" :stroke-width="2" />
        </div>
        <div>
          <p class="pstat__val">{{ stats.total }}</p>
          <p class="pstat__lbl">Jami mahsulot</p>
        </div>
      </div>
      <div class="pstat">
        <div class="pstat__ico pstat__ico--green">
          <AppIcon name="grid" :size="15" :stroke-width="2" />
        </div>
        <div>
          <p class="pstat__val">{{ stats.cats }}</p>
          <p class="pstat__lbl">Kategoriya</p>
        </div>
      </div>
      <div class="pstat">
        <div class="pstat__ico pstat__ico--amber">
          <AppIcon name="alert-triangle" :size="15" :stroke-width="2" />
        </div>
        <div>
          <p class="pstat__val">{{ stats.lowStock }}</p>
          <p class="pstat__lbl">Kam zaxira</p>
        </div>
      </div>
      <div class="pstat">
        <div class="pstat__ico pstat__ico--violet">
          <AppIcon name="trending-up" :size="15" :stroke-width="2" />
        </div>
        <div>
          <p class="pstat__val">{{ fmt(stats.revenue) }}</p>
          <p class="pstat__lbl">Jami narx</p>
        </div>
      </div>
    </div>

    <!-- Category filters -->
    <div class="prod-page__cats">
      <button
        v-for="cat in allCats"
        :key="cat"
        class="prod-page__cat"
        :class="{ 'is-active': filterCat === cat }"
        @click="filterCat = cat; showLowStockOnly = false"
      >
        {{ catLabel(cat) }}
        <span class="prod-page__cat-cnt">{{ catCount(cat) }}</span>
      </button>
      <button
        class="prod-page__cat prod-page__cat--warn"
        :class="{ 'is-active': showLowStockOnly }"
        @click="showLowStockOnly = !showLowStockOnly"
      >
        <span style="font-size:11px">⚠</span> Kam zaxira
        <span class="prod-page__cat-cnt">{{ stats.lowStock }}</span>
      </button>
    </div>

    <!-- Error -->
    <div v-if="error" class="prod-page__err">
      <AppIcon name="alert-circle" :size="14" />
      {{ error }}
      <button class="prod-page__err-retry" @click="loadProducts">Qayta urinish</button>
    </div>

    <!-- Table -->
    <div class="prod-page__table-wrap">

      <!-- Loading skeleton -->
      <div v-if="loading" class="prod-page__loading">
        <div v-for="i in 8" :key="i" class="skeleton prod-page__skel-row"></div>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredView.length === 0" class="prod-page__empty">
        <AppIcon name="package" :size="36" :stroke-width="1.2" />
        <p>Mahsulot topilmadi</p>
        <button class="prod-page__add-btn prod-page__add-btn--sm" @click="openAdd">
          <AppIcon name="plus" :size="14" /> Qo'shish
        </button>
      </div>

      <table v-else class="ptable">
        <thead>
          <tr>
            <th style="width:44px"></th>
            <th>Mahsulot nomi</th>
            <th>Kategoriya</th>
            <th>Birlik</th>
            <th class="ta-r">Chakana narx</th>
            <th class="ta-r">Ulgurji narx</th>
            <th class="ta-c">Zaxira</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in filteredView"
            :key="p.id"
            class="ptable__row"
            @click="openEdit(p)"
          >
            <td>
              <div class="ptable__avatar" :style="avatarStyle(p.name)">
                {{ p.name[0]?.toUpperCase() }}
              </div>
            </td>
            <td>
              <p class="ptable__name">{{ p.name }}</p>
              <p class="ptable__code">{{ p.code || `#${p.id}` }}</p>
            </td>
            <td>
              <span class="ptable__cat">{{ catLabel(p.category) || '—' }}</span>
            </td>
            <td class="ptable__unit">{{ p.unit || 'Dona' }}</td>
            <td class="ta-r">
              <span class="ptable__price">{{ fmt(p.retailPrice) }}</span>
              <span class="ptable__currency"> so'm</span>
            </td>
            <td class="ta-r">
              <span v-if="p.wholesalePrice" class="ptable__price ptable__price--ws">{{ fmt(p.wholesalePrice) }}</span>
              <span v-else class="ptable__currency">—</span>
              <span v-if="p.wholesalePrice" class="ptable__currency"> so'm</span>
            </td>
            <td class="ta-c">
              <div class="ptable__qty-wrap">
                <span class="ptable__qty">{{ p.qty }}</span>
                <span class="stock-badge" :class="stockStatus(p).cls">{{ stockStatus(p).label }}</span>
              </div>
            </td>
            <td @click.stop>
              <div class="ptable__actions">
                <button class="ptable__act ptable__act--edit" @click="openEdit(p)" title="Tahrirlash">
                  <AppIcon name="edit-2" :size="13" />
                </button>
                <button class="ptable__act ptable__act--del" @click="onDelete(p.id)" title="O'chirish">
                  <AppIcon name="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div v-if="filteredView.length > 0 && !loading" class="prod-page__footer">
      {{ filteredView.length }} ta mahsulot ko'rsatilmoqda
    </div>

    <Teleport to="body">
      <ProductFormModal
        v-if="showForm"
        :product="editing"
        :saving="saving"
        @close="showForm = false"
        @save="onSave"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.prod-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-h));
  overflow: hidden;
}

/* ── Top bar ─────────────────────────────── */
.prod-page__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 16px;
}
.prod-page__topbar-l {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}
.prod-page__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.03em;
  white-space: nowrap;
  flex-shrink: 0;
}

.prod-page__search {
  flex: 1;
  max-width: 320px;
  position: relative;
  display: flex;
  align-items: center;
}
.prod-page__search-ico {
  position: absolute;
  left: 11px;
  color: var(--color-text-3);
  pointer-events: none;
}
.prod-page__search-inp {
  width: 100%;
  height: 36px;
  padding: 0 32px 0 32px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  font-family: inherit;
  transition: border-color var(--t-base);
}
.prod-page__search-inp:focus { border-color: var(--indigo-300); }
.prod-page__search-inp::placeholder { color: var(--color-text-3); }
.prod-page__search-clr {
  position: absolute;
  right: 9px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--slate-200);
  color: var(--color-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.prod-page__add-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 20px;
  height: 40px;
  border-radius: var(--r-xl);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(99,102,241,0.35);
  transition: opacity var(--t-base), transform var(--t-fast), box-shadow var(--t-base);
  letter-spacing: -0.01em;
}
.prod-page__add-btn:hover { opacity: 0.92; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.45); }
.prod-page__add-btn:active { transform: scale(0.98); }
.prod-page__add-btn--sm { padding: 0 16px; height: 36px; font-size: 13px; margin-top: 4px; }

/* ── Stats ───────────────────────────────── */
.prod-page__stats {
  display: flex;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.pstat {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  background: var(--color-surface);
}
.pstat__ico {
  width: 36px;
  height: 36px;
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pstat__ico--indigo { background: var(--indigo-50);  color: var(--indigo-500);  border: 1px solid var(--indigo-100); }
.pstat__ico--green  { background: #f0fdf4;            color: #16a34a;            border: 1px solid #bbf7d0; }
.pstat__ico--amber  { background: #fffbeb;            color: #d97706;            border: 1px solid #fde68a; }
.pstat__ico--violet { background: #f5f3ff;            color: #7c3aed;            border: 1px solid #ddd6fe; }
.pstat__val { font-size: 16px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }
.pstat__lbl { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }

/* ── Category tabs ───────────────────────── */
.prod-page__cats {
  display: flex;
  gap: 6px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  flex-shrink: 0;
}
.prod-page__cats::-webkit-scrollbar { display: none; }

.prod-page__cat {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 99px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-3);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
}
.prod-page__cat:hover { background: var(--slate-50); color: var(--color-text); }
.prod-page__cat.is-active { background: var(--indigo-500); border-color: var(--indigo-500); color: white; }
.prod-page__cat--warn { border-color: #fde68a; color: #b45309; background: #fffbeb; }
.prod-page__cat--warn.is-active { background: #d97706; border-color: #d97706; color: white; }
.prod-page__cat-cnt {
  font-size: 10.5px;
  font-weight: 800;
  opacity: 0.65;
}
.prod-page__cat.is-active .prod-page__cat-cnt { opacity: 0.8; }

/* ── Table ───────────────────────────────── */
.prod-page__table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.prod-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  color: var(--color-text-3);
  font-size: 13px;
}

.ptable {
  width: 100%;
  border-collapse: collapse;
}
.ptable thead th {
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}
.ptable__row {
  cursor: pointer;
  transition: background var(--t-fast);
}
.ptable__row:hover td { background: var(--slate-50); }
.ptable__row td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}
.ptable__row:last-child td { border-bottom: none; }

.ptable__avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--r-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}
.ptable__name { font-size: 13.5px; font-weight: 700; color: var(--color-text); }
.ptable__code { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }

.ptable__cat {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--indigo-50);
  color: var(--indigo-600);
  border: 1px solid var(--indigo-100);
}

.ptable__unit { font-size: 13px; color: var(--color-text-2); }

.ptable__price { font-size: 14px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.ptable__price--ws { font-size: 13px; font-weight: 700; color: var(--indigo-600); }
.ptable__currency { font-size: 11px; color: var(--color-text-3); font-weight: 500; }

.ptable__qty-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.ptable__qty { font-size: 14px; font-weight: 700; color: var(--color-text); }

.stock-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}
.stock--ok  { background: #f0fdf4; color: #16a34a; }
.stock--low { background: #fffbeb; color: #d97706; }
.stock--out { background: #fff1f2; color: #e11d48; }

.ptable__actions { display: flex; gap: 4px; justify-content: flex-end; }
.ptable__act {
  width: 30px; height: 30px;
  border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
  color: var(--color-text-3);
}
.ptable__act--edit:hover { background: var(--indigo-50); color: var(--indigo-500); }
.ptable__act--del:hover  { background: var(--rose-50);   color: var(--rose-500);   }

.ta-r { text-align: right; }
.ta-c { text-align: center; }

/* ── Loading skeleton ────────────────────── */
.prod-page__loading { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
.prod-page__skel-row { height: 56px; border-radius: var(--r-md); }

/* ── Error ───────────────────────────────── */
.prod-page__err {
  display: flex; align-items: center; gap: 8px;
  margin: 0 24px 0;
  padding: 10px 14px;
  background: var(--rose-50);
  border: 1px solid var(--rose-100);
  border-radius: var(--r-md);
  font-size: 12.5px; color: var(--rose-600);
  flex-shrink: 0;
}
.prod-page__err-retry {
  margin-left: auto; font-size: 12px; font-weight: 600;
  font-family: inherit; color: var(--rose-600);
  cursor: pointer; text-decoration: underline;
}

/* ── Footer ──────────────────────────────── */
.prod-page__footer {
  padding: 10px 24px;
  border-top: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-3);
  flex-shrink: 0;
}
</style>
