import { createRouter, createWebHashHistory } from 'vue-router'
import { isLoggedIn, logout } from '@/composables/useAuth.js'
import { canView } from '@/composables/usePerms.js'
import { showToast } from '@/composables/useToast.js'

const routes = [
  { path: '/',           redirect: '/dashboard' },
  { path: '/login',      component: () => import('@/pages/Login.vue'),         meta: { public: true } },
  { path: '/dashboard',  component: () => import('@/pages/Dashboard.vue'),     meta: { title: 'nav.dashboard', module: 'dashboard' } },
  { path: '/sales',      component: () => import('@/pages/Sales.vue'),         meta: { title: 'nav.sales',     module: 'sales', fullscreen: true } },
  { path: '/products',   component: () => import('@/pages/Products.vue'),      meta: { title: 'nav.products',  module: 'products' } },
  { path: '/purchases',  component: () => import('@/pages/Kirim.vue'),         meta: { title: 'nav.purchases', module: 'purchases' } },
  { path: '/partiya',    component: () => import('@/pages/Partiyalar.vue'),    meta: { title: 'nav.partiya',   module: 'partiya' } },
  { path: '/partners',   component: () => import('@/pages/Kontragentlar.vue'), meta: { title: 'nav.customers', module: 'partners' } },
  { path: '/suppliers',  component: () => import('@/pages/Yetkazuvchilar.vue'), meta: { title: 'Yetkazuvchilar', module: 'suppliers' } },
  { path: '/payments',   component: () => import('@/pages/Tolonlar.vue'),      meta: { title: 'Kassa',          module: 'payments' } },
  { path: '/returns',    component: () => import('@/pages/Qaytarishlar.vue'),  meta: { title: 'Qaytarishlar',   module: 'returns' } },
  { path: '/users',      component: () => import('@/pages/Users.vue'),         meta: { title: 'nav.users',      module: 'users' } },
  { path: '/reports',    component: () => import('@/pages/Reports.vue'),       meta: { title: 'nav.reports',    module: 'reports' } },
  { path: '/settings',   component: () => import('@/pages/Sozlamalar.vue'),    meta: { title: 'Sozlamalar',     module: 'settings' } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Foydalanuvchi kira oladigan birinchi sahifa (ruxsatlar bo'yicha)
export function firstAllowedPath() {
  const order = ['/dashboard', '/sales', '/products', '/purchases', '/partners',
                 '/suppliers', '/payments', '/returns', '/partiya', '/reports', '/users', '/settings']
  for (const p of order) {
    const r = routes.find(x => x.path === p)
    if (r && canView(r.meta.module)) return p
  }
  return null
}

router.beforeEach((to, _from, next) => {
  if (to.meta.public) return next()
  if (!isLoggedIn.value) return next('/login')

  // Modulga "ko'rish" ruxsati tekshiruvi (Admin hammasini ko'radi)
  if (to.meta.module && !canView(to.meta.module)) {
    const fallback = firstAllowedPath()
    if (!fallback) {
      logout()
      showToast("Sizga hech qanday bo'lim ochilmagan. Administratorga murojaat qiling.", 'err')
      return next('/login')
    }
    if (fallback !== to.path) {
      showToast("Bu bo'limga kirish huquqingiz yo'q", 'err')
      return next(fallback)
    }
  }
  next()
})

export default router
