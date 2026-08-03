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

    // ── Inventarizatsiya signallari ────────────────────────────────
    // Sanoqchi ekranga qaramasdan, faqat ovozdan holatni ajrata olishi
    // kerak — shuning uchun har biri sezilarli darajada farq qiladi.

    } else if (kind === 'found') {
      // Topildi — yumshoq ko'tariluvchi ikki nota, quloqqa yoqimli
      tone(1046, 0,     0.075, 0.14)   // C6
      tone(1568, 0.075, 0.13,  0.13)   // G6
    } else if (kind === 'duplicate') {
      // Qayta urildi — past, takrorlanuvchi ogohlantirish.
      // Xato emas, shuning uchun keskin emas, lekin darhol sezilади.
      tone(420, 0,    0.1, 0.18, 'triangle')
      tone(420, 0.14, 0.1, 0.18, 'triangle')
    } else if (kind === 'extra') {
      // Ortiqcha — hisobda yo'q yoki ko'p chiqdi: o'rta balandlikda
      // uch nota, "diqqat" ma'nosida
      tone(760, 0,    0.07, 0.15)
      tone(660, 0.08, 0.07, 0.15)
      tone(560, 0.16, 0.12, 0.15)
    } else if (kind === 'unknown') {
      // Bazada umuman yo'q tovar — pastga tushuvchi, aniq salbiy
      tone(400, 0,    0.11, 0.19, 'square')
      tone(260, 0.12, 0.20, 0.19, 'square')
    } else if (kind === 'finish') {
      // Sanoq yakunlandi — uch notali ko'tariluvchi akkord
      tone(784,  0,    0.11, 0.14)   // G5
      tone(1046, 0.11, 0.11, 0.14)   // C6
      tone(1568, 0.22, 0.26, 0.15)   // G6
    }
  } catch { /* ovoz ishlamasa ham dastur ishlashda davom etadi */ }
}
