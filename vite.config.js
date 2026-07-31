import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Har build'da yangilanadigan belgi — login sahifasida ko'rsatiladi, shunda
// telefonga yangi APK tushgan-tushmagani darhol bilinadi.
const BUILD_TIME = new Date().toLocaleString('en-GB', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', '')

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  preview: {
    port: 3004,
    host: true,
  },
})
