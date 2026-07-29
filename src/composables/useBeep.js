// Kassa ovozli signallari — WebAudio, audio fayl talab qilmaydi.
// beep('add')     — savatga qo'shish / skan muvaffaqiyatli (qisqa yuqori "bip")
// beep('success') — sotuv yakunlandi (ikkitalik ko'tariluvchi signal)
// beep('error')   — xato / topilmadi (past ogohlantirish)

let ctx = null

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // Brauzer siyosati: foydalanuvchi harakatidan keyin resume qilinadi
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq, startAt, duration, volume = 0.16, type = 'sine') {
  const c = ensureCtx()
  if (!c) return
  const osc  = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = c.currentTime + startAt
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export function beep(kind = 'add') {
  try {
    if (kind === 'add') {
      tone(1250, 0, 0.09)
    } else if (kind === 'success') {
      tone(880, 0, 0.11)
      tone(1320, 0.11, 0.16)
    } else if (kind === 'error') {
      tone(220, 0, 0.22, 0.2, 'square')
    }
  } catch { /* ovoz ishlamasa ham dastur ishlashda davom etadi */ }
}
