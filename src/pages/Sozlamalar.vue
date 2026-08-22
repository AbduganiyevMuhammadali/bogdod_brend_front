<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { backupApi } from '@/api/backup.js'
import { botApi } from '@/api/bot.js'
import { showToast } from '@/composables/useToast.js'

const STORAGE_KEY = 'pos_settings'

const saved   = ref(false)
const form    = reactive({
  storeName:     '',
  storeAddress:  '',
  storePhone:    '',
  storeTax:      '',
  receiptHeader: '',
  receiptFooter: '',
  currency:      'so\'m',
  priceType:     'chakana',
  language:      'uz',
  exchangeRate:  0,
  showUSD:       false,
})

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(form, JSON.parse(raw))
  } catch { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form }))
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

// ── Zaxira nusxa ──────────────────────────────────────────────────────
const backupInfo  = reactive({ available: null, sizeMb: null, database: '' })
const downloading = ref(false)
const yuklandi    = ref('Yuklanmoqda…')

async function loadBackupInfo() {
  try {
    Object.assign(backupInfo, await backupApi.getInfo())
  } catch {
    // Huquqi yo'q yoki server eski — tugma baribir ko'rinadi, bosilganda
    // aniq xato chiqadi
  }
}

async function downloadBackup() {
  if (downloading.value) return
  downloading.value = true
  yuklandi.value = 'Yuklanmoqda…'
  try {
    const r = await backupApi.download({
      onProgress: loaded => {
        const mb = (loaded / 1024 / 1024).toFixed(1)
        yuklandi.value = `${mb} MB olindi…`
      },
    })
    const mb = (r.size / 1024 / 1024).toFixed(2)
    showToast(`Zaxira nusxa saqlandi: ${r.name} (${mb} MB)`, 'ok')
  } catch (e) {
    showToast(e.message || 'Zaxira nusxa olishda xatolik', 'err')
  } finally {
    downloading.value = false
  }
}

// ── Telegram bot ────────────────────────────────────────────────────
// Do'kon 6 xonali kod yasaydi, egasi uni botga yuboradi. Kod 5 daqiqa
// amal qiladi va bir marta ishlatiladi — Telegram'da parol yozilmaydi.
const botLinks   = ref([])
const botCode    = ref('')
const botExpires = ref(null)
const botBusy    = ref(false)
const botQoldi   = ref(0)
let botTimer = null

async function loadBotLinks() {
  try { botLinks.value = await botApi.getLinks() } catch { /* huquq yo'q */ }
}

