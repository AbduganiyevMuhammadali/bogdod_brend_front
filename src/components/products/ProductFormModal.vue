<script setup>
import { reactive, ref, watch, computed, onMounted } from 'vue'
import BaseModal   from '@/components/sales/BaseModal.vue'
import AppIcon     from '@/components/AppIcon.vue'
import SelectOrAdd from './SelectOrAdd.vue'
import { productsApi } from '@/api/products.js'
import { fileUrl } from '@/api/http.js'
import { genBarcode } from '@/composables/useBarcodePrint.js'
import * as CATALOG from '@/constants/catalog.js'

const props = defineProps({
  product: { type: Object, default: null },
  saving:  { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'save'])

// ── Options ──────────────────────────────────────────────────────────
// Ro'yxatlar @/constants/catalog.js da — tezkor kiritish sahifasi bilan
// bir xil bo'lishi uchun bitta manbadan olinadi.
const UNITS      = ref([...CATALOG.UNITS])
const BRANDS     = ref([...CATALOG.BRANDS])
const MODELS     = ref([])
const COUNTRIES  = ref([...CATALOG.COUNTRIES])
const GROUPS     = ref([...CATALOG.GROUPS])
const COLORS     = ref([...CATALOG.COLORS])
const CURRENCIES = ref([...CATALOG.CURRENCIES])

// ── Form ─────────────────────────────────────────────────────────────
const p = props.product
const form = reactive({
  code:        p?.code         ?? '',
  generalName: p?.name         ?? '',
  name:        p?.name         ?? '',
  minQty:      p?.minQty       ?? 0,
  isFolder:    p?.isFolder     ?? false,
  unit:        p?.unit         ?? '',
  brand:       p?.brand        ?? '',
  model:       p?.model        ?? '',
  country:     p?.country      ?? '',
  group:       p?.category     ?? '',
  color:       p?.color        ?? '',
  extraName1:  p?.extraName1   ?? '',
  barcodes:    Array.isArray(p?.barcodes) && p.barcodes.length ? [...p.barcodes] : [],
  newBarcode:  '',
  photoPreview: fileUrl(p?.photo),
  photoFile:    null,
  wholesalePrice:    p ? (Number(p.wholesalePrice)    || 0)  : 0,
  wholesalePriceUSD: p ? (Number(p.wholesalePriceUSD) || '') : '',
  retailPrice:       p ? (Number(p.retailPrice)       || 0)  : 0,
  retailPriceUSD:    p ? (Number(p.retailPriceUSD)    || '') : '',
  currency:    p?.currency ?? "So'm",
})

// ── Auto-compose name ─────────────────────────────────────────────────
const nameAuto = ref(!p)

function buildName() {
  return [form.brand, form.generalName, form.model, form.color]
    .map(v => (v || '').trim()).filter(Boolean).join(' ')
}
watch(() => [form.brand, form.generalName, form.model, form.color],
  () => { if (nameAuto.value) form.name = buildName() })

function onNameInput()  { nameAuto.value = false }
function resetNameAuto(){ nameAuto.value = true; form.name = buildName() }

// ── Barcode ───────────────────────────────────────────────────────────
function addBarcode()    { const v = form.newBarcode.trim(); if (!v || form.barcodes.includes(v)) return; form.barcodes.push(v); form.newBarcode = '' }
function addGenBarcode() { form.barcodes.push(genBarcode()) }
function removeBarcode(i){ form.barcodes.splice(i, 1) }

// ── Photo ─────────────────────────────────────────────────────────────
function onPhoto(e) {
  const file = e.target.files[0]; if (!file) return
  form.photoFile = file; form.photoPreview = URL.createObjectURL(file)
}

// ── Sizes (razmerlar) ─────────────────────────────────────────────────
const sizesMode = ref(false)
const sizes     = ref([])  // [{ size, qty, barcode }]

const { SIZE_ALPHA, SIZE_JEANS, SIZE_EVEN, SIZE_CLASSIC, SIZE_NUM } = CATALOG

const sizeSet = computed(() => new Set(sizes.value.map(s => s.size)))

function addSize(s) {
  if (sizeSet.value.has(s)) return
  sizes.value.push({ size: s, qty: 1, barcode: genBarcode() })
}
function addSizeSet(list) { list.forEach(s => addSize(s)) }
function removeSize(i){ sizes.value.splice(i, 1) }
function genSizeBc(i){ sizes.value[i].barcode = genBarcode() }

const sizesTotal = computed(() => sizes.value.reduce((a, s) => a + (Number(s.qty) || 0), 0))

// ── Mount ─────────────────────────────────────────────────────────────
onMounted(async () => {
  if (!p && form.barcodes.length === 0) form.barcodes.push(genBarcode())
  try {
    const cats = await productsApi.getCategories()
    cats.filter(Boolean).forEach(c => { if (!GROUPS.value.includes(c)) GROUPS.value.push(c) })
  } catch { /* ignore */ }
})

// ── Save ──────────────────────────────────────────────────────────────
function save() {
  if (!form.generalName.trim() && !form.name.trim()) return
  emit('save', { ...form, sizes: sizesMode.value ? [...sizes.value] : [] })
}

function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(v) }
</script>

