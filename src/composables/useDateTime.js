// Sana/vaqtni bir xil ko'rsatish uchun yagona joy.
//
// MUAMMO: backend sanani ISO UTC ko'rinishida yuboradi
// ("2026-08-07T05:15:00.000Z"), sahifalar esa uni matn deb qarab
// `slice(11,16)` bilan soatni kesib olardi. Natijada UTC soati chiqib
// qolardi — Toshkent vaqti bilan 5 soat farq (10:15 o'rniga 05:15).
//
// Shuning uchun sanani doim Date obyektiga o'girib, brauzerning mahalliy
// vaqt zonasida formatlaymiz. Kassir kompyuterida soat nechi bo'lsa,
// hujjatda ham o'sha ko'rinadi.

// Sanasi yo'q/buzuq bo'lsa formatlashga urinmaymiz
function toDate(v) {
  if (!v) return null
  if (v instanceof Date) return isNaN(v) ? null : v
  // "2026-08-07 05:15:00" (probel bilan) — Safari uni tushunmaydi,
  // shuning uchun ISO ko'rinishga keltiramiz.
  const s = String(v).trim().replace(' ', 'T')
  const d = new Date(s)
  return isNaN(d) ? null : d
}

const pad = n => String(n).padStart(2, '0')

/** "07.08.2026" — mahalliy vaqt bo'yicha */
export function fmtDate(v, fallback = '—') {
  const d = toDate(v)
  if (!d) return fallback
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** "10:15" — mahalliy vaqt bo'yicha */
export function fmtTime(v, fallback = '') {
  const d = toDate(v)
  if (!d) return fallback
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "07.08.2026 10:15" */
export function fmtDateTime(v, fallback = '—') {
  const d = toDate(v)
  if (!d) return fallback
  return `${fmtDate(d)} ${fmtTime(d)}`
}

/**
 * "2026-08-07" — mahalliy kun. Filtrlash va solishtirish uchun.
 * toISOString() ishlatib bo'lmaydi: u UTC ga o'giradi va kechqurun
 * kiritilgan hujjat "ertangi kun" bo'lib ketadi.
 */
export function toDateKey(v = new Date()) {
  const d = toDate(v)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Bugungi kun kaliti — toDateKey() ning qisqartmasi */
export function todayKey() {
  return toDateKey(new Date())
}

/** <input type="datetime-local"> uchun "2026-08-07T10:15" */
export function toInputValue(v = new Date()) {
  const d = toDate(v)
  if (!d) return ''
  return `${toDateKey(d)}T${fmtTime(d)}`
}
