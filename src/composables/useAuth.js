import { ref, computed } from 'vue'
import { usersApi } from '@/api/users.js'
import { branchesApi } from '@/api/branches.js'
import { BRANCH_KEY } from '@/api/http.js'

const token   = ref(localStorage.getItem('token') ?? '')
const me      = ref(JSON.parse(localStorage.getItem('me') ?? 'null'))

// ── Filial ──────────────────────────────────────────────────────────
// `branch` — hozir ishlanayotgan filial (server aniqlab beradi).
// `branches` — bosh ofis foydalanuvchisi tanlashi mumkin bo'lgan ro'yxat.
const branch   = ref(JSON.parse(localStorage.getItem('branch') ?? 'null'))
const branches = ref([])

export const isLoggedIn = computed(() => !!token.value)
// Filialni o'zgartira oladimi (bosh ofis = true)
export const canSwitchBranch = computed(() => !!me.value && !me.value.branchLocked)

function saveBranch(b) {
  branch.value = b
  if (b) localStorage.setItem('branch', JSON.stringify({ id: b.id, name: b.name, code: b.code }))
  else   localStorage.removeItem('branch')
}

// Joriy filial va ro'yxatni serverdan olish. Login va App mount'da chaqiriladi.
export async function loadBranch() {
  if (!token.value) return
  try {
    const cur = await branchesApi.getCurrent()
    saveBranch(cur)
    // Server qaytargan filial saqlangan sarlavha bilan mos bo'lsin
    // (masalan tanlangan filial o'chirilgan bo'lsa server asosiysini beradi)
    localStorage.setItem(BRANCH_KEY, String(cur.id))
    if (me.value) { me.value = { ...me.value, branch: { id: cur.id, name: cur.name, code: cur.code }, branchLocked: cur.locked }; localStorage.setItem('me', JSON.stringify(me.value)) }
  } catch { /* tarmoq xatosi — saqlangani bilan davom etamiz */ }
  try {
    branches.value = canSwitchBranch.value ? await branchesApi.getAll() : []
  } catch { branches.value = [] }
}

// Bosh ofis: boshqa filialga o'tish. Sahifa to'liq qayta yuklanadi —
// barcha ro'yxatlar (tovar, sotuv, kassa) yangi filialdan qayta olinadi,
// eski filial ma'lumoti xotirada qolib ketmaydi.
export function setBranch(id) {
  if (!canSwitchBranch.value) return
  localStorage.setItem(BRANCH_KEY, String(id))
  const b = branches.value.find(x => x.id === Number(id))
  if (b) saveBranch(b)
  location.reload()
}

export async function login(username, password) {
  const user = await usersApi.login(username, password)
  token.value = localStorage.getItem('token') // set by usersApi.login
  me.value    = user
  localStorage.setItem('me', JSON.stringify(user))
  // Login paytida server qaytargan filial (xodim uchun o'z filiali, bosh
  // ofis uchun asosiy filial). Oldingi sessiyadan qolgan tanlov
  // ishlatilmaydi — boshqa odam kirsa uning filiali ko'rinsin.
  localStorage.removeItem(BRANCH_KEY)
  if (user.branch) {
    saveBranch(user.branch)
    localStorage.setItem(BRANCH_KEY, String(user.branch.id))
  }
  await loadBranch()
  return user
}

export function logout() {
  token.value = ''
  me.value    = null
  branches.value = []
  localStorage.removeItem('token')
  localStorage.removeItem('me')
  localStorage.removeItem(BRANCH_KEY)
  saveBranch(null)
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
  await loadBranch()
}

export function useAuth() {
  return { token, me, isLoggedIn, login, logout, branch, branches, canSwitchBranch, setBranch, loadBranch }
}