async function kodOl() {
  botBusy.value = true
  try {
    const r = await botApi.createCode()
    botCode.value = r.code
    botExpires.value = new Date(r.expires_at)
    sanoqBoshla()
    showToast('Kod yaratildi — 5 daqiqa ichida botga yuboring', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Kod olishda xatolik', 'err')
  } finally { botBusy.value = false }
}

// Qolgan vaqtni sanab turamiz — kod qachon eskirishi ko'rinsin
function sanoqBoshla() {
  clearInterval(botTimer)
  const yangila = () => {
    if (!botExpires.value) return
    const q = Math.max(0, Math.round((botExpires.value - Date.now()) / 1000))
    botQoldi.value = q
    if (q === 0) { botCode.value = ''; clearInterval(botTimer) }
  }
  yangila()
  botTimer = setInterval(yangila, 1000)
}
const botQoldiMatn = computed(() => {
  const m = Math.floor(botQoldi.value / 60)
  const s = botQoldi.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

async function botUzish(link) {
  if (!confirm(`"${link.chat_name || link.chat_id}" bog'lanishi uzilsinmi?`)) return
  try {
    await botApi.unlink(link.id)
    await loadBotLinks()
    showToast('Bog\'lanish uzildi', 'ok')
  } catch { showToast('Xatolik', 'err') }
}

onUnmounted(() => clearInterval(botTimer))

onMounted(() => {
  loadSettings()
  loadBackupInfo()
  loadBotLinks()
})

const SECTIONS = [
  { key: 'store',    label: 'Dokon ma\'lumotlari', icon: 'home'       },
  { key: 'receipt',  label: 'Chek sozlamalari',    icon: 'printer'    },
  { key: 'currency', label: 'Valyuta / Kurs',      icon: 'dollar-sign'},
  { key: 'system',   label: 'Tizim sozlamalari',   icon: 'settings'   },
]
const activeSection = ref('store')
</script>

<template>
  <div class="page">

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <div class="page__topbar">
      <div class="page__topbar-l">
        <h2 class="page__title">Sozlamalar</h2>
      </div>
      <button class="save-btn" :class="{ saved }" @click="saveSettings">
        <AppIcon :name="saved ? 'check' : 'save'" :size="15"/>
        {{ saved ? 'Saqlandi!' : 'Saqlash' }}
      </button>
    </div>

    <div class="settings-layout">

      <!-- ── Left nav ────────────────────────────────────────────── -->
      <nav class="settings-nav">
        <button
          v-for="s in SECTIONS" :key="s.key"
          class="snav-item" :class="{ on: activeSection === s.key }"
          @click="activeSection = s.key"
        >
          <AppIcon :name="s.icon" :size="16"/>
          {{ s.label }}
        </button>
      </nav>

      <!-- ── Content ─────────────────────────────────────────────── -->
      <div class="settings-content">

        <!-- Dokon ma'lumotlari -->
        <div v-if="activeSection === 'store'" class="settings-section">
          <h3 class="section-title">Dokon ma'lumotlari</h3>
          <p class="section-sub">Bu ma'lumotlar cheklarda va hisobotlarda ko'rsatiladi.</p>

          <div class="form-grid">
            <div class="field field--full">
              <label>Dokon nomi *</label>
              <input v-model="form.storeName" class="inp" placeholder="Masalan: Baxt Supermarket"/>
            </div>
            <div class="field field--full">
              <label>Manzil</label>
              <input v-model="form.storeAddress" class="inp" placeholder="Toshkent sh., Mirzo Ulug'bek ko'chasi 12"/>
            </div>
            <div class="field">
              <label>Telefon raqam</label>
              <input v-model="form.storePhone" class="inp" placeholder="+998 71 000 00 00"/>
            </div>
            <div class="field">
              <label>Soliq raqami (INN)</label>
              <input v-model="form.storeTax" class="inp" placeholder="123456789"/>
            </div>
          </div>
        </div>

        <!-- Chek sozlamalari -->
        <div v-if="activeSection === 'receipt'" class="settings-section">
          <h3 class="section-title">Chek sozlamalari</h3>
          <p class="section-sub">Chekda chiqadigan sarlavha va pastki matn.</p>

          <div class="form-grid">
            <div class="field field--full">
              <label>Chek sarlavhasi</label>
              <textarea
                v-model="form.receiptHeader"
                class="inp inp--ta" rows="3"
                placeholder="Masalan: Xaridingiz uchun rahmat!"
              ></textarea>
            </div>
            <div class="field field--full">
              <label>Chek oxirgi matni</label>
              <textarea
                v-model="form.receiptFooter"
                class="inp inp--ta" rows="3"
                placeholder="Masalan: Yana keling! Tel: +998 71 000 00 00"
              ></textarea>
            </div>
          </div>

          <!-- Preview -->
          <div class="receipt-preview">
            <div class="rp__header">{{ form.storeName || 'Dokon nomi' }}</div>
            <div v-if="form.storeAddress" class="rp__sub">{{ form.storeAddress }}</div>
            <div v-if="form.storePhone" class="rp__sub">{{ form.storePhone }}</div>
            <div class="rp__divider">- - - - - - - - - - - - - - -</div>
            <div class="rp__row"><span>Mahsulot 1</span><span>25 000</span></div>
            <div class="rp__row"><span>Mahsulot 2</span><span>15 000</span></div>
            <div class="rp__divider">- - - - - - - - - - - - - - -</div>
            <div class="rp__row rp__row--total"><span>JAMI</span><span>40 000 {{ form.currency }}</span></div>
            <div class="rp__divider">- - - - - - - - - - - - - - -</div>
            <div v-if="form.receiptHeader" class="rp__footer">{{ form.receiptHeader }}</div>
            <div v-if="form.receiptFooter" class="rp__footer">{{ form.receiptFooter }}</div>
          </div>
        </div>

        <!-- Valyuta / Kurs -->
        <div v-if="activeSection === 'currency'" class="settings-section">
          <h3 class="section-title">Valyuta va dollar kursi</h3>
          <p class="section-sub">Dollar kursi kiritilsa, POS da barcha narxlar va hisobotlar ikki valyutada ko'rsatiladi.</p>

          <div class="currency-hero">
            <div class="ch-flag ch-flag--uzs">so'm</div>
            <div class="ch-arrow"><AppIcon name="arrow-right" :size="20"/></div>
            <div class="ch-flag ch-flag--usd">$</div>
          </div>

          <div class="form-grid">
            <div class="field field--full">
              <label>1 USD = ? so'm (joriy kurs)</label>
              <div class="rate-inp-wrap">
                <span class="rate-inp-prefix">1 $ =</span>
                <input
                  v-model.number="form.exchangeRate"
                  type="number"
                  min="0"
                  step="10"
                  class="inp rate-inp"
                  placeholder="Masalan: 12700"
                />
                <span class="rate-inp-suffix">so'm</span>
              </div>
              <p class="field-hint" v-if="form.exchangeRate > 0">
                1 000 so'm = <strong>{{ (1000 / form.exchangeRate).toFixed(4) }} $</strong>
              </p>
            </div>
            <div class="field field--full">
              <label>Dollar ko'rinishini yoqish</label>
              <div class="toggle-row">
                <button
                  class="toggle-btn"
                  :class="form.showUSD && 'toggle-btn--on'"
                  @click="form.showUSD = !form.showUSD"
                >
                  <span class="toggle-knob"></span>
                </button>
                <span class="toggle-lbl">
                  {{ form.showUSD ? 'Yoqilgan — narxlar so\'m va $ da ko\'rsatiladi' : 'O\'chirilgan — faqat so\'mda' }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="form.exchangeRate > 0 && form.showUSD" class="rate-preview">
            <div class="rp-title">Namuna ko'rinish</div>
            <div class="rp-example">
              <div class="rpe__lbl">Mahsulot narxi</div>
              <div class="rpe__vals">
                <span class="rpe__uzs">{{ new Intl.NumberFormat('uz-UZ').format(50000) }} so'm</span>
                <span class="rpe__sep">≈</span>
                <span class="rpe__usd">{{ (50000 / form.exchangeRate).toFixed(2) }} $</span>
              </div>
            </div>
            <div class="rp-example">
              <div class="rpe__lbl">Jami sotuv (1 000 000 so'm)</div>
              <div class="rpe__vals">
                <span class="rpe__uzs">1 000 000 so'm</span>
                <span class="rpe__sep">≈</span>
                <span class="rpe__usd">{{ (1000000 / form.exchangeRate).toFixed(2) }} $</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tizim sozlamalari -->
        <div v-if="activeSection === 'system'" class="settings-section">
          <h3 class="section-title">Tizim sozlamalari</h3>
          <p class="section-sub">Asosiy POS xulq-atvori.</p>

          <div class="form-grid">
            <div class="field">
              <label>Valyuta belgisi</label>
              <select v-model="form.currency" class="inp">
                <option value="so'm">so'm</option>
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div class="field">
              <label>Standart narx turi</label>
              <select v-model="form.priceType" class="inp">
                <option value="chakana">Chakana</option>
                <option value="ulgurji">Ulgurji</option>
              </select>
            </div>
            <div class="field">
              <label>Til</label>
              <select v-model="form.language" class="inp">
                <option value="uz">O'zbekcha</option>
                <option value="ru">Русский</option>
              </select>
            </div>
          </div>

          <!-- ── Zaxira nusxa ──────────────────────────────────────── -->
          <div class="backup">
            <div class="backup__l">
              <div class="backup__ico"><AppIcon name="database" :size="18"/></div>
              <div>
                <p class="backup__title">Bazadan zaxira nusxa olish</p>
                <p class="backup__sub">
                  Bazaning ayni shu paytdagi to'liq nusxasi <code>.sql</code> fayl
                  bo'lib yuklab olinadi.
                  <template v-if="backupInfo.sizeMb != null">
                    Baza hajmi: ~{{ backupInfo.sizeMb }} MB.
                  </template>
                  Xavfli amallardan (masalan inventarizatsiyani qaytarish)
                  oldin albatta nusxa oling.
                </p>
              </div>
            </div>
            <button
              class="backup__btn"
              :disabled="downloading || backupInfo.available === false"
              @click="downloadBackup"
            >
              <AppIcon :name="downloading ? 'loader' : 'download'" :size="15"/>
              {{ downloading ? yuklandi : 'Zaxira nusxani yuklab olish' }}
            </button>
          </div>
          <p v-if="backupInfo.available === false" class="backup__err">
            Serverda <code>mysqldump</code> topilmadi. Nusxa olish uchun
            <code>mysql-client</code> o'rnatilishi kerak.
          </p>

          <!-- ── Telegram bot ──────────────────────────────────────── -->
          <div class="tbot">
            <div class="tbot__hdr">
              <div class="tbot__ico"><AppIcon name="send" :size="17"/></div>
              <div>
                <p class="tbot__title">Telegram bot</p>
                <p class="tbot__sub">
                  Hisobotlarni Telegram'dan ko'ring: kunlik savdo, foyda,
                  qarzdorlar va kam qolgan tovarlar.
                </p>
              </div>
            </div>

            <!-- Ulanish kodi -->
            <div v-if="botCode" class="tbot__code">
              <div class="tbot__code-num">{{ botCode }}</div>
              <div class="tbot__code-info">
                <div class="tbot__code-lbl">Shu kodni botga yuboring</div>
                <div class="tbot__code-time">Amal qilish muddati: {{ botQoldiMatn }}</div>
              </div>
            </div>

            <div class="tbot__steps" v-if="!botCode">
              <span class="tbot__step">1. Telegramda <b>@sellz_pos_bot</b> ni oching</span>
              <span class="tbot__step">2. Quyidagi tugmani bosib kod oling</span>
              <span class="tbot__step">3. Kodni botga yuboring</span>
            </div>

            <button class="tbot__btn" :disabled="botBusy" @click="kodOl">
              <AppIcon name="plus" :size="14"/>
              {{ botCode ? 'Yangi kod olish' : 'Ulanish kodini olish' }}
            </button>

            <!-- Bog'langan chatlar -->
            <div v-if="botLinks.length" class="tbot__links">
              <div class="tbot__links-t">Ulangan Telegram chatlar</div>
              <div v-for="l in botLinks" :key="l.id" class="tbot__link">
                <div>
                  <div class="tbot__link-name">{{ l.chat_name || ('Chat ' + l.chat_id) }}</div>
                  <div class="tbot__link-meta">
                    {{ l.daily ? 'Kunlik xabar yoqilgan' : 'Kunlik xabar o\'chirilgan' }}
                  </div>
                </div>
                <button class="tbot__unlink" @click="botUzish(l)">Uzish</button>
              </div>
            </div>
          </div>

          <!-- Info cards -->
          <div class="info-cards">
            <div class="info-card">
              <div class="info-card__ico info-card__ico--green"><AppIcon name="shield-check" :size="16"/></div>
              <div>
                <p class="info-card__title">Ma'lumotlar xavfsizligi</p>
                <p class="info-card__sub">Barcha ma'lumotlar mahalliy serverda saqlanadi</p>
              </div>
            </div>
            <div class="info-card">
              <div class="info-card__ico info-card__ico--indigo"><AppIcon name="monitor" :size="16"/></div>
              <div>
                <p class="info-card__title">Versiya</p>
                <p class="info-card__sub">BDM POS v1.0.0 — Barcha huquqlar himoyalangan</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; height:calc(100vh - var(--header-h)); overflow:hidden; }

.page__topbar { display:flex; align-items:center; justify-content:space-between; padding:18px 24px 14px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.page__topbar-l { display:flex; align-items:center; gap:14px; }
.page__title { font-size:18px; font-weight:800; color:var(--color-text); letter-spacing:-0.03em; }

.save-btn { display:flex; align-items:center; gap:8px; padding:0 22px; height:40px; border-radius:var(--r-xl); background:linear-gradient(135deg,var(--indigo-500),var(--violet-500)); color:white; font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; box-shadow:0 4px 14px rgba(99,102,241,.35); transition:all var(--t-base); }
.save-btn.saved { background:linear-gradient(135deg,#10b981,#059669); box-shadow:0 4px 14px rgba(16,185,129,.35); }
.save-btn:hover { opacity:.9; transform:translateY(-1px); }

/* Layout */
.settings-layout { display:flex; flex:1; overflow:hidden; }

/* Left nav */
.settings-nav { width:220px; flex-shrink:0; border-right:1px solid var(--color-border); padding:20px 12px; display:flex; flex-direction:column; gap:2px; }
.snav-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:var(--r-lg); font-size:13.5px; font-weight:500; color:var(--color-text-3); cursor:pointer; font-family:inherit; transition:all var(--t-base); text-align:left; }
.snav-item:hover { background:var(--slate-50); color:var(--color-text); }
.snav-item.on { background:var(--indigo-50); color:var(--indigo-600); font-weight:700; }

/* Content */
.settings-content { flex:1; overflow-y:auto; padding:28px 32px; }
.settings-section { max-width:640px; }
.section-title { font-size:16px; font-weight:800; color:var(--color-text); letter-spacing:-0.02em; }
.section-sub { font-size:13px; color:var(--color-text-3); margin-top:4px; margin-bottom:24px; }

/* Form */
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.field { display:flex; flex-direction:column; gap:6px; }
.field--full { grid-column:1/-1; }
.field label { font-size:12px; font-weight:600; color:var(--color-text-2); }
.inp { height:40px; padding:0 13px; border:1.5px solid var(--color-border); border-radius:var(--r-lg); font-size:13.5px; color:var(--color-text); background:var(--color-surface); outline:none; font-family:inherit; width:100%; transition:border-color var(--t-base); }
.inp:focus { border-color:var(--indigo-300); box-shadow:0 0 0 3px rgba(99,102,241,.08); }
.inp--ta { height:auto; padding:11px 13px; resize:vertical; }
select.inp { cursor:pointer; }

/* Receipt preview */
.receipt-preview { margin-top:24px; background:white; border:1.5px dashed var(--color-border); border-radius:var(--r-xl); padding:20px; max-width:260px; font-family:monospace; font-size:12px; line-height:1.7; }
.rp__header { font-size:14px; font-weight:700; text-align:center; }
.rp__sub { font-size:11px; text-align:center; color:#666; }
.rp__divider { color:#999; margin:6px 0; text-align:center; }
.rp__row { display:flex; justify-content:space-between; }
.rp__row--total { font-weight:700; font-size:13px; }
.rp__footer { text-align:center; color:#555; font-size:11px; margin-top:4px; }

/* Info cards */
/* ── Zaxira nusxa ─────────────────────────────────────────────────── */
.backup {
  display:flex; align-items:center; justify-content:space-between; gap:20px;
  margin-top:24px; padding:16px 18px;
  background:linear-gradient(135deg,#eff6ff,#f8fafc);
  border:1px solid #bfdbfe; border-radius:12px;
}
.backup__l { display:flex; align-items:flex-start; gap:13px; }
.backup__ico {
  display:flex; align-items:center; justify-content:center;
  width:38px; height:38px; flex-shrink:0;
  color:#1d4ed8; background:#dbeafe; border-radius:9px;
}
.backup__title { font-size:14px; font-weight:600; color:#0f172a; margin:0 0 3px; }
.backup__sub   { font-size:12.5px; color:#475569; line-height:1.5; margin:0; max-width:560px; }
.backup__sub code {
  padding:1px 5px; font-size:11.5px;
  background:#e2e8f0; border-radius:4px;
}
.backup__btn {
  display:flex; align-items:center; gap:7px; flex-shrink:0;
  padding:10px 18px; font-size:13px; font-weight:600; color:#fff;
  background:linear-gradient(135deg,#3b82f6,#2563eb);
  border:none; border-radius:9px; cursor:pointer;
  box-shadow:0 2px 8px rgba(37,99,235,.28);
}
.backup__btn:hover:not(:disabled) { filter:brightness(1.06); }
.backup__btn:disabled { opacity:.6; cursor:not-allowed; }
/* Yuklanayotganda belgi aylanib tursin */
.backup__btn:disabled :deep(.app-icon) { animation:backup-spin 1s linear infinite; }
@keyframes backup-spin { to { transform:rotate(360deg); } }
.backup__err {
  margin:10px 0 0; padding:10px 13px;
  font-size:12.5px; color:#b91c1c;
  background:#fef2f2; border:1px solid #fecaca; border-radius:9px;
}
.backup__err code { padding:1px 5px; background:#fee2e2; border-radius:4px; }

/* ── Telegram bot ─────────────────────────────────────────────────── */
.tbot { margin-top:24px; padding:16px 18px; background:linear-gradient(135deg,#eff6ff,#f8fafc); border:1px solid #bfdbfe; border-radius:12px; }
.tbot__hdr { display:flex; align-items:flex-start; gap:13px; margin-bottom:12px; }
.tbot__ico { display:flex; align-items:center; justify-content:center; width:38px; height:38px; flex-shrink:0; color:#fff; background:linear-gradient(135deg,#3b82f6,#2563eb); border-radius:9px; }
.tbot__title { font-size:14px; font-weight:700; color:#0f172a; margin:0 0 3px; }
.tbot__sub { font-size:12.5px; color:#475569; line-height:1.5; margin:0; max-width:560px; }

.tbot__code { display:flex; align-items:center; gap:14px; padding:12px 16px; margin-bottom:12px; background:#fff; border:2px dashed #3b82f6; border-radius:10px; }
.tbot__code-num { font-size:30px; font-weight:900; letter-spacing:.14em; color:#1d4ed8; font-variant-numeric:tabular-nums; }
.tbot__code-lbl { font-size:12.5px; font-weight:600; color:#334155; }
.tbot__code-time { font-size:11.5px; color:#64748b; margin-top:2px; font-variant-numeric:tabular-nums; }

.tbot__steps { display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
.tbot__step { font-size:12.5px; color:#475569; }

.tbot__btn { display:flex; align-items:center; gap:6px; padding:9px 16px; font-size:13px; font-weight:600; color:#fff; background:linear-gradient(135deg,#3b82f6,#2563eb); border:none; border-radius:8px; cursor:pointer; font-family:inherit; }
.tbot__btn:hover:not(:disabled) { filter:brightness(1.06); }
.tbot__btn:disabled { opacity:.6; cursor:not-allowed; }

.tbot__links { margin-top:14px; padding-top:12px; border-top:1px solid #bfdbfe; }
.tbot__links-t { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:#64748b; margin-bottom:8px; }
.tbot__link { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:6px; }
.tbot__link-name { font-size:13px; font-weight:600; color:#0f172a; }
.tbot__link-meta { font-size:11px; color:#94a3b8; margin-top:1px; }
.tbot__unlink { padding:5px 12px; font-size:12px; font-weight:600; color:#b91c1c; background:#fef2f2; border:1px solid #fecaca; border-radius:7px; cursor:pointer; font-family:inherit; }

.info-cards { display:flex; flex-direction:column; gap:10px; margin-top:24px; }
.info-card { display:flex; align-items:center; gap:14px; padding:14px 16px; border:1px solid var(--color-border); border-radius:var(--r-xl); background:var(--color-surface); }
.info-card__ico { width:38px; height:38px; border-radius:var(--r-lg); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.info-card__ico--green  { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
.info-card__ico--blue   { background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; }
.info-card__ico--indigo { background:var(--indigo-50); color:var(--indigo-600); border:1px solid var(--indigo-100); }
.info-card__title { font-size:13px; font-weight:700; color:var(--color-text); }
.info-card__sub   { font-size:11.5px; color:var(--color-text-3); margin-top:2px; }

/* Currency section */
.currency-hero{display:flex;align-items:center;justify-content:center;gap:20px;padding:24px;background:linear-gradient(135deg,#f0fdf4,#eff6ff);border-radius:16px;margin-bottom:24px;border:1.5px solid #e2e8f0}
.ch-flag{width:60px;height:60px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;letter-spacing:.02em}
.ch-flag--uzs{background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white}
.ch-flag--usd{background:linear-gradient(135deg,#16a34a,#15803d);color:white}
.ch-arrow{color:#94a3b8}
.rate-inp-wrap{display:flex;align-items:center;gap:8px}
.rate-inp-prefix{font-size:14px;font-weight:700;color:#16a34a;white-space:nowrap}
.rate-inp{flex:1}
.rate-inp-suffix{font-size:13px;color:#94a3b8;white-space:nowrap}
.field-hint{font-size:12px;color:#6366f1;font-weight:600;margin-top:4px}
.toggle-row{display:flex;align-items:center;gap:12px;padding:12px 0}
.toggle-btn{width:44px;height:24px;border-radius:99px;background:#e2e8f0;position:relative;cursor:pointer;transition:all .2s;flex-shrink:0;border:none}
.toggle-btn--on{background:#6366f1}
.toggle-knob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:white;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:all .2s}
.toggle-btn--on .toggle-knob{left:23px}
.toggle-lbl{font-size:13px;color:#1e293b;font-weight:500}
.rate-preview{margin-top:20px;border:1.5px solid #c7d2fe;border-radius:14px;overflow:hidden}
.rp-title{padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6366f1;background:#eef2ff;border-bottom:1px solid #e0e7ff}
.rp-example{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #f1f5f9}
.rp-example:last-child{border-bottom:none}
.rpe__lbl{font-size:12.5px;color:#64748b}
.rpe__vals{display:flex;align-items:center;gap:8px}
.rpe__uzs{font-size:13px;font-weight:600;color:#1e293b}
.rpe__sep{color:#94a3b8;font-size:12px}
.rpe__usd{font-size:14px;font-weight:800;color:#16a34a}
</style>
