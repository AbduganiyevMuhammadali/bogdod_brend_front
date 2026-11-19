// "Sellz AI" — pastda qotib turuvchi ovozli yordamchi holati.
//
// Bitta (modul darajasidagi) holat: panel yopilib-ochilsa suhbat yo'qolmaydi.
// Ovoz: javob serverdan tayyor audio (Gemini TTS) bo'lib keladi va ijro
// etiladi; server ovoz bera olmasa brauzerning o'z ovozi ishlatiladi.
// Mikrofon: MediaRecorder → WAV (16 kHz, mono) → serverga, Gemini o'zi
// tinglab tushunadi (o'zbekcha nutqni ham).
import { ref, computed } from 'vue'
import router from '@/router/index.js'
import { aiApi } from '@/api/ai.js'
import { isLoggedIn } from '@/composables/useAuth.js'

const VOICE_KEY = 'ai_voice'          // '1' | '0' — ovozli javob
const MAX_REC_SEC = 30

export const open      = ref(false)
export const status    = ref(null)    // /ai/status javobi
export const messages  = ref([])      // {id, role, text, transcript, tools, actions, pending, error}
export const busy      = ref(false)
export const recording = ref(false)
export const recSec    = ref(0)
export const speaking  = ref(false)
export const voiceOn   = ref(localStorage.getItem(VOICE_KEY) !== '0')
export const lastError = ref('')

let greeted = false
let seq = 0
let audioEl = null
let mediaRec = null
let recChunks = []
let recTimer = null
let recStream = null
let recCancelled = false

export const configured = computed(() => !!status.value?.configured && status.value?.enabled !== false)
export const canConfigure = computed(() => !!status.value?.canConfigure)
// Gemini TTS ishlatiladimi (aks holda brauzer ovozi)
const geminiTts = computed(() => !!status.value?.ttsModel && status.value.ttsModel !== 'browser')

export async function loadStatus() {
  if (!isLoggedIn.value) return
  try { status.value = await aiApi.status() } catch { status.value = null }
}

export function toggleVoice() {
  voiceOn.value = !voiceOn.value
  localStorage.setItem(VOICE_KEY, voiceOn.value ? '1' : '0')
  if (!voiceOn.value) stopSpeaking()
}

export function clearChat() {
  messages.value = []
  greeted = false
  stopSpeaking()
}

export async function openAgent() {
  open.value = true
  if (!status.value) await loadStatus()
  if (!greeted && configured.value) greet()
}
export function closeAgent() { open.value = false; stopSpeaking(); if (recording.value) cancelRecording() }
export function toggleAgent() { open.value ? closeAgent() : openAgent() }

function push(msg) {
  const m = { id: ++seq, ...msg }
  messages.value.push(m)
  return m
}
function patch(m, data) {
  const i = messages.value.findIndex(x => x.id === m.id)
  if (i >= 0) messages.value[i] = { ...messages.value[i], ...data }
}

// Serverga yuboriladigan qisqa tarix (faqat matn)
function history() {
  return messages.value
    .filter(m => !m.pending && !m.error && m.text)
    .slice(-12)
    .map(m => ({ role: m.role, text: m.transcript || m.text }))
}

/** Ochilganda: qisqa xulosa (server bazadan tuzadi) va ovoz */
export async function greet() {
  greeted = true
  const m = push({ role: 'assistant', text: '', pending: true })
  try {
    const r = await aiApi.greeting(voiceOn.value && geminiTts.value)
    patch(m, { text: r.text, pending: false })
    if (voiceOn.value) r.audio ? playAudio(r.audio) : speakBrowser(r.text)
  } catch (e) {
    patch(m, { text: 'Salom! Nima bilan yordam beray?', pending: false })
  }
}

/** Matnli savol */
export async function send(text) {
  const t = String(text || '').trim()
  if (!t || busy.value) return
  stopSpeaking()
  push({ role: 'user', text: t })
  await ask({ text: t })
}

/** Ovozli savol (WAV/base64) */
async function sendAudio(audio) {
  const um = push({ role: 'user', text: '🎤 Ovozli xabar', voice: true })
  await ask({ audio }, um)
}

async function ask(payload, userMsg = null) {
  busy.value = true
  lastError.value = ''
  const m = push({ role: 'assistant', text: '', pending: true })
  try {
    const r = await aiApi.chat({ ...payload, history: history().slice(0, -1), speak: voiceOn.value && geminiTts.value })
    if (userMsg && r.transcript) patch(userMsg, { text: r.transcript, transcript: r.transcript })
    patch(m, { text: r.text, pending: false, tools: r.tools || [], actions: r.actions || [], ms: r.ms })
    if (voiceOn.value) r.audio ? playAudio(r.audio) : speakBrowser(r.text)
    // Sahifa ochish so'ralgan bo'lsa — o'tamiz va panelni yig'amiz (sahifa ko'rinsin;
    // ovoz ijrosi davom etadi)
    const nav = (r.actions || []).find(a => a.type === 'navigate' && a.path)
    if (nav) { router.push(nav.path); open.value = false }
  } catch (e) {
    const msg = e?.response?.data?.message || e.message || 'Xatolik'
    lastError.value = msg
    patch(m, { text: msg, pending: false, error: true })
  } finally {
    busy.value = false
  }
}