<template>
  <BaseModal
    :title="product ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot qo\'shish'"
    width="1020px"
    @close="emit('close')"
  >
    <div class="pf">

      <!-- ══ Row 1: Basic + Properties ══════════════════════════════════ -->
      <div class="pf__r2-top">

        <!-- Basic info -->
        <div class="pf__card">
          <p class="pf__stitle"><AppIcon name="file-text" :size="13" /> Asosiy ma'lumotlar</p>

          <div class="pf__inline2">
            <div class="pf__field">
              <label>Kod</label>
              <input v-model="form.code" placeholder="Auto" />
            </div>
            <div class="pf__field">
              <label>Minimal zaxira</label>
              <input v-model.number="form.minQty" type="number" min="0" placeholder="0" />
            </div>
          </div>

          <div class="pf__field">
            <label>Umumiy nomi <span class="pf__hint">(asos)</span></label>
            <input v-model="form.generalName" placeholder="Masalan: Shim, Futbolka..." class="pf__inp--main" />
          </div>

          <div class="pf__field" style="margin-bottom:0">
            <div class="pf__label-row">
              <label>To'liq nomi</label>
              <span v-if="nameAuto" class="pf__auto-badge"><AppIcon name="zap" :size="9" :stroke-width="2.5" /> AUTO</span>
              <button v-else class="pf__reset-auto" @click="resetNameAuto">
                <AppIcon name="rotate-ccw" :size="10" :stroke-width="2.5" /> Avtomatik
              </button>
            </div>
            <input
              v-model="form.name"
              placeholder="Brand + Nom + Rang — avtomatik"
              :class="{ 'pf__inp--auto': nameAuto }"
              @input="onNameInput"
            />
          </div>
        </div>

        <!-- Properties -->
        <div class="pf__card">
          <p class="pf__stitle">
            <AppIcon name="sliders" :size="13" /> Xususiyatlar
            <span class="pf__stitle-hint">— to'liq nomiga avtomatik qo'shiladi</span>
          </p>

          <div class="pf__inline2">
            <div class="pf__field">
              <label>Birlik</label>
              <SelectOrAdd v-model="form.unit" :options="UNITS" placeholder="Dona, kg..." />
            </div>
            <div class="pf__field">
              <label>Guruh / Kategoriya</label>
              <SelectOrAdd v-model="form.group" :options="GROUPS" placeholder="Kiyim, Taom..." />
            </div>
          </div>

          <div class="pf__inline2">
            <div class="pf__field">
              <label>Brend <span v-if="form.brand" class="pf__auto-tag">→ nomga</span></label>
              <SelectOrAdd v-model="form.brand" :options="BRANDS" placeholder="Nike, Samsung..." />
            </div>
            <div class="pf__field">
              <label>Rang <span v-if="form.color" class="pf__auto-tag">→ nomga</span></label>
              <SelectOrAdd v-model="form.color" :options="COLORS" placeholder="Oq, Ko'k..." />
            </div>
          </div>

          <div class="pf__inline2">
            <div class="pf__field" style="margin-bottom:0">
              <label>Model <span v-if="form.model" class="pf__auto-tag">→ nomga</span></label>
              <SelectOrAdd v-model="form.model" :options="MODELS" placeholder="Model..." />
            </div>
            <div class="pf__field" style="margin-bottom:0">
              <label>Davlat</label>
              <SelectOrAdd v-model="form.country" :options="COUNTRIES" placeholder="O'zbekiston..." />
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Row 2: Photo + Barcode + Extra + Prices ════════════════════ -->
      <div class="pf__r4-bot">
        <!-- Photo -->
        <div class="pf__card pf__card--photo">
          <p class="pf__stitle"><AppIcon name="image" :size="13" /> Rasm</p>
          <label class="photo-up">
            <div v-if="form.photoPreview" class="photo-up__prev">
              <img :src="form.photoPreview" alt="" />
            </div>
            <div v-else class="photo-up__ph">
              <AppIcon name="upload-cloud" :size="24" :stroke-width="1.3" />
              <span>Rasm</span>
            </div>
            <input type="file" accept="image/*" @change="onPhoto" hidden />
          </label>
        </div>

        <!-- Barcodes -->
        <div class="pf__card">
          <div class="pf__stitle-row">
            <p class="pf__stitle" style="margin-bottom:0;border:none;padding:0"><AppIcon name="hash" :size="13" /> Shtrix kodlar</p>
            <button class="pf__gen-btn" @click="addGenBarcode">
              <AppIcon name="zap" :size="11" :stroke-width="2.5" /> Yaratish
            </button>
          </div>
          <div v-if="form.barcodes.length" class="bc-list">
            <div v-for="(bc, i) in form.barcodes" :key="i" class="bc-chip">
              <span>{{ bc }}</span>
              <button class="bc-rm" @click="removeBarcode(i)"><AppIcon name="x" :size="9" :stroke-width="3" /></button>
            </div>
          </div>
          <p v-else class="bc-empty">Shtrix kod yo'q</p>
          <div class="bc-inp">
            <input v-model="form.newBarcode" placeholder="Qo'lda kiritish..." @keyup.enter="addBarcode" />
            <button class="bc-inp__btn" :disabled="!form.newBarcode.trim()" @click="addBarcode">
              <AppIcon name="plus" :size="13" />
            </button>
          </div>
        </div>

        <!-- Extra name -->
        <div class="pf__card">
          <p class="pf__stitle"><AppIcon name="align-left" :size="13" /> Qo'shimcha nom</p>
          <div class="pf__field" style="margin-bottom:0">
            <label>Muqobil nom</label>
            <input v-model="form.extraName1" placeholder="Ruscha, inglizcha..." />
          </div>
        </div>

        <!-- Prices -->
        <div class="pf__card pf__card--prices">
          <p class="pf__stitle"><AppIcon name="dollar-sign" :size="13" /> Narxlar</p>
          <div class="prices">
            <div class="prices__grp">
              <span class="prices__badge prices__badge--blue">Ulgurji</span>
              <div class="prices__row">
                <div class="prices__inp-w">
                  <input v-model.number="form.wholesalePrice" type="number" class="prices__inp" placeholder="0" />
                  <span class="prices__unit">so'm</span>
                </div>
                <div class="prices__inp-w">
                  <input v-model="form.wholesalePriceUSD" type="number" step="0.001" class="prices__inp" placeholder="0.000" />
                  <span class="prices__unit prices__unit--usd">$</span>
                </div>
              </div>
            </div>
            <div class="prices__sep" />
            <div class="prices__grp">
              <span class="prices__badge prices__badge--green">Chakana</span>
              <div class="prices__row">
                <div class="prices__inp-w">
                  <input v-model.number="form.retailPrice" type="number" class="prices__inp prices__inp--main" placeholder="0" />
                  <span class="prices__unit">so'm</span>
                </div>
                <div class="prices__inp-w">
                  <input v-model="form.retailPriceUSD" type="number" step="0.001" class="prices__inp" placeholder="0.000" />
                  <span class="prices__unit prices__unit--usd">$</span>
                </div>
              </div>
            </div>
            <div class="prices__sep" />
            <div class="prices__grp prices__grp--sm">
              <span class="prices__badge prices__badge--slate">Valyuta</span>
              <SelectOrAdd v-model="form.currency" :options="CURRENCIES" placeholder="So'm" />
            </div>
          </div>
        </div>
      </div>

      <!-- ══ Row 3: Razmerlar ════════════════════════════════════════════ -->
      <div class="pf__card sz-card">

        <!-- Toggle header -->
        <div class="sz-header" @click="sizesMode = !sizesMode">
          <div class="sz-header__l">
            <div class="sz-toggle" :class="{ on: sizesMode }">
              <div class="sz-toggle__dot" />
            </div>
            <span class="sz-header__title">
              <AppIcon name="layers" :size="14" />
              Razmerlar bo'yicha kiritish
            </span>
            <span class="sz-header__desc">
              Kiyim-kechak, poyabzal: har bir razmer alohida mahsulot sifatida saqlanadi
            </span>
          </div>
          <div v-if="sizesMode && sizes.length" class="sz-header__summary">
            <span class="sz-sum-pill sz-sum-pill--blue">{{ sizes.length }} razmer</span>
            <span class="sz-sum-pill sz-sum-pill--green">{{ sizesTotal }} dona jami</span>
          </div>
        </div>

        <!-- Sizes body -->
        <div v-if="sizesMode" class="sz-body">

          <!-- Quick-add presets -->
          <div class="sz-presets">
            <div class="sz-preset-group">
              <span class="sz-preset-label">Harfli:</span>
              <button
                v-for="s in SIZE_ALPHA" :key="s"
                class="sz-preset-btn"
                :class="{ active: sizeSet.has(s) }"
                @click="sizeSet.has(s) ? null : addSize(s)"
              >{{ s }}</button>
            </div>

            <div class="sz-preset-group">
              <span class="sz-preset-label">Raqamli:</span>
              <button
                v-for="s in SIZE_NUM" :key="s"
                class="sz-preset-btn"
                :class="{ active: sizeSet.has(s) }"
                @click="sizeSet.has(s) ? null : addSize(s)"
              >{{ s }}</button>
            </div>

            <div class="sz-preset-group">
              <span class="sz-preset-label">To'plam:</span>
              <button class="sz-range-btn" @click="addSizeSet(SIZE_JEANS)">Jinsi 29–34</button>
              <button class="sz-range-btn" @click="addSizeSet(SIZE_EVEN)">Shim 36–46</button>
              <button class="sz-range-btn" @click="addSizeSet(SIZE_CLASSIC)">Klassik 44–60</button>
              <button class="sz-range-btn" @click="addSizeSet(SIZE_ALPHA)">Harfli S–10XL</button>
            </div>
          </div>

          <!-- Size rows -->
          <div v-if="sizes.length" class="sz-table-wrap">
            <table class="sz-table">
              <thead>
                <tr>
                  <th style="width:80px">Razmer</th>
                  <th style="width:100px">Miqdor</th>
                  <th>Shtrix kod</th>
                  <th style="width:80px">To'liq nomi</th>
                  <th style="width:36px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(sz, i) in sizes" :key="i">
                  <td>
                    <input v-model="sz.size" class="sz-inp sz-inp--size" placeholder="M" />
                  </td>
                  <td>
                    <input v-model.number="sz.qty" type="number" min="0" class="sz-inp sz-inp--qty" placeholder="1" />
                  </td>
                  <td>
                    <div class="sz-bc-row">
                      <input v-model="sz.barcode" class="sz-inp sz-inp--bc" placeholder="Barcode..." />
                      <button class="sz-bc-gen" title="Yangisini yaratish" @click="genSizeBc(i)">
                        <AppIcon name="zap" :size="11" :stroke-width="2.5" />
                      </button>
                    </div>
                  </td>
                  <td class="sz-preview">{{ (form.name || form.generalName) ? (form.name || form.generalName) + ' ' + sz.size : sz.size }}</td>
                  <td>
                    <button class="sz-rm" @click="removeSize(i)">
                      <AppIcon name="x" :size="12" :stroke-width="2.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-else class="sz-empty">
            <AppIcon name="info" :size="13" :stroke-width="1.8" />
            Yuqoridan razmerlarni tanlang yoki har birini qo'lda qo'shing
          </p>

          <!-- Info note -->
          <div v-if="sizes.length" class="sz-note">
            <AppIcon name="info" :size="12" :stroke-width="2" />
            Saqlashda <strong>{{ sizes.length }} ta alohida mahsulot</strong> yaratiladi —
            har biri o'z barkoди va miqdori bilan
          </div>
        </div>
      </div>

    </div>

    <!-- Footer -->
    <template #footer>
      <button class="pf__btn pf__btn--cancel" @click="emit('close')">
        <AppIcon name="x" :size="14" /> Bekor qilish
      </button>
      <button
        class="pf__btn pf__btn--save"
        :disabled="saving || (!form.generalName.trim() && !form.name.trim())"
        @click="save"
      >
        <AppIcon v-if="saving" name="loader" :size="15" class="spin" />
        <AppIcon v-else name="check" :size="15" :stroke-width="2.5" />
        <template v-if="sizesMode && sizes.length">
          {{ saving ? 'Saqlanmoqda...' : `${sizes.length} ta mahsulot saqlash` }}
        </template>
        <template v-else>
          {{ saving ? 'Saqlanmoqda...' : 'Saqlash' }}
        </template>
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
/* ── Layout ───────────────────────────────────────────────────── */
.pf { display: flex; flex-direction: column; gap: 14px; }
.pf__r2-top { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.pf__r4-bot { display: grid; grid-template-columns: 140px 1fr 1fr 1fr; gap: 14px; align-items: start; }

/* ── Cards ─────────────────────────────────────────────────────── */
.pf__card {
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  padding: 16px 18px;
  background: var(--color-surface);
}
.pf__card--photo  { padding-bottom: 14px; }
.pf__card--prices { display: flex; flex-direction: column; }

/* ── Section titles ────────────────────────────────────────────── */
.pf__stitle {
  display: flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--color-text-3);
  margin-bottom: 14px; padding-bottom: 11px;
  border-bottom: 1px solid var(--color-border);
}
.pf__stitle-hint { font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--indigo-400); font-size: 10px; }
.pf__stitle-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--color-border);
}

