// Shtrix-kod skanerini butun sahifa bo'ylab tinglaydi — input fokusda
// bo'lishi shart emas.
//
// Skanerni odam terishidan ajratish: skaner belgilarni juda tez yuboradi
// (odatda 5–30 ms oralig'ida) va oxirida Enter bosadi. Odam esa sekinroq
// yozadi. Shu farqdan foydalanamiz.
//
// Odatiy input maydonlariga xalaqit bermaydi: agar foydalanuvchi biror
// maydonga qo'lda yozayotgan bo'lsa, tezlik chegarasi bo'yicha bu skan
// deb hisoblanmaydi va belgilar o'z joyiga tushaveradi.
import { onMounted, onUnmounted } from 'vue'

const MAX_GAP_MS   = 60   // belgilar orasidagi eng katta oraliq
const MIN_LENGTH   = 6    // shundan qisqa kodlar e'tiborga olinmaydi
const RESET_MS     = 120  // shu vaqt jim tursa, bufer tozalanadi

export function useGlobalScanner(onScan, options = {}) {
  const {
    minLength = MIN_LENGTH,
    maxGap    = MAX_GAP_MS,
    enabled   = () => true,
  } = options

  let buffer = ''
  let lastAt = 0
  let timer  = null

  function reset() {
    buffer = ''
    if (timer) { clearTimeout(timer); timer = null }
  }

  function handler(e) {
    if (!enabled()) return

    // Modifikatorli kombinatsiyalar (Ctrl+C va h.k.) skan emas
    if (e.ctrlKey || e.altKey || e.metaKey) return reset()

    const now = Date.now()
    const gap = now - lastAt
    lastAt = now

    if (e.key === 'Enter') {
      const code = buffer.trim()
      reset()
      if (code.length >= minLength) {
        // Skaner Enter'i — forma yuborilishini to'xtatamiz
        e.preventDefault()
        e.stopPropagation()
        onScan(code)
      }
      return
    }

    // Faqat bitta belgi beradigan tugmalar (harf/raqam) qiziqtiradi
    if (e.key.length !== 1) return

    // Oraliq katta bo'lsa — yangi ketma-ketlik boshlandi deb hisoblaymiz.
    // Odam yozganda har belgi orasida 100 ms dan ko'p vaqt o'tadi, shuning
    // uchun uning matni hech qachon minLength ga yetmaydi.
    if (gap > maxGap) buffer = ''
    buffer += e.key

    // Enter kelmasa ham, jim qolgach buferni tozalaymiz
    if (timer) clearTimeout(timer)
    timer = setTimeout(reset, RESET_MS)
  }

  onMounted(()   => window.addEventListener('keydown', handler, true))
  onUnmounted(() => { window.removeEventListener('keydown', handler, true); reset() })

  return { reset }
}
