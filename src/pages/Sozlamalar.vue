<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { backupApi } from '@/api/backup.js'
import { botApi } from '@/api/bot.js'
import { showToast } from '@/composables/useToast.js'
import { useRoute } from 'vue-router'
import { aiApi } from '@/api/ai.js'
import { API_URL } from '@/api/http.js'
import { usePerms } from '@/composables/usePerms.js'
import { loadStatus as reloadAiStatus } from '@/composables/useAiAgent.js'
import { geminiInteract, extractText, geminiSynthesize } from '@/composables/geminiCore.js'

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

// Oxirgi faollik — "2 soat oldin" ko'rinishida
function botOxirgi(t) {
  if (!t) return ''
  const d = Math.floor((Date.now() - new Date(t)) / 60000)
  if (d < 2)    return 'hozir faol'
  if (d < 60)   return `${d} daqiqa oldin`
  if (d < 1440) return `${Math.floor(d / 60)} soat oldin`
  return `${Math.floor(d / 1440)} kun oldin`
}

async function botUzish(link) {
  if (!confirm(`"${link.chat_name || link.chat_id}" bog'lanishi uzilsinmi?`)) return
  try {
    await botApi.unlink(link.id)
    await loadBotLinks()
    showToast('Bog\'lanish uzildi', 'ok')
  } catch { showToast('Xatolik', 'err') }
}

onUnmounted(() => clearInterval(botTimer))

// ── AI yordamchi (Gemini) ───────────────────────────────────────────
// Kalit va model serverda (app_setting) saqlanadi — hamma qurilma uchun
// bir xil. Faqat admin ko'radi va o'zgartiradi.
const route = useRoute()
const { isAdmin } = usePerms()
const ai = reactive({
  loading: true, enabled: true, greeting: true,
  hasKey: false, keyMasked: '', keyFromEnv: false,
  model: '', customModel: '', thinking: 'low', ttsModel: '', voice: 'Kore',
  models: [], ttsModels: [], voices: [], thinkingLevels: [],
  apiKeyInput: '', showKey: false, saving: false, testing: false, testResult: null,
  // Ulanish: relay (server joylashuvi Gemini uchun qo'llanmasa)
  endpoint: '', defaultEndpoint: '', isDirect: true, hasRelayToken: false, relayTokenMasked: '', relayTokenInput: '', useRelay: false,
  // Rejim: auto | server | browser (effectiveMode — amalda qaysi biri)
  mode: 'auto', effectiveMode: 'server', locationBlocked: false,
})

const MODES = [
  { id: 'auto',    label: 'Avtomatik (tavsiya)', hint: "Server Gemini'ga yetsa — server; yetmasa (hudud cheklovi) — brauzer" },
  { id: 'server',  label: 'Faqat server',        hint: 'Kalit faqat serverda. Server joylashuvi Gemini uchun qo\'llanishi yoki relay bo\'lishi shart' },
  { id: 'browser', label: 'Faqat brauzer',       hint: "Gemini'ga kassirning brauzeri murojaat qiladi (O'zbekistondan ishlaydi)" },
]

async function loadAi() {
  ai.loading = true
  try {
    const r = await aiApi.getSettings()
    Object.assign(ai, {
      enabled: r.enabled, greeting: r.greeting, hasKey: r.hasKey, keyMasked: r.keyMasked, keyFromEnv: r.keyFromEnv,
      model: r.model, thinking: r.thinking, ttsModel: r.ttsModel, voice: r.voice,
      models: r.models, ttsModels: r.ttsModels, voices: r.voices, thinkingLevels: r.thinkingLevels,
      endpoint: r.isDirect ? '' : r.endpoint, defaultEndpoint: r.defaultEndpoint, isDirect: r.isDirect,
      hasRelayToken: r.hasRelayToken, relayTokenMasked: r.relayTokenMasked, useRelay: !r.isDirect,
      mode: r.mode, effectiveMode: r.effectiveMode, locationBlocked: r.locationBlocked,
    })
  } catch (e) {
    showToast(e?.response?.data?.message || 'AI sozlamalari yuklanmadi', 'err')
  } finally { ai.loading = false }
}