/* ── Fields ────────────────────────────────────────────────────── */
.pf__inline2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pf__field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 11px; }
.pf__field label {
  font-size: 11.5px; font-weight: 600; color: var(--color-text-2);
  display: flex; align-items: center; gap: 5px;
}
.pf__hint { font-weight: 500; color: var(--color-text-3); font-size: 10.5px; }
.pf__auto-tag {
  font-size: 9.5px; font-weight: 700; color: var(--indigo-400);
  background: var(--indigo-50); border: 1px solid var(--indigo-100);
  padding: 1px 6px; border-radius: 99px;
}
.pf__field input, .pf__card input:not(.sz-inp):not(.bc-inp input):not(.prices__inp) {
  height: 38px; padding: 0 12px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-lg);
  font-size: 13.5px; color: var(--color-text); background: var(--color-surface);
  outline: none; font-family: inherit; width: 100%;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.pf__field input:focus { border-color: var(--indigo-300); box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
.pf__field input::placeholder { color: var(--color-text-3); }
.pf__inp--main { font-size: 14px !important; font-weight: 600 !important; }
.pf__inp--auto { color: var(--indigo-600) !important; background: var(--indigo-50) !important; border-color: var(--indigo-200) !important; }

.pf__label-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
.pf__label-row label { margin-bottom: 0 !important; }
.pf__auto-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 1px 7px; border-radius: 99px; font-size: 9.5px; font-weight: 800;
  background: var(--indigo-500); color: white; letter-spacing: 0.03em;
}
.pf__reset-auto {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 600;
  color: var(--color-text-3); border: 1.5px solid var(--color-border);
  background: transparent; cursor: pointer; font-family: inherit;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
}
.pf__reset-auto:hover { background: var(--indigo-50); color: var(--indigo-500); border-color: var(--indigo-200); }

