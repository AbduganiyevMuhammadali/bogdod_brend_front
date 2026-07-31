// Push-bildirishnomalarga obuna bo'lish/bekor qilish.
// Ikki yo'l: Android/APK (Capacitor) — Firebase Cloud Messaging orqali;
// brauzer (veb) — Web Push (VAPID) orqali. iOS Safari: faqat "Bosh ekranga
// qo'shish" orqali PWA rejimida ishlaydi (iOS 16.4+).
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { notificationsApi } from '@/api/notifications.js'

const isNative = Capacitor.isNativePlatform()

export const pushSupported   = ref(isNative || ('serviceWorker' in navigator && 'PushManager' in window))
export const pushPermission  = ref(typeof Notification !== 'undefined' ? Notification.permission : 'default')
export const pushSubscribed  = ref(false)
export const pushBusy        = ref(false)
export const pushError       = ref('')

let currentFcmToken = ''

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
  if (isNative) {
    pushSubscribed.value = !!localStorage.getItem('fcm_token')
    return
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    pushSubscribed.value = !!sub
  } catch { /* ignore */ }
}

// Server xabarni channelId: 'daily-greeting' bilan yuboradi. Android 8+ da
// mavjud bo'lmagan kanalga kelgan bildirishnoma jimgina tashlab yuboriladi —
// FCM "yuborildi" deydi, lekin telefonda hech narsa ko'rinmaydi. Shuning
// uchun kanalni obuna bo'lishdan oldin yaratamiz.
async function ensureChannel(PushNotifications) {
  try {
    const { channels } = await PushNotifications.listChannels()
    if (channels?.some(c => c.id === 'daily-greeting')) return
  } catch { /* listChannels hamma versiyada yo'q — quyida baribir yaratamiz */ }

  try {
    await PushNotifications.createChannel({
      id: 'daily-greeting',
      name: 'Kunlik xabarlar',
      description: 'Har kuni ertalabki xush kelibsiz xabari',
      importance: 5,          // MAX — ekranda ko'rinadi
      visibility: 1,          // PUBLIC — qulflangan ekranda ham
      sound: 'default',
      vibration: true,
      lights: true,
    })
  } catch (e) {
    // Kanal allaqachon bo'lsa xato bermaydi; boshqa holatda ham
    // obunani to'xtatmaymiz.
    console.warn('Bildirishnoma kanalini yaratib bo\'lmadi:', e)
  }
}

async function enablePushNative() {
  const { PushNotifications } = await import('@capacitor/push-notifications')

  const permStatus = await PushNotifications.requestPermissions()
  pushPermission.value = permStatus.receive === 'granted' ? 'granted' : 'denied'
  if (permStatus.receive !== 'granted') {
    pushError.value = 'Bildirishnoma uchun ruxsat berilmadi'
    return false
  }

  await ensureChannel(PushNotifications)

  return new Promise((resolve) => {
    PushNotifications.addListener('registration', async (token) => {
      currentFcmToken = token.value
      localStorage.setItem('fcm_token', token.value)
      try {
        await notificationsApi.registerFcmToken(token.value)
        pushSubscribed.value = true
        resolve(true)
      } catch (e) {
        pushError.value = e?.message || 'Token yuborishda xatolik'
        resolve(false)
      }
    })
    PushNotifications.addListener('registrationError', (err) => {
      pushError.value = err?.error || 'FCM ro\'yxatdan o\'tishda xatolik'
      resolve(false)
    })
    PushNotifications.register()
  })
}

async function enablePushWeb() {
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
}

export async function enablePush() {
  if (!pushSupported.value) { pushError.value = 'Bu qurilma/brauzer push-bildirishnomani qo\'llab-quvvatlamaydi'; return false }
  pushBusy.value = true
  pushError.value = ''
  try {
    return isNative ? await enablePushNative() : await enablePushWeb()
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
    if (isNative) {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const token = currentFcmToken || localStorage.getItem('fcm_token')
      if (token) await notificationsApi.unregisterFcmToken(token).catch(() => {})
      await PushNotifications.unregister().catch(() => {})
      localStorage.removeItem('fcm_token')
    } else {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await notificationsApi.unsubscribe(sub.endpoint).catch(() => {})
        await sub.unsubscribe()
      }
    }
    pushSubscribed.value = false
  } finally {
    pushBusy.value = false
  }
}
