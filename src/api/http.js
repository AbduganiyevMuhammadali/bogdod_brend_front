import axios from 'axios'
import router from '@/router/index.js'
import { showToast } from '@/composables/useToast.js'
import { logout } from '@/composables/useAuth.js'

const http = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
  timeout: 10000,
})

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
