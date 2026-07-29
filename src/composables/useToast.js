import { ref } from 'vue'

export const toast = ref(null) // { type: 'ok' | 'err' | 'hold', message: string }

let hideTimer = null

export function showToast(message, type = 'err', duration = 3500) {
  toast.value = { type, message }
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { toast.value = null }, duration)
}
