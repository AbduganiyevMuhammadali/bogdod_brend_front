<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import AppIcon from '@/components/AppIcon.vue'
import { loadStoreSettings } from '@/composables/useStoreSettings.js'

const store = loadStoreSettings()

// Chek pastidagi QR — skanerlaganda do'kon sahifasi ochiladi.
// Rasm data:URI sifatida yasaladi, shuning uchun chop etishda ham,
// internetsiz ham ishlaydi (tashqi so'rov ketmaydi).
const SHOP_URL = 'https://www.instagram.com/bogdod_brand?igsh=MWNkbGZnOGQ1ejVkZQ=='
const qrDataUrl = ref('')

onMounted(async () => {
  try {
    qrDataUrl.value = await QRCode.toDataURL(SHOP_URL, {
      // Katta yasaymiz: termal printer past aniqlikda bosadi, kichik
      // rasm "yopishib" o'qilmay qoladi.
      width: 512,
      margin: 2,
      // 'H' — 30% xato tuzatish: bosma sifati past bo'lsa ham skaner o'qiydi
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#FFFFFF' },
    })
  } catch { /* QR yasalmasa chek baribir chop etilaveradi */ }
})

const props = defineProps({
  cart:           { type: Array,  default: () => [] },
  totalSum:       { type: Number, default: 0 },
  payableSum:     { type: Number, default: 0 },
  debtSum:        { type: Number, default: 0 },
  // Aralash to'lovda hozir to'lanadigan pul. Qarzsiz sotuvda
  // `payableSum` ga teng bo'ladi.
  paidSum:        { type: Number, default: 0 },
  // Qarz muddati — DebtModal da tanlangan bo'lsa shu yerda ko'rinadi
  dueDate:        { type: String, default: '' },
  discount:       { type: Number, default: 0 },
  paymentType:    { type: String, default: 'Naqd' },
  docNumber:      { type: Number, default: 1 },
  warehouse:      { type: String, default: 'Asosiy ombor' },
  priceType:      { type: String, default: 'chakana' },
  selectedClient: { type: Object, default: null },
  saving:         { type: Boolean, default: false },
  saveErr:        { type: String,  default: '' },
  exchangeRate:   { type: Number, default: 0 },
  showUSD:        { type: Boolean, default: false },
})

function toUSD(v) {
  if (!props.showUSD || props.exchangeRate <= 0) return null
  return (Number(v) / props.exchangeRate).toFixed(2)
}

const emit = defineEmits(['close', 'complete', 'update:discount', 'update:paymentType', 'drop-client', 'update:dueDate'])

// ── Qarz muddati ────────────────────────────────────────────────────
// Har sotuvga alohida sana. Bo'sh qoldirilsa — muddatsiz qarz.
function bugunKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function kunQosh(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// Standart: bir hafta. Kassir odatda shu muddatni beradi, kerak bo'lsa
// bir bosishda o'zgartiradi.
// Qarz oynasida (DebtModal) sana allaqachon tanlangan bo'lishi mumkin —
// uni bosib ketmaymiz. `immediate: true` bilan emit qilinsa, bu yerdagi
// standart qiymat kassir tanlagan sanani almashtirib yuborardi.
const dueDate = ref(props.dueDate || kunQosh(7))

// Faqat kassir shu oynada o'zgartirsa uzatamiz
watch(dueDate, v => emit('update:dueDate', v || null))

const dueLabel = computed(() => {
  if (!dueDate.value) return ''
  const kun = Math.round((new Date(dueDate.value) - new Date(bugunKey())) / 86400000)
  const sana = new Date(dueDate.value).toLocaleDateString('uz-UZ', {
    day: 'numeric', month: 'long', weekday: 'short',
  })
  if (kun === 0) return `${sana} — bugun`
  if (kun === 1) return `${sana} — ertaga`
  if (kun < 0)   return `${sana} — o'tgan sana!`
  return `${sana} — ${kun} kundan keyin`
})

const PAY_ICONS = { 'Naqd': 'dollar-sign', 'Karta': 'credit-card', "O'tkazma": 'send', 'Qarz': 'clock' }
const CARD_COLORS = [
  '#e0e7ff','#fce7f3','#d1fae5','#fef3c7','#dbeafe',
  '#f3e8ff','#ccfbf1','#fef9c3','#ffe4e6','#e0f2fe',
]
function cardColor(idx) { return CARD_COLORS[idx % CARD_COLORS.length] }

// Aralash to'lov: bir qismi to'langan, bir qismi qarz
const aralash = computed(() => props.debtSum > 0 && props.paidSum > 0)

const itemsCount = computed(() => props.cart.reduce((s, i) => s + i.qty, 0))

function fmt(v) { return new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0)) }
function todayStr() { return new Date().toLocaleDateString('uz-UZ') }
function timeStr()  { return new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) }

