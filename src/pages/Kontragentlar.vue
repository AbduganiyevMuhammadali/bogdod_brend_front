<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { clientsApi } from '@/api/clients.js'

// ── State ─────────────────────────────────────────────────────────
const clients   = ref([])
const loading   = ref(false)
const search    = ref('')
const filterTab = ref('all')

// ── Load ──────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const res = await clientsApi.getAll({ limit: 500 })
    clients.value = res.data
  } catch { clients.value = [] }
  finally { loading.value = false }
}
onMounted(load)

// ── Computed ──────────────────────────────────────────────────────
const filtered = computed(() => {
  let list = clients.value
  if (filterTab.value === 'active')  list = list.filter(c => c.active)
  if (filterTab.value === 'debtors') list = list.filter(c => c.balance < 0)
  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.phone.includes(q) ||
    c.code.toLowerCase().includes(q)
  )
  return list
})

const stats = computed(() => ({
  total:    clients.value.length,
  active:   clients.value.filter(c => c.active).length,
  debtors:  clients.value.filter(c => c.balance < 0).length,
  totalDebt: clients.value.reduce((s, c) => s + (c.balance < 0 ? Math.abs(c.balance) : 0), 0),
}))

// ── Client form modal ─────────────────────────────────────────────
const showForm  = ref(false)
const editing   = ref(null)
const saving    = ref(false)
const form = reactive({ name: '', phone: '', address: '', comment: '', active: true })

function openAdd() {
  Object.assign(form, { name: '', phone: '', address: '', comment: '', active: true })
  editing.value = null
  showForm.value = true
}

function openEdit(c) {
  Object.assign(form, { name: c.name, phone: c.phone, address: c.address, comment: c.comment, active: c.active })
  editing.value = c
  showForm.value = true
}

async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    if (editing.value) {
      const updated = await clientsApi.update(editing.value.id, form)
      const idx = clients.value.findIndex(c => c.id === editing.value.id)
      if (idx !== -1) clients.value[idx] = updated
    } else {
      const created = await clientsApi.create(form)
      clients.value.unshift(created)
    }
    showForm.value = false
  } catch { /* handled silently */ }
  finally { saving.value = false }
}

async function remove(client) {
  if (!confirm(`"${client.name}" ni o'chirishni tasdiqlaysizmi?`)) return
  try {
    await clientsApi.remove(client.id)
    clients.value = clients.value.filter(c => c.id !== client.id)
  } catch { /* handled silently */ }
}

// ── Debt payment modal ────────────────────────────────────────────
const showDebt  = ref(false)
const debtClient = ref(null)
const debtPaying = ref(false)
const debtForm  = reactive({ amount: '', payment_type: 'Naqd' })

const PAY_TYPES = ['Naqd', 'Karta', "O'tkazma"]

function openDebtModal(client) {
  debtClient.value = client
  debtForm.amount = String(Math.abs(client.balance))
  debtForm.payment_type = 'Naqd'
  showDebt.value = true
}

async function submitDebt() {
  const amt = Number(debtForm.amount)
  if (!amt || amt <= 0) return
  debtPaying.value = true
  try {
    const res = await clientsApi.payDebt({
      client_id:    debtClient.value.id,
      amount:       amt,
      payment_type: debtForm.payment_type,
      description:  `${debtClient.value.name} — qarz to'lovi`,
    })
    const idx = clients.value.findIndex(c => c.id === debtClient.value.id)
    if (idx !== -1) {
      clients.value[idx] = { ...clients.value[idx], balance: Number(res.client.balance) }
    }
    // refresh ledger if open for same client
    if (showLedger.value && ledgerClient.value?.id === debtClient.value.id) {
      openLedger(clients.value[clients.value.findIndex(c => c.id === debtClient.value.id)])
    }
    showDebt.value = false
  } catch { /* handled silently */ }
  finally { debtPaying.value = false }
}

const remaining = computed(() => {
  const debt = Math.abs(debtClient.value?.balance ?? 0)
  const paid = Number(debtForm.amount) || 0
  return paid - debt
})

// ── Ledger panel ──────────────────────────────────────────────────
const showLedger     = ref(false)
const ledgerClient   = ref(null)
const ledgerEntries  = ref([])
const ledgerSummary  = ref(null)
const ledgerLoading  = ref(false)
const ledgerErr      = ref('')

async function openLedger(c) {
  ledgerClient.value  = c
  ledgerEntries.value = []
  ledgerSummary.value = null
  ledgerErr.value     = ''
  showLedger.value    = true
  ledgerLoading.value = true
  try {
    const data = await clientsApi.getLedger(c.id)
    ledgerClient.value  = data.client
    ledgerEntries.value = data.entries
    ledgerSummary.value = { totalSales: data.totalSales, totalPaid: data.totalPaid, totalDebt: data.totalDebt, balance: data.balance }
    // sync balance in list
    const idx = clients.value.findIndex(x => x.id === c.id)
    if (idx !== -1) clients.value[idx] = { ...clients.value[idx], balance: data.balance }
  } catch (e) {
    ledgerErr.value = e.response?.data?.message ?? "Yuklab bo'lmadi"
  } finally { ledgerLoading.value = false }
}
function closeLedger() { showLedger.value = false; ledgerClient.value = null }

// ── Helpers ───────────────────────────────────────────────────────
function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.abs(Number(v) || 0)) }
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

const TABS = [
  { key: 'all',     label: 'Barchasi'   },
  { key: 'active',  label: 'Faollar'    },
  { key: 'debtors', label: 'Qarzdorlar' },
]
</script>