/* ── Photo ─────────────────────────────────────────────────────── */
.photo-up {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 110px; border: 2px dashed var(--color-border); border-radius: var(--r-xl);
  cursor: pointer; overflow: hidden; transition: border-color var(--t-base), background var(--t-base);
}
.photo-up:hover { border-color: var(--indigo-300); background: var(--indigo-50); }
.photo-up__prev { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.photo-up__prev img { width: 100%; height: 100%; object-fit: cover; }
.photo-up__emoji { font-size: 36px; }
.photo-up__ph { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--color-text-3); }
.photo-up__ph span { font-size: 11px; font-weight: 600; color: var(--color-text-2); }

/* ── Barcode ───────────────────────────────────────────────────── */
.pf__gen-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 99px; font-size: 11px; font-weight: 700;
  background: var(--indigo-50); color: var(--indigo-600); border: 1.5px solid var(--indigo-100);
  cursor: pointer; font-family: inherit; transition: background var(--t-fast);
}
.pf__gen-btn:hover { background: var(--indigo-100); }
.bc-list { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0; }
.bc-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border: 1px solid var(--color-border); border-radius: 99px;
  background: var(--slate-50); font-size: 11px; font-weight: 600; font-family: monospace;
  color: var(--color-text-2);
}
.bc-rm {
  width: 14px; height: 14px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; color: var(--color-text-3);
  cursor: pointer; transition: background var(--t-fast), color var(--t-fast);
}
.bc-rm:hover { background: var(--rose-100); color: var(--rose-500); }
.bc-empty { font-size: 11.5px; color: var(--color-text-3); margin: 8px 0; font-style: italic; }
.bc-inp { display: flex; gap: 6px; margin-top: 6px; }
.bc-inp input {
  flex: 1; height: 34px; padding: 0 10px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-lg);
  font-size: 12px; color: var(--color-text); font-family: monospace;
  background: var(--color-surface); outline: none;
  transition: border-color var(--t-base);
}
.bc-inp input:focus { border-color: var(--indigo-300); }
.bc-inp__btn {
  width: 34px; height: 34px; border-radius: var(--r-lg);
  background: var(--indigo-500); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0; transition: opacity var(--t-base);
}
.bc-inp__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.bc-inp__btn:not(:disabled):hover { opacity: 0.85; }

