// Pul/miqdor maydonlarini yozayotgan vaqtda formatlaydi: 4000 → "4 000".
//
// Nima uchun v-model bilan emas: <input type="number"> bo'sh joyli matnni
// qabul qilmaydi, shuning uchun maydon type="text" bo'lishi va qiymat
// qo'lda formatlanishi kerak. Kursor holati ham saqlanadi — aks holda
// har harfda kursor oxiriga sakrab ketadi.
//
// Ishlatilishi:
//   <input type="text" inputmode="decimal"
//          :value="fmtNum(row.price)"
//          @input="e => row.price = parseNum(e.target.value)" />
//
// yoki to'g'ridan-to'g'ri direktiva bilan (kursorni saqlaydi):
//   <input v-money="{ get: () => row.price, set: v => row.price = v }" />

const NBSP = ' '

// "4 000,50" / "4000.5" → 4000.5 ; bo'sh bo'lsa '' qaytaradi
export function parseNum(str) {
  if (str === null || str === undefined) return ''
  const s = String(str).replace(/[\s ]/g, '').replace(',', '.')
  if (s === '' || s === '-') return ''
  const n = Number(s)
  return Number.isFinite(n) ? n : ''
}

// 4000.5 → "4 000,5" ; bo'sh/0 uchun bo'sh satr (maydon bo'sh ko'rinadi)
export function fmtNum(value, { keepZero = false } = {}) {
  if (value === '' || value === null || value === undefined) return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (n === 0 && !keepZero) return ''

  const neg = n < 0
  const [int, dec] = Math.abs(n).toString().split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return (neg ? '-' : '') + grouped + (dec ? ',' + dec : '')
}

// Yozish jarayonida: raqam va bitta kasr ajratgichdan boshqasini olib
// tashlaydi, so'ng guruhlaydi. Kasr qismi yozilayotgan bo'lsa
// ("4000," yoki "4000,5") saqlanadi.
function formatWhileTyping(raw) {
  let s = String(raw).replace(/[^\d.,-]/g, '')

  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')

  // Birinchi ajratgichni qoldiramiz, qolganini olib tashlaymiz
  const firstSep = s.search(/[.,]/)
  if (firstSep >= 0) {
    s = s.slice(0, firstSep + 1).replace(/[.,]/g, ',') + s.slice(firstSep + 1).replace(/[.,]/g, '')
  }

  const [intPart, decPart] = s.split(',')
  const grouped = (intPart || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)

  let out = grouped
  if (s.includes(',')) out += ',' + (decPart ?? '')
  return (neg ? '-' : '') + out
}

// Kursordan chapdagi raqamlar sonini hisoblaydi — formatlashdan keyin
// kursorni o'sha joyga qaytarish uchun.
function digitsBefore(str, pos) {
  return (str.slice(0, pos).match(/\d/g) || []).length
}

function posAfterDigits(str, count) {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < str.length; i++) {
    if (/\d/.test(str[i])) {
      seen++
      if (seen === count) return i + 1
    }
  }
  return str.length
}

// v-money direktivasi — maydon qiymatini formatlab ko'rsatadi, model'ga
// esa toza son yozadi. Kursor holati saqlanadi.
export const vMoney = {
  mounted(el, binding) {
    if (!binding.value?.get || !binding.value?.set) return

    // MUHIM: get/set ni closure'ga olib qo'ymaymiz, `el.__bind` orqali
    // o'qiymiz. Vue ro'yxatni qayta chizganda (masalan qatorlar tozalanib
    // yangisi qo'yilganda) shu DOM elementini qayta ishlatishi mumkin —
    // eski closure esa allaqachon tashlab yuborilgan qatorga yozib,
    // kiritilgan summa yo'qolib qolardi.
    el.__bind = binding.value

    el.type = 'text'
    el.inputMode = 'decimal'
    el.value = fmtNum(el.__bind.get())

    el.__money = () => {
      const before = el.value
      const caret  = el.selectionStart ?? before.length
      const dCount = digitsBefore(before, caret)

      const formatted = formatWhileTyping(before)
      el.value = formatted
      el.__bind.set(parseNum(formatted))

      const newPos = posAfterDigits(formatted, dCount)
      requestAnimationFrame(() => {
        try { el.setSelectionRange(newPos, newPos) } catch { /* ignore */ }
      })
    }

    el.__moneyBlur = () => { el.value = fmtNum(el.__bind.get()) }

    el.addEventListener('input', el.__money)
    el.addEventListener('blur',  el.__moneyBlur)
  },

  updated(el, binding) {
    if (!binding.value?.get || !binding.value?.set) return
    // Yangi qatorga bog'landi — get/set ni almashtiramiz
    el.__bind = binding.value
    // Tashqaridan o'zgargan bo'lsa yangilaymiz (foydalanuvchi yozayotgan
    // paytdan tashqari — aks holda kursor sakraydi)
    if (document.activeElement !== el) el.value = fmtNum(el.__bind.get())
  },

  unmounted(el) {
    el.removeEventListener('input', el.__money)
    el.removeEventListener('blur',  el.__moneyBlur)
    el.__bind = null
  },
}
