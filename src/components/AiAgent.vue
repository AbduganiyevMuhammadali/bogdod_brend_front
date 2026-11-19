<script setup>
// Pastda qotib turuvchi "Sellz AI" tugmasi va suhbat paneli.
// Bosilganda ochiladi va bugungi xulosani ovoz bilan aytadi;
// matn yoki mikrofon orqali savol beriladi, javob o'qib beriladi.
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useAiAgent } from '@/composables/useAiAgent.js'
import { useAuth } from '@/composables/useAuth.js'

const {
  open, status, messages, busy, recording, recSec, speaking, voiceOn, lastError,
  configured, canConfigure, micSupported,
  loadStatus, openAgent, closeAgent, toggleAgent, send, clearChat,
  toggleVoice, stopSpeaking, startRecording, stopRecording, cancelRecording,
} = useAiAgent()

const { branch } = useAuth()
const route  = useRoute()
const router = useRouter()

const input   = ref('')
const listEl  = ref(null)
const inputEl = ref(null)

// Login sahifasida ko'rinmaydi. Yoqilmagan (admin o'chirgan) bo'lsa — yo'q.
// Sozlanmagan bo'lsa faqat admin ko'radi (sozlash uchun).
const visible = computed(() => {
  if (route.meta?.public) return false
  if (!status.value) return false
  if (status.value.enabled === false) return false
  if (!status.value.configured && !canConfigure.value) return false
  return true
})

const statusLine = computed(() => {
  if (recording.value) return `Eshitmoqda… ${recSec.value}s`
  if (busy.value)      return "O'ylamoqda…"
  if (speaking.value)  return 'Gapirmoqda…'
  const m = status.value?.model ? status.value.model.replace('gemini-', 'Gemini ') : 'Gemini'
  return `${m} • ${branch.value?.name || ''}`
})

const QUICK = [
  { label: 'Bugungi hisobot',   text: "Bugungi savdo hisobotini ayt" },
  { label: 'Qarzdorlar',        text: "Muddati kelgan qarzdorlar kim?" },
  { label: 'Kam qolgan tovar',  text: "Qaysi tovarlar kam qoldi yoki tugadi?" },
  { label: 'Kassa',             text: "Bugungi kassa holati qanday?" },
  { label: 'Top tovarlar',      text: "Bu oyda eng ko'p sotilgan tovarlar" },
  { label: 'Kechagi savdo',     text: "Kechagi savdo bugungi bilan solishtirganda qanday?" },
]

function submit() {
  const t = input.value
  input.value = ''
  send(t)
}
function onMic() {
  if (recording.value) stopRecording()
  else startRecording()
}
function goSettings() {
  closeAgent()
  router.push({ path: '/settings', query: { section: 'ai' } })
}

// Oddiy formatlash: **qalin**, "- " bandlar, yangi qatorlar. HTML qochiriladi.
function fmt(text) {
  const esc = String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .split('\n')
    .map(l => /^\s*[-•]\s+/.test(l) ? `<div class="ai-li">${l.replace(/^\s*[-•]\s+/, '')}</div>` : l)
    .join('<br>')
    .replace(/(<\/div>)<br>/g, '$1')
    .replace(/<br>(<div class="ai-li">)/g, '$1')
}

async function scrollDown() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}
watch(() => messages.value.length, scrollDown)
watch(() => messages.value.map(m => m.text).join('|'), scrollDown)
watch(open, async v => { if (v) { await scrollDown(); await nextTick(); inputEl.value?.focus?.() } })

