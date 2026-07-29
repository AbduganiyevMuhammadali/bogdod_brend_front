// Foydalanuvchi ruxsatlarini tekshirish (Users sahifasida belgilanadi).
// Admin va Dasturchi hamma narsani ko'radi; boshqalar uchun perms[modul] tekshiriladi.
// Modul kalitlari = router path kaliti: dashboard, sales, products, purchases,
// partiya, partners, suppliers, payments, returns, reports, users, settings.
import { computed } from 'vue'
import { useAuth } from './useAuth.js'

const { me } = useAuth()

// Eski saqlangan ruxsat kalitlari bilan moslik (oldin boshqa nomlar ishlatilgan)
const LEGACY = {
  purchases: ['kirim'],
  products:  ['mahsulot'],
  partners:  ['kontrag'],
  payments:  ['kassa', 'tolov'],
  returns:   ['qaytarish'],
  users:     ['foydalanuvchi'],
  reports:   ['aylanma', 'balans', 'xarajat'],
}

export const isAdmin = computed(() => me.value?.role === 'admin')
// Faqat asl backend roli 'Dasturchi' bo'lgan hisob — Admin bu yerga kirmaydi.
export const isDasturchi = computed(() => me.value?.rawRole === 'Dasturchi')

function permOf(module) {
  const p = me.value?.perms
  if (!p) return null
  if (p[module]) return p[module]
  for (const k of LEGACY[module] ?? []) if (p[k]) return p[k]
  return null
}

function has(module, action) {
  if (isAdmin.value) return true
  return !!permOf(module)?.[action]
}

export function canView(module) { return has(module, 'korish') }
export function canAdd(module)  { return has(module, 'qoshish') }
export function canEdit(module) { return has(module, 'tahrir') }

export function usePerms() {
  return { isAdmin, isDasturchi, canView, canAdd, canEdit }
}
