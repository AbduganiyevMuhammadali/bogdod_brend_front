<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { suppliersApi } from '@/api/suppliers.js'

// ── List ────────────────────────────────────────────────────────
const suppliers    = ref([])
const loading      = ref(false)
const error        = ref('')
const search       = ref('')
const filterActive = ref('all')

let searchTimer = null
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 280) })
watch(filterActive, load)
onMounted(load)

async function load() {
  loading.value = true; error.value = ''
  try {
    const params = {}
    if (search.value.trim())      params.search = search.value.trim()
    if (filterActive.value !== 'all') params.active = filterActive.value === 'active'
    suppliers.value = await suppliersApi.getAll(params)
  } catch (e) {
    error.value = e.response?.data?.message ?? "Serverga ulanib bo'lmadi"
  } finally { loading.value = false }
}

const stats = computed(() => ({
  total:     suppliers.value.length,
  withDebt:  suppliers.value.filter(s => s.balance < 0).length,
  totalDebt: suppliers.value.reduce((s, x) => s + Math.min(0, Number(x.balance)), 0),
}))

// ── Add/Edit form ────────────────────────────────────────────────
const showForm  = ref(false)
const editingId = ref(null)
const saving    = ref(false)
const saveErr   = ref('')
const form      = ref({ code: '', name: '', phone: '', address: '', comment: '', active: true })

function openAdd() {
  form.value = { code: '', name: '', phone: '', address: '', comment: '', active: true }
  editingId.value = null; saveErr.value = ''; showForm.value = true
}
function openEdit(s) {
  form.value = { code: s.code, name: s.name, phone: s.phone, address: s.address, comment: s.comment, active: s.active }
  editingId.value = s.id; saveErr.value = ''; showForm.value = true
}
function closeForm() { showForm.value = false }

async function save() {
  if (!form.value.name.trim()) { saveErr.value = 'Nomi kiritilmagan'; return }
  saving.value = true; saveErr.value = ''
  try {
    if (editingId.value) await suppliersApi.update(editingId.value, form.value)
    else                 await suppliersApi.create(form.value)
    closeForm(); load()
  } catch (e) { saveErr.value = e.response?.data?.message ?? 'Xatolik' }
  finally { saving.value = false }
}

async function remove(s) {
  if (!confirm(`"${s.name}" ni o'chirasizmi?`)) return
  try { await suppliersApi.remove(s.id); load() }
  catch (e) { alert(e.response?.data?.message ?? "O'chirishda xatolik") }
}

// ── Ledger (oldi-berdi tarixi) ───────────────────────────────────
const showLedger    = ref(false)
const ledgerSupplier = ref(null)
const ledgerEntries  = ref([])
const ledgerBalance  = ref(0)
const ledgerLoading  = ref(false)
const ledgerErr      = ref('')

async function openLedger(s) {
  ledgerSupplier.value = s
  ledgerEntries.value  = []
  ledgerBalance.value  = 0
  ledgerErr.value      = ''
  showLedger.value     = true
  ledgerLoading.value  = true
  try {
    const data = await suppliersApi.getLedger(s.id)
    ledgerEntries.value = data.entries
    ledgerBalance.value = data.balance
    ledgerSupplier.value = data.supplier
  } catch (e) {
    ledgerErr.value = e.response?.data?.message ?? 'Yuklab bo\'lmadi'
  } finally { ledgerLoading.value = false }
}
function closeLedger() { showLedger.value = false; ledgerSupplier.value = null }

const ledgerStats = computed(() => {
  const entries = ledgerEntries.value
  const totalDebt  = entries.filter(e => e.type === 'purchase').reduce((s, e) => s + e.debit, 0)
  const totalPaid  = entries.filter(e => e.type === 'payment').reduce((s, e) => s + (e.credit || 0), 0)
  return { totalDebt, totalPaid }
})

// ── Pay modal ────────────────────────────────────────────────────
const showPay    = ref(false)
const payTarget  = ref(null)
const payAmount  = ref(0)
const payType    = ref('Naqd')
const payComment = ref('')
const payErr     = ref('')
const payLoading = ref(false)
const PAYMENT_TYPES = ['Naqd', 'Karta', "O'tkazma"]

function openPay(s) {
  payTarget.value  = s
  payAmount.value  = Math.abs(Math.min(0, Number(s.balance)))
  payType.value    = 'Naqd'
  payComment.value = ''
  payErr.value     = ''
  showPay.value    = true
}
function closePay() { showPay.value = false; payTarget.value = null }

async function submitPay() {
  if (!payAmount.value || payAmount.value <= 0) { payErr.value = 'Summani kiriting'; return }
  payLoading.value = true; payErr.value = ''
  try {
    await suppliersApi.pay(payTarget.value.id, {
      amount: payAmount.value,
      payment_type: payType.value,
      comment: payComment.value || null,
    })
    closePay()
    load()
    // Agar ledger ochiq bo'lsa — uni ham yangilaymiz
    if (showLedger.value && ledgerSupplier.value?.id === payTarget.value.id) {
      const data = await suppliersApi.getLedger(payTarget.value.id)
      ledgerEntries.value  = data.entries
      ledgerBalance.value  = data.balance
      ledgerSupplier.value = data.supplier
    }
  } catch (e) { payErr.value = e.response?.data?.message ?? "To'lovda xatolik" }
  finally { payLoading.value = false }
}