function onKey(e) {
  if (e.key === 'Escape' && open.value) closeAgent()
}
onMounted(() => { loadStatus(); document.addEventListener('keydown', onKey) })
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <!-- Qotib turuvchi tugma -->
    <transition name="ai-fab">
      <button
        v-if="visible && !open"
        class="ai-fab"
        :class="{ 'is-speaking': speaking, 'is-busy': busy }"
        title="Sellz AI yordamchi"
        aria-label="AI yordamchi"
        @click="toggleAgent"
      >
        <span class="ai-fab__ring" />
        <span class="ai-fab__orb"><AppIcon name="sparkles" :size="22" :stroke-width="2" /></span>
      </button>
    </transition>

    <!-- Panel -->
    <transition name="ai-panel">
      <section v-if="visible && open" class="ai-panel" role="dialog" aria-label="Sellz AI">
        <header class="ai-hd">
          <div class="ai-hd__orb" :class="{ 'is-speaking': speaking, 'is-busy': busy, 'is-rec': recording }">
            <AppIcon name="sparkles" :size="18" :stroke-width="2" />
          </div>
          <div class="ai-hd__t">
            <p class="ai-hd__name">Sellz AI</p>
            <p class="ai-hd__sub">{{ statusLine }}</p>
          </div>
          <button class="ai-ib" :title="voiceOn ? 'Ovozni o\'chirish' : 'Ovozni yoqish'" @click="toggleVoice">
            <AppIcon :name="voiceOn ? 'volume-2' : 'volume-x'" :size="16" />
          </button>
          <button v-if="speaking" class="ai-ib ai-ib--stop" title="To'xtatish" @click="stopSpeaking">
            <AppIcon name="square" :size="14" />
          </button>
          <button class="ai-ib" title="Suhbatni tozalash" @click="clearChat">
            <AppIcon name="trash-2" :size="15" />
          </button>
          <button class="ai-ib" title="Yopish" @click="closeAgent">
            <AppIcon name="x" :size="17" />
          </button>
        </header>

        <!-- Sozlanmagan -->
        <div v-if="!configured" class="ai-setup">
          <div class="ai-setup__ico"><AppIcon name="key" :size="22" /></div>
          <p class="ai-setup__t">AI yordamchi hali sozlanmagan</p>
          <p class="ai-setup__s">
            Gemini API kalitini kiriting — kalit bepul, <b>aistudio.google.com/apikey</b> dan olinadi.
            Kalit faqat serverda saqlanadi.
          </p>
          <button v-if="canConfigure" class="ai-btn" @click="goSettings">
            <AppIcon name="settings" :size="15" /> Sozlamalarga o'tish
          </button>
          <p v-else class="ai-setup__s">Administratorga murojaat qiling.</p>
        </div>

        <!-- Suhbat -->
        <div v-else ref="listEl" class="ai-body">
          <div v-for="m in messages" :key="m.id" class="ai-msg" :class="[`ai-msg--${m.role}`, m.error && 'ai-msg--err']">
            <div class="ai-msg__bubble">
              <template v-if="m.pending">
                <span class="ai-dots"><i /><i /><i /></span>
              </template>
              <template v-else>
                <span v-if="m.voice" class="ai-msg__voice"><AppIcon name="mic" :size="12" /></span>
                <span class="ai-msg__text" v-html="fmt(m.text)" />
              </template>
            </div>
            <div v-if="!m.pending && m.role === 'assistant' && (m.tools?.length || m.actions?.length)" class="ai-msg__meta">
              <span v-for="t in m.tools" :key="t" class="ai-chip ai-chip--tool">
                <AppIcon name="database" :size="10" /> {{ t.replace(/_/g, ' ') }}
              </span>
              <button v-for="a in m.actions" :key="a.path" class="ai-chip ai-chip--act" @click="router.push(a.path); closeAgent()">
                <AppIcon name="external-link" :size="10" /> {{ a.label }}
              </button>
            </div>
          </div>

          <div v-if="messages.length <= 1 && !busy" class="ai-quick">
            <p class="ai-quick__t">Tezkor savollar</p>
            <div class="ai-quick__row">
              <button v-for="qk in QUICK" :key="qk.label" class="ai-quick__btn" @click="send(qk.text)">{{ qk.label }}</button>
            </div>
          </div>
        </div>

        <footer v-if="configured" class="ai-ft">
          <button
            v-if="micSupported"
            class="ai-mic"
            :class="{ 'is-rec': recording }"
            :disabled="busy"
            :title="recording ? 'Yozishni tugatish va yuborish' : 'Ovoz bilan so\'rash'"
            @click="onMic"
          >
            <AppIcon :name="recording ? 'square' : 'mic'" :size="18" :stroke-width="2" />
            <span v-if="recording" class="ai-mic__sec">{{ recSec }}s</span>
          </button>
          <button v-if="recording" class="ai-ib ai-ib--cancel" title="Bekor qilish" @click="cancelRecording">
            <AppIcon name="x" :size="15" />
          </button>
          <input
            v-else
            ref="inputEl"
            v-model="input"
            class="ai-inp"
            type="text"
            :disabled="busy"
            placeholder="Savol yozing… (masalan: bugun qancha savdo bo'ldi?)"
            @keydown.enter.prevent="submit"
          />
          <button v-if="!recording" class="ai-send" :disabled="busy || !input.trim()" title="Yuborish" @click="submit">
            <AppIcon name="send" :size="16" :stroke-width="2" />
          </button>
        </footer>
        <p v-if="lastError && configured" class="ai-err">{{ lastError }}</p>
      </section>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ── Qotib turuvchi tugma ─────────────────────────────── */