async function saveAi() {
  const model = ai.model === '__custom__' ? ai.customModel.trim() : ai.model
  if (!model) { showToast('Model nomini kiriting', 'err'); return }
  ai.saving = true
  try {
    const patch = { enabled: ai.enabled, greeting: ai.greeting, model, thinking: ai.thinking, ttsModel: ai.ttsModel, voice: ai.voice, mode: ai.mode }
    if (ai.apiKeyInput.trim()) patch.apiKey = ai.apiKeyInput.trim()
    // Relay: yoqilgan bo'lsa manzil shart; o'chirilsa Google'ga to'g'ridan-to'g'ri
    if (ai.useRelay) {
      if (!ai.endpoint.trim()) { showToast('Relay manzilini kiriting', 'err'); ai.saving = false; return }
      patch.endpoint = ai.endpoint.trim()
      if (ai.relayTokenInput.trim()) patch.relayToken = ai.relayTokenInput.trim()
    } else {
      patch.endpoint = ''
    }
    const r = await aiApi.saveSettings(patch)
    ai.apiKeyInput = ''
    ai.relayTokenInput = ''
    ai.testResult = null
    Object.assign(ai, { enabled: r.enabled, greeting: r.greeting, hasKey: r.hasKey, keyMasked: r.keyMasked, keyFromEnv: r.keyFromEnv,
                        model: r.model, thinking: r.thinking, ttsModel: r.ttsModel, voice: r.voice,
                        endpoint: r.isDirect ? '' : r.endpoint, isDirect: r.isDirect, useRelay: !r.isDirect,
                        hasRelayToken: r.hasRelayToken, relayTokenMasked: r.relayTokenMasked,
                        mode: r.mode, effectiveMode: r.effectiveMode, locationBlocked: r.locationBlocked })
    reloadAiStatus()
    showToast('AI sozlamalari saqlandi', 'ok')
  } catch (e) {
    showToast(e?.response?.data?.message || 'Saqlashda xatolik', 'err')
  } finally { ai.saving = false }
}

// Brauzer rejimida sinov: Gemini'ga shu brauzerdan murojaat
async function testViaBrowser() {
  const st = await aiApi.status()
  const b = st.browser
  if (!b?.apiKey) throw new Error('Brauzer rejimi uchun kalit olinmadi')
  const t0 = Date.now()
  const data = await geminiInteract({
    model: b.model, store: false,
    system_instruction: "Faqat o'zbek tilida, bitta qisqa gap bilan javob ber.",
    input: 'Salom! Ishga tayyormisan? Bir gapda javob ber.',
  }, { apiKey: b.apiKey, endpoint: b.endpoint, timeoutMs: 30000 })
  const text = extractText(data?.steps) || "(bo'sh javob)"
  const out = { ok: true, model: b.model, text, ms: Date.now() - t0, viaBrowser: true }
  if (b.ttsModel && b.ttsModel !== 'browser') {
    try {
      const a = await geminiSynthesize(text, { apiKey: b.apiKey, endpoint: b.endpoint, model: b.ttsModel, voice: b.voice })
      if (a?.data) new Audio(`data:${a.mime};base64,${a.data}`).play().catch(() => {})
    } catch (e) { out.ttsError = e.message }
  }
  return out
}

async function testAi() {
  ai.testing = true
  ai.testResult = null
  try {
    let r
    if (ai.effectiveMode === 'browser') {
      r = await testViaBrowser()
    } else {
      r = await aiApi.test(ai.ttsModel !== 'browser')
      if (r.browserMode) r = await testViaBrowser()
      else if (r.audio?.data) new Audio(`data:${r.audio.mime || 'audio/wav'};base64,${r.audio.data}`).play().catch(() => {})
    }
    ai.testResult = r
    await loadAi()
    reloadAiStatus()
  } catch (e) {
    const msg = e?.response?.data?.message || e.message
    // Server joylashuvi cheklangan → 'auto' rejim brauzerga o'tdi, qayta brauzerdan sinaymiz
    if (/joylashuvida ishlamaydi/.test(msg) && ai.mode === 'auto') {
      try {
        await loadAi()
        const r = await testViaBrowser()
        ai.testResult = { ...r, switched: true }
        reloadAiStatus()
        return
      } catch (e2) { ai.testResult = { ok: false, error: `${msg}\nBrauzerdan ham: ${e2.message}` }; return }
    }
    ai.testResult = { ok: false, error: msg }
  } finally { ai.testing = false }
}

