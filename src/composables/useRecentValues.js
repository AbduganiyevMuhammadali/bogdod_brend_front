// Foydalanuvchi yozgan qiymatlarni eslab qolish (brend, kategoriya va h.k.).
//
// Tayyor ro'yxatlar har do'konga to'g'ri kelmaydi — kimdir "Nike" sotadi,
// kimdir mahalliy brendlar bilan ishlaydi. Shuning uchun taklif sifatida
// foydalanuvchining o'zi kiritgan qiymatlarni ko'rsatamiz: eng ko'p va
// eng oxirgi ishlatilgani yuqorida turadi.
//
// localStorage'da saqlanadi — bu ro'yxat bitta kassir kompyuteriga tegishli
// va serverga yuborilishi shart emas.

const PREFIX = 'recent_'
const MAX    = 40          // ro'yxat cheksiz o'smasin

function key(name) { return PREFIX + name }

function read(name) {
  try {
    const raw = localStorage.getItem(key(name))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []          // buzuq JSON — bo'sh ro'yxatdan boshlaymiz
  }
}

/**
 * Eslab qolingan qiymatlar — taklif tartibida.
 * Ko'p ishlatilgani oldinda, teng bo'lsa yaqinda ishlatilgani oldinda.
 */
export function getRecent(name) {
  return read(name)
    .sort((a, b) => (b.n - a.n) || (b.t - a.t))
    .map(x => x.v)
}

/** Qiymatni eslab qoladi (bir xil qiymat qayta yozilmaydi, sanog'i oshadi) */
export function rememberValue(name, value) {
  const v = String(value || '').trim()
  if (!v) return

  const list = read(name)
  const hit  = list.find(x => x.v.toLowerCase() === v.toLowerCase())

  if (hit) {
    hit.n += 1
    hit.t = Date.now()
    // Foydalanuvchi yozuvini o'zgartirgan bo'lsa (masalan katta harf)
    // oxirgi ko'rinishini saqlaymiz
    hit.v = v
  } else {
    list.push({ v, n: 1, t: Date.now() })
  }

  // Chegaradan oshsa — eng kam va eng eski ishlatilganini tashlaymiz
  const trimmed = list
    .sort((a, b) => (b.n - a.n) || (b.t - a.t))
    .slice(0, MAX)

  try {
    localStorage.setItem(key(name), JSON.stringify(trimmed))
  } catch { /* joy tugagan bo'lsa jim o'tamiz */ }
}

/** Bir nechta qiymatni birdan eslab qolish */
export function rememberValues(name, values) {
  (values || []).forEach(v => rememberValue(name, v))
}

/** Bitta qiymatni ro'yxatdan o'chirish */
export function forgetValue(name, value) {
  const v = String(value || '').trim().toLowerCase()
  const list = read(name).filter(x => x.v.toLowerCase() !== v)
  try {
    localStorage.setItem(key(name), JSON.stringify(list))
  } catch { /* ignore */ }
}
