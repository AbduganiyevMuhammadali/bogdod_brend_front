import { ref } from 'vue'
import uz from './uz.js'
import ru from './ru.js'

const translations = { uz, ru }

// Module-level singleton — shared across all components
const locale = ref(localStorage.getItem('pos_locale') || 'uz')

export const languages = [
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

export function useI18n() {
  function t(key) {
    if (!key) return ''
    const parts = key.split('.')
    let val = translations[locale.value]
    for (const part of parts) {
      val = val?.[part]
      if (val === undefined) break
    }
    if (val === undefined) {
      // fallback to Uzbek
      let fallback = translations['uz']
      for (const part of parts) {
        fallback = fallback?.[part]
      }
      return fallback ?? key
    }
    return val
  }

  function setLocale(code) {
    if (!translations[code]) return
    locale.value = code
    localStorage.setItem('pos_locale', code)
    document.documentElement.lang = code
  }

  return { locale, t, setLocale, languages }
}
