<script setup>
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { loadStoreSettings } from '@/composables/useStoreSettings.js'

const store = loadStoreSettings()

const props = defineProps({
  cart:           { type: Array,  default: () => [] },
  totalSum:       { type: Number, default: 0 },
  payableSum:     { type: Number, default: 0 },
  debtSum:        { type: Number, default: 0 },
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

const emit = defineEmits(['close', 'complete', 'update:discount', 'update:paymentType', 'drop-client'])

const PAY_ICONS = { 'Naqd': 'dollar-sign', 'Karta': 'credit-card', "O'tkazma": 'send', 'Qarz': 'clock' }
const CARD_COLORS = [
  '#e0e7ff','#fce7f3','#d1fae5','#fef3c7','#dbeafe',
  '#f3e8ff','#ccfbf1','#fef9c3','#ffe4e6','#e0f2fe',
]
function cardColor(idx) { return CARD_COLORS[idx % CARD_COLORS.length] }

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
    .rp-store{text-align:center;font-size:18px;font-weight:900;letter-spacing:3px;margin-bottom:3px}
    .rp-store-sub{text-align:center;font-size:10.5px;color:#6b7280;margin-bottom:4px}
    .rp-meta-row{display:flex;justify-content:space-between;font-size:10.5px;color:#9ca3af;margin-bottom:2px}
    .rp-dashes{border-top:1px dashed #d1d5db;margin:8px 0}
    .rp-row{display:flex;justify-content:space-between;font-size:11.5px;margin:3px 0}
    .rp-val{font-weight:600}.rp-bold{font-weight:800}
    .rp-items-hdr{display:flex;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #f3f4f6}
    .rp-item{margin-bottom:7px}
    .rp-item__name{font-size:12px;font-weight:700;color:#111827;margin-bottom:1px}
    .rp-item__line{display:flex;justify-content:space-between;font-size:11px}
    .rp-item__qty{color:#6b7280}.rp-item__sum{font-weight:700}
    .rp-row--disc{color:#ef4444}.rp-row--debt{color:#ef4444;font-weight:700}
    .rp-total-row{display:flex;justify-content:space-between;font-weight:900;font-size:15px;padding:8px 0;margin:4px 0;border-top:2px solid #111827;border-bottom:2px solid #111827}
    .rp-pay-badge{font-weight:800;font-size:12px}
    .rp-barcode{text-align:center;padding:10px 0 6px}
    .rp-bc-bars{display:flex;justify-content:center;align-items:flex-end;gap:1px;margin-bottom:5px}
    .rp-bc-bar{background:#111827;display:inline-block}
    .rp-bc-num{font-size:9px;letter-spacing:3px;color:#9ca3af}
    .rp-footer{text-align:center;padding:6px 0 4px;border-top:1px dashed #d1d5db}
    .rp-footer__line{font-size:12px;font-weight:700;letter-spacing:1px}
    .rp-footer__sub{font-size:10px;color:#9ca3af;margin-top:2px}
    @media print{body{background:white;padding:0}}
  </style></head><body>`)
  win.document.write(el.outerHTML)
  win.document.write('</body></html>')
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
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
              type="number" min="0" class="pm-disc-inp" placeholder="0"
              :value="discount"
              @input="emit('update:discount', Number($event.target.value) || 0)"
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

          <div v-if="debtSum > 0" class="pm-debt-warn">
            <AppIcon name="alert-triangle" :size="13"/>
            Qarzga: <strong>{{ fmt(debtSum) }} so'm</strong> · {{ selectedClient?.name }}
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

                <div class="rp-row"><span>Hujjat №</span><span class="rp-val">#{{ docNumber }}</span></div>
                <div class="rp-row"><span>Ombor</span><span class="rp-val">{{ warehouse }}</span></div>
                <div v-if="selectedClient" class="rp-row"><span>Mijoz</span><span class="rp-val rp-bold">{{ selectedClient.name }}</span></div>
                <div class="rp-row"><span>Narx turi</span><span class="rp-val">{{ priceType }}</span></div>
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
                  <span class="rp-pay-badge">{{ paymentType }}</span>
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
.rp-store{text-align:center;font-size:16px;font-weight:900;letter-spacing:3px;margin-bottom:3px}
.rp-store-sub{text-align:center;font-size:10px;color:#6b7280;margin-bottom:4px}
.rp-meta-row{display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-bottom:2px}
.rp-dashes{border-top:1px dashed #d1d5db;margin:8px 0}
.rp-row{display:flex;justify-content:space-between;font-size:11px;margin:3px 0;color:#374151}
.rp-val{font-weight:600}
.rp-bold{font-weight:800}
.rp-items-hdr{display:flex;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #f3f4f6}
.rp-item{margin-bottom:6px}
.rp-item__name{font-size:11.5px;font-weight:700;color:#111827;margin-bottom:1px}
.rp-item__line{display:flex;justify-content:space-between;font-size:10.5px}
.rp-item__qty{color:#6b7280}
.rp-item__sum{font-weight:700}
.rp-row--disc{color:#ef4444}
.rp-row--debt{color:#ef4444;font-weight:700}
.rp-total-row{display:flex;justify-content:space-between;font-weight:900;font-size:14px;padding:7px 0;margin:4px 0;border-top:2px solid #111827;border-bottom:2px solid #111827}
.rp-pay-badge{font-weight:800;font-size:11.5px}
.rp-barcode{text-align:center;padding:10px 0 6px}
.rp-bc-bars{display:flex;justify-content:center;align-items:flex-end;gap:1px;margin-bottom:5px}
.rp-bc-bar{background:#111827;display:inline-block}
.rp-bc-num{font-size:9px;letter-spacing:3px;color:#9ca3af}
.rp-footer{text-align:center;padding:6px 0 4px;border-top:1px dashed #d1d5db}
.rp-footer__line{font-size:11.5px;font-weight:700;letter-spacing:1px}
.rp-footer__sub{font-size:10px;color:#9ca3af;margin-top:2px}
</style>
