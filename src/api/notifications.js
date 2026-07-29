import http from './http'

export const notificationsApi = {
  getPublicKey() {
    return http.get('/notifications/public-key').then(r => r.data.publicKey)
  },
  subscribe(subscription) {
    return http.post('/notifications/subscribe', subscription)
  },
  unsubscribe(endpoint) {
    return http.post('/notifications/unsubscribe', { endpoint })
  },
  // Faqat Dasturchi huquqi bilan ishlaydi (backend tekshiradi)
  getSettings() {
    return http.get('/notifications/settings').then(r => r.data)
  },
  updateSettings(payload) {
    return http.patch('/notifications/settings', payload)
  },
  sendTest() {
    return http.post('/notifications/send-test').then(r => r.data)
  },
}
