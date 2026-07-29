<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { BrowserMultiFormatReader } from '@zxing/browser'
import AppIcon from '@/components/AppIcon.vue'
import { beep } from '@/composables/useBeep.js'

const emit = defineEmits(['close', 'detected'])

const videoEl   = ref(null)
const error     = ref('')
const starting  = ref(true)
let reader      = null
let controls    = null
let lastCode    = ''
let lastAt      = 0

function onResult(result) {
  if (!result) return
  const code = result.getText()
  const now  = Date.now()
  // Bir xil kodni ketma-ket bir necha marta o'qishning oldini olamiz (video kadr tezligi tufayli)
  if (code === lastCode && now - lastAt < 1500) return
  lastCode = code; lastAt = now
  beep('add')
  emit('detected', code)
}

async function start() {
  reader = new BrowserMultiFormatReader()

  // 1-urinish: facingMode orqali to'g'ridan-to'g'ri orqa kamerani so'raymiz.
  // enumerateDevices()ga tayanmaydi — iOS Safari/PWA'da "method not supported"
  // xatosiga olib keladigan yo'l shu edi, chunki kamera ruxsati hali berilmagan
  // paytda qurilmalar ro'yxati (va ba'zan hatto usulning o'zi) mavjud bo'lmaydi.
  try {
    controls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      videoEl.value,
      onResult,
    )
    starting.value = false
    return
  } catch (e) {
    if (e?.name === 'NotAllowedError') {
      error.value = 'Kameraga ruxsat berilmadi'
      starting.value = false
      return
    }
    // facingMode qo'llab-quvvatlanmasa (ba'zi eski qurilmalar), oddiy video bilan qayta urinamiz
  }

  try {
    controls = await reader.decodeFromConstraints(
      { video: true },
      videoEl.value,
      onResult,
    )
    starting.value = false
  } catch (e) {
    error.value = e?.name === 'NotAllowedError'
      ? 'Kameraga ruxsat berilmadi'
      : (e?.message || 'Kamerani ochib bo\'lmadi')
    starting.value = false
  }
}

function stop() {
  controls?.stop()
  controls = null
}

onMounted(start)
onUnmounted(stop)

function close() { stop(); emit('close') }
</script>

<template>
  <Teleport to="body">
    <div class="bcs">
      <div class="bcs__hdr">
        <span class="bcs__title">
          <AppIcon name="camera" :size="16" :stroke-width="2.2"/>
          Shtrix-kodni skanerlang
        </span>
        <button class="bcs__close" @click="close">
          <AppIcon name="x" :size="18" :stroke-width="2.3"/>
        </button>
      </div>

      <div class="bcs__body">
        <video ref="videoEl" class="bcs__video" autoplay muted playsinline></video>

        <div v-if="!error" class="bcs__frame">
          <span class="bcs__corner bcs__corner--tl"></span>
          <span class="bcs__corner bcs__corner--tr"></span>
          <span class="bcs__corner bcs__corner--bl"></span>
          <span class="bcs__corner bcs__corner--br"></span>
          <div class="bcs__laser"></div>
        </div>

        <div v-if="starting && !error" class="bcs__status">
          <div class="bcs__spinner"></div>
          Kamera ishga tushmoqda...
        </div>

        <div v-if="error" class="bcs__error">
          <AppIcon name="alert-circle" :size="28" :stroke-width="1.8"/>
          <p>{{ error }}</p>
          <button class="bcs__retry" @click="error=''; starting=true; start()">Qayta urinish</button>
        </div>
      </div>

      <p class="bcs__hint">Tovar shtrix-kodini kamera ramkasiga to'g'rilang</p>
    </div>
  </Teleport>
</template>

<style scoped>
.bcs {
  position: fixed; inset: 0; z-index: 900;
  background: #000;
  display: flex; flex-direction: column;
  animation: bcs-in 0.2s ease;
}
@keyframes bcs-in { from { opacity: 0; } to { opacity: 1; } }

.bcs__hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 14px;
  background: rgba(0,0,0,0.55);
  z-index: 2;
}
.bcs__title { display: flex; align-items: center; gap: 8px; color: white; font-size: 14.5px; font-weight: 700; }
.bcs__close {
  width: 36px; height: 36px; border-radius: 99px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.12); color: white;
}
.bcs__close:active { background: rgba(255,255,255,0.22); }

.bcs__body { position: relative; flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.bcs__video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }

.bcs__frame {
  position: relative; z-index: 1;
  width: min(78vw, 340px); height: 130px;
}
.bcs__corner { position: absolute; width: 26px; height: 26px; border: 3px solid #34d399; }
.bcs__corner--tl { top: 0; left: 0; border-right: none; border-bottom: none; border-radius: 8px 0 0 0; }
.bcs__corner--tr { top: 0; right: 0; border-left: none; border-bottom: none; border-radius: 0 8px 0 0; }
.bcs__corner--bl { bottom: 0; left: 0; border-right: none; border-top: none; border-radius: 0 0 0 8px; }
.bcs__corner--br { bottom: 0; right: 0; border-left: none; border-top: none; border-radius: 0 0 8px 0; }

.bcs__laser {
  position: absolute; left: 4%; right: 4%; height: 2px;
  background: linear-gradient(90deg, transparent, #34d399, transparent);
  box-shadow: 0 0 8px 1px #34d399;
  animation: bcs-scan 1.6s ease-in-out infinite;
}
@keyframes bcs-scan {
  0%   { top: 6%; opacity: 0.3; }
  50%  { top: 92%; opacity: 1; }
  100% { top: 6%; opacity: 0.3; }
}

.bcs__status {
  position: absolute; bottom: 14%; left: 0; right: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  color: white; font-size: 13px; font-weight: 600;
}
.bcs__spinner {
  width: 26px; height: 26px; border-radius: 99px;
  border: 3px solid rgba(255,255,255,0.25); border-top-color: white;
  animation: bcs-spin 0.8s linear infinite;
}
@keyframes bcs-spin { to { transform: rotate(360deg); } }

.bcs__error {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  color: white; text-align: center; padding: 0 30px;
}
.bcs__error p { font-size: 13.5px; color: rgba(255,255,255,0.85); }
.bcs__retry {
  margin-top: 4px; padding: 8px 18px; border-radius: 99px;
  background: #34d399; color: #06281c; font-size: 13px; font-weight: 700; font-family: inherit;
}

.bcs__hint {
  text-align: center; color: rgba(255,255,255,0.6); font-size: 12px;
  padding: 14px 16px calc(18px + env(safe-area-inset-bottom, 0px));
  background: rgba(0,0,0,0.55);
}
</style>
