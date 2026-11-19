import http from './http'

// AI yordamchi (Gemini) — javoblar odatdagi 10 soniyadan uzoq kelishi mumkin
// (vositalar + model + ovoz), shuning uchun alohida timeout.
const LONG = { timeout: 90000 }

export const aiApi = {
  /** Yoqilganmi, kalit bormi, qaysi model — tugmani ko'rsatish uchun */
  status() {
    return http.get('/ai/status').then(r => r.data)
  },

  /** Ochilganda aytiladigan qisqa xulosa (speak=true bo'lsa ovoz bilan) */
  greeting(speak = false) {
    return http.get('/ai/greeting', { params: speak ? { speak: 1 } : {}, timeout: 60000 }).then(r => r.data)
  },

  /**
   * Suhbat. payload: { text?, audio?: {mime, data}, history?: [{role,text}], speak?: bool }
   * Javob: { text, transcript?, actions[], tools[], audio?: {mime,data}, ms }
   */
  chat(payload) {
    return http.post('/ai/chat', payload, LONG).then(r => r.data)
  },

  /** Matnni ovozga aylantirish → { mime, data(base64) } */
  speak(text) {
    return http.post('/ai/speak', { text }, { timeout: 60000 }).then(r => r.data)
  },

  // ── Sozlamalar (faqat admin) ──
  getSettings() {
    return http.get('/ai/settings').then(r => r.data)
  },
  saveSettings(patch) {
    return http.put('/ai/settings', patch).then(r => r.data)
  },
  test(speak = true) {
    return http.post('/ai/test', { speak }, LONG).then(r => r.data)
  },
}
