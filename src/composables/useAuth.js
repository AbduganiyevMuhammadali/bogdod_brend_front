import { ref, computed } from 'vue'
import { usersApi } from '@/api/users.js'

const token   = ref(localStorage.getItem('token') ?? '')
const me      = ref(JSON.parse(localStorage.getItem('me') ?? 'null'))

export const isLoggedIn = computed(() => !!token.value)

export async function login(username, password) {
  const user = await usersApi.login(username, password)
  token.value = localStorage.getItem('token') // set by usersApi.login
  me.value    = user
  localStorage.setItem('me', JSON.stringify(user))
  return user
}

export function logout() {
  token.value = ''
  me.value    = null
  localStorage.removeItem('token')
  localStorage.removeItem('me')
}

// Joriy foydalanuvchini serverdan yangilash (ruxsatlar o'zgargan bo'lsa,
// qayta login qilmasdan kuchga kirishi uchun; App mount'da chaqiriladi)
export async function refreshMe() {
  if (!token.value) return
  try {
    const user = await usersApi.getMe()
    me.value = user
    localStorage.setItem('me', JSON.stringify(user))
  } catch { /* tarmoq xatosi — saqlangan me bilan davom etamiz */ }
}

export function useAuth() {
  return { token, me, isLoggedIn, login, logout }
}
