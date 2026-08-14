<script setup>
/**
 * Qarzdorlar (CRM).
 *
 * Asosiy g'oya: ochilganda DARHOL bugun to'lashi kerak bo'lganlar va
 * kechikkanlar ko'rinadi — kassir kunni shu ro'yxatdan boshlaydi.
 *
 * Qarz har sotuvga alohida muddat bilan yozilgani uchun bitta mijozda
 * bir necha muddat bo'lishi mumkin; ro'yxatda eng yaqini ko'rsatiladi.
 */
import { ref, computed, onMounted, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { debtorsApi } from '@/api/debtors.js'
import { showToast } from '@/composables/useToast.js'
import { canEdit } from '@/composables/usePerms.js'

const fmt = v => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0))

// ── Holat ───────────────────────────────────────────────────────────
const loading = ref(false)
const rows    = ref([])
const jami    = ref({})
const bugun   = ref('')

// Filtrlar. Standart — "bugun to'lashi kerak" (kunlik ish shundan boshlanadi)
const fMuddat = ref('bugun')
const fHajm   = ref('all')
const fStatus = ref('all')
const fTeg    = ref('all')
const search  = ref('')

const STATUSLAR = [
  { key: 'faol',      nom: 'Faol',      rang: '#0369a1', fon: '#e0f2fe' },
  { key: 'ishonchli', nom: 'Ishonchli', rang: '#047857', fon: '#d1fae5' },
  { key: 'muammoli',  nom: 'Muammoli',  rang: '#b45309', fon: '#fef3c7' },
  { key: 'qora',      nom: 'Qora ro\'yxat', rang: '#b91c1c', fon: '#fee2e2' },
]
const statusInfo = k => STATUSLAR.find(s => s.key === k) || STATUSLAR[0]

const MUDDATLAR = [
  { key: 'bugun',     nom: 'Bugun to\'laydi', ico: 'calendar',      rang: '#b45309' },
  { key: 'kechikkan', nom: 'Kechikkan',       ico: 'alert-triangle', rang: '#b91c1c' },
  { key: 'hafta',     nom: 'Bu hafta',        ico: 'clock',          rang: '#0369a1' },
  { key: 'keyin',     nom: 'Keyinroq',        ico: 'calendar',       rang: '#475569' },
  { key: 'muddatsiz', nom: 'Muddatsiz',       ico: 'help-circle',    rang: '#64748b' },
  { key: 'all',       nom: 'Hammasi',         ico: 'users',          rang: '#4f46e5' },
]

const HAJMLAR = [
  { key: 'all',    nom: 'Har qanday' },
  { key: 'yirik',  nom: 'Yirik (5 mln+)' },
  { key: 'orta',   nom: "O'rta (1-5 mln)" },
  { key: 'kichik', nom: 'Kichik (1 mln gacha)' },
]

// Bazadagi barcha teglar — filtr ro'yxati uchun
const teglar = computed(() => {
  const s = new Set()
  rows.value.forEach(r => (r.tags || []).forEach(t => s.add(t)))
  return [...s].sort()
})

async function load() {
  loading.value = true
  try {
    const params = {}
    if (fMuddat.value !== 'all') params.muddat = fMuddat.value
    if (fHajm.value   !== 'all') params.hajm   = fHajm.value
    if (fStatus.value !== 'all') params.status = fStatus.value
    if (fTeg.value    !== 'all') params.teg    = fTeg.value
    if (search.value.trim())     params.search = search.value.trim()

    const res = await debtorsApi.getAll(params)
    rows.value  = res.data
    jami.value  = res.jami
    bugun.value = res.bugun
  } catch (e) {
    showToast(e?.response?.data?.message || 'Ro\'yxatni yuklab bo\'lmadi', 'err')
    rows.value = []
  } finally { loading.value = false }
}

let qidirTimer = null
watch(search, () => { clearTimeout(qidirTimer); qidirTimer = setTimeout(load, 300) })
watch([fMuddat, fHajm, fStatus, fTeg], load)
onMounted(load)

const sanoq = k => jami.value?.[k] || { n: 0, sum: 0 }

// ── Mijoz kartochkasi ───────────────────────────────────────────────
const karta      = ref(null)
const kartaYuk   = ref(false)
const yangiIzoh  = ref('')
const izohTuri   = ref('izoh')
const izohSana   = ref('')

