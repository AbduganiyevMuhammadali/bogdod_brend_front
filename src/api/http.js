import axios from 'axios'
import router from '@/router/index.js'
import { showToast } from '@/composables/useToast.js'
import { logout } from '@/composables/useAuth.js'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'

const http = axios.create({
  baseURL: API_URL,
  timeout: 10000,
})

// Rasm/fayllar API prefiksisiz, server ildizidan beriladi (masalan "/uploads/x.jpg").
// Shu sababli baseURL dan "/api/v1" qismini olib tashlaymiz — aks holda APK
// serverga emas, o'z ichidagi localhost'ga murojaat qilib qoladi.
const FILE_BASE = API_URL.replace(/\/api\/v\d+\/?$/, '')

export function fileUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return `${FILE_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

// Attach JWT token to every request
http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// If 401 — token expired/invalid: clear it, notify, kick to login
http.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const hadToken = !!localStorage.getItem('token')
      logout()
      if (hadToken && router.currentRoute.value.path !== '/login') {
        showToast('Sessiya muddati tugadi. Qaytadan tizimga kiring.', 'err')
        router.push('/login')
      }
    }
    return Promise.reject(err)
  }
)

export default http
