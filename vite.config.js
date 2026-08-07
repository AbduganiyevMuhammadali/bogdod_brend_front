import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Har build'da yangilanadigan belgi — login sahifasida ko'rsatiladi, shunda
// telefonga yangi APK tushgan-tushmagani darhol bilinadi.
const BUILD_TIME = new Date().toLocaleString('en-GB', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', '')

// Capacitor paketlari faqat Android APK yig'ishda kerak. Veb uchun build
// qilinadigan serverda ular o'rnatilmagan bo'lishi mumkin — bunda rollup
// import'ni hal qila olmay yiqiladi. Quyidagi plagin shunday holatda
// paket o'rniga bo'sh modul beradi: brauzerda bu kod baribir ishlamaydi,
// chunki `isNative` false bo'ladi.
function capacitorOptional() {
  const OPTIONAL = ['@capacitor/core', '@capacitor/push-notifications']
  const STUB = '\0capacitor-stub'
  const root = fileURLToPath(new URL('.', import.meta.url))

  return {
    name: 'capacitor-optional',
    resolveId(id) {
      if (!OPTIONAL.includes(id)) return null
      // Paket node_modules'da bormi — bo'lsa odatdagidek ishlatamiz
      return existsSync(join(root, 'node_modules', ...id.split('/'))) ? null : STUB
    },
    load(id) {
      if (id !== STUB) return null
      return `export const Capacitor = { isNativePlatform: () => false };
              export const PushNotifications = {};
              export default {};`
    },
  }
}

// Backend `beckend/dist/` papkasini statik fayl sifatida uzatadi
// (startup/routes.js). Ilgari build `frontend/dist/` ga tushardi va uni
// qo'lda ko'chirish kerak bo'lardi — esdan chiqsa, serverda eski sahifa
// qolib ketardi. Endi build to'g'ridan-to'g'ri o'sha papkaga yoziladi.
// Boshqa joyga kerak bo'lsa: BUILD_OUT_DIR=... npm run build
const OUT_DIR = process.env.BUILD_OUT_DIR
  || fileURLToPath(new URL('../beckend/dist', import.meta.url))

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
  },
  plugins: [capacitorOptional(), vue()],
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