// ── Tarmoq diagnostikasi ────────────────────────────────────────────
// Brauzer qayerda, Google API'ga yetadimi, server yetadimi — xato sababini
// aniqlash uchun. Google'ga soxta kalit bilan so'rov yuboriladi: tez "API key
// not valid" kelsa tarmoq ochiq, vaqt tugasa — bu tarmoq Google'ni bloklaydi.
const diag = reactive({ running: false, rows: [] })
async function timed(label, fn, ms = 12000) {
  const t0 = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const info = await fn(ctrl.signal)
    diag.rows.push({ label, ok: true, ms: Date.now() - t0, info })
  } catch (e) {
    const msg = e?.name === 'AbortError' ? `vaqt tugadi (${ms / 1000}s)` : (e?.message || String(e))
    diag.rows.push({ label, ok: false, ms: Date.now() - t0, info: msg })
  } finally { clearTimeout(timer) }
}
async function runDiag() {
  diag.running = true
  diag.rows = []
  await timed('Brauzer joylashuvi (ipinfo.io)', async signal => {
    const r = await fetch('https://ipinfo.io/json', { signal })
    const d = await r.json()
    return `${d.country || '?'} ${d.city || ''} — ${d.org || ''} (IP ${d.ip || '?'})`
  })
  await timed('Do\'kon serveri (API)', async signal => {
    const r = await fetch(`${API_URL}/ai/status`, { signal })
    return `HTTP ${r.status} (401 bo\'lsa ham server ishlayapti)`
  })
  await timed('Google Gemini API (brauzerdan)', async signal => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'diagnostika-soxta-kalit' },
      body: JSON.stringify({ model: 'gemini-4-hydrogen', input: 'salom' }),
    })
    const t = await r.text()
    if (/location is not supported/i.test(t)) return `HTTP ${r.status}: Google bu joylashuvdan ishlamaydi (User location is not supported)`
    if (/API key not valid/i.test(t)) return `HTTP ${r.status}: Google'ga yetdi (soxta kalit rad etildi — kutilgan). Tarmoq OCHIQ`
    return `HTTP ${r.status}: ${t.slice(0, 120)}`
  })
  await timed('Google (umumiy, www.gstatic.com)', async signal => {
    const r = await fetch('https://www.gstatic.com/generate_204', { signal, mode: 'no-cors' })
    return 'javob keldi'
  }, 8000)
  diag.running = false
}

async function deleteKey() {
  if (!confirm('Gemini API kaliti o\'chirilsinmi? AI yordamchi ishlamay qoladi.')) return
  try {
    const r = await aiApi.saveSettings({ apiKey: '__delete__' })
    Object.assign(ai, { hasKey: r.hasKey, keyMasked: r.keyMasked, keyFromEnv: r.keyFromEnv })
    reloadAiStatus()
    showToast('Kalit o\'chirildi', 'ok')
  } catch { showToast('Xatolik', 'err') }
}

onMounted(() => {
  loadSettings()
  loadBackupInfo()
  loadBotLinks()
  if (isAdmin.value) loadAi()
})

const BASE_SECTIONS = [
  { key: 'store',    label: 'Dokon ma\'lumotlari', icon: 'home'       },
  { key: 'receipt',  label: 'Chek sozlamalari',    icon: 'printer'    },
  { key: 'currency', label: 'Valyuta / Kurs',      icon: 'dollar-sign'},
  { key: 'system',   label: 'Tizim sozlamalari',   icon: 'settings'   },
]
// AI bo'limi faqat administratorga
const SECTIONS = computed(() => isAdmin.value
  ? [...BASE_SECTIONS, { key: 'ai', label: 'AI yordamchi', icon: 'sparkles' }]
  : BASE_SECTIONS)