// ── Ovoz ijrosi ───────────────────────────────────────────────────────────

export function stopSpeaking() {
  if (audioEl) { try { audioEl.pause() } catch {} audioEl = null }
  if (window.speechSynthesis) try { window.speechSynthesis.cancel() } catch {}
  speaking.value = false
}

function playAudio(audio) {
  stopSpeaking()
  if (!audio?.data) return
  try {
    const el = new Audio(`data:${audio.mime || 'audio/wav'};base64,${audio.data}`)
    audioEl = el
    speaking.value = true
    el.onended = el.onerror = () => { if (audioEl === el) { audioEl = null; speaking.value = false } }
    el.play().catch(() => { speaking.value = false })
  } catch { speaking.value = false }
}

// Brauzer ovozi — zaxira variant. O'zbek ovozi kam uchraydi: uz → tr → ru.
function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || []
  const by = pre => voices.find(v => v.lang?.toLowerCase().startsWith(pre))
  return by('uz') || by('tr') || by('ru') || null
}
function speakBrowser(text) {
  if (!window.speechSynthesis || !text) return
  stopSpeaking()
  const clean = String(text).replace(/\*\*/g, '').replace(/^- /gm, '').slice(0, 800)
  const u = new SpeechSynthesisUtterance(clean)
  const v = pickVoice()
  if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'uz-UZ'
  u.rate = 1
  u.onstart = () => { speaking.value = true }
  u.onend = u.onerror = () => { speaking.value = false }
  window.speechSynthesis.speak(u)
}

// ── Mikrofon ─────────────────────────────────────────────────────────────

export const micSupported = computed(() =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined')

export async function startRecording() {
  if (recording.value || busy.value) return
  if (!micSupported.value) { lastError.value = 'Bu qurilmada mikrofon yozish qo\'llanmaydi'; return }
  stopSpeaking()
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    lastError.value = 'Mikrofonga ruxsat berilmadi'
    return
  }
  recChunks = []
  recCancelled = false
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m))
  mediaRec = mime ? new MediaRecorder(recStream, { mimeType: mime }) : new MediaRecorder(recStream)
  mediaRec.ondataavailable = e => { if (e.data?.size) recChunks.push(e.data) }
  mediaRec.onstop = onRecStop
  mediaRec.start(250)
  recording.value = true
  recSec.value = 0
  recTimer = setInterval(() => {
    recSec.value++
    if (recSec.value >= MAX_REC_SEC) stopRecording()
  }, 1000)
}

export function stopRecording() {
  if (!recording.value) return
  clearInterval(recTimer)
  recording.value = false
  try { mediaRec?.stop() } catch {}
}
export function cancelRecording() {
  recCancelled = true
  stopRecording()
}

async function onRecStop() {
  recStream?.getTracks().forEach(t => t.stop())
  recStream = null
  const blob = new Blob(recChunks, { type: mediaRec?.mimeType || 'audio/webm' })
  recChunks = []
  mediaRec = null
  if (recCancelled || blob.size < 1500) return  // juda qisqa / bekor
  let audio
  try { audio = await blobToWav(blob) }
  catch { audio = { mime: blob.type.split(';')[0] || 'audio/webm', data: await blobToBase64(blob) } }
  await sendAudio(audio)
}

// Har qanday yozuvni (webm/mp4/ogg) 16 kHz mono WAV ga aylantirish —
// Gemini uchun eng ishonchli format, hajmi ham kichik.
async function blobToWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) throw new Error('AudioContext yo\'q')
  const ctx = new AC()
  let decoded
  try { decoded = await ctx.decodeAudioData(await blob.arrayBuffer()) }
  finally { try { ctx.close() } catch {} }
  const ch = decoded.numberOfChannels, len = decoded.length
  const mono = new Float32Array(len)
  for (let c = 0; c < ch; c++) { const d = decoded.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch }
  const src = decoded.sampleRate, dst = 16000
  const outLen = Math.max(1, Math.round(len * dst / src))
  const ratio = src / dst
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(i0 + 1, len - 1), f = pos - i0
    out[i] = mono[i0] * (1 - f) + mono[i1] * f
  }
  const buf = new ArrayBuffer(44 + outLen * 2)
  const v = new DataView(buf)
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + outLen * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, dst, true); v.setUint32(28, dst * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, outLen * 2, true)
  for (let i = 0, o = 44; i < outLen; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, out[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return { mime: 'audio/wav', data: bufToBase64(buf) }
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
async function blobToBase64(blob) { return bufToBase64(await blob.arrayBuffer()) }

export function useAiAgent() {
  return {
    open, status, messages, busy, recording, recSec, speaking, voiceOn, lastError,
    configured, canConfigure, micSupported,
    loadStatus, openAgent, closeAgent, toggleAgent, send, greet, clearChat,
    toggleVoice, stopSpeaking, startRecording, stopRecording, cancelRecording,
  }
}