async function ochKarta(clientId) {
  kartaYuk.value = true
  try {
    karta.value = await debtorsApi.getOne(clientId)
  } catch (e) {
    showToast(e?.response?.data?.message || 'Mijozni ochib bo\'lmadi', 'err')
  } finally { kartaYuk.value = false }
}
function yopKarta() { karta.value = null; yangiIzoh.value = ''; izohSana.value = '' }

async function izohQosh() {
  const t = yangiIzoh.value.trim()
  if (!t) return
  try {
    await debtorsApi.addNote(karta.value.client.id, {
      text: t, kind: izohTuri.value, remindAt: izohSana.value || null,
    })
    yangiIzoh.value = ''; izohSana.value = ''
    await ochKarta(karta.value.client.id)
    await load()
    showToast('Izoh qo\'shildi', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Saqlab bo\'lmadi', 'err')
  }
}

async function izohBajarildi(n) {
  try {
    await debtorsApi.updateNote(n.id, { done: !n.done })
    await ochKarta(karta.value.client.id)
    await load()
  } catch { showToast('Xatolik', 'err') }
}

async function izohOchir(n) {
  if (!confirm('Izoh o\'chirilsinmi?')) return
  try {
    await debtorsApi.removeNote(n.id)
    await ochKarta(karta.value.client.id)
  } catch { showToast('Xatolik', 'err') }
}

async function statusOzgart(s) {
  try {
    await debtorsApi.update(karta.value.client.id, { status: s })
    karta.value.client.status = s
    await load()
    showToast('Status yangilandi', 'ok')
  } catch { showToast('Xatolik', 'err') }
}

const yangiTeg = ref('')
async function tegQosh() {
  const t = yangiTeg.value.trim()
  if (!t) return
  const tags = [...new Set([...(karta.value.client.tags || []), t])]
  try {
    await debtorsApi.update(karta.value.client.id, { tags })
    karta.value.client.tags = tags
    yangiTeg.value = ''
    await load()
  } catch { showToast('Xatolik', 'err') }
}
async function tegOchir(t) {
  const tags = (karta.value.client.tags || []).filter(x => x !== t)
  try {
    await debtorsApi.update(karta.value.client.id, { tags })
    karta.value.client.tags = tags
    await load()
  } catch { showToast('Xatolik', 'err') }
}