<template>
  <div class="page">

    <!-- ── Top bar ───────────────────────────────────────────────── -->
    <div class="page__topbar">
      <div class="page__topbar-l">
        <h2 class="page__title">Mijozlar</h2>
        <div class="page__search">
          <AppIcon name="search" :size="13" class="page__search-ico" />
          <input v-model="search" type="text" class="page__search-inp" placeholder="Ism, telefon, kod..." />
          <button v-if="search" class="page__search-clr" @click="search = ''">
            <AppIcon name="x" :size="11" :stroke-width="2.5" />
          </button>
        </div>
      </div>
      <button class="page__add-btn" @click="openAdd">
        <AppIcon name="user-plus" :size="15" :stroke-width="2.5" />
        Qo'shish
      </button>
    </div>

    <!-- ── Stats ─────────────────────────────────────────────────── -->
    <div class="page__stats">
      <div class="kcard">
        <div class="kcard__ico kcard__ico--indigo"><AppIcon name="users" :size="15" /></div>
        <div><p class="kcard__val">{{ stats.total }}</p><p class="kcard__lbl">Jami mijoz</p></div>
      </div>
      <div class="kcard">
        <div class="kcard__ico kcard__ico--green"><AppIcon name="user-check" :size="15" /></div>
        <div><p class="kcard__val">{{ stats.active }}</p><p class="kcard__lbl">Faol mijozlar</p></div>
      </div>
      <div class="kcard">
        <div class="kcard__ico kcard__ico--amber"><AppIcon name="alert-circle" :size="15" /></div>
        <div><p class="kcard__val">{{ stats.debtors }}</p><p class="kcard__lbl">Qarzdorlar</p></div>
      </div>
      <div class="kcard">
        <div class="kcard__ico kcard__ico--red"><AppIcon name="trending-down" :size="15" /></div>
        <div>
          <p class="kcard__val kcard__val--red">{{ fmt(stats.totalDebt) }}</p>
          <p class="kcard__lbl">Umumiy qarz (so'm)</p>
        </div>
      </div>
    </div>

    <!-- ── Tabs ──────────────────────────────────────────────────── -->
    <div class="page__tabs">
      <button
        v-for="tab in TABS" :key="tab.key"
        class="page__tab" :class="{ on: filterTab === tab.key }"
        @click="filterTab = tab.key"
      >
        {{ tab.label }}
        <span class="page__tab-cnt">
          {{ tab.key === 'all' ? clients.length : tab.key === 'active' ? stats.active : stats.debtors }}
        </span>
      </button>
      <p class="tab-count">{{ filtered.length }} ta natija</p>
    </div>

    <!-- ── Table ─────────────────────────────────────────────────── -->
    <div class="page__table-wrap">
      <div v-if="loading" class="page__empty">
        <AppIcon name="loader" :size="28" :stroke-width="1.5" class="spin" />
        <p>Yuklanmoqda...</p>
      </div>

      <div v-else-if="filtered.length === 0" class="page__empty">
        <AppIcon name="users" :size="36" :stroke-width="1.2" />
        <p>Mijoz topilmadi</p>
        <button class="page__add-btn" @click="openAdd"><AppIcon name="plus" :size="14" /> Qo'shish</button>
      </div>

      <table v-else class="dtable">
        <thead>
          <tr>
            <th>Kod</th>
            <th>Ism</th>
            <th>Telefon</th>
            <th>Manzil</th>
            <th class="ta-r">Balans</th>
            <th class="ta-c">Holat</th>
            <th style="width:110px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in filtered" :key="c.id" class="dtable__row" @click="openLedger(c)">
            <td class="client-code">{{ c.code || '—' }}</td>
            <td>
              <div class="client-name">
                <div class="client-av">{{ c.name[0]?.toUpperCase() }}</div>
                <div>
                  <p class="client-nm">{{ c.name }}</p>
                  <p class="client-note">{{ c.comment || '' }}</p>
                </div>
              </div>
            </td>
            <td class="client-phone">{{ c.phone || '—' }}</td>
            <td class="client-addr">{{ c.address || '—' }}</td>
            <td class="ta-r">
              <span v-if="c.balance === 0"    class="balance balance--zero">0</span>
              <span v-else-if="c.balance > 0" class="balance balance--pos">+{{ fmt(c.balance) }} <em>so'm</em></span>
              <span v-else                    class="balance balance--neg">−{{ fmt(c.balance) }} <em>so'm</em></span>
            </td>
            <td class="ta-c">
              <span class="active-dot" :class="c.active ? 'active-dot--on' : 'active-dot--off'">
                {{ c.active ? 'Faol' : 'Faol emas' }}
              </span>
            </td>
            <td @click.stop>
              <div class="row-actions">
                <button v-if="c.balance < 0" class="row-act row-act--pay" title="Qarz to'lash" @click.stop="openDebtModal(c)">
                  <AppIcon name="dollar-sign" :size="13" />
                </button>
                <button class="row-act row-act--hist" title="Tarix" @click.stop="openLedger(c)">
                  <AppIcon name="clock" :size="13" />
                </button>
                <button class="row-act row-act--edit" title="Tahrirlash" @click.stop="openEdit(c)">
                  <AppIcon name="edit-2" :size="13" />
                </button>
                <button class="row-act row-act--del" title="O'chirish" @click.stop="remove(c)">
                  <AppIcon name="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- ── Mobile card list (≤768px) ─────────────────────────────── -->
      <div v-if="filtered.length" class="ctable-cards">
        <div
          v-for="(c, i) in filtered" :key="c.id"
          class="ccard" :style="{ animationDelay: Math.min(i, 10) * 0.035 + 's' }"
          @click="openLedger(c)"
        >
          <div class="ccard__top">
            <div class="client-av ccard__av">{{ c.name[0]?.toUpperCase() }}</div>
            <div class="ccard__id">
              <p class="client-nm">{{ c.name }}</p>
              <p class="ccard__meta">
                <span v-if="c.code">{{ c.code }}</span>
                <span v-if="c.code && c.phone">·</span>
                <span v-if="c.phone">{{ c.phone }}</span>
              </p>
            </div>
            <span class="active-dot" :class="c.active ? 'active-dot--on' : 'active-dot--off'">
              {{ c.active ? 'Faol' : "Faol emas" }}
            </span>
          </div>

          <p v-if="c.address" class="ccard__addr">
            <AppIcon name="map-pin" :size="11" /> {{ c.address }}
          </p>

          <div class="ccard__bal" :class="c.balance < 0 ? 'ccard__bal--neg' : c.balance > 0 ? 'ccard__bal--pos' : 'ccard__bal--zero'">
            <span class="ccard__bal-lbl">{{ c.balance < 0 ? "Qarzi bor" : c.balance > 0 ? 'Krediti bor' : 'Balans' }}</span>
            <span class="ccard__bal-val">
              <template v-if="c.balance === 0">0 so'm</template>
              <template v-else-if="c.balance > 0">+{{ fmt(c.balance) }} so'm</template>
              <template v-else>−{{ fmt(c.balance) }} so'm</template>
            </span>
          </div>

          <div class="ccard__actions" @click.stop>
            <button v-if="c.balance < 0" class="ccard__act ccard__act--pay" @click.stop="openDebtModal(c)">
              <AppIcon name="dollar-sign" :size="14" :stroke-width="2.5" /> Qarz to'lash
            </button>
            <button class="ccard__act" @click.stop="openLedger(c)">
              <AppIcon name="clock" :size="14" /> Tarix
            </button>
            <button class="ccard__act ccard__act--icon" @click.stop="openEdit(c)" title="Tahrirlash">
              <AppIcon name="edit-2" :size="14" />
            </button>
            <button class="ccard__act ccard__act--icon ccard__act--del" @click.stop="remove(c)" title="O'chirish">
              <AppIcon name="trash-2" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Mobile FAB: add client ──────────────────────────────────── -->
    <button class="fab" @click="openAdd" aria-label="Mijoz qo'shish">
      <AppIcon name="user-plus" :size="20" :stroke-width="2.5" />
    </button>

    <!-- ══ LEDGER PANEL ══════════════════════════════════════════════ -->
    <Teleport to="body">
      <div v-if="showLedger" class="ldg-overlay" @click.self="closeLedger">
        <div class="ldg-panel">

          <!-- Header -->
          <div class="ldg-panel__hdr">
            <div class="ldg-panel__hdr-l">
              <div class="ldg-panel__ico">
                <AppIcon name="user" :size="16" :stroke-width="2"/>
              </div>
              <div>
                <h3 class="ldg-panel__title">{{ ledgerClient?.name }}</h3>
                <p class="ldg-panel__sub">Oldi-berdi tarixi · {{ ledgerClient?.phone || ledgerClient?.code }}</p>
              </div>
            </div>
            <div class="ldg-panel__hdr-r">
              <button
                v-if="ledgerClient && Number(ledgerClient.balance) < 0"
                class="ldg-pay-btn"
                @click="openDebtModal(ledgerClient)"
              >
                <AppIcon name="dollar-sign" :size="13" :stroke-width="2.5"/>
                Qarz to'lash
              </button>
              <button class="ldg-panel__close" @click="closeLedger">
                <AppIcon name="x" :size="15" :stroke-width="2.5"/>
              </button>
            </div>
          </div>

          <!-- Summary cards -->
          <div v-if="ledgerSummary && !ledgerLoading" class="ldg-summary">
            <div class="ldg-card ldg-card--blue">
              <p class="ldg-card__lbl">Jami sotuv</p>
              <p class="ldg-card__val">{{ fmt(ledgerSummary.totalSales) }} <span>so'm</span></p>
            </div>
            <div class="ldg-card ldg-card--green">
              <p class="ldg-card__lbl">Jami to'langan</p>
              <p class="ldg-card__val">{{ fmt(ledgerSummary.totalPaid) }} <span>so'm</span></p>
            </div>
            <div class="ldg-card" :class="Number(ledgerSummary.balance) < 0 ? 'ldg-card--red' : 'ldg-card--ok'">
              <p class="ldg-card__lbl">Joriy balans</p>
              <p class="ldg-card__val" v-if="Number(ledgerSummary.balance) < 0">
                −{{ fmt(Math.abs(Number(ledgerSummary.balance))) }} <span>so'm qarz</span>
              </p>
              <p class="ldg-card__val" v-else>
                {{ fmt(Number(ledgerSummary.balance)) }} <span>so'm</span>
              </p>
            </div>
          </div>

          <!-- Body -->
          <div class="ldg-panel__body">
            <div v-if="ledgerLoading" class="ldg-loading">
              <div v-for="i in 5" :key="i" class="skeleton ldg-skel"/>
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
                  <th class="ta-r">Debet (sotuv)</th>
                  <th class="ta-r">Kredit (to'lov)</th>
                  <th class="ta-r">Qoldiq</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="e in ledgerEntries" :key="e.id"
                  class="ldg-tbl__row"
                  :class="{
                    'ldg-row--sale':    e.type === 'sale',
                    'ldg-row--payment': e.type === 'payment',
                    'ldg-row--cancelled': e.status === 'cancelled',
                  }"
                >
                  <td class="ldg-tbl__date">
                    <div>{{ fmtDate(e.date) }}</div>
                    <div class="ldg-time">{{ fmtTime(e.date) }}</div>
                  </td>
                  <td>
                    <div class="ldg-desc">
                      <span
                        class="ldg-type-badge"
                        :class="e.type === 'sale' ? 'ldg-type-badge--sale' : 'ldg-type-badge--pay'"
                      >
                        {{ e.type === 'sale' ? 'Sotuv' : "To'lov" }}
                      </span>
                      <span class="ldg-desc-text">{{ e.description }}</span>
                    </div>
                    <span v-if="e.status === 'cancelled'" class="ldg-cancelled-badge">Bekor qilingan</span>
                  </td>
                  <td><span class="ldg-ptype">{{ e.payment_type || '—' }}</span></td>
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
                      v-if="e.status !== 'cancelled'"
                      class="ldg-balance"
                      :class="e.running_balance < 0 ? 'ldg-balance--neg' : 'ldg-balance--pos'"
                    >
                      {{ e.running_balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(e.running_balance)) }}
                    </span>
                    <span v-else class="ldg-zero">—</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- ── Mobile ledger card list (≤768px) ──────────────────── -->
            <div class="ldg-cards">
              <div
                v-for="(e, i) in ledgerEntries" :key="e.id"
                class="ldg-ecard"
                :style="{ animationDelay: Math.min(i, 10) * 0.035 + 's' }"
                :class="{ 'ldg-ecard--cancelled': e.status === 'cancelled' }"
              >
                <div class="ldg-ecard__top">
                  <span
                    class="ldg-type-badge"
                    :class="e.type === 'sale' ? 'ldg-type-badge--sale' : 'ldg-type-badge--pay'"
                  >
                    {{ e.type === 'sale' ? 'Sotuv' : "To'lov" }}
                  </span>
                  <span class="ldg-ecard__date">{{ fmtDate(e.date) }} · {{ fmtTime(e.date) }}</span>
                </div>
                <p class="ldg-ecard__desc">{{ e.description }}</p>
                <span v-if="e.status === 'cancelled'" class="ldg-cancelled-badge">Bekor qilingan</span>
                <div class="ldg-ecard__row">
                  <span class="ldg-ecard__ptype">{{ e.payment_type || '—' }}</span>
                  <span v-if="e.debit > 0" class="ldg-debit">−{{ fmt(e.debit) }} so'm</span>
                  <span v-else-if="e.credit > 0" class="ldg-credit">+{{ fmt(e.credit) }} so'm</span>
                </div>
                <div v-if="e.status !== 'cancelled'" class="ldg-ecard__bal">
                  <span>Qoldiq</span>
                  <span class="ldg-balance" :class="e.running_balance < 0 ? 'ldg-balance--neg' : 'ldg-balance--pos'">
                    {{ e.running_balance < 0 ? '−' : '+' }}{{ fmt(Math.abs(e.running_balance)) }} so'm
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </Teleport>

    <!-- ── Client form modal ──────────────────────────────────────── -->
    <teleport to="body">
      <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
        <div class="modal">
          <div class="modal__hdr">
            <h3>{{ editing ? 'Mijozni tahrirlash' : 'Yangi mijoz' }}</h3>
            <button class="modal__close" @click="showForm = false">
              <AppIcon name="x" :size="16" />
            </button>
          </div>
          <div class="modal__body">
            <div class="mf__grid">
              <div class="mf__field mf__field--full">
                <label>Ism *</label>
                <input v-model="form.name" class="mf__inp" placeholder="To'liq ism..." @keydown.enter="save" />
              </div>
              <div class="mf__field">
                <label>Telefon</label>
                <input v-model="form.phone" class="mf__inp" placeholder="+998 90 000 00 00" />
              </div>
              <div class="mf__field">
                <label>Manzil</label>
                <input v-model="form.address" class="mf__inp" placeholder="Shahar, ko'cha..." />
              </div>
              <div class="mf__field mf__field--full">
                <label>Izoh</label>
                <input v-model="form.comment" class="mf__inp" placeholder="Qo'shimcha ma'lumot..." />
              </div>
              <div class="mf__field mf__field--full">
                <label class="mf__check-label">
                  <input type="checkbox" v-model="form.active" class="mf__check" />
                  Faol mijoz
                </label>
              </div>
            </div>
          </div>
          <div class="modal__footer">
            <button class="mf__btn mf__btn--cancel" @click="showForm = false">Bekor</button>
            <button class="mf__btn mf__btn--save" :disabled="saving || !form.name.trim()" @click="save">
              <AppIcon v-if="saving" name="loader" :size="14" class="spin" />
              <AppIcon v-else name="check" :size="14" />
              Saqlash
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- ── Debt payment modal ─────────────────────────────────────── -->
    <teleport to="body">
      <div v-if="showDebt" class="modal-overlay" @click.self="showDebt = false">
        <div class="modal modal--debt">
          <div class="modal__hdr">
            <div>
              <h3>Qarz to'lash</h3>
              <p class="debt-client-name">{{ debtClient?.name }}</p>
            </div>
            <button class="modal__close" @click="showDebt = false">
              <AppIcon name="x" :size="16" />
            </button>
          </div>
          <div class="modal__body">
            <div class="debt-info">
              <span class="debt-info__lbl">Joriy qarz</span>
              <span class="debt-info__val">{{ fmt(debtClient?.balance ?? 0) }} so'm</span>
            </div>
            <div class="mf__field">
              <label>To'lov summasi (so'm)</label>
              <input
                v-model="debtForm.amount" class="mf__inp mf__inp--lg"
                type="number" min="1" placeholder="0"
                @keydown.enter="submitDebt"
              />
            </div>
            <div class="mf__field">
              <label>To'lov turi</label>
              <div class="pay-type-row">
                <button
                  v-for="pt in PAY_TYPES" :key="pt"
                  class="pay-type-btn" :class="{ on: debtForm.payment_type === pt }"
                  @click="debtForm.payment_type = pt"
                >{{ pt }}</button>
              </div>
            </div>
            <div v-if="debtForm.amount" class="debt-after">
              <span>To'lovdan keyin:</span>
              <span :class="remaining >= 0 ? 'debt-after__clear' : 'debt-after__remain'">
                {{ remaining >= 0 ? "✓ Qarz to'landi" : `${fmt(remaining)} so'm qoladi` }}
              </span>
            </div>
          </div>
          <div class="modal__footer">
            <button class="mf__btn mf__btn--cancel" @click="showDebt = false">Bekor</button>
            <button
              class="mf__btn mf__btn--pay"
              :disabled="debtPaying || !Number(debtForm.amount)"
              @click="submitDebt"
            >
              <AppIcon v-if="debtPaying" name="loader" :size="14" class="spin" />
              <AppIcon v-else name="dollar-sign" :size="14" />
              Qabul qilish
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; height: calc(100vh - var(--header-h)); overflow: hidden; }