/* ── Prices ────────────────────────────────────────────────────── */
.prices { display: flex; align-items: center; border: 1.5px solid var(--color-border); border-radius: var(--r-xl); overflow: hidden; flex: 1; }
.prices__grp { flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; }
.prices__grp--sm { flex: 0 0 110px; }
.prices__badge { display: inline-flex; padding: 2px 9px; border-radius: 99px; font-size: 10px; font-weight: 700; align-self: flex-start; }
.prices__badge--blue  { background: #eff6ff; color: #2563eb; }
.prices__badge--green { background: #f0fdf4; color: #16a34a; }
.prices__badge--slate { background: var(--slate-100); color: var(--color-text-2); }
.prices__row { display: flex; gap: 7px; }
.prices__inp-w { flex: 1; position: relative; display: flex; align-items: center; }
.prices__inp {
  width: 100%; height: 38px; padding: 0 30px 0 10px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-lg);
  font-size: 13px; font-weight: 700; color: var(--color-text); background: var(--color-surface);
  outline: none; font-family: inherit; text-align: right;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.prices__inp--main { color: var(--indigo-600); font-size: 15px; }
.prices__inp:focus { border-color: var(--indigo-300); box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
.prices__unit { position: absolute; right: 8px; font-size: 10px; font-weight: 700; color: var(--color-text-3); pointer-events: none; }
.prices__unit--usd { color: #16a34a; }
.prices__sep { width: 1px; background: var(--color-border); align-self: stretch; margin: 10px 0; flex-shrink: 0; }

/* ══ RAZMERLAR ═══════════════════════════════════════════════════ */
.sz-card { padding: 0; overflow: hidden; }

.sz-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; cursor: pointer;
  transition: background var(--t-fast);
  user-select: none;
}
.sz-header:hover { background: var(--slate-50); }
.sz-header__l { display: flex; align-items: center; gap: 12px; }
.sz-header__title {
  display: flex; align-items: center; gap: 6px;
  font-size: 13.5px; font-weight: 700; color: var(--color-text);
}
.sz-header__desc { font-size: 12px; color: var(--color-text-3); }
.sz-header__summary { display: flex; gap: 6px; }
.sz-sum-pill {
  padding: 3px 10px; border-radius: 99px; font-size: 11.5px; font-weight: 700;
}
.sz-sum-pill--blue  { background: var(--indigo-50);  color: var(--indigo-600); border: 1px solid var(--indigo-100); }
.sz-sum-pill--green { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

/* Toggle switch */
.sz-toggle {
  width: 38px; height: 22px; border-radius: 11px;
  background: var(--slate-200); position: relative; flex-shrink: 0;
  transition: background 0.2s ease;
}
.sz-toggle.on { background: var(--indigo-500); }
.sz-toggle__dot {
  position: absolute; top: 3px; left: 3px;
  width: 16px; height: 16px; border-radius: 50%; background: white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.2);
  transition: transform 0.2s ease;
}
.sz-toggle.on .sz-toggle__dot { transform: translateX(16px); }

/* Body */
.sz-body {
  border-top: 1px solid var(--color-border);
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 14px;
}

/* Presets */
.sz-presets { display: flex; flex-direction: column; gap: 8px; }
.sz-preset-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sz-preset-label {
  font-size: 11px; font-weight: 700; color: var(--color-text-3);
  text-transform: uppercase; letter-spacing: 0.04em;
  min-width: 58px; flex-shrink: 0;
}
.sz-preset-btn {
  height: 30px; min-width: 36px; padding: 0 10px;
  border-radius: var(--r-md); font-size: 12.5px; font-weight: 700;
  border: 1.5px solid var(--color-border); color: var(--color-text-2);
  background: var(--color-surface); cursor: pointer; font-family: inherit;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
}
.sz-preset-btn:hover:not(.active) { background: var(--indigo-50); color: var(--indigo-600); border-color: var(--indigo-300); transform: translateY(-1px); }
.sz-preset-btn.active { background: var(--indigo-500); color: white; border-color: var(--indigo-500); cursor: default; }

.sz-range-btn {
  height: 28px; padding: 0 12px; border-radius: var(--r-md);
  font-size: 11.5px; font-weight: 700; font-family: inherit;
  border: 1.5px solid var(--indigo-200); color: var(--indigo-600);
  background: var(--indigo-50); cursor: pointer;
  transition: background var(--t-fast), box-shadow var(--t-fast);
}
.sz-range-btn:hover { background: var(--indigo-100); box-shadow: 0 2px 8px rgba(99,102,241,0.2); }

/* Table */
.sz-table-wrap { border: 1px solid var(--color-border); border-radius: var(--r-xl); overflow: hidden; }
.sz-table { width: 100%; border-collapse: collapse; }
.sz-table thead th {
  padding: 8px 12px; font-size: 10.5px; font-weight: 700;
  color: var(--color-text-3); text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid var(--color-border); text-align: left;
  background: var(--slate-50);
}
.sz-table tbody tr:hover td { background: var(--slate-50); }
.sz-table tbody td {
  padding: 7px 10px; border-bottom: 1px solid var(--color-border); vertical-align: middle;
}
.sz-table tbody tr:last-child td { border-bottom: none; }

.sz-inp {
  height: 32px; padding: 0 10px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-md);
  font-size: 13px; color: var(--color-text); background: var(--color-surface);
  outline: none; font-family: inherit; width: 100%;
  transition: border-color var(--t-base);
}
.sz-inp:focus { border-color: var(--indigo-300); }
.sz-inp--size { font-size: 14px; font-weight: 800; text-align: center; color: var(--indigo-600); }
.sz-inp--qty  { text-align: center; font-weight: 700; width: 70px; }
.sz-inp--bc   { font-family: monospace; font-size: 12px; }

.sz-bc-row { display: flex; gap: 5px; align-items: center; }
.sz-bc-gen {
  width: 32px; height: 32px; border-radius: var(--r-md); flex-shrink: 0;
  background: var(--indigo-50); color: var(--indigo-500); border: 1.5px solid var(--indigo-100);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background var(--t-fast);
}
.sz-bc-gen:hover { background: var(--indigo-100); }

.sz-preview { font-size: 11.5px; color: var(--color-text-3); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sz-rm {
  width: 28px; height: 28px; border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-3); cursor: pointer;
  transition: background var(--t-fast), color var(--t-fast);
}
.sz-rm:hover { background: var(--rose-50); color: var(--rose-500); }

.sz-empty {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: var(--color-text-3); font-style: italic;
  padding: 8px 0;
}
.sz-note {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 14px; border-radius: var(--r-lg);
  background: var(--indigo-50); border: 1px solid var(--indigo-100);
  font-size: 12px; color: var(--indigo-700);
}

/* ── Footer ────────────────────────────────────────────────────── */
.pf__btn {
  display: flex; align-items: center; gap: 7px;
  height: 40px; padding: 0 22px; border-radius: var(--r-lg);
  font-size: 13.5px; font-weight: 700; cursor: pointer;
  transition: opacity var(--t-base), transform var(--t-fast);
  letter-spacing: -0.01em; font-family: inherit;
}
.pf__btn--cancel { border: 1.5px solid var(--color-border); color: var(--color-text-2); }
.pf__btn--cancel:hover { background: var(--slate-50); }
.pf__btn--save {
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white; box-shadow: 0 4px 16px rgba(99,102,241,0.3);
}
.pf__btn--save:hover:not(:disabled)  { opacity: 0.9; transform: translateY(-1px); }
.pf__btn--save:active:not(:disabled) { transform: scale(0.98); }
.pf__btn--save:disabled { opacity: 0.5; cursor: not-allowed; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }
</style>