// ── Utils ────────────────────────────────────────────────────────
function fmt(v)  { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function fmtD(v, d = 2) { return (Number(v) || 0).toFixed(d) }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
<div class="yv">

  <!-- ══ HEADER ════════════════════════════════════════════════════ -->
  <div class="yv__topbar">
    <div class="yv__topbar-l">
      <h2 class="yv__title">Yetkazuvchilar</h2>
      <div class="yv__search">
        <AppIcon name="search" :size="13" class="yv__search-ico"/>
        <input v-model="search" class="yv__search-inp" placeholder="Qidirish..."/>
      </div>
      <select v-model="filterActive" class="yv__filter-sel">
        <option value="all">Barchasi</option>
        <option value="active">Faol</option>
        <option value="inactive">Nofaol</option>
      </select>
    </div>
    <button class="yv__add-btn" @click="openAdd">
      <AppIcon name="plus" :size="15" :stroke-width="2.5"/> Qo'shish
    </button>
  </div>

  <!-- ══ STATS ═════════════════════════════════════════════════════ -->
  <div class="yv__stats">
    <div class="ys">
      <div class="ys__ico ys__ico--orange"><AppIcon name="truck" :size="15" :stroke-width="2"/></div>
      <div><p class="ys__val">{{ stats.total }}</p><p class="ys__lbl">Jami yetkazuvchi</p></div>
    </div>
    <div class="ys">
      <div class="ys__ico ys__ico--rose"><AppIcon name="alert-circle" :size="15" :stroke-width="2"/></div>
      <div><p class="ys__val">{{ stats.withDebt }}</p><p class="ys__lbl">Qarzli</p></div>
    </div>
    <div class="ys">
      <div class="ys__ico ys__ico--amber"><AppIcon name="trending-down" :size="15" :stroke-width="2"/></div>
      <div>
        <p class="ys__val ys__val--debt">{{ fmt(Math.abs(stats.totalDebt)) }} <span class="ys__cur">so'm</span></p>
        <p class="ys__lbl">Umumiy qarz</p>
      </div>
    </div>
  </div>

  <!-- ══ ERROR ═════════════════════════════════════════════════════ -->
  <div v-if="error" class="yv__err">
    <AppIcon name="alert-circle" :size="13"/>{{ error }}
    <button class="yv__err-retry" @click="load">Qayta</button>
  </div>

  <!-- ══ TABLE ═════════════════════════════════════════════════════ -->
  <div class="yv__table-wrap">
    <div v-if="loading" class="yv__loading">
      <div v-for="i in 5" :key="i" class="skeleton yv__skel"/>
    </div>
    <div v-else-if="!suppliers.length" class="yv__empty">
      <AppIcon name="truck" :size="38" :stroke-width="1.2"/>
      <p>Yetkazuvchi topilmadi</p>
      <button class="yv__add-btn yv__add-btn--sm" @click="openAdd">
        <AppIcon name="plus" :size="14"/> Qo'shish
      </button>
    </div>
    <table v-else class="ytbl">
      <thead>
        <tr>
          <th>Kod</th>
          <th>Nomi</th>
          <th>Telefon</th>
          <th>Manzil</th>
          <th class="ta-r">Balans (so'm)</th>
          <th>Holat</th>
          <th style="width:110px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in suppliers" :key="s.id" class="ytbl__row" @click="openLedger(s)">
          <td><span class="y-code">{{ s.code || '—' }}</span></td>
          <td class="ytbl__name">{{ s.name }}</td>
          <td class="ytbl__phone">{{ s.phone || '—' }}</td>
          <td class="ytbl__addr">{{ s.address || '—' }}</td>
          <td class="ta-r">
            <span v-if="s.balance < 0"  class="y-bal y-bal--debt">−{{ fmt(Math.abs(s.balance)) }}</span>
            <span v-else-if="s.balance > 0" class="y-bal y-bal--credit">+{{ fmt(s.balance) }}</span>
            <span v-else class="y-bal y-bal--zero">0</span>
          </td>
          <td>
            <span class="y-status" :class="s.active ? 'y-status--ok' : 'y-status--off'">
              {{ s.active ? 'Faol' : 'Nofaol' }}
            </span>
          </td>
          <td @click.stop>
            <div class="ytbl__acts">
              <button
                v-if="s.balance < 0"
                class="ytbl__act ytbl__act--pay"
                @click="openPay(s)"
                title="To'lov qilish"
              ><AppIcon name="credit-card" :size="13"/></button>
              <button
                class="ytbl__act ytbl__act--hist"
                @click="openLedger(s)"
                title="Oldi-berdi tarixi"
              ><AppIcon name="clock" :size="13"/></button>
              <button
                class="ytbl__act ytbl__act--edit"
                @click="openEdit(s)"
                title="Tahrirlash"
              ><AppIcon name="edit-2" :size="13"/></button>
              <button
                class="ytbl__act ytbl__act--del"
                @click="remove(s)"
                title="O'chirish"
              ><AppIcon name="trash-2" :size="13"/></button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Mobile card list (shown only ≤768px) -->
    <div v-if="suppliers.length" class="ycards">
      <div
        v-for="(s, i) in suppliers"
        :key="s.id"
        class="ycard"
        :style="{ '--i': i }"
        @click="openLedger(s)"
      >
        <div class="ycard__top">
          <div class="ycard__id">
            <span class="ycard__name">{{ s.name }}</span>
            <span v-if="s.code" class="y-code">{{ s.code }}</span>
          </div>
          <span class="y-status" :class="s.active ? 'y-status--ok' : 'y-status--off'">
            {{ s.active ? 'Faol' : 'Nofaol' }}
          </span>
        </div>

        <div class="ycard__rows">
          <div class="ycard__row">
            <span class="ycard__lbl">Telefon</span>
            <span class="ycard__val">{{ s.phone || '—' }}</span>
          </div>
          <div class="ycard__row">
            <span class="ycard__lbl">Manzil</span>
            <span class="ycard__val">{{ s.address || '—' }}</span>
          </div>
          <div class="ycard__row">
            <span class="ycard__lbl">Balans</span>
            <span v-if="s.balance < 0" class="y-bal y-bal--debt">−{{ fmt(Math.abs(s.balance)) }} so'm</span>
            <span v-else-if="s.balance > 0" class="y-bal y-bal--credit">+{{ fmt(s.balance) }} so'm</span>
            <span v-else class="y-bal y-bal--zero">0 so'm</span>
          </div>
        </div>

        <div class="ycard__acts" @click.stop>
          <button
            v-if="s.balance < 0"
            class="ycard__act ycard__act--pay"
            @click="openPay(s)"
          ><AppIcon name="credit-card" :size="14"/> To'lov</button>
          <button class="ycard__act ycard__act--hist" @click="openLedger(s)">
            <AppIcon name="clock" :size="14"/> Tarix
          </button>
          <button class="ycard__act ycard__act--edit" @click="openEdit(s)">
            <AppIcon name="edit-2" :size="14"/>
          </button>
          <button class="ycard__act ycard__act--del" @click="remove(s)">
            <AppIcon name="trash-2" :size="14"/>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ══ LEDGER PANEL ══════════════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showLedger" class="ldg-overlay" @click.self="closeLedger">
      <div class="ldg-panel">

        <!-- Header -->
        <div class="ldg-panel__hdr">
          <div class="ldg-panel__hdr-l">
            <div class="ldg-panel__ico">
              <AppIcon name="truck" :size="16" :stroke-width="2"/>
            </div>
            <div>
              <h3 class="ldg-panel__title">{{ ledgerSupplier?.name }}</h3>
              <p class="ldg-panel__sub">Oldi-berdi tarixi</p>
            </div>
          </div>
          <div class="ldg-panel__hdr-r">
            <button
              v-if="ledgerSupplier && Number(ledgerSupplier.balance) < 0"
              class="ldg-pay-btn"
              @click="openPay(ledgerSupplier)"
            >
              <AppIcon name="credit-card" :size="13" :stroke-width="2.5"/>
              To'lov qilish
            </button>
            <button class="ldg-panel__close" @click="closeLedger">
              <AppIcon name="x" :size="15" :stroke-width="2.5"/>
            </button>
          </div>
        </div>

        <!-- Summary cards -->
        <div v-if="ledgerSupplier && !ledgerLoading" class="ldg-summary">
          <div class="ldg-card ldg-card--debt">
            <p class="ldg-card__lbl">Jami kirim (qarz)</p>
            <p class="ldg-card__val">{{ fmt(ledgerStats.totalDebt) }} <span>so'm</span></p>
          </div>
          <div class="ldg-card ldg-card--paid">
            <p class="ldg-card__lbl">Jami to'langan</p>
            <p class="ldg-card__val">{{ fmt(ledgerStats.totalPaid) }} <span>so'm</span></p>
          </div>
          <div class="ldg-card" :class="Number(ledgerSupplier.balance) < 0 ? 'ldg-card--owe' : 'ldg-card--ok'">
            <p class="ldg-card__lbl">Joriy balans</p>
            <p class="ldg-card__val" v-if="Number(ledgerSupplier.balance) < 0">
              −{{ fmt(Math.abs(Number(ledgerSupplier.balance))) }} <span>so'm qarz</span>
            </p>
            <p class="ldg-card__val" v-else>
              {{ fmt(Number(ledgerSupplier.balance)) }} <span>so'm</span>
            </p>
          </div>
        </div>

        <!-- Body -->
        <div class="ldg-panel__body">
          <div v-if="ledgerLoading" class="ldg-loading">
            <div v-for="i in 4" :key="i" class="skeleton ldg-skel"/>
          </div>
          <div v-else-if="ledgerErr" class="ldg-err">{{ ledgerErr }}</div>
          <div v-else-if="!ledgerEntries.length" class="ldg-empty">
            <AppIcon name="inbox" :size="32" :stroke-width="1.2"/>
            <p>Hali hech qanday operatsiya yo'q</p>
          </div>
          <table v-else class="ldg-tbl">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Izoh</th>
                <th>To'lov turi</th>
                <th class="ta-r">Kirim (qarz)</th>
                <th class="ta-r">To'lov</th>
                <th class="ta-r">Qoldiq</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in ledgerEntries"
                :key="e.id"
                class="ldg-tbl__row"
                :class="{
                  'ldg-row--purchase': e.type === 'purchase',
                  'ldg-row--payment':  e.type === 'payment',
                }"
              >
                <td class="ldg-tbl__date">{{ fmtDate(e.date) }}</td>
                <td>
                  <div class="ldg-desc">
                    <span
                      class="ldg-type-badge"
                      :class="e.type === 'purchase' ? 'ldg-type-badge--buy' : 'ldg-type-badge--pay'"
                    >
                      {{ e.type === 'purchase' ? 'Kirim' : "To'lov" }}
                    </span>
                    <span class="ldg-desc-text">{{ e.description }}</span>
                  </div>
                  <!-- USD ham ko'rsatamiz kirim uchun -->
                  <span v-if="e.type === 'purchase' && e.total_usd > 0" class="ldg-usd">
                    ${{ fmtD(e.total_usd) }}
                    <span class="ldg-rate">(1$={{ fmt(e.exchange_rate) }})</span>
                  </span>
                </td>
                <td>
                  <span class="ldg-ptype">{{ e.payment_type || '—' }}</span>
                </td>
                <td class="ta-r">
                  <span v-if="e.debit > 0" class="ldg-debit">{{ fmt(e.debit) }}</span>
                  <span v-else class="ldg-zero">—</span>
                </td>
                <td class="ta-r">
                  <span v-if="e.credit > 0" class="ldg-credit">{{ fmt(e.credit) }}</span>
                  <span v-else class="ldg-zero">—</span>
                </td>
                <td class="ta-r">
                  <span
                    class="ldg-balance"
                    :class="e.running_balance < 0 ? 'ldg-balance--neg' : 'ldg-balance--pos'"
                  >
                    {{ e.running_balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(e.running_balance)) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Mobile card list (shown only ≤768px) -->
          <div v-if="ledgerEntries.length" class="ldg-cards">
            <div
              v-for="(e, i) in ledgerEntries"
              :key="e.id"
              class="ldg-ecard"
              :style="{ '--i': i }"
              :class="{
                'ldg-ecard--purchase': e.type === 'purchase',
                'ldg-ecard--payment':  e.type === 'payment',
              }"
            >
              <div class="ldg-ecard__top">
                <span
                  class="ldg-type-badge"
                  :class="e.type === 'purchase' ? 'ldg-type-badge--buy' : 'ldg-type-badge--pay'"
                >
                  {{ e.type === 'purchase' ? 'Kirim' : "To'lov" }}
                </span>
                <span class="ldg-ecard__date">{{ fmtDate(e.date) }}</span>
              </div>
              <p class="ldg-ecard__desc">{{ e.description }}</p>
              <span v-if="e.type === 'purchase' && e.total_usd > 0" class="ldg-usd">
                ${{ fmtD(e.total_usd) }}
                <span class="ldg-rate">(1$={{ fmt(e.exchange_rate) }})</span>
              </span>
              <div class="ldg-ecard__rows">
                <div class="ldg-ecard__row">
                  <span class="ldg-ecard__lbl">To'lov turi</span>
                  <span class="ldg-ptype">{{ e.payment_type || '—' }}</span>
                </div>
                <div class="ldg-ecard__row">
                  <span class="ldg-ecard__lbl">Kirim (qarz)</span>
                  <span v-if="e.debit > 0" class="ldg-debit">{{ fmt(e.debit) }}</span>
                  <span v-else class="ldg-zero">—</span>
                </div>
                <div class="ldg-ecard__row">
                  <span class="ldg-ecard__lbl">To'lov</span>
                  <span v-if="e.credit > 0" class="ldg-credit">{{ fmt(e.credit) }}</span>
                  <span v-else class="ldg-zero">—</span>
                </div>
                <div class="ldg-ecard__row">
                  <span class="ldg-ecard__lbl">Qoldiq</span>
                  <span
                    class="ldg-balance"
                    :class="e.running_balance < 0 ? 'ldg-balance--neg' : 'ldg-balance--pos'"
                  >
                    {{ e.running_balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(e.running_balance)) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ══ ADD/EDIT FORM MODAL ═══════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showForm" class="yv-overlay" @click.self="closeForm">
      <div class="yv-modal">
        <div class="yv-modal__hdr">
          <span class="yv-modal__title">
            <AppIcon name="truck" :size="15" :stroke-width="2"/>
            {{ editingId ? 'Tahrirlash' : "Yetkazuvchi qo'shish" }}
          </span>
          <button class="yv-modal__close" @click="closeForm">
            <AppIcon name="x" :size="14" :stroke-width="2.5"/>
          </button>
        </div>
        <div class="yv-modal__body">
          <div class="yv-field">
            <label class="yv-lbl">Kod</label>
            <input v-model="form.code" class="yv-inp" placeholder="Ixtiyoriy..."/>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">Nomi <span class="yv-req">*</span></label>
            <input v-model="form.name" class="yv-inp" placeholder="Kompaniya yoki ism..." @keyup.enter="save"/>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">Telefon</label>
            <input v-model="form.phone" class="yv-inp" placeholder="+998 ..."/>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">Manzil</label>
            <input v-model="form.address" class="yv-inp" placeholder="Shahar, ko'cha..."/>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">Izoh</label>
            <textarea v-model="form.comment" class="yv-inp yv-inp--ta" placeholder="Ixtiyoriy..." rows="2"/>
          </div>
          <label class="yv-check">
            <input v-model="form.active" type="checkbox"/>
            Faol yetkazuvchi
          </label>
          <div v-if="saveErr" class="yv-err-msg">{{ saveErr }}</div>
        </div>
        <div class="yv-modal__foot">
          <button class="yv-cancel-btn" @click="closeForm">Bekor</button>
          <button class="yv-save-btn" :disabled="saving" @click="save">
            <AppIcon name="check" :size="14" :stroke-width="2.5"/>
            {{ saving ? 'Saqlanmoqda...' : 'Saqlash' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ══ PAY MODAL ════════════════════════════════════════════════ -->
  <Teleport to="body">
    <div v-if="showPay" class="yv-overlay" @click.self="closePay">
      <div class="yv-modal">
        <div class="yv-modal__hdr">
          <span class="yv-modal__title">
            <AppIcon name="credit-card" :size="15" :stroke-width="2"/>
            Yetkazuvchiga to'lov
          </span>
          <button class="yv-modal__close" @click="closePay">
            <AppIcon name="x" :size="14" :stroke-width="2.5"/>
          </button>
        </div>
        <div v-if="payTarget" class="yv-modal__body">
          <div class="pay-info-card">
            <div class="pay-info-row">
              <span class="yv-lbl">Yetkazuvchi</span>
              <strong class="pay-supplier-name">{{ payTarget.name }}</strong>
            </div>
            <div class="pay-info-row">
              <span class="yv-lbl">Joriy qarz</span>
              <strong class="pay-debt-val">{{ fmt(Math.abs(Math.min(0, Number(payTarget.balance)))) }} so'm</strong>
            </div>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">To'lov summasi <span class="yv-req">*</span></label>
            <div class="pay-amount-wrap">
              <input v-model.number="payAmount" type="number" class="yv-inp pay-amount-inp" placeholder="0" min="0"/>
              <span class="pay-amount-cur">so'm</span>
            </div>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">To'lov turi</label>
            <div class="pay-type-btns">
              <button
                v-for="p in PAYMENT_TYPES" :key="p"
                class="pay-type-btn"
                :class="{ active: payType === p }"
                @click="payType = p"
              >{{ p }}</button>
            </div>
          </div>
          <div class="yv-field">
            <label class="yv-lbl">Izoh</label>
            <input v-model="payComment" class="yv-inp" placeholder="Ixtiyoriy..."/>
          </div>
          <div v-if="payErr" class="yv-err-msg">{{ payErr }}</div>
        </div>
        <div class="yv-modal__foot">
          <button class="yv-cancel-btn" @click="closePay">Bekor</button>
          <button class="yv-save-btn yv-save-btn--pay" :disabled="payLoading" @click="submitPay">
            <AppIcon name="check-circle" :size="14" :stroke-width="2.5"/>
            {{ payLoading ? 'Amalga oshirilmoqda...' : "To'lovni amalga oshirish" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

</div>
</template>

<style scoped>
.yv { display: flex; flex-direction: column; height: calc(100vh - var(--header-h)); overflow: hidden; }

/* ── Topbar ─────────────────────────────────────────────────────── */
.yv__topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; gap: 12px; }
.yv__topbar-l { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.yv__title { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; white-space: nowrap; }
.yv__search { position: relative; display: flex; align-items: center; max-width: 260px; flex: 1; }
.yv__search-ico { position: absolute; left: 11px; color: var(--color-text-3); pointer-events: none; }
.yv__search-inp { width: 100%; height: 36px; padding: 0 12px 0 32px; border: 1.5px solid var(--color-border); border-radius: var(--r-lg); font-size: 13px; font-family: inherit; color: var(--color-text); background: var(--color-surface); outline: none; transition: border-color var(--t-base); }
.yv__search-inp:focus { border-color: var(--indigo-400); }
.yv__filter-sel { height: 36px; padding: 0 10px; border: 1.5px solid var(--color-border); border-radius: var(--r-md); font-size: 12.5px; font-family: inherit; color: var(--color-text); background: var(--color-surface); outline: none; cursor: pointer; }
.yv__add-btn { display: flex; align-items: center; gap: 7px; padding: 0 18px; height: 38px; border-radius: var(--r-lg); background: linear-gradient(135deg, #fb923c, #f97316); color: white; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; flex-shrink: 0; box-shadow: 0 4px 12px rgba(251,146,60,0.3); transition: opacity var(--t-base), transform var(--t-base); }
.yv__add-btn:hover { opacity: 0.9; transform: translateY(-1px); }
.yv__add-btn--sm { padding: 0 14px; height: 34px; font-size: 12px; margin-top: 4px; }

/* ── Stats ──────────────────────────────────────────────────────── */
.yv__stats { display: flex; gap: 12px; padding: 14px 24px; flex-shrink: 0; }
.ys { display: flex; align-items: center; gap: 12px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-lg); padding: 12px 18px; box-shadow: var(--shadow-xs); }
.ys__ico { width: 36px; height: 36px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ys__ico--orange { background: #fff7ed; color: #f97316; }
.ys__ico--rose   { background: var(--rose-50); color: var(--rose-500); }
.ys__ico--amber  { background: var(--amber-50); color: var(--amber-600); }
.ys__val { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.04em; line-height: 1.1; }
.ys__val--debt { color: var(--rose-600); }
.ys__cur { font-size: 12px; font-weight: 500; color: var(--color-text-3); }
.ys__lbl { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }

/* ── Error ──────────────────────────────────────────────────────── */
.yv__err { display: flex; align-items: center; gap: 8px; margin: 0 24px 10px; padding: 8px 12px; background: var(--rose-50); border: 1px solid var(--rose-100); border-radius: var(--r-md); font-size: 12px; color: var(--rose-600); flex-shrink: 0; }
.yv__err-retry { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--rose-600); cursor: pointer; text-decoration: underline; font-family: inherit; }

/* ── Table ──────────────────────────────────────────────────────── */
.yv__table-wrap { flex: 1; overflow-y: auto; padding: 0 24px 24px; }
.yv__loading { display: flex; flex-direction: column; gap: 8px; padding: 16px 0; }
.yv__skel { height: 50px; border-radius: var(--r-md); }
.yv__empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px; color: var(--color-text-3); font-size: 13px; }
.ytbl { width: 100%; border-collapse: collapse; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
.ytbl thead th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); background: var(--slate-50); border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
.ytbl__row { cursor: pointer; transition: background var(--t-fast); border-bottom: 1px solid var(--color-border-sub); }
.ytbl__row:last-child { border-bottom: none; }
.ytbl__row:hover td { background: #fff8f2; }
.ytbl__row td { padding: 11px 12px; font-size: 13px; vertical-align: middle; }
.ytbl__name  { font-weight: 600; color: var(--color-text); }
.ytbl__phone { color: var(--color-text-2); font-size: 12.5px; }
.ytbl__addr  { color: var(--color-text-3); font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.y-code { font-family: monospace; font-size: 12px; background: var(--slate-100); padding: 2px 6px; border-radius: var(--r-xs); color: var(--color-text-2); }
.y-bal { font-weight: 700; font-size: 13px; }
.y-bal--debt   { color: var(--rose-600); }
.y-bal--credit { color: var(--emerald-600); }
.y-bal--zero   { color: var(--color-text-3); }
.y-status { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 99px; }
.y-status--ok  { background: var(--emerald-50); color: var(--emerald-700); border: 1px solid var(--emerald-100); }
.y-status--off { background: var(--slate-100);  color: var(--color-text-3); border: 1px solid var(--color-border); }
.ytbl__acts { display: flex; gap: 3px; }
.ytbl__act { width: 28px; height: 28px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--t-fast); color: var(--color-text-3); }
.ytbl__act--pay:hover  { background: var(--emerald-50); color: var(--emerald-600); }
.ytbl__act--hist:hover { background: var(--indigo-50);  color: var(--indigo-500); }
.ytbl__act--edit:hover { background: var(--amber-50);   color: var(--amber-600); }
.ytbl__act--del:hover  { background: var(--rose-50);    color: var(--rose-500); }
.ta-r { text-align: right; }

/* ── Ledger Panel ───────────────────────────────────────────────── */
.ldg-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(15,23,42,0.4); display: flex; align-items: stretch; justify-content: flex-end; }
.ldg-panel { width: 780px; max-width: 95vw; background: white; display: flex; flex-direction: column; box-shadow: -8px 0 40px rgba(0,0,0,0.15); animation: slide-in 0.22s ease; }
@keyframes slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }

.ldg-panel__hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; background: white; }
.ldg-panel__hdr-l { display: flex; align-items: center; gap: 12px; }
.ldg-panel__ico { width: 40px; height: 40px; border-radius: var(--r-md); background: linear-gradient(135deg, #fb923c, #f97316); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
.ldg-panel__title { font-size: 16px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.ldg-panel__sub { font-size: 11.5px; color: var(--color-text-3); margin-top: 1px; }
.ldg-panel__hdr-r { display: flex; align-items: center; gap: 8px; }
.ldg-pay-btn { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: var(--r-md); background: linear-gradient(135deg, var(--emerald-500), var(--cyan-500)); color: white; font-size: 12.5px; font-weight: 700; font-family: inherit; cursor: pointer; transition: opacity var(--t-base); box-shadow: 0 3px 10px rgba(16,185,129,0.25); }
.ldg-pay-btn:hover { opacity: 0.88; }
.ldg-panel__close { width: 32px; height: 32px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; color: var(--color-text-3); cursor: pointer; transition: background var(--t-fast); }
.ldg-panel__close:hover { background: var(--rose-50); color: var(--rose-500); }

/* Summary cards */
.ldg-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; background: #fafbff; }
.ldg-card { padding: 12px 16px; border-radius: var(--r-lg); border: 1.5px solid transparent; }
.ldg-card--debt { background: #fff8f2; border-color: #fed7aa; }
.ldg-card--paid { background: #f0fdf4; border-color: #bbf7d0; }
.ldg-card--owe  { background: var(--rose-50); border-color: var(--rose-200); }
.ldg-card--ok   { background: var(--emerald-50); border-color: var(--emerald-200); }
.ldg-card__lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); margin-bottom: 5px; }
.ldg-card__val { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }
.ldg-card--debt .ldg-card__val { color: #ea580c; }
.ldg-card--paid .ldg-card__val { color: var(--emerald-700); }
.ldg-card--owe  .ldg-card__val { color: var(--rose-600); }
.ldg-card--ok   .ldg-card__val { color: var(--emerald-700); }
.ldg-card__val span { font-size: 12px; font-weight: 500; color: var(--color-text-3); }

/* Ledger table */
.ldg-panel__body { flex: 1; overflow-y: auto; }
.ldg-loading { display: flex; flex-direction: column; gap: 8px; padding: 20px; }
.ldg-skel { height: 48px; border-radius: var(--r-md); }
.ldg-err { padding: 24px; text-align: center; color: var(--rose-500); font-size: 13px; }
.ldg-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px; color: var(--color-text-3); font-size: 13px; }
.ldg-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ldg-tbl thead th { padding: 10px 14px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); background: var(--slate-50); border-bottom: 1px solid var(--color-border); text-align: left; position: sticky; top: 0; z-index: 2; white-space: nowrap; }
.ldg-tbl__row { border-bottom: 1px solid var(--color-border-sub); transition: background var(--t-fast); }
.ldg-tbl__row:last-child { border-bottom: none; }
.ldg-row--purchase:hover { background: #fff8f2; }
.ldg-row--payment:hover  { background: #f0fdf4; }
.ldg-tbl__row td { padding: 10px 14px; vertical-align: middle; }
.ldg-tbl__date { color: var(--color-text-2); white-space: nowrap; font-size: 12px; }
.ldg-desc { display: flex; align-items: center; gap: 7px; }
.ldg-desc-text { font-weight: 500; color: var(--color-text); }
.ldg-usd { display: block; font-size: 11px; color: var(--emerald-600); font-weight: 600; margin-top: 2px; }
.ldg-rate { color: var(--color-text-3); font-weight: 400; }
.ldg-type-badge { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
.ldg-type-badge--buy { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; }
.ldg-type-badge--pay { background: var(--emerald-50); color: var(--emerald-700); border: 1px solid var(--emerald-100); }
.ldg-ptype { font-size: 11.5px; color: var(--color-text-2); }
.ldg-debit  { font-weight: 700; color: var(--rose-600); font-size: 13px; }
.ldg-credit { font-weight: 700; color: var(--emerald-600); font-size: 13px; }
.ldg-zero   { color: var(--color-text-3); }
.ldg-balance { font-size: 12.5px; font-weight: 800; padding: 2px 8px; border-radius: var(--r-sm); }
.ldg-balance--neg { background: var(--rose-50); color: var(--rose-600); }
.ldg-balance--pos { background: var(--emerald-50); color: var(--emerald-700); }

/* ── Modals shared ──────────────────────────────────────────────── */
.yv-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; }
.yv-modal { background: white; border-radius: var(--r-lg); box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 400px; display: flex; flex-direction: column; overflow: hidden; }
.yv-modal__hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--color-border); background: var(--slate-50); }
.yv-modal__title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; color: var(--color-text); }
.yv-modal__close { width: 28px; height: 28px; border-radius: var(--r-sm); display: flex; align-items: center; justify-content: center; color: var(--color-text-3); cursor: pointer; transition: background var(--t-fast); }
.yv-modal__close:hover { background: var(--rose-50); color: var(--rose-500); }
.yv-modal__body { padding: 16px; display: flex; flex-direction: column; gap: 11px; }
.yv-field { display: flex; flex-direction: column; gap: 4px; }
.yv-lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); }
.yv-req { color: var(--rose-500); }
.yv-inp { height: 36px; padding: 0 10px; border: 1.5px solid var(--color-border); border-radius: var(--r-md); font-size: 13px; font-family: inherit; outline: none; transition: border-color var(--t-base); width: 100%; box-sizing: border-box; }
.yv-inp:focus { border-color: var(--indigo-400); }
.yv-inp--ta { height: auto; padding: 8px 10px; resize: none; }
.yv-inp--sel { cursor: pointer; }
.yv-check { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text); cursor: pointer; }
.yv-check input { width: 15px; height: 15px; cursor: pointer; accent-color: var(--indigo-500); }
.yv-err-msg { font-size: 12px; color: var(--rose-600); background: var(--rose-50); padding: 7px 10px; border-radius: var(--r-sm); border: 1px solid var(--rose-100); }
.yv-modal__foot { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--color-border); justify-content: flex-end; }
.yv-cancel-btn { height: 36px; padding: 0 16px; border-radius: var(--r-md); border: 1.5px solid var(--color-border); color: var(--color-text-2); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; }
.yv-cancel-btn:hover { background: var(--slate-50); }
.yv-save-btn { display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 18px; border-radius: var(--r-md); background: linear-gradient(135deg, #fb923c, #f97316); color: white; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; transition: opacity var(--t-base); box-shadow: 0 3px 10px rgba(251,146,60,0.25); }
.yv-save-btn--pay { background: linear-gradient(135deg, var(--emerald-500), var(--cyan-500)); box-shadow: 0 3px 10px rgba(16,185,129,0.25); }
.yv-save-btn:hover:not(:disabled) { opacity: 0.88; }
.yv-save-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* Pay modal specific */
.pay-info-card { background: var(--slate-50); border: 1px solid var(--color-border); border-radius: var(--r-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.pay-info-row { display: flex; align-items: center; justify-content: space-between; }
.pay-supplier-name { font-size: 14px; font-weight: 700; color: var(--color-text); }
.pay-debt-val { font-size: 15px; font-weight: 800; color: var(--rose-600); }
.pay-amount-wrap { display: flex; align-items: center; gap: 8px; }
.pay-amount-inp { flex: 1; font-size: 16px; font-weight: 700; text-align: right; }
.pay-amount-cur { font-size: 13px; font-weight: 600; color: var(--color-text-3); white-space: nowrap; }
.pay-type-btns { display: flex; gap: 6px; }
.pay-type-btn { flex: 1; height: 34px; border-radius: var(--r-md); border: 1.5px solid var(--color-border); font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer; color: var(--color-text-2); transition: all var(--t-fast); }
.pay-type-btn.active { background: var(--indigo-500); color: white; border-color: var(--indigo-500); }
.pay-type-btn:not(.active):hover { background: var(--indigo-50); border-color: var(--indigo-200); color: var(--indigo-600); }

/* ── Mobile card list (hidden on desktop) ──────────────────────────── */
.ycards { display: none; }
.ldg-cards { display: none; }

/* Press feedback shared */
.ytbl__row:active,
.ycard:active,
.ys:active { transform: scale(0.99); }

@keyframes yv-fade-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ════════════════════════════════════════════════════════════════════
   ≤768px — tablet / large phone
   ════════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {
  .yv { height: auto; overflow: visible; }

  /* Topbar: stack, sticky, full-width tappable controls */
  .yv__topbar {
    flex-wrap: wrap;
    padding: 12px 14px 12px;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--color-surface);
  }
  .yv__topbar-l { flex-wrap: wrap; width: 100%; gap: 8px; }
  .yv__title { width: 100%; font-size: 17px; }
  .yv__search { max-width: none; flex: 1 1 100%; order: 2; }
  .yv__search-inp { height: 44px; font-size: 14px; border-radius: var(--r-lg); }
  .yv__filter-sel { flex: 1; height: 44px; font-size: 13px; order: 3; }
  .yv__add-btn { flex: 1; height: 44px; justify-content: center; order: 4; }

  /* Stats: wrap to 2-col grid, scrollable if needed */
  .yv__stats { flex-wrap: wrap; padding: 10px 14px; gap: 10px; }
  .ys { flex: 1 1 calc(50% - 5px); min-width: 0; padding: 10px 12px; }
  .ys__val { font-size: 16px; }

  .yv__err { margin: 0 14px 10px; }

  /* Table wrap padding */
  .yv__table-wrap { padding: 0 14px 14px; overflow-x: hidden; }

  /* Hide desktop table, show card list */
  .ytbl { display: none; }
  .ycards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ycard {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-sm);
    padding: 14px;
    cursor: pointer;
    transition: transform var(--t-fast), box-shadow var(--t-base);
    animation: yv-fade-up 0.32s var(--ease-spring) both;
    animation-delay: calc(var(--i, 0) * 45ms);
  }
  .ycard:active { transform: scale(0.98); box-shadow: var(--shadow-xs); }
  .ycard__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  .ycard__id { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ycard__name { font-size: 14.5px; font-weight: 700; color: var(--color-text); word-break: break-word; }
  .ycard__rows { display: flex; flex-direction: column; gap: 7px; padding: 10px 0; border-top: 1px solid var(--color-border-sub); border-bottom: 1px solid var(--color-border-sub); }
  .ycard__row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; }
  .ycard__lbl { color: var(--color-text-3); font-weight: 600; flex-shrink: 0; }
  .ycard__val { color: var(--color-text-2); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ycard__acts { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 7px; margin-top: 10px; }
  .ycard__act {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 38px; border-radius: var(--r-md); font-size: 12px; font-weight: 700;
    font-family: inherit; cursor: pointer; color: var(--color-text-2);
    background: var(--slate-50); border: 1px solid var(--color-border);
    transition: transform var(--t-fast), background var(--t-fast);
  }
  .ycard__act:active { transform: scale(0.94); }
  .ycard__act--pay  { background: var(--emerald-50); color: var(--emerald-700); border-color: var(--emerald-100); }
  .ycard__act--hist { background: var(--indigo-50); color: var(--indigo-600); border-color: var(--indigo-100); }
  .ycard__act--edit { width: 38px; padding: 0; background: var(--amber-50); color: var(--amber-600); border-color: var(--amber-100); }
  .ycard__act--del  { width: 38px; padding: 0; background: var(--rose-50); color: var(--rose-500); border-color: var(--rose-100); }

  /* ── Ledger panel: near full-screen ───────────────────────────── */
  .ldg-overlay { align-items: flex-end; justify-content: stretch; }
  .ldg-panel {
    width: 100%; max-width: 100vw; height: 94vh; max-height: 94vh;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    animation: ldg-sheet-in 0.3s var(--ease-spring);
  }
  @keyframes ldg-sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .ldg-panel__hdr { padding: 14px 16px; flex-wrap: wrap; gap: 10px; }
  .ldg-panel__hdr-r { width: 100%; justify-content: space-between; }
  .ldg-pay-btn { flex: 1; justify-content: center; height: 40px; }
  .ldg-panel__close { width: 40px; height: 40px; flex-shrink: 0; }

  .ldg-summary { grid-template-columns: 1fr; gap: 8px; padding: 12px 16px; }
  .ldg-card { padding: 10px 14px; }

  .ldg-tbl { display: none; }
  .ldg-cards { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; }
  .ldg-ecard {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--r-lg); box-shadow: var(--shadow-xs); padding: 12px 14px;
    animation: yv-fade-up 0.3s var(--ease-spring) both;
    animation-delay: calc(var(--i, 0) * 40ms);
  }
  .ldg-ecard--purchase { border-left: 3px solid #fdba74; }
  .ldg-ecard--payment  { border-left: 3px solid var(--emerald-500); }
  .ldg-ecard__top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .ldg-ecard__date { font-size: 11.5px; color: var(--color-text-3); }
  .ldg-ecard__desc { font-size: 13px; font-weight: 600; color: var(--color-text); margin-bottom: 6px; word-break: break-word; }
  .ldg-ecard__rows { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--color-border-sub); }
  .ldg-ecard__row { display: flex; align-items: center; justify-content: space-between; font-size: 12.5px; }
  .ldg-ecard__lbl { color: var(--color-text-3); font-weight: 600; }

  /* ── Add/Edit + Pay modals: near full-screen sheet ────────────── */
  .yv-overlay { align-items: flex-end; padding: 0; }
  .yv-modal {
    width: 100%; max-width: 100vw; max-height: 92vh;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    animation: ldg-sheet-in 0.3s var(--ease-spring);
  }
  .yv-modal__body { max-height: 65vh; overflow-y: auto; padding: 16px; }
  .yv-inp { height: 44px; font-size: 14px; }
  .yv-modal__foot { padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); }
  .yv-cancel-btn, .yv-save-btn { height: 44px; flex: 1; justify-content: center; }
  .pay-type-btn { height: 40px; }
  .pay-amount-inp { font-size: 17px; }

  /* Tap feedback */
  .yv__add-btn:active,
  .yv-save-btn:active,
  .yv-cancel-btn:active,
  .ldg-pay-btn:active,
  .pay-type-btn:active { transform: scale(0.96); }
}

/* ════════════════════════════════════════════════════════════════════
   ≤480px — small phones
   ════════════════════════════════════════════════════════════════════ */
@media (max-width: 480px) {
  .yv__topbar { padding: 10px 12px; }
  .yv__title { font-size: 16px; }
  .yv__stats { padding: 8px 12px; gap: 8px; }
  .ys { flex: 1 1 100%; }
  .yv__table-wrap { padding: 0 10px 12px; }
  .ycard { padding: 12px; }
  .ycard__acts { grid-template-columns: 1fr 1fr; }
  .ycard__act--edit, .ycard__act--del { width: auto; }

  .ldg-panel { height: 96vh; max-height: 96vh; }
  .ldg-panel__hdr { padding: 12px; }
  .ldg-panel__title { font-size: 14.5px; }
  .ldg-summary { padding: 10px 12px; }
  .ldg-cards { padding: 12px; }

  .yv-modal__hdr { padding: 12px; }
  .yv-modal__body { padding: 12px; }
  .yv-modal__foot { flex-direction: column-reverse; }
  .pay-type-btns { flex-wrap: wrap; }
  .pay-type-btn { flex: 1 1 calc(50% - 3px); }
}
</style>