/* Top bar */
.page__topbar { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px 14px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; gap: 16px; }
.page__topbar-l { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
.page__title { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; white-space: nowrap; flex-shrink: 0; }
.page__search { flex: 1; max-width: 320px; position: relative; display: flex; align-items: center; }
.page__search-ico { position: absolute; left: 11px; color: var(--color-text-3); pointer-events: none; }
.page__search-inp { width: 100%; height: 36px; padding: 0 32px 0 32px; border: 1.5px solid var(--color-border); border-radius: var(--r-lg); font-size: 13px; color: var(--color-text); background: var(--color-surface); outline: none; font-family: inherit; transition: border-color var(--t-base); }
.page__search-inp:focus { border-color: var(--indigo-300); }
.page__search-inp::placeholder { color: var(--color-text-3); }
.page__search-clr { position: absolute; right: 9px; width: 18px; height: 18px; border-radius: 50%; background: var(--slate-200); color: var(--color-text-3); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.page__add-btn { display: flex; align-items: center; gap: 7px; padding: 0 20px; height: 40px; border-radius: var(--r-xl); background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); color: white; font-size: 13.5px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0; box-shadow: 0 4px 14px rgba(99,102,241,0.35); transition: opacity var(--t-base), transform var(--t-fast); letter-spacing: -0.01em; font-family: inherit; }
.page__add-btn:hover { opacity: 0.9; transform: translateY(-1px); }

/* Stats */
.page__stats { display: flex; gap: 12px; padding: 14px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.kcard { flex: 1; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--color-border); border-radius: var(--r-xl); background: var(--color-surface); }
.kcard__ico { width: 36px; height: 36px; border-radius: var(--r-lg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.kcard__ico--indigo { background: var(--indigo-50);  color: var(--indigo-500);  border: 1px solid var(--indigo-100); }
.kcard__ico--green  { background: #f0fdf4;            color: #16a34a;            border: 1px solid #bbf7d0; }
.kcard__ico--amber  { background: #fffbeb;            color: #d97706;            border: 1px solid #fde68a; }
.kcard__ico--red    { background: #fff1f2;            color: #e11d48;            border: 1px solid #fecdd3; }
.kcard__val { font-size: 16px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }
.kcard__val--red { color: #e11d48; }
.kcard__lbl { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }

/* Tabs */
.page__tabs { display: flex; align-items: center; gap: 2px; padding: 0 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.page__tab { display: flex; align-items: center; gap: 6px; padding: 11px 16px; font-size: 13px; font-weight: 600; color: var(--color-text-3); border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; transition: color var(--t-base), border-color var(--t-base); font-family: inherit; }
.page__tab:hover { color: var(--color-text-2); }
.page__tab.on { color: var(--indigo-600); border-bottom-color: var(--indigo-500); }
.page__tab-cnt { min-width: 18px; height: 18px; border-radius: 99px; background: var(--slate-100); color: var(--color-text-3); font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; padding: 0 5px; }
.page__tab.on .page__tab-cnt { background: var(--indigo-100); color: var(--indigo-600); }
.tab-count { margin-left: auto; font-size: 12px; color: var(--color-text-3); }

/* Table */
.page__table-wrap { flex: 1; overflow-y: auto; padding: 14px 24px 20px; }
.page__empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 20px; color: var(--color-text-3); font-size: 13px; }
.dtable { width: 100%; border-collapse: collapse; }
.dtable thead th { padding: 7px 14px; font-size: 10.5px; font-weight: 700; color: var(--color-text-3); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--color-border); text-align: left; white-space: nowrap; }
.dtable__row { cursor: pointer; transition: background var(--t-fast); }
.dtable__row:hover td { background: var(--slate-50); }
.dtable__row td { padding: 11px 14px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
.dtable__row:last-child td { border-bottom: none; }

.client-code { font-size: 12px; color: var(--color-text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.client-name { display: flex; align-items: center; gap: 10px; }
.client-av { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, var(--indigo-400), var(--violet-500)); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: white; flex-shrink: 0; }
.client-nm { font-size: 13.5px; font-weight: 700; color: var(--color-text); }
.client-note { font-size: 11px; color: var(--color-text-3); margin-top: 1px; }
.client-phone { font-size: 13px; color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.client-addr { font-size: 12px; color: var(--color-text-3); max-width: 160px; }

.balance { font-size: 13px; font-weight: 700; }
.balance em { font-style: normal; font-size: 10.5px; font-weight: 400; color: var(--color-text-3); }
.balance--zero { color: var(--color-text-3); }
.balance--pos  { color: #16a34a; }
.balance--neg  { color: #e11d48; }

.active-dot { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
.active-dot--on  { background: #f0fdf4; color: #16a34a; }
.active-dot--off { background: var(--slate-100); color: var(--color-text-3); }

.row-actions { display: flex; gap: 4px; justify-content: flex-end; }
.row-act { width: 30px; height: 30px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background var(--t-fast), color var(--t-fast); color: var(--color-text-3); }
.row-act--pay:hover  { background: #f0fdf4; color: #16a34a; }
.row-act--hist:hover { background: var(--indigo-50); color: var(--indigo-500); }
.row-act--edit:hover { background: var(--indigo-50); color: var(--indigo-500); }
.row-act--del:hover  { background: #fff1f2; color: #e11d48; }
.ta-c { text-align: center; }
.ta-r { text-align: right; }

/* ── Ledger Panel ─────────────────────────────────────────────────── */
.ldg-overlay { position: fixed; inset: 0; z-index: 800; background: rgba(15,23,42,0.4); display: flex; align-items: stretch; justify-content: flex-end; }
.ldg-panel { width: 820px; max-width: 95vw; background: white; display: flex; flex-direction: column; box-shadow: -8px 0 40px rgba(0,0,0,0.15); animation: slide-in 0.22s ease; }
@keyframes slide-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }

.ldg-panel__hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.ldg-panel__hdr-l { display: flex; align-items: center; gap: 12px; }
.ldg-panel__ico { width: 40px; height: 40px; border-radius: var(--r-md); background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
.ldg-panel__title { font-size: 16px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.ldg-panel__sub { font-size: 11.5px; color: var(--color-text-3); margin-top: 1px; }
.ldg-panel__hdr-r { display: flex; align-items: center; gap: 8px; }
.ldg-pay-btn { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border-radius: var(--r-md); background: linear-gradient(135deg, #16a34a, #15803d); color: white; font-size: 12.5px; font-weight: 700; font-family: inherit; cursor: pointer; transition: opacity var(--t-base); box-shadow: 0 3px 10px rgba(22,163,74,0.25); }
.ldg-pay-btn:hover { opacity: 0.88; }
.ldg-panel__close { width: 32px; height: 32px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; color: var(--color-text-3); cursor: pointer; transition: background var(--t-fast); }
.ldg-panel__close:hover { background: var(--rose-50); color: var(--rose-500); }

.ldg-summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; background: #fafbff; }
.ldg-card { padding: 12px 16px; border-radius: var(--r-lg); border: 1.5px solid transparent; }
.ldg-card--blue  { background: #eff6ff; border-color: #bfdbfe; }
.ldg-card--green { background: #f0fdf4; border-color: #bbf7d0; }
.ldg-card--red   { background: var(--rose-50); border-color: var(--rose-200); }
.ldg-card--ok    { background: var(--emerald-50); border-color: var(--emerald-200); }
.ldg-card__lbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); margin-bottom: 5px; }
.ldg-card__val { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }
.ldg-card--blue  .ldg-card__val { color: #1d4ed8; }
.ldg-card--green .ldg-card__val { color: var(--emerald-700); }
.ldg-card--red   .ldg-card__val { color: var(--rose-600); }
.ldg-card--ok    .ldg-card__val { color: var(--emerald-700); }
.ldg-card__val span { font-size: 12px; font-weight: 500; color: var(--color-text-3); }

.ldg-panel__body { flex: 1; overflow-y: auto; }
.ldg-loading { display: flex; flex-direction: column; gap: 8px; padding: 20px; }
.ldg-skel { height: 52px; border-radius: var(--r-md); }
.ldg-err { padding: 24px; text-align: center; color: var(--rose-500); font-size: 13px; }
.ldg-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px; color: var(--color-text-3); font-size: 13px; }

.ldg-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.ldg-tbl thead th { padding: 10px 14px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-3); background: var(--slate-50); border-bottom: 1px solid var(--color-border); text-align: left; position: sticky; top: 0; z-index: 2; white-space: nowrap; }
.ldg-tbl__row { border-bottom: 1px solid var(--color-border-sub); transition: background var(--t-fast); }
.ldg-tbl__row:last-child { border-bottom: none; }
.ldg-row--sale:hover    { background: #eff6ff; }
.ldg-row--payment:hover { background: #f0fdf4; }
.ldg-row--cancelled { opacity: 0.5; }
.ldg-tbl__row td { padding: 10px 14px; vertical-align: middle; }
.ldg-tbl__date { color: var(--color-text-2); white-space: nowrap; font-size: 12px; }
.ldg-time { font-size: 10.5px; color: var(--color-text-3); margin-top: 2px; }
.ldg-desc { display: flex; align-items: center; gap: 7px; }
.ldg-desc-text { font-weight: 500; color: var(--color-text); font-size: 12.5px; }
.ldg-type-badge { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
.ldg-type-badge--sale { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.ldg-type-badge--pay  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.ldg-cancelled-badge  { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; background: var(--rose-50); color: var(--rose-500); border: 1px solid var(--rose-100); margin-top: 3px; }
.ldg-ptype { font-size: 11.5px; color: var(--color-text-2); }
.ldg-debit  { font-weight: 700; color: #1d4ed8; font-size: 13px; }
.ldg-credit { font-weight: 700; color: #16a34a; font-size: 13px; }
.ldg-zero   { color: var(--color-text-3); }
.ldg-balance { font-size: 12.5px; font-weight: 800; padding: 2px 8px; border-radius: var(--r-sm); }
.ldg-balance--neg { background: var(--rose-50); color: var(--rose-600); }
.ldg-balance--pos { background: var(--emerald-50); color: var(--emerald-700); }

/* ── Modal ────────────────────────────────────────────────────────── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; animation: ov-in 0.18s ease; }
@keyframes ov-in { from { opacity: 0; } to { opacity: 1; } }
.modal { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-2xl); box-shadow: 0 20px 60px rgba(0,0,0,0.2); width: 480px; max-width: 95vw; animation: modal-in 0.2s ease; }
.modal--debt { width: 400px; }
@keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
.modal__hdr { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px 16px; border-bottom: 1px solid var(--color-border); }
.modal__hdr h3 { font-size: 15px; font-weight: 700; color: var(--color-text); }
.modal__close { width: 30px; height: 30px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; color: var(--color-text-3); cursor: pointer; transition: background var(--t-base); flex-shrink: 0; margin-left: 8px; }
.modal__close:hover { background: var(--slate-100); }
.modal__body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.modal__footer { padding: 14px 20px; border-top: 1px solid var(--color-border); display: flex; gap: 10px; justify-content: flex-end; }

.mf__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mf__field { display: flex; flex-direction: column; gap: 5px; }
.mf__field--full { grid-column: 1 / -1; }
.mf__field label { font-size: 11.5px; font-weight: 600; color: var(--color-text-2); }
.mf__inp { height: 38px; padding: 0 12px; border: 1.5px solid var(--color-border); border-radius: var(--r-lg); font-size: 13.5px; color: var(--color-text); background: var(--color-surface); outline: none; font-family: inherit; width: 100%; transition: border-color var(--t-base); }
.mf__inp--lg { height: 46px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.mf__inp:focus { border-color: var(--indigo-300); box-shadow: 0 0 0 3px rgba(99,102,241,0.08); }
.mf__check-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--color-text-2); cursor: pointer; }
.mf__check { width: 16px; height: 16px; accent-color: var(--indigo-500); }
.mf__btn { display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 20px; border-radius: var(--r-lg); font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: opacity var(--t-base); }
.mf__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mf__btn--cancel { border: 1.5px solid var(--color-border); color: var(--color-text-2); }
.mf__btn--cancel:hover:not(:disabled) { background: var(--slate-50); }
.mf__btn--save { background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); color: white; box-shadow: 0 4px 14px rgba(99,102,241,0.3); }
.mf__btn--pay  { background: linear-gradient(135deg, #16a34a, #15803d); color: white; box-shadow: 0 4px 14px rgba(22,163,74,0.3); }
.mf__btn--save:hover:not(:disabled) { opacity: 0.9; }
.mf__btn--pay:hover:not(:disabled)  { opacity: 0.9; }

.debt-client-name { font-size: 12px; color: var(--color-text-3); margin-top: 2px; }
.debt-info { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: var(--r-lg); }
.debt-info__lbl { font-size: 12px; font-weight: 600; color: #be123c; }
.debt-info__val { font-size: 16px; font-weight: 800; color: #e11d48; letter-spacing: -0.02em; }
.pay-type-row { display: flex; gap: 8px; }
.pay-type-btn { flex: 1; height: 36px; border: 1.5px solid var(--color-border); border-radius: var(--r-lg); font-size: 13px; font-weight: 600; color: var(--color-text-2); cursor: pointer; font-family: inherit; transition: all var(--t-base); }
.pay-type-btn.on { background: var(--indigo-500); border-color: var(--indigo-500); color: white; }
.debt-after { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--slate-50); border-radius: var(--r-lg); font-size: 12.5px; }
.debt-after span:first-child { color: var(--color-text-3); }
.debt-after__clear  { font-weight: 700; color: #16a34a; }
.debt-after__remain { font-weight: 700; color: #e11d48; }

/* Shared */
.skeleton { background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

/* ── Mobile-only elements (hidden on desktop by default) ───────────── */
.ctable-cards { display: none; }
.ldg-cards    { display: none; }
.fab          { display: none; }

/* ════════════════════════════════════════════════════════════════════
   MOBILE  ( ≤768px )
   ════════════════════════════════════════════════════════════════════ */
@media (max-width: 768px) {

  @keyframes card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes fab-in   { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }

  .page { height: auto; min-height: calc(100vh - var(--header-h)); overflow: visible; overflow-x: hidden; }

  /* ── Top bar ─────────────────────────────────────────────────── */
  .page__topbar {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 14px 10px;
    gap: 10px;
  }
  .page__topbar-l { flex-direction: column; align-items: stretch; gap: 10px; width: 100%; }
  .page__title { font-size: 16px; }
  .page__search { max-width: none; width: 100%; }
  .page__search-inp { height: 44px; font-size: 14px; padding: 0 36px 0 36px; }
  .page__search-ico { left: 13px; }
  .page__search-clr { right: 11px; width: 22px; height: 22px; }
  /* "Qo'shish" button hidden on mobile — replaced by FAB */
  .page__topbar > .page__add-btn { display: none; }

  /* ── Stats: 2-col grid, horizontally scroll-free ───────────────── */
  .page__stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 10px 14px;
  }
  .kcard {
    padding: 11px 12px;
    gap: 10px;
    opacity: 0;
    animation: card-in 0.32s var(--ease-spring) both;
  }
  .kcard:nth-child(1) { animation-delay: 0.02s; }
  .kcard:nth-child(2) { animation-delay: 0.06s; }
  .kcard:nth-child(3) { animation-delay: 0.10s; }
  .kcard:nth-child(4) { animation-delay: 0.14s; }
  .kcard__ico { width: 32px; height: 32px; }
  .kcard__val { font-size: 15px; }
  .kcard__lbl { font-size: 10px; }

  /* ── Tabs: sticky, full-width, scrollable, ≥44px tap ───────────── */
  .page__tabs {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--color-surface);
    padding: 0 10px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .page__tabs::-webkit-scrollbar { display: none; }
  .page__tab { padding: 13px 12px; min-height: 44px; font-size: 12.5px; white-space: nowrap; }
  .tab-count { display: none; }

  /* ── Table → Card list ──────────────────────────────────────────── */
  .page__table-wrap { padding: 10px 12px 90px; overflow-x: hidden; }
  .dtable { display: none; }

  .ctable-cards { display: flex; flex-direction: column; gap: 10px; }
  .ccard {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--r-xl);
    box-shadow: var(--shadow-sm);
    padding: 13px 14px;
    cursor: pointer;
    opacity: 0;
    animation: card-in 0.32s var(--ease-spring) both;
    transition: transform var(--t-fast), box-shadow var(--t-base);
  }
  .ccard:active { transform: scale(0.97); box-shadow: var(--shadow-xs); }

  .ccard__top { display: flex; align-items: center; gap: 10px; }
  .ccard__av { width: 38px; height: 38px; font-size: 14px; flex-shrink: 0; }
  .ccard__id { flex: 1; min-width: 0; }
  .ccard__id .client-nm { font-size: 14px; }
  .ccard__meta { font-size: 11px; color: var(--color-text-3); margin-top: 2px; display: flex; gap: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ccard__addr { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--color-text-3); margin-top: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .ccard__bal {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 10px; padding: 10px 12px; border-radius: var(--r-lg);
  }
  .ccard__bal-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .ccard__bal-val { font-size: 15px; font-weight: 800; letter-spacing: -0.02em; }
  .ccard__bal--neg  { background: var(--rose-50);    }
  .ccard__bal--neg  .ccard__bal-lbl, .ccard__bal--neg  .ccard__bal-val { color: var(--rose-600); }
  .ccard__bal--pos  { background: var(--emerald-50);  }
  .ccard__bal--pos  .ccard__bal-lbl, .ccard__bal--pos  .ccard__bal-val { color: var(--emerald-700); }
  .ccard__bal--zero { background: var(--slate-50);    }
  .ccard__bal--zero .ccard__bal-lbl, .ccard__bal--zero .ccard__bal-val { color: var(--color-text-3); }

  .ccard__actions { display: flex; gap: 8px; margin-top: 10px; }
  .ccard__act {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 38px; border-radius: var(--r-lg); border: 1.5px solid var(--color-border);
    background: var(--color-surface); color: var(--color-text-2);
    font-size: 12.5px; font-weight: 600; font-family: inherit; cursor: pointer;
    transition: transform var(--t-fast), background var(--t-base);
  }
  .ccard__act:active { transform: scale(0.94); }
  .ccard__act--pay { border-color: var(--emerald-100); background: var(--emerald-50); color: var(--emerald-700); }
  .ccard__act--icon { flex: 0 0 38px; }
  .ccard__act--del { color: var(--rose-500); }

  .active-dot { font-size: 10.5px; padding: 3px 8px; flex-shrink: 0; }

  /* ── FAB ─────────────────────────────────────────────────────────── */
  .fab {
    display: flex; align-items: center; justify-content: center;
    position: fixed;
    right: 16px;
    bottom: calc(16px + 58px + env(safe-area-inset-bottom, 0px));
    width: 54px; height: 54px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
    color: white;
    border: none;
    box-shadow: 0 8px 22px rgba(99,102,241,0.4);
    cursor: pointer;
    z-index: 60;
    opacity: 0;
    animation: fab-in 0.3s var(--ease-spring) 0.2s both;
    transition: transform var(--t-fast);
  }
  .fab:active { transform: scale(0.9); }

  /* ── Ledger panel: near full-screen ─────────────────────────────── */
  .ldg-overlay { align-items: flex-end; justify-content: center; }
  .ldg-panel {
    width: 100%; max-width: 100vw;
    height: 94vh; max-height: 94vh;
    border-radius: var(--r-2xl) var(--r-2xl) 0 0;
    animation: ldg-slide-up 0.28s var(--ease-spring);
  }
  @keyframes ldg-slide-up { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }

  .ldg-panel__hdr { padding: 14px 14px 12px; gap: 10px; flex-wrap: wrap; }
  .ldg-panel__ico { width: 36px; height: 36px; }
  .ldg-panel__title { font-size: 14.5px; }
  .ldg-panel__sub { font-size: 11px; }
  .ldg-panel__hdr-r { width: 100%; }
  .ldg-pay-btn { flex: 1; justify-content: center; height: 40px; }
  .ldg-panel__close { width: 40px; height: 40px; flex-shrink: 0; }

  .ldg-summary { grid-template-columns: 1fr 1fr; padding: 12px; gap: 8px; }
  .ldg-summary .ldg-card:last-child { grid-column: 1 / -1; }
  .ldg-card { padding: 10px 12px; }
  .ldg-card__val { font-size: 15px; }

  .ldg-tbl { display: none; }
  .ldg-cards { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
  .ldg-ecard {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-xs);
    padding: 11px 13px;
    opacity: 0;
    animation: card-in 0.3s var(--ease-spring) both;
  }
  .ldg-ecard--cancelled { opacity: 0.55 !important; animation: none; }
  .ldg-ecard__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ldg-ecard__date { font-size: 11px; color: var(--color-text-3); white-space: nowrap; }
  .ldg-ecard__desc { font-size: 13px; font-weight: 600; color: var(--color-text); margin-top: 7px; }
  .ldg-ecard__row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
  .ldg-ecard__ptype { font-size: 11.5px; color: var(--color-text-2); }
  .ldg-ecard__bal {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-sub);
    font-size: 11.5px; color: var(--color-text-3);
  }

  /* ── Generic modal: near full-screen on mobile ──────────────────── */
  .modal-overlay { align-items: flex-end; padding: 0; }
  .modal {
    width: 100%; max-width: 100vw;
    max-height: 92vh;
    border-radius: var(--r-2xl) var(--r-2xl) 0 0;
    animation: ldg-slide-up 0.28s var(--ease-spring);
    display: flex; flex-direction: column;
    overflow-y: auto;
  }
  .modal--debt { width: 100%; }
  .modal__hdr { padding: 16px 16px 14px; }
  .modal__body { padding: 16px; }
  .modal__footer { padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); position: sticky; bottom: 0; background: var(--color-surface); }
  .mf__grid { grid-template-columns: 1fr; }
  .mf__inp { height: 44px; font-size: 15px; }
  .mf__inp--lg { height: 50px; }
  .mf__btn { flex: 1; justify-content: center; height: 44px; }
  .pay-type-btn { height: 42px; }

  .row-actions { display: none; }
}

/* ════════════════════════════════════════════════════════════════════
   SMALL MOBILE  ( ≤480px )
   ════════════════════════════════════════════════════════════════════ */
@media (max-width: 480px) {
  .page__stats { grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 10px; }
  .kcard { padding: 10px; gap: 8px; }
  .kcard__ico { width: 28px; height: 28px; }
  .kcard__val { font-size: 13.5px; }
  .kcard__lbl { font-size: 9.5px; }

  .page__table-wrap { padding: 8px 10px 86px; }
  .ccard { padding: 11px 12px; }
  .ccard__actions { flex-wrap: wrap; }
  .ccard__act { min-width: 0; font-size: 12px; }

  .fab { width: 50px; height: 50px; right: 12px; }

  .ldg-summary { grid-template-columns: 1fr; }
  .ldg-summary .ldg-card:last-child { grid-column: auto; }
}
</style>
