import http from './http'

/**
 * Telegram bot bilan bog'lanish.
 *
 * Do'kon 6 xonali kod yasaydi, egasi uni botga yuboradi — shundan
 * keyin bot shu do'kon hisobotlarini ko'ra oladi (faqat o'qish).
 */
export const botApi = {
  // Yangi ulanish kodi (5 daqiqa amal qiladi)
  async createCode() {
    const res = await http.post('/bot/pair-code')
    return res.data
  },

  // Bog'langan Telegram chatlar
  async getLinks() {
    const res = await http.get('/bot/links')
    return res.data
  },

  // Bog'lanishni uzish
  async unlink(id) {
    await http.delete(`/bot/links/${id}`)
  },
}
