import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import './assets/main.css'

createApp(App).use(router).mount('#app')

// index.html'dagi boshlang'ich yuklanish ekranini olib tashlash — Vue mount
// bo'lib, router ham birinchi marshrutini hal qilganidan keyin (ya'ni
// haqiqiy sahifa chizilgandan so'ng), oq/bo'sh ekran ko'rinmasligi uchun.
router.isReady().then(() => {
  const loader = document.getElementById('initial-loader')
  if (!loader) return
  loader.classList.add('il-hide')
  setTimeout(() => loader.remove(), 300)
})