async function muddatOzgart(q, sana) {
  try {
    await debtorsApi.setDue(q.id, sana || null)
    await ochKarta(karta.value.client.id)
    await load()
    showToast('Muddat yangilandi', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Xatolik', 'err')
  }
}

function sanaMatn(d) {
  if (!d) return 'Muddatsiz'
  return new Date(d).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short', year: 'numeric' })
}
const KIND_NOM = { izoh: 'Izoh', qongiroq: 'Qo\'ng\'iroq', uchrashuv: 'Uchrashuv', vada: 'Va\'da' }
</script>

<template>
  <div class="dbt">

    <!-- Sarlavha -->
    <div class="dbt__top">
      <div>
        <h2 class="dbt__title">Qarzdorlar</h2>
        <p class="dbt__sub">
          Jami {{ sanoq('hammasi').n }} mijoz ·
          <strong>{{ fmt(sanoq('hammasi').sum) }} so'm</strong>
        </p>
      </div>
      <div class="dbt__search">
        <AppIcon name="search" :size="13" class="dbt__search-ico"/>
        <input v-model="search" class="dbt__search-inp" placeholder="Ism yoki telefon…"/>
        <button v-if="search" class="dbt__search-x" @click="search=''">
          <AppIcon name="x" :size="11" :stroke-width="2.5"/>
        </button>
      </div>
    </div>

    <!-- Muddat kartochkalari — asosiy ish ko'rinishi -->
    <div class="dbt__cards">
      <button v-for="m in MUDDATLAR" :key="m.key"
              class="dcard" :class="{ on: fMuddat === m.key }"
              @click="fMuddat = m.key">
        <div class="dcard__ico" :style="{ color: m.rang }">
          <AppIcon :name="m.ico" :size="15"/>
        </div>
        <div class="dcard__body">
          <div class="dcard__n">{{ sanoq(m.key).n }}</div>
          <div class="dcard__lbl">{{ m.nom }}</div>
          <div class="dcard__sum">{{ fmt(sanoq(m.key).sum) }}</div>
        </div>
      </button>
    </div>

    <!-- Qo'shimcha filtrlar -->
    <div class="dbt__filters">
      <select v-model="fHajm" class="dbt__sel">
        <option v-for="h in HAJMLAR" :key="h.key" :value="h.key">{{ h.nom }}</option>
      </select>
      <select v-model="fStatus" class="dbt__sel">
        <option value="all">Har qanday status</option>
        <option v-for="s in STATUSLAR" :key="s.key" :value="s.key">{{ s.nom }}</option>
      </select>
      <select v-if="teglar.length" v-model="fTeg" class="dbt__sel">
        <option value="all">Har qanday teg</option>
        <option v-for="t in teglar" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>

    <!-- Ro'yxat -->
    <div class="dbt__list">
      <div v-if="loading" class="dbt__load">
        <div v-for="i in 5" :key="i" class="dbt__skel"></div>
      </div>

      <div v-else-if="!rows.length" class="dbt__empty">
        <AppIcon name="check-circle" :size="38" :stroke-width="1.2"/>
        <p v-if="fMuddat === 'bugun'">Bugun to'lashi kerak bo'lgan qarzdor yo'q</p>
        <p v-else>Bu toifada qarzdor topilmadi</p>
      </div>

      <table v-else class="dtbl">
        <thead>
          <tr>
            <th>Mijoz</th>
            <th>Telefon</th>
            <th class="ta-c">Muddat</th>
            <th class="ta-r">Qarz</th>
            <th class="ta-c">Status</th>
            <th>Oxirgi izoh</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.clientId" class="dtbl__row" @click="ochKarta(r.clientId)">
            <td>
              <div class="dtbl__name">{{ r.name }}</div>
              <div class="dtbl__meta">{{ r.sotuvlar }} ta qarz hujjati</div>
              <div v-if="r.tags?.length" class="dtbl__tags">
                <span v-for="t in r.tags" :key="t" class="dtag">{{ t }}</span>
              </div>
            </td>
            <td class="dtbl__phone">{{ r.phone || '—' }}</td>
            <td class="ta-c">
              <span class="dbadge" :class="`dbadge--${r.muddat}`">
                {{ sanaMatn(r.dueDate) }}
              </span>
              <div v-if="r.kechikkanKun > 0" class="dtbl__late">
                {{ r.kechikkanKun }} kun kechikdi
              </div>
            </td>
            <td class="ta-r dtbl__sum">{{ fmt(r.qarz) }}</td>
            <td class="ta-c">
              <span class="dstat" :style="{ color: statusInfo(r.status).rang, background: statusInfo(r.status).fon }">
                {{ statusInfo(r.status).nom }}
              </span>
            </td>
            <td class="dtbl__note">
              <template v-if="r.oxirgiIzoh">
                <span class="dtbl__kind">{{ KIND_NOM[r.oxirgiIzoh.kind] || 'Izoh' }}:</span>
                {{ r.oxirgiIzoh.text }}
              </template>
              <span v-else class="dtbl__dim">—</span>
              <span v-if="r.eslatmalar" class="dbell">
                <AppIcon name="bell" :size="11"/> {{ r.eslatmalar }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Mijoz kartochkasi ──────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="karta" class="dmod" @click.self="yopKarta">
        <div class="dmod__box">
          <div class="dmod__hdr">
            <div>
              <div class="dmod__name">{{ karta.client.name }}</div>
              <div class="dmod__phone">{{ karta.client.phone || 'Telefon yo\'q' }}</div>
            </div>
            <button class="dmod__x" @click="yopKarta"><AppIcon name="x" :size="16"/></button>
          </div>

          <div class="dmod__body">
            <!-- Umumiy -->
            <div class="dsum">
              <div class="dsum__item">
                <div class="dsum__lbl">Jami qarz</div>
                <div class="dsum__val dsum__val--red">
                  {{ fmt(karta.qarzlar.reduce((a,q)=>a+q.debt,0)) }} so'm
                </div>
              </div>
              <div class="dsum__item">
                <div class="dsum__lbl">Hujjatlar</div>
                <div class="dsum__val">{{ karta.qarzlar.length }} ta</div>
              </div>
            </div>

            <!-- Status -->
            <div class="dsec">
              <div class="dsec__t">Status</div>
              <div class="dstat-row">
                <button v-for="s in STATUSLAR" :key="s.key"
                        class="dstat-btn" :class="{ on: karta.client.status === s.key }"
                        :style="karta.client.status === s.key ? { background: s.fon, color: s.rang, borderColor: s.rang } : {}"
                        :disabled="!canEdit('partners')"
                        @click="statusOzgart(s.key)">{{ s.nom }}</button>
              </div>
            </div>

            <!-- Teglar -->
            <div class="dsec">
              <div class="dsec__t">Teglar</div>
              <div class="dtag-row">
                <span v-for="t in (karta.client.tags||[])" :key="t" class="dtag dtag--big">
                  {{ t }}
                  <button v-if="canEdit('partners')" class="dtag__x" @click="tegOchir(t)">×</button>
                </span>
                <input v-if="canEdit('partners')" v-model="yangiTeg" class="dtag-inp"
                       placeholder="+ teg" @keyup.enter="tegQosh"/>
              </div>
            </div>

            <!-- Qarzlar (har biri muddati bilan) -->
            <div class="dsec">
              <div class="dsec__t">Qarz hujjatlari</div>
              <div v-for="q in karta.qarzlar" :key="q.id" class="dq">
                <div class="dq__l">
                  <div class="dq__doc">Sotuv #{{ q.docNumber }}</div>
                  <div class="dq__date">{{ new Date(q.date).toLocaleDateString('uz-UZ') }}</div>
                </div>
                <div class="dq__due">
                  <input type="date" class="dq__inp" :value="q.dueDate || ''"
                         :disabled="!canEdit('partners')"
                         @change="e => muddatOzgart(q, e.target.value)"/>
                  <span class="dbadge" :class="`dbadge--${q.muddat}`">{{ sanaMatn(q.dueDate) }}</span>
                </div>
                <div class="dq__sum">{{ fmt(q.debt) }}</div>
              </div>
            </div>

            <!-- To'lov tarixi -->
            <div v-if="karta.tolovlar.length" class="dsec">
              <div class="dsec__t">To'lovlar tarixi</div>
              <div v-for="t in karta.tolovlar" :key="t.id" class="dpay">
                <span>{{ new Date(t.date).toLocaleDateString('uz-UZ') }}</span>
                <span class="dpay__type">{{ t.paymentType }}</span>
                <strong class="dpay__sum">+{{ fmt(t.amount) }}</strong>
              </div>
            </div>

            <!-- Izohlar / eslatmalar -->
            <div class="dsec">
              <div class="dsec__t">Izohlar va eslatmalar</div>

              <div v-if="canEdit('partners')" class="dnote-add">
                <div class="dnote-add__row">
                  <select v-model="izohTuri" class="dnote-add__sel">
                    <option value="izoh">Izoh</option>
                    <option value="qongiroq">Qo'ng'iroq</option>
                    <option value="uchrashuv">Uchrashuv</option>
                    <option value="vada">Va'da</option>
                  </select>
                  <input v-model="izohSana" type="date" class="dnote-add__date"
                         title="Eslatma sanasi (ixtiyoriy)"/>
                </div>
                <textarea v-model="yangiIzoh" class="dnote-add__txt" rows="2"
                          placeholder="Masalan: qo'ng'iroq qildim, 20-avgustda to'layman dedi"></textarea>
                <button class="dnote-add__btn" @click="izohQosh">
                  <AppIcon name="plus" :size="13"/> Qo'shish
                </button>
              </div>

              <div v-for="n in karta.izohlar" :key="n.id" class="dnote" :class="{ done: n.done }">
                <div class="dnote__hdr">
                  <span class="dnote__kind">{{ KIND_NOM[n.kind] || 'Izoh' }}</span>
                  <span class="dnote__at">{{ new Date(n.createdAt).toLocaleDateString('uz-UZ') }}</span>
                  <span v-if="n.user" class="dnote__user">{{ n.user }}</span>
                  <span v-if="n.remindAt" class="dnote__rem">
                    <AppIcon name="bell" :size="10"/> {{ sanaMatn(n.remindAt) }}
                  </span>
                  <div class="dnote__acts" v-if="canEdit('partners')">
                    <button v-if="n.remindAt" class="dnote__act" @click="izohBajarildi(n)">
                      {{ n.done ? 'Qayta ochish' : 'Bajarildi' }}
                    </button>
                    <button class="dnote__act dnote__act--del" @click="izohOchir(n)">O'chirish</button>
                  </div>
                </div>
                <div class="dnote__txt">{{ n.text }}</div>
              </div>

              <p v-if="!karta.izohlar.length" class="dnote-empty">Hali izoh yo'q</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dbt { display:flex; flex-direction:column; height:calc(100vh - var(--header-h)); overflow:hidden; }

.dbt__top { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 24px 12px; }
.dbt__title { font-size:19px; font-weight:800; color:#0f172a; margin:0; }
.dbt__sub { font-size:12.5px; color:#64748b; margin:3px 0 0; }
.dbt__sub strong { color:#b91c1c; }

.dbt__search { position:relative; display:flex; align-items:center; width:280px; }
.dbt__search-ico { position:absolute; left:10px; color:#94a3b8; }
.dbt__search-inp { width:100%; padding:8px 28px 8px 30px; font-size:13px; border:1px solid #e2e8f0; border-radius:9px; outline:none; }
.dbt__search-inp:focus { border-color:#94a3b8; }
.dbt__search-x { position:absolute; right:8px; display:flex; padding:3px; color:#94a3b8; background:#f1f5f9; border:none; border-radius:50%; cursor:pointer; }

/* Muddat kartochkalari */
.dbt__cards { display:flex; gap:10px; padding:0 24px 12px; overflow-x:auto; }
.dcard { display:flex; align-items:center; gap:10px; padding:11px 14px; min-width:150px; background:#fff; border:1.5px solid #e2e8f0; border-radius:11px; cursor:pointer; text-align:left; font-family:inherit; transition:all .15s; }
.dcard:hover { border-color:#cbd5e1; }
.dcard.on { border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.12); }
.dcard__ico { display:flex; }
.dcard__n { font-size:19px; font-weight:800; color:#0f172a; line-height:1; }
.dcard__lbl { font-size:11.5px; color:#64748b; margin-top:2px; }
.dcard__sum { font-size:11px; font-weight:600; color:#94a3b8; margin-top:1px; }

.dbt__filters { display:flex; gap:8px; padding:0 24px 12px; }
.dbt__sel { padding:7px 10px; font-size:12.5px; color:#334155; background:#fff; border:1px solid #e2e8f0; border-radius:8px; outline:none; cursor:pointer; font-family:inherit; }

/* Ro'yxat */
.dbt__list { flex:1; overflow-y:auto; padding:0 24px 20px; }
.dbt__load { display:flex; flex-direction:column; gap:8px; }
.dbt__skel { height:56px; background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%); background-size:200% 100%; animation:dsk 1.4s infinite; border-radius:9px; }
@keyframes dsk { to { background-position:-200% 0; } }
.dbt__empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:60px; color:#94a3b8; }

.dtbl { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e2e8f0; border-radius:11px; overflow:hidden; }
.dtbl th { padding:10px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#64748b; background:#f8fafc; text-align:left; border-bottom:1px solid #e2e8f0; }
.dtbl td { padding:11px 14px; border-bottom:1px solid #f1f5f9; font-size:13px; vertical-align:top; }
.dtbl__row { cursor:pointer; }
.dtbl__row:hover { background:#f8fafc; }
.dtbl__name { font-weight:700; color:#0f172a; }
.dtbl__meta { font-size:11px; color:#94a3b8; margin-top:1px; }
.dtbl__phone { color:#475569; }
.dtbl__sum { font-weight:800; color:#b91c1c; white-space:nowrap; }
.dtbl__late { font-size:10.5px; font-weight:600; color:#b91c1c; margin-top:3px; }
.dtbl__note { font-size:12px; color:#475569; max-width:280px; }
.dtbl__kind { font-weight:700; color:#334155; }
.dtbl__dim { color:#cbd5e1; }
.dtbl__tags { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }

.dtag { display:inline-flex; align-items:center; gap:3px; padding:1px 7px; font-size:10.5px; font-weight:600; color:#4338ca; background:#e0e7ff; border-radius:20px; }
.dtag--big { padding:4px 10px; font-size:12px; }
.dtag__x { border:none; background:transparent; color:inherit; cursor:pointer; font-size:14px; line-height:1; padding:0 0 0 2px; }

.dbadge { display:inline-block; padding:2px 9px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; }
.dbadge--kechikkan { color:#b91c1c; background:#fee2e2; }
.dbadge--bugun     { color:#b45309; background:#fef3c7; }
.dbadge--hafta     { color:#0369a1; background:#e0f2fe; }
.dbadge--keyin     { color:#475569; background:#f1f5f9; }
.dbadge--muddatsiz { color:#64748b; background:#f8fafc; border:1px dashed #cbd5e1; }

.dstat { display:inline-block; padding:2px 9px; font-size:11.5px; font-weight:700; border-radius:20px; white-space:nowrap; }
.dbell { display:inline-flex; align-items:center; gap:2px; margin-left:6px; padding:1px 6px; font-size:10.5px; font-weight:700; color:#b45309; background:#fef3c7; border-radius:20px; }

/* Kartochka modal */
.dmod { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,.55); padding:20px; }
.dmod__box { width:100%; max-width:680px; max-height:88vh; display:flex; flex-direction:column; background:#fff; border-radius:14px; overflow:hidden; }
.dmod__hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #e2e8f0; }
.dmod__name { font-size:17px; font-weight:800; color:#0f172a; }
.dmod__phone { font-size:12.5px; color:#64748b; margin-top:2px; }
.dmod__x { display:flex; padding:6px; color:#64748b; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; }
.dmod__body { flex:1; overflow-y:auto; padding:16px 20px 20px; }

.dsum { display:flex; gap:12px; margin-bottom:16px; }
.dsum__item { flex:1; padding:11px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; }
.dsum__lbl { font-size:11px; color:#64748b; }
.dsum__val { font-size:16px; font-weight:800; color:#0f172a; margin-top:2px; }
.dsum__val--red { color:#b91c1c; }

.dsec { margin-bottom:18px; }
.dsec__t { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#64748b; margin-bottom:8px; }

.dstat-row { display:flex; flex-wrap:wrap; gap:6px; }
.dstat-btn { padding:6px 13px; font-size:12.5px; font-weight:600; color:#475569; background:#fff; border:1.5px solid #e2e8f0; border-radius:8px; cursor:pointer; font-family:inherit; }
.dstat-btn:disabled { opacity:.5; cursor:not-allowed; }

.dtag-row { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.dtag-inp { width:110px; padding:4px 10px; font-size:12px; border:1px dashed #cbd5e1; border-radius:20px; outline:none; }

.dq { display:flex; align-items:center; gap:12px; padding:9px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; margin-bottom:6px; }
.dq__l { flex:1; }
.dq__doc { font-size:13px; font-weight:700; color:#0f172a; }
.dq__date { font-size:11px; color:#94a3b8; }
.dq__due { display:flex; flex-direction:column; align-items:flex-end; gap:3px; }
.dq__inp { padding:4px 8px; font-size:12px; border:1px solid #e2e8f0; border-radius:6px; outline:none; }
.dq__sum { font-size:14px; font-weight:800; color:#b91c1c; white-space:nowrap; min-width:90px; text-align:right; }

.dpay { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:7px 12px; font-size:12.5px; color:#475569; border-bottom:1px solid #f1f5f9; }
.dpay__type { font-size:11px; color:#94a3b8; }
.dpay__sum { color:#047857; }

.dnote-add { padding:11px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; margin-bottom:10px; }
.dnote-add__row { display:flex; gap:7px; margin-bottom:7px; }
.dnote-add__sel, .dnote-add__date { padding:6px 9px; font-size:12.5px; border:1px solid #e2e8f0; border-radius:7px; outline:none; font-family:inherit; }
.dnote-add__txt { width:100%; padding:8px 10px; font-size:13px; border:1px solid #e2e8f0; border-radius:7px; outline:none; resize:vertical; font-family:inherit; }
.dnote-add__btn { display:flex; align-items:center; gap:5px; margin-top:7px; padding:7px 15px; font-size:12.5px; font-weight:600; color:#fff; background:#4f46e5; border:none; border-radius:7px; cursor:pointer; font-family:inherit; }

.dnote { padding:9px 12px; border-left:3px solid #e2e8f0; background:#fff; margin-bottom:6px; }
.dnote.done { opacity:.55; }
.dnote__hdr { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:3px; }
.dnote__kind { font-size:11px; font-weight:700; color:#4338ca; }
.dnote__at, .dnote__user { font-size:11px; color:#94a3b8; }
.dnote__rem { display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700; color:#b45309; background:#fef3c7; padding:1px 7px; border-radius:20px; }
.dnote__acts { margin-left:auto; display:flex; gap:6px; }
.dnote__act { font-size:11px; color:#64748b; background:none; border:none; cursor:pointer; font-family:inherit; text-decoration:underline; }
.dnote__act--del { color:#b91c1c; }
.dnote__txt { font-size:13px; color:#334155; line-height:1.45; }
.dnote-empty { font-size:12.5px; color:#94a3b8; text-align:center; padding:12px; }

.ta-c { text-align:center; } .ta-r { text-align:right; }
</style>