function printReceipt() {
  const el = document.getElementById('pos-receipt')
  if (!el) return
  const win = window.open('', '_blank', 'width=400,height=750,scrollbars=yes')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chek #${props.docNumber}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#e5e7eb;display:flex;justify-content:center;padding:24px;font-family:"Courier New",monospace}
    .receipt-paper{width:300px;background:white}
    .rp-perf--top{height:14px;background:repeating-radial-gradient(circle at 7px 7px,#e5e7eb 6px,white 6px) -7px 0/14px 14px}
    .rp-perf--bot{height:14px;background:repeating-radial-gradient(circle at 7px 0,#e5e7eb 6px,white 6px) -7px 0/14px 14px}
    .rp-body{padding:14px 16px}
    .rp-store{text-align:center;font-size:22px;font-weight:900;letter-spacing:2px;margin-bottom:4px;text-transform:uppercase;line-height:1.2}
    .rp-store-sub{text-align:center;font-size:14px;font-weight:800;color:#111827;margin-bottom:4px}
    .rp-meta-row{display:flex;justify-content:space-between;font-size:14px;font-weight:800;color:#111827;margin-bottom:3px}
    .rp-dashes{border-top:1px dashed #d1d5db;margin:8px 0}
    .rp-row{display:flex;justify-content:space-between;font-size:15px;font-weight:800;margin:5px 0}
    .rp-val{font-weight:900}.rp-bold{font-weight:900}
    .rp-items-hdr{display:flex;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#111827;margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid #111827}
    .rp-item{margin-bottom:10px}
    .rp-item__name{font-size:16px;font-weight:900;color:#111827;margin-bottom:3px;line-height:1.3}
    .rp-item__line{display:flex;justify-content:space-between;font-size:15px;font-weight:900}
    .rp-item__qty{color:#111827;font-weight:900}.rp-item__sum{font-weight:900}
    .rp-row--disc{color:#ef4444}.rp-row--debt{color:#ef4444;font-weight:700}
    .rp-total-row{display:flex;justify-content:space-between;font-weight:900;font-size:20px;padding:10px 0;margin:8px 0;border-top:3px solid #111827;border-bottom:3px solid #111827}
    .rp-pay-badge{font-weight:900;font-size:15px}
    .rp-barcode{text-align:center;padding:10px 0 6px}
    .rp-bc-bars{display:flex;justify-content:center;align-items:flex-end;gap:1px;margin-bottom:5px}
    .rp-bc-bar{background:#111827;display:inline-block}
    .rp-bc-num{font-size:11px;font-weight:900;letter-spacing:2px;color:#111827}
    .rp-footer{text-align:center;padding:6px 0 4px;border-top:1px dashed #d1d5db}
    .rp-footer__line{font-size:15px;font-weight:900;letter-spacing:.5px;line-height:1.35}
    .rp-footer__sub{font-size:13px;font-weight:800;color:#111827;margin-top:2px}
    .rp-qr{text-align:center;padding:10px 0 4px;border-top:1px dashed #d1d5db;margin-top:6px}
    .rp-qr__img{width:110px;height:110px;display:block;margin:0 auto 4px}
    .rp-qr__cap{font-size:14px;font-weight:900}
    .rp-qr__sub{font-size:13px;font-weight:800;color:#111827}

    /* ── TERMAL PRINTER UCHUN ────────────────────────────────────────
       Ekrandagi kulrang ranglar (#6b7280, #9ca3af, #d1d5db) termal
       printerda och kul nuqtalar bo'lib chiqadi va o'qib bo'lmaydi.
       Chop etishda hamma matn TO'Q QORA va qalinroq bo'lishi kerak. */
    @media print{
      body{background:white;padding:0;display:block}
      .receipt-paper{width:auto;max-width:none}

      /* Hamma matn qora, brauzer ranglarni "tejamasin".
         !important shart: yuqorida .rp-meta-row uchun kulrang rang
         berilgan va u aniqroq selektor bo'lgani uchun ustunlik qilardi —
         natijada sana, chek raqami, kassir, chegirma xira chiqardi. */
      *,*::before,*::after{
        color:#000 !important;
        opacity:1 !important;
        -webkit-print-color-adjust:exact !important;
        print-color-adjust:exact !important;
      }

      /* Ingichka shrift termal bosmada yo'qoladi — qalinlashtiramiz */
      .rp-body{padding:4px 6px}
      /* Do'kon nomi — chekning eng ko'zga tashlanadigan qismi.
         Katta, qalin va bo'sh joy bilan ajratilgan. */
      .rp-store{
        font-size:26px;
        font-weight:900;
        letter-spacing:2px;
        text-transform:uppercase;
        line-height:1.15;
        margin:2px 0 6px;
      }
      /* Barcha matn yirik va qalin — uzoqdan ham o'qilsin.
         Termal bosmada ingichka shrift yo'qoladi, shuning uchun
         hamma joyda 900 (eng qalin) ishlatiladi. */
      .rp-store-sub{font-size:15px;font-weight:900;line-height:1.35}
      .rp-meta-row{font-size:15px;font-weight:900;margin-bottom:3px}
      .rp-row{font-size:16px;font-weight:900;margin:5px 0}
      .rp-val,.rp-bold{font-weight:900}
      .rp-items-hdr{font-size:13px;font-weight:900;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px}
      .rp-item{margin-bottom:10px}
      .rp-item__name{font-size:17px;font-weight:900;line-height:1.3;margin-bottom:3px}
      .rp-item__line{font-size:16px;font-weight:900}
      .rp-item__qty{font-weight:900}
      .rp-item__sum{font-weight:900}
      .rp-total-row{font-size:21px;font-weight:900;border-top:3px solid #000;border-bottom:3px solid #000;padding:10px 0;margin:8px 0}
      .rp-pay-badge{font-size:16px;font-weight:900}
      .rp-footer__line{font-size:16px;font-weight:900;line-height:1.35}
      .rp-footer__sub{font-size:14px;font-weight:900}
      .rp-qr__cap{font-size:15px;font-weight:900}
      .rp-qr__sub{font-size:14px;font-weight:900}
      .rp-bc-num{font-size:12px;font-weight:900;letter-spacing:2px}

      /* Ajratgichlar aniq ko'rinsin */
      .rp-dashes{border-top:1px dashed #000}
      .rp-footer,.rp-qr{border-top:1px dashed #000}

      /* Qog'oz teshiklari bezagi — bosmada kerak emas */
      .rp-perf--top,.rp-perf--bot{display:none}

      /* QR aniq skanerlanishi uchun yetarli katta.
         image-rendering:pixelated — brauzer QR kvadratchalarini
         silliqlamasin, aks holda chetlari xiralashib skaner o'qimaydi. */
      .rp-qr{padding:8px 0 6px}
      .rp-qr__img{
        width:36mm;height:36mm;
        image-rendering:pixelated;
        image-rendering:-moz-crisp-edges;
        image-rendering:crisp-edges;
      }

      /* Shtrix-kod chiziqlari to'q qora bo'lsin (o'lchami yuqorida) */
      .rp-bc-bar{background:#000 !important;opacity:1 !important}

      .rp-item,.rp-row,.rp-qr{page-break-inside:avoid}
      @page{margin:0}
    }
  </style></head><body>`)
  win.document.write(el.outerHTML)
  win.document.write('</body></html>')
  win.document.close()
  win.focus()
  // Chop etishdan OLDIN rasmlar (QR) to'liq yuklanishini kutamiz.
  // Ilgari bu yerda oddiy 400ms kutish bor edi va QR ulgurmasdan
  // bosilib ketardi — chekda QR umuman chiqmasdi.
  const bosib = () => {
    try { win.focus(); win.print(); } finally { win.close(); }
  };

  const rasmlar = Array.from(win.document.images || []);
  const kutish = rasmlar.map(img => (
    img.complete
      ? Promise.resolve()
      : new Promise(res => { img.onload = img.onerror = res; })
  ));

  // Rasm yuklanmay qolsa ham chek chiqaversin — 3 soniyadan keyin bosamiz
  Promise.race([
    Promise.all(kutish),
    new Promise(res => setTimeout(res, 3000)),
  ]).then(() => setTimeout(bosib, 150));
}
</script>

<template>
  <Teleport to="body">
    <transition name="pov-fade">
    <div class="pov" @click.self="!saving && emit('close')">
      <transition name="pmw-slide">
      <div class="pmw">

        <!-- LEFT: payment details -->
        <div class="pm-left">
          <div class="pm-left__hdr">
            <div class="pm-left__logo"><AppIcon name="shopping-cart" :size="17" :stroke-width="2.5"/></div>
            <div class="pm-left__title">Sotuv <span class="pm-left__doc">#{{ docNumber }}</span></div>
            <button class="pm-close" :disabled="saving" @click="emit('close')"><AppIcon name="x" :size="16"/></button>
          </div>

          <div class="pm-amount-block">
            <div class="pm-amount-label">To'lash kerak</div>
            <div class="pm-amount-num">{{ fmt(payableSum) }}</div>
            <div class="pm-amount-cur">so'm</div>
            <div v-if="showUSD && toUSD(payableSum)" class="pm-amount-usd">≈ {{ toUSD(payableSum) }} $</div>
          </div>

          <div class="pm-items-mini">
            <div v-for="item in cart" :key="item._key" class="pm-item-row">
              <div class="pm-item-dot" :style="{ background: cardColor(item.colorIdx ?? 0) }"></div>
              <span class="pm-item-name">{{ item.productName }}</span>
              <span class="pm-item-qty">{{ item.qty }} × {{ fmt(item.price) }}</span>
              <span class="pm-item-sum">{{ fmt(item.totalSum) }}</span>
            </div>
          </div>

          <div class="pm-hr"></div>

          <div class="pm-total-rows">
            <div class="pm-trow">
              <span>Jami:</span>
              <div class="pm-trow-val">
                <span>{{ fmt(totalSum) }} so'm</span>
                <span v-if="showUSD && toUSD(totalSum)" class="pm-usd-sm">{{ toUSD(totalSum) }} $</span>
              </div>
            </div>
            <div v-if="discount > 0" class="pm-trow pm-trow--disc">
              <span>Skidka:</span>
              <div class="pm-trow-val">
                <span>−{{ fmt(discount) }} so'm</span>
                <span v-if="showUSD && toUSD(discount)" class="pm-usd-sm">−{{ toUSD(discount) }} $</span>
              </div>
            </div>
            <div class="pm-trow pm-trow--big">
              <span>To'lov:</span>
              <div class="pm-trow-val">
                <span>{{ fmt(payableSum) }} so'm</span>
                <span v-if="showUSD && toUSD(payableSum)" class="pm-usd-main">{{ toUSD(payableSum) }} $</span>
              </div>
            </div>
          </div>

          <div class="pm-hr"></div>

          <div class="pm-field-label">To'lov turi</div>
          <div class="pm-pay-types">
            <button
              v-for="pt in ['Naqd', 'Karta', &quot;O'tkazma&quot;, 'Qarz']" :key="pt"
              :class="['pm-pt', paymentType === pt && 'pm-pt--on']"
              @click="emit('update:paymentType', pt)"
            >
              <AppIcon :name="PAY_ICONS[pt]" :size="14"/>
              <span>{{ pt }}</span>
            </button>
          </div>

          <div class="pm-field-label" style="margin-top:14px">Skidka (so'm)</div>
          <div class="pm-disc-row">
            <input
              class="pm-disc-inp" placeholder="0"
              v-money="{ get: () => discount, set: v => emit('update:discount', Number(v) || 0) }"
            />
            <span class="pm-disc-cur">so'm</span>
          </div>

          <div v-if="selectedClient" class="pm-cli-card">
            <div class="pm-cli-av"><AppIcon name="user" :size="13"/></div>
            <div class="pm-cli-info">
              <div class="pm-cli-name">{{ selectedClient.name }}</div>
              <div v-if="selectedClient.balance < 0" class="pm-cli-debt">Mavjud qarz: {{ fmt(-selectedClient.balance) }} so'm</div>
            </div>
            <button class="pm-cli-x" @click="emit('drop-client')"><AppIcon name="x" :size="11"/></button>
          </div>

          <!-- Aralash to'lov taqsimoti: qancha hozir, qancha qarz -->
          <div v-if="aralash" class="pm-split">
            <div class="pm-split__row">
              <span><AppIcon name="dollar-sign" :size="12"/> Hozir to'lanadi</span>
              <strong class="pm-split__paid">{{ fmt(paidSum) }} so'm</strong>
            </div>
            <div class="pm-split__row">
              <span><AppIcon name="clock" :size="12"/> Qarzga qoladi</span>
              <strong class="pm-split__debt">{{ fmt(debtSum) }} so'm</strong>
            </div>
          </div>

          <div v-if="debtSum > 0" class="pm-debt-warn">
            <AppIcon name="alert-triangle" :size="13"/>
            Qarzga: <strong>{{ fmt(debtSum) }} so'm</strong> · {{ selectedClient?.name }}
          </div>

          <!-- Qarz muddati DebtModal da tanlanadi ("Qarz" bosilganda).
               Bu yerda faqat tasdiq uchun ko'rsatiladi — ikki joyda
               so'ralsa kassir qaysi biri kuchda ekanini bilmay qolardi.
               Kerak bo'lsa shu yerdan ham o'zgartirsa bo'ladi. -->
          <div v-if="debtSum > 0" class="pm-due">
            <div class="pm-due__lbl">
              <AppIcon name="calendar" :size="12"/> Qarz qaytarish sanasi
            </div>
            <input v-model="dueDate" type="date" class="pm-due__inp" :min="bugunKey()" />
            <div v-if="dueDate" class="pm-due__info">{{ dueLabel }}</div>
            <div v-else class="pm-due__warn">Sana belgilanmagan — muddatsiz qarz</div>
          </div>

          <div v-if="saveErr" class="pm-err-box">{{ saveErr }}</div>

          <button class="pm-pay-btn" :disabled="saving" @click="emit('complete')">
            <template v-if="saving">
              <div class="pm-spinner"></div><span>Jarayon...</span>
            </template>
            <template v-else>
              <AppIcon name="check-circle" :size="18" :stroke-width="2.5"/>
              <span>To'lash &amp; Yakunlash</span>
            </template>
          </button>

          <button class="pm-btn-cancel" :disabled="saving" @click="emit('close')">Bekor qilish</button>
        </div>

        <!-- RIGHT: receipt paper -->
        <div class="pm-right">
          <div class="pm-right__topbar">
            <span class="pm-right__title">Chek / Kvitansiya</span>
            <button class="pm-print-btn" @click="printReceipt">
              <AppIcon name="printer" :size="13"/> Chop etish
            </button>
          </div>
          <div class="pm-receipt-scroll">
            <div class="receipt-paper" id="pos-receipt">
              <div class="rp-perf rp-perf--top"></div>
              <div class="rp-body">
                <div class="rp-store">{{ store.name }}</div>
                <div v-if="store.address" class="rp-store-sub">{{ store.address }}</div>
                <div v-if="store.phone" class="rp-store-sub">{{ store.phone }}</div>
                <div v-if="store.header" class="rp-store-sub">{{ store.header }}</div>
                <div class="rp-meta-row">
                  <span>{{ todayStr() }}</span>
                  <span>{{ timeStr() }}</span>
                </div>
                <div class="rp-dashes"></div>

                <!-- Ombor va narx turi chekda ko'rsatilmaydi: mijozga
                     kerak emas, faqat joy egallaydi va chekni uzaytiradi -->
                <div class="rp-row"><span>Hujjat №</span><span class="rp-val">#{{ docNumber }}</span></div>
                <div v-if="selectedClient" class="rp-row"><span>Mijoz</span><span class="rp-val rp-bold">{{ selectedClient.name }}</span></div>
                <div class="rp-dashes"></div>

                <div class="rp-items-hdr">
                  <span style="flex:1">Tovar nomi</span>
                  <span style="width:70px;text-align:right">Summa</span>
                </div>

                <div v-for="item in cart" :key="item._key" class="rp-item">
                  <div class="rp-item__name">{{ item.productName }}</div>
                  <div class="rp-item__line">
                    <span class="rp-item__qty">{{ item.qty }} × {{ fmt(item.price) }} so'm</span>
                    <span class="rp-item__sum">{{ fmt(item.totalSum) }}</span>
                  </div>
                </div>
                <div class="rp-dashes"></div>

                <div class="rp-row"><span>Tovarlar</span><span>{{ cart.length }} xil · {{ itemsCount }} dona</span></div>
                <div v-if="discount > 0" class="rp-row rp-row--disc">
                  <span>Skidka</span><span>−{{ fmt(discount) }} so'm</span>
                </div>
                <div class="rp-total-row">
                  <span>JAMI TO'LOV</span>
                  <div style="text-align:right">
                    <div>{{ fmt(payableSum) }} so'm</div>
                    <div v-if="showUSD && toUSD(payableSum)" style="font-size:10px;font-weight:600;color:#16a34a;margin-top:1px">≈ {{ toUSD(payableSum) }} $</div>
                  </div>
                </div>
                <div v-if="showUSD && exchangeRate > 0" class="rp-row" style="font-size:9.5px;color:#9ca3af">
                  <span>Kurs</span><span>1$ = {{ fmt(exchangeRate) }} so'm</span>
                </div>
                <div class="rp-dashes"></div>

                <div class="rp-row">
                  <span>To'lov turi</span>
                  <span class="rp-pay-badge">{{ aralash ? 'Qisman qarz' : paymentType }}</span>
                </div>
                <!-- Aralash to'lovda mijoz nechta pul berganini
                     chekda ko'rishi kerak — nizolarning oldini oladi -->
                <div v-if="aralash" class="rp-row">
                  <span>To'landi</span>
                  <span class="rp-val">{{ fmt(paidSum) }} so'm</span>
                </div>
                <div v-if="debtSum > 0" class="rp-row rp-row--debt">
                  <span>Qarz miqdori</span>
                  <div style="text-align:right">
                    <div>{{ fmt(debtSum) }} so'm</div>
                    <div v-if="showUSD && toUSD(debtSum)" style="font-size:9.5px;font-weight:600">{{ toUSD(debtSum) }} $</div>
                  </div>
                </div>
                <div class="rp-dashes"></div>

                <div class="rp-barcode">
                  <div class="rp-bc-bars">
                    <div v-for="i in 40" :key="i" class="rp-bc-bar"
                      :style="{
                        width: ((i*7+3)%4===0 ? 3 : (i*13)%5===0 ? 2 : 1)+'px',
                        height: ((i*11)%7===0 ? 40 : (i*3)%5===0 ? 34 : 28)+'px',
                        opacity: ((i*17)%11===0 ? 0.4 : 1),
                      }">
                    </div>
                  </div>
                  <div class="rp-bc-num">{{ String(docNumber).padStart(6,'0') }}-{{ new Date().getFullYear() }}-POS</div>
                </div>

                <div class="rp-footer">
                  <div class="rp-footer__line">{{ store.footer }}</div>
                </div>

                <!-- Do'kon sahifasiga QR — mijoz skanerlab kirsin -->
                <div v-if="qrDataUrl" class="rp-qr">
                  <img :src="qrDataUrl" alt="" class="rp-qr__img" />
                  <div class="rp-qr__cap">Bizni kuzatib boring</div>
                  <div class="rp-qr__sub">@bogdod_brand</div>
                </div>
              </div>
              <div class="rp-perf rp-perf--bot"></div>
            </div>
          </div>
        </div>

      </div>
      </transition>
    </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.pov{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}
.pov-fade-enter-active,.pov-fade-leave-active{transition:opacity .22s}
.pov-fade-enter-from,.pov-fade-leave-to{opacity:0}

/* Modal window */
.pmw{display:flex;width:900px;max-width:100%;height:600px;border-radius:20px;overflow:hidden;box-shadow:0 40px 80px rgba(0,0,0,.4)}
.pmw-slide-enter-active,.pmw-slide-leave-active{transition:all .28s cubic-bezier(.34,1.56,.64,1)}
.pmw-slide-enter-from,.pmw-slide-leave-to{opacity:0;transform:scale(.93) translateY(12px)}

/* Left panel */
.pm-left{width:380px;flex-shrink:0;background:linear-gradient(170deg,#1e1b4b 0%,#1a1740 50%,#16143a 100%);display:flex;flex-direction:column;padding:20px;overflow-y:auto;scrollbar-width:none}
.pm-left::-webkit-scrollbar{display:none}
.pm-left__hdr{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-shrink:0}
.pm-left__logo{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0}
.pm-left__title{flex:1;font-size:15px;font-weight:700;color:rgba(255,255,255,.9)}
.pm-left__doc{font-family:monospace;color:#a5b4fc;font-weight:900}
.pm-close{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);cursor:pointer;transition:all .15s;flex-shrink:0}
.pm-close:hover{background:rgba(255,255,255,.1);color:white}

.pm-amount-block{text-align:center;padding:16px 0;flex-shrink:0}
.pm-amount-label{font-size:11px;font-weight:600;letter-spacing:.08em;color:rgba(165,180,252,.7);text-transform:uppercase}
.pm-amount-num{font-size:40px;font-weight:900;letter-spacing:-.04em;color:white;line-height:1.1}
.pm-amount-cur{font-size:13px;color:rgba(165,180,252,.6);margin-top:2px}
.pm-amount-usd{font-size:14px;font-weight:700;color:#4ade80;margin-top:4px;letter-spacing:.01em}

.pm-items-mini{display:flex;flex-direction:column;gap:3px;max-height:120px;overflow-y:auto;margin-bottom:4px;scrollbar-width:thin;scrollbar-color:rgba(99,102,241,.3) transparent}
.pm-item-row{display:flex;align-items:center;gap:7px;padding:4px 8px;border-radius:7px;background:rgba(255,255,255,.05)}
.pm-item-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.pm-item-name{flex:1;font-size:11.5px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pm-item-qty{font-size:10.5px;color:rgba(165,180,252,.6);white-space:nowrap;flex-shrink:0}
.pm-item-sum{font-size:11.5px;font-weight:700;color:rgba(255,255,255,.9);white-space:nowrap;flex-shrink:0;min-width:50px;text-align:right}

.pm-hr{height:1px;background:rgba(255,255,255,.08);margin:10px 0;flex-shrink:0}

.pm-total-rows{display:flex;flex-direction:column;gap:5px;flex-shrink:0}
.pm-trow{display:flex;justify-content:space-between;align-items:flex-end;font-size:12.5px;color:rgba(255,255,255,.65)}
.pm-trow--disc{color:#fca5a5}
.pm-trow--big{font-size:15px;font-weight:800;color:white;margin-top:3px}
.pm-trow-val{display:flex;flex-direction:column;align-items:flex-end;gap:1px}
.pm-usd-sm{font-size:10px;font-weight:600;color:#4ade80;opacity:.85}
.pm-usd-main{font-size:12px;font-weight:700;color:#4ade80}

.pm-field-label{font-size:10.5px;font-weight:700;letter-spacing:.07em;color:rgba(165,180,252,.6);text-transform:uppercase;margin-bottom:7px;margin-top:12px;flex-shrink:0}

.pm-pay-types{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex-shrink:0}
.pm-pt{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:1.5px solid rgba(255,255,255,.12);color:rgba(255,255,255,.55);font-size:10.5px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .15s}
.pm-pt:hover{border-color:rgba(165,180,252,.4);color:rgba(255,255,255,.9)}
.pm-pt--on{background:linear-gradient(135deg,rgba(99,102,241,.35),rgba(139,92,246,.25));border-color:#818cf8;color:white;box-shadow:0 0 0 1px rgba(129,140,248,.3)}

.pm-disc-row{display:flex;align-items:center;gap:8px;flex-shrink:0}
.pm-disc-inp{flex:1;height:36px;padding:0 10px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.12);border-radius:8px;color:white;font-size:14px;font-weight:600;font-family:inherit;outline:none;transition:border-color .15s}
.pm-disc-inp:focus{border-color:#818cf8}
.pm-disc-inp::placeholder{color:rgba(255,255,255,.25)}
.pm-disc-cur{font-size:12px;color:rgba(165,180,252,.6);flex-shrink:0}

.pm-cli-card{display:flex;align-items:center;gap:8px;padding:9px 12px;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.3);border-radius:10px;margin-top:10px;flex-shrink:0}
.pm-cli-av{width:26px;height:26px;border-radius:50%;background:rgba(99,102,241,.4);display:flex;align-items:center;justify-content:center;color:#a5b4fc;flex-shrink:0}
.pm-cli-info{flex:1;min-width:0}
.pm-cli-name{font-size:12.5px;font-weight:700;color:rgba(255,255,255,.9)}
.pm-cli-debt{font-size:11px;color:#fca5a5;margin-top:1px}
.pm-cli-x{color:rgba(165,180,252,.5);cursor:pointer;padding:3px;border-radius:4px;flex-shrink:0}
.pm-cli-x:hover{color:#fca5a5}

.pm-debt-warn{display:flex;align-items:center;gap:6px;padding:8px 10px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:11.5px;color:#fca5a5;margin-top:8px;flex-shrink:0}

/* Qarz qaytarish sanasi */
.pm-due{margin-top:10px;padding:10px 11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:9px;flex-shrink:0}
.pm-due__lbl{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:8px}
.pm-due__quick{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}
.pm-due__q{padding:5px 10px;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.75);background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:7px;cursor:pointer;font-family:inherit;transition:all .15s}
.pm-due__q:hover{background:rgba(255,255,255,.13)}
.pm-due__q.on{background:#6366f1;border-color:#818cf8;color:#fff}
.pm-due__inp{width:100%;padding:8px 10px;font-size:13px;font-weight:600;color:#fff;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:7px;outline:none;font-family:inherit;color-scheme:dark}
.pm-due__inp:focus{border-color:#818cf8}
.pm-due__info{margin-top:6px;font-size:11.5px;font-weight:600;color:#a5b4fc}
.pm-due__warn{margin-top:6px;font-size:11px;color:rgba(255,255,255,.45)}

.pm-err-box{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);border-radius:8px;padding:8px 12px;font-size:12px;color:#fca5a5;text-align:center;margin-top:8px;flex-shrink:0}

.pm-pay-btn{width:100%;height:48px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;display:flex;align-items:center;justify-content:center;gap:8px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;transition:all .15s;margin-top:14px;box-shadow:0 6px 20px rgba(99,102,241,.4);flex-shrink:0}
.pm-pay-btn:hover:not(:disabled){opacity:.9;transform:translateY(-1px);box-shadow:0 8px 24px rgba(99,102,241,.5)}
.pm-pay-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.pm-spinner{width:16px;height:16px;border:2.5px solid rgba(255,255,255,.3);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.pm-btn-cancel{width:100%;height:36px;border-radius:9px;background:transparent;border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4);font-size:12.5px;font-family:inherit;cursor:pointer;transition:all .15s;margin-top:6px;flex-shrink:0}
.pm-btn-cancel:hover:not(:disabled){border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.7)}

/* Right panel: receipt */
.pm-right{flex:1;background:#f0f0f0;display:flex;flex-direction:column;overflow:hidden}
.pm-right__topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:white;border-bottom:1px solid #e5e7eb;flex-shrink:0}
.pm-right__title{font-size:13px;font-weight:700;color:#1e293b}
.pm-print-btn{display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;background:#eff6ff;border:1px solid #c7d2fe;color:#4f46e5;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer}
.pm-print-btn:hover{background:#e0e7ff}
.pm-receipt-scroll{flex:1;overflow-y:auto;padding:16px;display:flex;justify-content:center;scrollbar-width:thin;scrollbar-color:#d1d5db transparent}

/* Receipt paper */
.receipt-paper{width:300px;background:white;box-shadow:0 4px 24px rgba(0,0,0,.15)}
.rp-perf{height:14px}
.rp-perf--top{background:repeating-radial-gradient(circle at 7px 7px,#f0f0f0 6px,white 6px) -7px 0/14px 14px}
.rp-perf--bot{background:repeating-radial-gradient(circle at 7px 0,#f0f0f0 6px,white 6px) -7px 0/14px 14px}
.rp-body{padding:14px 16px;font-family:"Courier New",monospace}
.rp-store{text-align:center;font-size:20px;font-weight:900;letter-spacing:2px;margin-bottom:4px;text-transform:uppercase;line-height:1.2}
.rp-store-sub{text-align:center;font-size:12px;font-weight:700;color:#374151;margin-bottom:4px}
.rp-meta-row{display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#374151;margin-bottom:3px}
.rp-dashes{border-top:1px dashed #d1d5db;margin:8px 0}
.rp-row{display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin:4px 0;color:#111827}
.rp-val{font-weight:600}
.rp-bold{font-weight:800}
.rp-items-hdr{display:flex;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #f3f4f6}
.rp-item{margin-bottom:6px}
.rp-item__name{font-size:14px;font-weight:800;color:#111827;margin-bottom:2px;line-height:1.3}
.rp-item__line{display:flex;justify-content:space-between;font-size:10.5px}
.rp-item__qty{color:#6b7280}
.rp-item__sum{font-weight:700}
.rp-row--disc{color:#ef4444}
.rp-row--debt{color:#ef4444;font-weight:700}
.rp-total-row{display:flex;justify-content:space-between;font-weight:900;font-size:18px;padding:9px 0;margin:6px 0;border-top:2.5px solid #111827;border-bottom:2.5px solid #111827}
.rp-pay-badge{font-weight:800;font-size:11.5px}
.rp-barcode{text-align:center;padding:10px 0 6px}
.rp-bc-bars{display:flex;justify-content:center;align-items:flex-end;gap:1px;margin-bottom:5px}
.rp-bc-bar{background:#111827;display:inline-block}
.rp-bc-num{font-size:9px;letter-spacing:3px;color:#9ca3af}
.rp-footer{text-align:center;padding:6px 0 4px;border-top:1px dashed #d1d5db}
.rp-footer__line{font-size:14px;font-weight:800;letter-spacing:.5px;line-height:1.35}
.rp-footer__sub{font-size:10px;color:#9ca3af;margin-top:2px}

/* Do'kon sahifasiga QR (ekrandagi ko'rinish) */
.rp-qr{text-align:center;padding:10px 0 4px;border-top:1px dashed #d1d5db;margin-top:6px}
.rp-qr__img{width:96px;height:96px;display:block;margin:0 auto 4px}
.rp-qr__cap{font-size:13px;font-weight:800;color:#111827}
.rp-qr__sub{font-size:12px;font-weight:700;color:#374151}

/* Aralash to'lov taqsimoti */
.pm-split{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.pm-split__row{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:rgba(255,255,255,.7)}
.pm-split__row+.pm-split__row{margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.08)}
.pm-split__row span{display:flex;align-items:center;gap:5px}
.pm-split__row strong{font-size:14px;font-variant-numeric:tabular-nums}
.pm-split__paid{color:#4ade80}
.pm-split__debt{color:#fb7185}
</style>
