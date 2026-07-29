// Brauzer push-bildirishnomalariga obuna bo'lish/bekor qilish.
// iOS Safari: faqat "Bosh ekranga qo'shish" orqali PWA rejimida ishlaydi (iOS 16.4+).
import { ref } from 'vue'
import { notificationsApi } from '@/api/notifications.js'

export const pushSupported   = ref('serviceWorker' in navigator && 'PushManager' in window)
export const pushPermission  = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default')
export const pushSubscribed  = ref(false)
export const pushBusy        = ref(false)
export const pushError       = ref('')

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

async function getRegistration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function checkPushStatus() {
  if (!pushSupported.value) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    pushSubscribed.value = !!sub
  } catch { /* ignore */ }
}

export async function enablePush() {
  if (!pushSupported.value) { pushError.value = 'Bu qurilma/brauzer push-bildirishnomani qo\'llab-quvvatlamaydi'; return false }
  pushBusy.value = true
  pushError.value = ''
  try {
    const permission = await Notification.requestPermission()
    pushPermission.value = permission
    if (permission !== 'granted') {
      pushError.value = 'Bildirishnoma uchun ruxsat berilmadi'
      return false
    }

    const reg = await getRegistration()
    const publicKey = await notificationsApi.getPublicKey()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    const json = sub.toJSON()
    await notificationsApi.subscribe({ endpoint: json.endpoint, keys: json.keys })
    pushSubscribed.value = true
    return true
  } catch (e) {
    pushError.value = e?.message || 'Obuna bo\'lishda xatolik'
    return false
  } finally {
    pushBusy.value = false
  }
}

export async function disablePush() {
  pushBusy.value = true
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await notificationsApi.unsubscribe(sub.endpoint).catch(() => {})
      await sub.unsubscribe()
    }
    pushSubscribed.value = false
  } finally {
    pushBusy.value = false
  }
}