// AI agent "Sozlamalarga o'tish" dan kelganda shu bo'lim ochiladi
const activeSection = ref(route.query.section === 'ai' ? 'ai' : 'store')
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

        <!-- AI yordamchi (Gemini) -->
        <div v-if="activeSection === 'ai'" class="settings-section">
          <h3 class="section-title">AI yordamchi (Gemini)</h3>
          <p class="section-sub">
            Pastdagi "Sellz AI" tugmasi: savdo, qarz, qoldiq haqida ovozli savol-javob.
            Google Gemini bilan ishlaydi, kalit faqat serverda saqlanadi.
          </p>

          <div v-if="ai.loading" class="ai-note">Yuklanmoqda…</div>
          <template v-else>
            <div class="ai-status" :class="ai.hasKey ? 'ok' : 'warn'">
              <AppIcon :name="ai.hasKey ? 'check-circle' : 'alert-circle'" :size="16"/>
              <span v-if="ai.hasKey">
                Ulangan — kalit: <code>{{ ai.keyMasked }}</code>
                <span v-if="ai.keyFromEnv"> (serverdagi .env dan)</span>
                · rejim: <b>{{ ai.effectiveMode === 'browser' ? 'brauzer orqali' : 'server orqali' }}</b>
                <span v-if="ai.effectiveMode === 'browser' && ai.mode === 'auto'"> (server joylashuvi Gemini uchun cheklangan, avtomatik o'tildi)</span>
              </span>
              <span v-else>
                Kalit kiritilmagan.
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>
                dan bepul kalit oling va pastga kiriting.
              </span>
            </div>

            <div class="form-grid">
              <div class="field field--full">
                <label>Yoqish</label>
                <div class="toggle-row">
                  <button class="toggle-btn" :class="ai.enabled && 'toggle-btn--on'" @click="ai.enabled = !ai.enabled">
                    <span class="toggle-knob"></span>
                  </button>
                  <span class="toggle-lbl">{{ ai.enabled ? 'AI yordamchi yoqilgan' : 'O\'chirilgan — tugma ko\'rinmaydi' }}</span>
                </div>
              </div>

              <div class="field field--full">
                <label>Gemini API kaliti</label>
                <div class="ai-key">
                  <input
                    v-model="ai.apiKeyInput"
                    :type="ai.showKey ? 'text' : 'password'"
                    class="inp"
                    :placeholder="ai.hasKey ? 'Yangi kalit kiritsangiz eskisi almashadi' : 'AIza…'"
                    autocomplete="off"
                  />
                  <button class="ai-key__eye" type="button" @click="ai.showKey = !ai.showKey">
                    <AppIcon :name="ai.showKey ? 'eye-off' : 'eye'" :size="15"/>
                  </button>
                </div>
                <p class="field-hint">Kalit brauzerda saqlanmaydi — faqat serverdagi bazada.</p>
              </div>

              <div class="field">
                <label>Model (suhbat)</label>
                <select v-model="ai.model" class="inp">
                  <option v-for="m in ai.models" :key="m.id" :value="m.id">{{ m.label }}</option>
                  <option v-if="ai.model && ai.model !== '__custom__' && !ai.models.some(m => m.id === ai.model)" :value="ai.model">{{ ai.model }}</option>
                  <option value="__custom__">Boshqa model…</option>
                </select>
                <input v-if="ai.model === '__custom__'" v-model="ai.customModel" class="inp" placeholder="masalan: gemini-4-neon" style="margin-top:6px"/>
              </div>

              <div class="field">
                <label>Fikrlash darajasi</label>
                <select v-model="ai.thinking" class="inp">
                  <option v-for="t in ai.thinkingLevels" :key="t" :value="t">{{ t }}</option>
                </select>
                <p class="field-hint">low — tez va arzon (tavsiya)</p>
              </div>

              <div class="field">
                <label>Ovoz (TTS) modeli</label>
                <select v-model="ai.ttsModel" class="inp">
                  <option v-for="m in ai.ttsModels" :key="m.id" :value="m.id">{{ m.label }}</option>
                </select>
              </div>

              <div class="field">
                <label>Ovoz tembri</label>
                <select v-model="ai.voice" class="inp" :disabled="ai.ttsModel === 'browser'">
                  <option v-for="v in ai.voices" :key="v" :value="v">{{ v }}</option>
                </select>
              </div>

              <div class="field field--full">
                <label>Ochilganda xulosa</label>
                <div class="toggle-row">
                  <button class="toggle-btn" :class="ai.greeting && 'toggle-btn--on'" @click="ai.greeting = !ai.greeting">
                    <span class="toggle-knob"></span>
                  </button>
                  <span class="toggle-lbl">Tugma bosilganda bugungi savdo va qarzlar xulosasini ovoz bilan aytadi</span>
                </div>
              </div>
            </div>

            <!-- Ulanish: relay -->
            <div class="ai-relay">
              <div class="ai-relay__hd">
                <div>
                  <p class="ai-relay__t">Ulanish</p>
                  <p class="ai-relay__s">
                    Gemini ba'zi hududlarda (masalan Rossiyadagi serverlar) ishlamaydi —
                    "User location is not supported". Bunda so'rovlar ruxsat etilgan hududdagi
                    <b>relay</b> orqali yuboriladi.
                  </p>
                </div>
                <div class="toggle-row">
                  <button class="toggle-btn" :class="ai.useRelay && 'toggle-btn--on'" @click="ai.useRelay = !ai.useRelay">
                    <span class="toggle-knob"></span>
                  </button>
                  <span class="toggle-lbl">{{ ai.useRelay ? 'Relay orqali' : "To'g'ridan-to'g'ri Google" }}</span>
                </div>
              </div>
              <div class="form-grid" style="margin-bottom:10px">
                <div class="field field--full">
                  <label>Rejim</label>
                  <select v-model="ai.mode" class="inp">
                    <option v-for="m in MODES" :key="m.id" :value="m.id">{{ m.label }}</option>
                  </select>
                  <p class="field-hint">{{ MODES.find(m => m.id === ai.mode)?.hint }}</p>
                  <p v-if="ai.mode !== 'server'" class="field-hint">
                    Brauzer rejimida Gemini kaliti dasturga kirgan xodimlar brauzeriga yuboriladi. Google Cloud'da kalitni
                    faqat shu dastur manziliga (HTTP referrer) cheklash tavsiya etiladi.
                  </p>
                </div>
              </div>
              <div v-if="ai.useRelay" class="form-grid">
                <div class="field field--full">
                  <label>Relay manzili</label>
                  <input v-model="ai.endpoint" class="inp" placeholder="http://RELAY_IP:3977/v1beta/interactions"/>
                  <p class="field-hint">
                    Relay — <code>beckend/tools/gemini-relay.js</code> (o'z serveringizda, masalan Toshkentdagi VPS) yoki
                    <code>gemini-relay.worker.js</code> (Cloudflare Workers, bepul).
                  </p>
                </div>
                <div class="field field--full">
                  <label>Relay token</label>
                  <input v-model="ai.relayTokenInput" class="inp" type="password" autocomplete="off"
                         :placeholder="ai.hasRelayToken ? `Saqlangan: ${ai.relayTokenMasked} (yangisini kiritsangiz almashadi)` : 'Relay ishga tushirilgan RELAY_TOKEN'"/>
                </div>
              </div>
            </div>

            <div class="ai-actions">
              <button class="tbot__btn" :disabled="ai.saving" @click="saveAi">
                <AppIcon name="save" :size="15"/> {{ ai.saving ? 'Saqlanmoqda…' : 'AI sozlamalarini saqlash' }}
              </button>
              <button class="ai-test" :disabled="ai.testing || !ai.hasKey" @click="testAi">
                <AppIcon :name="ai.testing ? 'loader' : 'zap'" :size="15"/> {{ ai.testing ? 'Tekshirilmoqda…' : 'Sinab ko\'rish' }}
              </button>
              <button v-if="ai.hasKey && !ai.keyFromEnv" class="ai-del" @click="deleteKey">Kalitni o'chirish</button>
            </div>
            <div class="ai-diag">
              <button class="ai-test" :disabled="diag.running" @click="runDiag">
                <AppIcon :name="diag.running ? 'loader' : 'zap'" :size="15"/> {{ diag.running ? 'Tekshirilmoqda…' : 'Tarmoq diagnostikasi' }}
              </button>
              <span class="field-hint">Brauzer qayerda, Google va serverga yetadimi — xato sababini aniqlash uchun</span>
              <ul v-if="diag.rows.length" class="ai-diag__list">
                <li v-for="(r, i) in diag.rows" :key="i" :class="r.ok ? 'ok' : 'err'">
                  <b>{{ r.ok ? '✓' : '✗' }} {{ r.label }}</b> <span class="ai-diag__ms">{{ r.ms }} ms</span><br>{{ r.info }}
                </li>
              </ul>
            </div>
            <div v-if="ai.testResult" class="ai-result" :class="ai.testResult.ok ? 'ok' : 'err'">
              <template v-if="ai.testResult.ok">
                ✓ {{ ai.testResult.model }} javob berdi ({{ ai.testResult.ms }} ms{{ ai.testResult.viaBrowser ? ', brauzer orqali' : '' }}): «{{ ai.testResult.text }}»
                <span v-if="ai.testResult.switched"><br>Server joylashuvi Gemini uchun cheklangan — brauzer rejimiga avtomatik o'tildi.</span>
                <span v-if="ai.testResult.ttsError"><br>Ovoz xatosi: {{ ai.testResult.ttsError }}</span>
              </template>
              <template v-else>✗ {{ ai.testResult.error }}</template>
            </div>

            <div class="info-cards">
              <div class="info-card">
                <div class="info-card__ico info-card__ico--indigo"><AppIcon name="mic" :size="17"/></div>
                <div>
                  <p class="info-card__title">Ovozli savol</p>
                  <p class="info-card__sub">Mikrofonni bosib o'zbekcha so'rang: "bugun qancha savdo bo'ldi?", "Azizbekning qarzi qancha?", "qarzdorlarni och".</p>
                </div>
              </div>
              <div class="info-card">
                <div class="info-card__ico info-card__ico--green"><AppIcon name="database" :size="17"/></div>
                <div>
                  <p class="info-card__title">Faqat o'qiydi</p>
                  <p class="info-card__sub">AI sotuv, to'lov yoki tovarni o'zgartira olmaydi — ma'lumot beradi va sahifa ochadi. Har xodim o'z ruxsati doirasida ko'radi.</p>
                </div>
              </div>
              <div class="info-card">
                <div class="info-card__ico info-card__ico--blue"><AppIcon name="map-pin" :size="17"/></div>
                <div>
                  <p class="info-card__title">Filial bo'yicha</p>
                  <p class="info-card__sub">Javoblar faqat joriy filial ma'lumotidan. Bosh ofis filialni almashtirib so'rashi mumkin.</p>
                </div>
              </div>
            </div>
          </template>
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
              <div class="tbot__links-t">Ulangan Telegram akkauntlar</div>
              <div v-for="l in botLinks" :key="l.id" class="tbot__link">
                <div class="tbot__link-av">
                  {{ (l.chat_name || 'T')[0].toUpperCase() }}
                </div>
                <div class="tbot__link-body">
                  <div class="tbot__link-name">
                    {{ l.chat_name || ('Chat ' + l.chat_id) }}
                    <span v-if="l.chat_username" class="tbot__link-user">@{{ l.chat_username }}</span>
                  </div>
                  <div class="tbot__link-meta">
                    <span :class="l.daily ? 'is-on' : 'is-off'">
                      {{ l.daily
                        ? `Kunlik xabar ${String(l.daily_hour ?? 21).padStart(2,'0')}:00`
                        : 'Kunlik xabar o\'chirilgan' }}
                    </span>
                    <span v-if="l.created_by_name">· {{ l.created_by_name }} ulagan</span>
                    <span v-if="l.last_seen">· {{ botOxirgi(l.last_seen) }}</span>
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
                <p class="info-card__sub">Sellz POS v1.0.0 — Barcha huquqlar himoyalangan</p>
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
.tbot__link { display:flex; align-items:center; gap:11px; padding:10px 12px; background:#fff; border:1px solid #e2e8f0; border-radius:9px; margin-bottom:6px; }
.tbot__link-av { display:flex; align-items:center; justify-content:center; width:34px; height:34px; flex-shrink:0; font-size:14px; font-weight:800; color:#1d4ed8; background:#dbeafe; border-radius:9px; }
.tbot__link-body { flex:1; min-width:0; }
.tbot__link-user { margin-left:6px; font-size:11.5px; font-weight:600; color:#2563eb; }
.tbot__link-name { font-size:13px; font-weight:600; color:#0f172a; }
.tbot__link-meta { display:flex; flex-wrap:wrap; gap:5px; font-size:11px; color:#94a3b8; margin-top:2px; }
.tbot__link-meta .is-on  { color:#047857; font-weight:600; }
.tbot__link-meta .is-off { color:#b45309; font-weight:600; }
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

/* ── AI yordamchi ─────────────────────────────────────── */
.ai-relay { margin-top:18px; padding:14px 16px; border:1.5px dashed var(--color-border); border-radius:14px; background:var(--slate-50); }
.ai-relay__hd { display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
.ai-relay__t { font-size:13.5px; font-weight:800; color:var(--color-text); }
.ai-relay__s { font-size:12px; color:var(--color-text-2); line-height:1.5; max-width:420px; margin-top:3px; }
.ai-relay .form-grid { margin-top:4px; }
.ai-relay code { font-family:ui-monospace, monospace; font-size:11px; background:#fff; padding:1px 5px; border-radius:5px; border:1px solid var(--color-border); }
.ai-note { font-size:13px; color:var(--color-text-3); padding:10px 0; }
.ai-status { display:flex; align-items:center; gap:9px; padding:11px 14px; border-radius:12px; font-size:13px; margin-bottom:18px; line-height:1.45; }
.ai-status.ok   { background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; }
.ai-status.warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; }
.ai-status code { font-family:ui-monospace, monospace; font-size:12px; background:rgba(255,255,255,.7); padding:1px 6px; border-radius:6px; }
.ai-status a { color:#1d4ed8; font-weight:600; text-decoration:underline; }
.ai-key { position:relative; display:flex; }
.ai-key .inp { padding-right:42px; }
.ai-key__eye { position:absolute; right:6px; top:50%; transform:translateY(-50%); width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--color-text-3); }
.ai-key__eye:hover { background:var(--slate-100); color:var(--color-text); }
.ai-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; align-items:center; }
.ai-test { display:flex; align-items:center; gap:6px; padding:9px 16px; font-size:13px; font-weight:600; border-radius:8px; border:1.5px solid #c7d2fe; color:#4338ca; background:#eef2ff; font-family:inherit; }
.ai-test:disabled { opacity:.55; cursor:not-allowed; }
.ai-del { margin-left:auto; font-size:12.5px; font-weight:600; color:#be123c; padding:8px 10px; border-radius:8px; }
.ai-del:hover { background:#fff1f2; }
.ai-diag { margin-top:14px; display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
.ai-diag__list { list-style:none; width:100%; margin:4px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; }
.ai-diag__list li { padding:9px 12px; border-radius:9px; font-size:12.5px; line-height:1.5; border:1px solid var(--color-border); background:var(--color-surface); word-break:break-word; }
.ai-diag__list li.ok  { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
.ai-diag__list li.err { border-color:#fecdd3; background:#fff1f2; color:#be123c; }
.ai-diag__ms { font-size:11px; opacity:.7; margin-left:6px; }
.ai-result { margin-top:12px; padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; }
.ai-result.ok  { background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; }
.ai-result.err { background:#fff1f2; border:1px solid #fecdd3; color:#be123c; }
</style>
