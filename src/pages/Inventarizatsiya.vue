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

// Skaner tugmasi bosib turilganda kodni to'xtovsiz qayta yuboradi. Ayni
// kod uchun qulf qo'yamiz va har takror uni uzaytiradi — hisob tugma
// qo'yib yuborilgandan keyin boshlanadi. Shunda 3-5 soniya ushlab tursa
// ham bir marta sanaladi. Boshqa kod kelsa qulf darhol bekor bo'ladi.
const SCAN_LOCK_MS = 1200
let lastCode = ''
let lastAt   = 0

async function onScan() {
  const code = scanCode.value.trim()
  scanCode.value = ''
  if (!code || !doc.value || doc.value.status !== 'draft') return

  const now = Date.now()
  if (code === lastCode && now - lastAt < SCAN_LOCK_MS) {
    lastAt = now          // ushlab turilgan ekan — qulfni uzaytiramiz
    focusScanner()
    return
  }
  lastCode = code
  lastAt   = now

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

      <div v-if="loading" class="inv__skeleton">
        <div v-for="n in 3" :key="n" class="inv__skel-card"></div>
      </div>

      <div v-else-if="!docs.length" class="inv__empty">
        <div class="inv__empty-ico"><AppIcon name="list" :size="30" /></div>
        <p class="inv__empty-t">Hali inventarizatsiya o'tkazilmagan</p>
        <p class="inv__empty-s">Ombordagi tovarlarni sanab, haqiqiy qoldiqni aniqlang</p>
        <button v-if="canAdd('products')" class="inv__btn inv__btn--primary" @click="createDoc">
          <AppIcon name="plus" :size="15" /> Boshlash
        </button>
      </div>

      <div v-else class="cards">
        <article v-for="d in docs" :key="d.id" class="card" @click="openDoc(d.id)">
          <div class="card__top">
            <div class="card__num">
              <span class="card__hash">#</span>{{ d.docNumber }}
            </div>
            <span class="st" :class="STATUS[d.status]?.cls">{{ STATUS[d.status]?.label }}</span>
          </div>

          <div class="card__meta">
            <span><AppIcon name="calendar" :size="12" /> {{ d.date?.slice(0,10).split('-').reverse().join('.') }}</span>
            <span><AppIcon name="package" :size="12" /> {{ d.itemCount }} ta tovar</span>
          </div>

          <div class="card__foot">
            <div v-if="d.status === 'finished'" class="card__diff">
              <span class="card__diff-l">Farq</span>
              <strong :class="d.totalDiffSum < 0 ? 'neg' : (d.totalDiffSum > 0 ? 'pos' : '')">
                {{ d.totalDiffSum > 0 ? '+' : '' }}{{ fmt(d.totalDiffSum) }} so'm
              </strong>
            </div>
            <div v-else class="card__diff">
              <span class="card__diff-l">{{ d.warehouse }}</span>
            </div>

            <button v-if="d.status !== 'finished' && canEdit('products')"
                    class="inv__mini inv__mini--del" title="O'chirish"
                    @click.stop="deleteDoc(d.id)">
              <AppIcon name="trash-2" :size="13" />
            </button>
          </div>
        </article>
      </div>
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

      <!-- Statistika: sanoq holati bir qarashda ko'rinadi -->
      <div class="stats">
        <div class="stat">
          <div class="stat__v">{{ doc.items.length }}</div>
          <div class="stat__l">Jami tovar</div>
        </div>
        <div class="stat stat--ok">
          <div class="stat__v">{{ found.length }}</div>
          <div class="stat__l">Topildi</div>
        </div>
        <div class="stat stat--miss">
          <div class="stat__v">{{ notFound.length }}</div>
          <div class="stat__l">Topilmadi</div>
        </div>
        <div class="stat stat--extra">
          <div class="stat__v">{{ extra.length }}</div>
          <div class="stat__l">Ortiqcha</div>
        </div>
      </div>

      <!-- Skaner maydoni — doim fokusda -->
      <div v-if="doc.status === 'draft'" class="scan">
        <div class="scan__l">
          <div class="scan__pulse"><AppIcon name="zap" :size="18" /></div>
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
        <transition name="pop">
          <div v-if="lastScan" :key="lastScan.at" class="scan__last" :class="`scan__last--${lastScan.holat}`">
            <div class="scan__last-badge">
              <AppIcon :name="lastScan.holat === 'topildi' ? 'check-circle' : 'alert-circle'" :size="12" />
              {{ lastScan.holat === 'takror'   ? 'QAYTA URILDI'
               : lastScan.holat === 'ortiqcha' ? 'ORTIQCHA'
               : lastScan.holat === 'notanish' ? 'NOMA\'LUM'
               : 'TOPILDI' }}
            </div>
            <div class="scan__last-name">{{ lastScan.item.productName }}</div>
            <div class="scan__last-qty">
              <strong>{{ fmtQ(lastScan.item.countedQty) }}</strong> / {{ fmtQ(lastScan.item.expectedQty) }}
            </div>
          </div>
        </transition>
      </div>

      <!-- Jarayon ko'rsatkichi -->
      <div class="prog">
        <div class="prog__bar"><div class="prog__fill" :style="{ width: progress + '%' }"></div></div>
        <span class="prog__txt">{{ progress }}%</span>
      </div>

      <!-- Guruhlar -->
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
/* Inventarizatsiya — sanoq jarayoni ekranda tez o'qilishi kerak, shuning
   uchun katta raqamlar, aniq ranglar va yumshoq soyalar ishlatilgan. */

.inv { padding: 20px 24px; max-width: 1400px; margin: 0 auto; }

/* ── Sarlavha ─────────────────────────────────────────────────── */
.inv__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: 20px;
}
.inv__head-l { display: flex; align-items: flex-start; gap: 14px; }
.inv__title {
  font-size: 22px; font-weight: 700; letter-spacing: -.3px;
  color: var(--color-text, #0f172a);
}
.inv__sub {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #64748b; margin-top: 5px;
}

.inv__back {
  width: 36px; height: 36px; margin-top: 2px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #e2e8f0; border-radius: 10px;
  background: #fff; cursor: pointer; color: #475569;
  transition: all .15s;
}
.inv__back:hover { background: #f8fafc; border-color: #cbd5e1; transform: translateX(-2px); }

.inv__btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 17px; border-radius: 10px; border: 1px solid #e2e8f0;
  background: #fff; font-size: 13.5px; font-weight: 600; cursor: pointer;
  color: #334155; transition: all .15s; white-space: nowrap;
}
.inv__btn:hover:not(:disabled) { background: #f8fafc; }
.inv__btn--primary {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  border-color: transparent; color: #fff;
  box-shadow: 0 2px 8px rgba(79,70,229,.28);
}
.inv__btn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(79,70,229,.36); transform: translateY(-1px);
}
.inv__btn:disabled { opacity: .55; cursor: default; }

/* ── Hujjat kartalari ─────────────────────────────────────────── */
.cards {
  display: grid; gap: 13px;
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
}
.card {
  padding: 16px; border-radius: 14px; cursor: pointer;
  background: #fff; border: 1px solid #e2e8f0;
  transition: all .18s;
}
.card:hover {
  border-color: #c7d2fe; transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(15,23,42,.07);
}
.card__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 13px; }
.card__num { font-size: 19px; font-weight: 700; color: #0f172a; letter-spacing: -.4px; }
.card__hash { color: #94a3b8; font-weight: 600; }

.card__meta { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; }
.card__meta span {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; color: #64748b;
}

.card__foot {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 12px; border-top: 1px solid #f1f5f9;
}
.card__diff { display: flex; flex-direction: column; gap: 2px; }
.card__diff-l { font-size: 11px; color: #94a3b8; }
.card__diff strong { font-size: 14px; font-weight: 700; }

/* ── Statistika ───────────────────────────────────────────────── */
.stats {
  display: grid; gap: 11px; margin-bottom: 16px;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
}
.stat {
  padding: 14px 16px; border-radius: 13px;
  background: #fff; border: 1px solid #e2e8f0;
}
.stat__v {
  font-size: 26px; font-weight: 700; line-height: 1;
  color: #0f172a; letter-spacing: -.6px; font-variant-numeric: tabular-nums;
}
.stat__l { font-size: 11.5px; color: #64748b; margin-top: 5px; font-weight: 500; }

.stat--ok    { background: linear-gradient(160deg, #f0fdf4, #fff); border-color: #bbf7d0; }
.stat--ok    .stat__v { color: #059669; }
.stat--miss  { background: linear-gradient(160deg, #fef2f2, #fff); border-color: #fecaca; }
.stat--miss  .stat__v { color: #dc2626; }
.stat--extra { background: linear-gradient(160deg, #fff7ed, #fff); border-color: #fed7aa; }
.stat--extra .stat__v { color: #ea580c; }

/* ── Skaner ───────────────────────────────────────────────────── */
.scan {
  display: flex; align-items: center; gap: 16px;
  padding: 15px 18px; margin-bottom: 16px;
  background: #fff; border-radius: 15px;
  border: 2px solid #6366f1;
  box-shadow: 0 0 0 4px rgba(99,102,241,.09);
}
.scan__l { display: flex; align-items: center; gap: 13px; flex: 1; min-width: 0; }

/* Skaner faol ekanini bildiradigan yumshoq puls */
.scan__pulse {
  width: 38px; height: 38px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 11px; color: #fff;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  animation: pulse 2.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,.5); }
  50%      { box-shadow: 0 0 0 9px rgba(99,102,241,0); }
}

.scan__inp {
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  font-size: 18px; font-weight: 600; color: #0f172a;
  font-variant-numeric: tabular-nums; letter-spacing: .3px;
}
.scan__inp::placeholder { color: #cbd5e1; font-weight: 400; letter-spacing: 0; }

.scan__last {
  min-width: 250px; max-width: 320px; padding: 10px 15px; border-radius: 12px;
  border: 1px solid transparent; flex-shrink: 0;
}
.scan__last--topildi  { background: #f0fdf4; border-color: #bbf7d0; }
.scan__last--takror   { background: #fffbeb; border-color: #fde68a; }
.scan__last--ortiqcha { background: #fff7ed; border-color: #fed7aa; }
.scan__last--notanish { background: #fef2f2; border-color: #fecaca; }

.scan__last-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: .7px;
}
.scan__last--topildi  .scan__last-badge { color: #059669; }
.scan__last--takror   .scan__last-badge { color: #d97706; }
.scan__last--ortiqcha .scan__last-badge { color: #ea580c; }
.scan__last--notanish .scan__last-badge { color: #dc2626; }

.scan__last-name {
  font-size: 13.5px; font-weight: 600; margin-top: 4px; color: #0f172a;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.scan__last-qty {
  font-size: 12.5px; color: #64748b; margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.scan__last-qty strong { font-size: 15px; color: #0f172a; }

/* Yangi skan natijasi yumshoq paydo bo'ladi */
.pop-enter-active { transition: all .22s cubic-bezier(.34,1.56,.64,1); }
.pop-enter-from   { opacity: 0; transform: scale(.94) translateY(-3px); }

/* ── Jarayon ──────────────────────────────────────────────────── */
.prog { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
.prog__bar {
  flex: 1; height: 8px; background: #e2e8f0;
  border-radius: 99px; overflow: hidden;
}
.prog__fill {
  height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, #6366f1, #22c55e);
  transition: width .35s cubic-bezier(.4,0,.2,1);
}
.prog__txt {
  font-size: 13px; color: #475569; font-weight: 700;
  min-width: 42px; text-align: right; font-variant-numeric: tabular-nums;
}

/* ── Tablar ───────────────────────────────────────────────────── */
.tabs {
  display: flex; gap: 5px; margin-bottom: 15px;
  padding: 4px; background: #f1f5f9; border-radius: 11px;
}
.tabs__b {
  display: flex; align-items: center; gap: 8px; flex: 1; justify-content: center;
  padding: 9px 15px; border: none; background: none; cursor: pointer;
  font-size: 13px; font-weight: 600; color: #64748b;
  border-radius: 8px; transition: all .15s;
}
.tabs__b:hover { color: #334155; }
.tabs__b.on {
  background: #fff; color: #4f46e5;
  box-shadow: 0 1px 3px rgba(15,23,42,.08);
}
.tabs__n {
  padding: 2px 8px; border-radius: 99px; background: #e2e8f0;
  font-size: 11px; font-weight: 700; color: #475569;
  font-variant-numeric: tabular-nums;
}
.tabs__n--ok   { background: #d1fae5; color: #047857; }
.tabs__n--warn { background: #ffedd5; color: #c2410c; }

/* ── Jadval ───────────────────────────────────────────────────── */
.inv__table {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: #fff; border-radius: 13px; overflow: hidden;
  border: 1px solid #e2e8f0;
}
.inv__table th {
  text-align: left; padding: 11px 14px; background: #f8fafc;
  font-size: 11px; font-weight: 600; color: #64748b;
  border-bottom: 1px solid #e2e8f0;
  text-transform: uppercase; letter-spacing: .4px;
}
.inv__table td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; }
.inv__table tbody tr:last-child td { border-bottom: none; }
.inv__table tbody tr:hover { background: #fafbfc; }

.ta-c { text-align: center; }
.ta-r { text-align: right; }
.neg  { color: #dc2626; font-weight: 700; }
.pos  { color: #059669; font-weight: 700; }

.inv__pname { font-weight: 600; color: #0f172a; }
.inv__bc {
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 12px; color: #64748b;
}
.inv__tag {
  margin-left: 8px; padding: 2px 8px; border-radius: 6px;
  background: #fef2f2; color: #dc2626; font-size: 10.5px; font-weight: 600;
}

.inv__qty {
  width: 72px; padding: 6px 9px; text-align: center;
  border: 1px solid #cbd5e1; border-radius: 8px;
  font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
  transition: all .15s;
}
.inv__qty:focus {
  outline: none; border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99,102,241,.12);
}

.inv__mini {
  width: 28px; height: 28px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid #e2e8f0; border-radius: 8px;
  background: #fff; cursor: pointer; color: #64748b; transition: all .15s;
}
.inv__mini--del:hover { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

/* ── Holat belgisi ────────────────────────────────────────────── */
.st {
  padding: 3px 10px; border-radius: 99px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.st--draft  { background: #fef3c7; color: #b45309; }
.st--done   { background: #d1fae5; color: #047857; }
.st--cancel { background: #f1f5f9; color: #64748b; }

/* ── Bo'sh holat ──────────────────────────────────────────────── */
.inv__empty {
  display: flex; flex-direction: column; align-items: center; gap: 9px;
  padding: 64px 24px; text-align: center;
}
.inv__empty-ico {
  width: 62px; height: 62px; margin-bottom: 5px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 17px; background: #eef2ff; color: #6366f1;
}
.inv__empty-t { font-size: 15px; font-weight: 600; color: #334155; }
.inv__empty-s { font-size: 13px; color: #94a3b8; margin-bottom: 9px; }
.inv__empty--sm { padding: 44px 24px; }

/* Yuklanish skeleti — bo'sh ekran o'rniga */
.inv__skeleton {
  display: grid; gap: 13px;
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
}
.inv__skel-card {
  height: 148px; border-radius: 14px;
  background: linear-gradient(100deg, #f1f5f9 30%, #f8fafc 50%, #f1f5f9 70%);
  background-size: 220% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* ── Yakuniy xulosa ───────────────────────────────────────────── */
.summary {
  display: grid; gap: 14px; margin-top: 18px; padding: 17px 20px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  background: #fff; border: 1px solid #e2e8f0; border-radius: 13px;
}
.summary__i { display: flex; flex-direction: column; gap: 4px; }
.summary__i span { font-size: 11.5px; color: #64748b; }
.summary__i strong {
  font-size: 18px; font-weight: 700; color: #0f172a;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .inv { padding: 14px; }
  .scan { flex-direction: column; align-items: stretch; gap: 12px; }
  .scan__last { min-width: 0; max-width: none; }
  .inv__head { flex-direction: column; }
}
</style>