.ai-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 950;
  width: 58px; height: 58px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  filter: drop-shadow(0 10px 24px rgba(99,102,241,0.45));
  transition: transform .2s var(--ease-spring);
}
.ai-fab:hover  { transform: translateY(-2px) scale(1.04); }
.ai-fab:active { transform: scale(0.95); }
.ai-fab__orb {
  position: relative; z-index: 1;
  width: 58px; height: 58px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 55%, #22d3ee 120%);
  background-size: 200% 200%;
  animation: ai-grad 6s ease-in-out infinite;
}
.ai-fab__ring {
  position: absolute; inset: -6px; border-radius: 50%;
  border: 2px solid rgba(99,102,241,0.45);
  animation: ai-ring 2.4s ease-out infinite;
}
.ai-fab.is-speaking .ai-fab__ring { border-color: rgba(34,211,238,0.7); animation-duration: 1s; }
.ai-fab.is-busy .ai-fab__orb { animation-duration: 1.4s; }
@keyframes ai-grad { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes ai-ring { 0% { transform: scale(0.85); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }

@media (max-width: 768px) {
  /* Pastki menyu (BottomNav) ustida tursin */
  .ai-fab { right: 14px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); width: 54px; height: 54px; }
  .ai-fab__orb { width: 54px; height: 54px; }
}

.ai-fab-enter-active, .ai-fab-leave-active { transition: opacity .18s, transform .22s var(--ease-spring); }
.ai-fab-enter-from, .ai-fab-leave-to { opacity: 0; transform: scale(.6); }

/* ── Panel ────────────────────────────────────────────── */
.ai-panel {
  position: fixed;
  right: 22px; bottom: 22px;
  z-index: 960;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: 600px;
  max-height: calc(100vh - 40px);
  display: flex; flex-direction: column;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 22px;
  box-shadow: 0 24px 64px rgba(15,23,42,0.22), 0 4px 16px rgba(15,23,42,0.08);
  overflow: hidden;
}
@media (max-width: 768px) {
  .ai-panel {
    right: 0; left: 0; bottom: 0;
    width: 100%; max-width: 100%;
    height: 82vh; max-height: 82vh;
    border-radius: 22px 22px 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
}
.ai-panel-enter-active { transition: opacity .18s ease, transform .26s var(--ease-spring); }
.ai-panel-leave-active { transition: opacity .14s ease, transform .18s ease; }
.ai-panel-enter-from, .ai-panel-leave-to { opacity: 0; transform: translateY(18px) scale(.97); }

/* Header */
.ai-hd {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 12px 12px 14px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: linear-gradient(180deg, #f5f3ff, #fff);
}
.ai-hd__orb {
  width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6 60%, #22d3ee);
  background-size: 200% 200%;
  animation: ai-grad 6s ease-in-out infinite;
  box-shadow: 0 6px 16px rgba(99,102,241,.35);
}
.ai-hd__orb.is-speaking { animation: ai-grad 1s ease-in-out infinite, ai-pulse 1s ease-in-out infinite; }
.ai-hd__orb.is-busy     { animation-duration: 1.4s; }
.ai-hd__orb.is-rec      { background: linear-gradient(135deg, #f43f5e, #fb7185); animation: ai-pulse .9s ease-in-out infinite; }
@keyframes ai-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.ai-hd__t { flex: 1; min-width: 0; line-height: 1.25; }
.ai-hd__name { font-size: 14.5px; font-weight: 800; color: var(--color-text); letter-spacing: -0.01em; }
.ai-hd__sub  { font-size: 11.5px; color: var(--color-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-ib {
  width: 32px; height: 32px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-2); transition: background .15s;
}
.ai-ib:hover { background: rgba(99,102,241,.1); color: var(--indigo-600); }
.ai-ib--stop { color: #e11d48; }
.ai-ib--cancel { color: #e11d48; }

/* Setup */
.ai-setup { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 28px 26px; gap: 10px; }
.ai-setup__ico { width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: #eef2ff; color: #4f46e5; }
.ai-setup__t { font-size: 15px; font-weight: 800; color: var(--color-text); }
.ai-setup__s { font-size: 12.5px; color: var(--color-text-2); line-height: 1.5; }
.ai-btn {
  margin-top: 6px; display: inline-flex; align-items: center; gap: 7px;
  height: 38px; padding: 0 16px; border-radius: 12px; font-weight: 700; font-size: 13px; color: #fff;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}

/* Body */
.ai-body { flex: 1; overflow-y: auto; padding: 14px 14px 8px; display: flex; flex-direction: column; gap: 10px; background: var(--color-bg, #f0f2f7); }
.ai-msg { display: flex; flex-direction: column; max-width: 88%; }
.ai-msg--user { align-self: flex-end; align-items: flex-end; }
.ai-msg--assistant { align-self: flex-start; align-items: flex-start; }
.ai-msg__bubble {
  padding: 9px 13px; border-radius: 16px; font-size: 13.5px; line-height: 1.5; word-break: break-word;
  background: var(--color-surface, #fff); color: var(--color-text); border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: var(--shadow-xs);
}
.ai-msg--user .ai-msg__bubble { background: linear-gradient(135deg, #6366f1, #7c3aed); color: #fff; border-color: transparent; border-bottom-right-radius: 6px; }
.ai-msg--assistant .ai-msg__bubble { border-bottom-left-radius: 6px; }
.ai-msg--err .ai-msg__bubble { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
.ai-msg__voice { display: inline-flex; margin-right: 5px; opacity: .8; vertical-align: -1px; }
.ai-msg__text :deep(.ai-li) { padding-left: 14px; position: relative; }
.ai-msg__text :deep(.ai-li)::before { content: '•'; position: absolute; left: 2px; opacity: .6; }
.ai-msg__meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; padding: 0 4px; }
.ai-chip { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; border-radius: 99px; font-size: 10.5px; font-weight: 600; }
.ai-chip--tool { background: #eef2ff; color: #4338ca; }
.ai-chip--act  { background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; cursor: pointer; }
.ai-chip--act:hover { background: #cffafe; }

.ai-dots { display: inline-flex; gap: 4px; padding: 3px 2px; }
.ai-dots i { width: 6px; height: 6px; border-radius: 50%; background: #a5b4fc; animation: ai-dot 1.2s infinite; }
.ai-dots i:nth-child(2) { animation-delay: .15s; } .ai-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes ai-dot { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }

.ai-quick { margin-top: auto; padding-top: 6px; }
.ai-quick__t { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-3); margin: 0 2px 6px; }
.ai-quick__row { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-quick__btn {
  height: 30px; padding: 0 11px; border-radius: 99px; font-size: 12px; font-weight: 600;
  background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e8f0); color: var(--color-text-2);
  transition: all .15s;
}
.ai-quick__btn:hover { border-color: #c7d2fe; color: #4338ca; background: #eef2ff; }

/* Footer */
.ai-ft {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-surface, #fff);
}
.ai-mic {
  position: relative; flex-shrink: 0;
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; background: linear-gradient(135deg, #6366f1, #8b5cf6);
  box-shadow: 0 4px 12px rgba(99,102,241,.35);
  transition: transform .15s;
}
.ai-mic:disabled { opacity: .5; }
.ai-mic:active { transform: scale(.93); }
.ai-mic.is-rec { background: linear-gradient(135deg, #f43f5e, #fb7185); box-shadow: 0 0 0 6px rgba(244,63,94,.18); animation: ai-pulse 1s infinite; width: auto; padding: 0 14px; border-radius: 99px; gap: 8px; }
.ai-mic__sec { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ai-inp {
  flex: 1; min-width: 0; height: 42px; padding: 0 14px;
  border: 1.5px solid var(--color-border, #e2e8f0); border-radius: 14px;
  font-size: 13.5px; font-family: inherit; color: var(--color-text); background: var(--slate-50, #f8fafc); outline: none;
}
.ai-inp:focus { border-color: #a5b4fc; background: #fff; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
.ai-send {
  flex-shrink: 0; width: 42px; height: 42px; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; background: var(--indigo-500, #6366f1);
}
.ai-send:disabled { opacity: .4; }
.ai-err { font-size: 11.5px; color: #be123c; background: #fff1f2; padding: 6px 14px; border-top: 1px solid #fecdd3; }
</style>
