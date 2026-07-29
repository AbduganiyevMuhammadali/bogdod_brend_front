<script setup>
import { ref, reactive, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

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

onMounted(loadSettings)

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
              <div class="info-card__ico info-card__ico--blue"><AppIcon name="database" :size="16"/></div>
              <div>
                <p class="info-card__title">Bazadan zaxira nusxa</p>
                <p class="info-card__sub">Muntazam zaxira nusxa olishni unutmang</p>
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
