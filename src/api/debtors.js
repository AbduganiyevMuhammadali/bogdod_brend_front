import http from './http'

/**
 * Qarzdorlar (CRM) API.
 *
 * Backend qarzni `sale` jadvalidan yig'adi — har sotuvning o'z muddati
 * bo'lgani uchun kategoriyalar (kechikkan/bugun/hafta...) ham shu yerda
 * hisoblanadi va tayyor holda keladi.
 */
export const debtorsApi = {
  // Qarzdorlar ro'yxati + kategoriya sanoqlari
  async getAll(params = {}) {
    const res = await http.get('/debtors', { params })
    return {
      data:  res.data.data  ?? [],
      jami:  res.data.jami  ?? {},
      bugun: res.data.bugun ?? null,
    }
  },

  // Bitta mijoz kartochkasi: qarzlari, to'lovlari, izohlari
  async getOne(id) {
    const res = await http.get(`/debtors/${id}`)
    return res.data
  },

  // Status / teg / izohni o'zgartirish
  async update(id, patch) {
    const res = await http.patch(`/debtors/${id}`, patch)
    return res.data
  },

  // Bitta sotuvning qarz muddatini o'zgartirish
  async setDue(saleId, dueDate) {
    const res = await http.patch(`/debtors/sale/${saleId}/due`, { due_date: dueDate })
    return res.data
  },

  // ── Eslatmalar / izohlar ──────────────────────────────────────────
  async addNote(clientId, { text, kind = 'izoh', remindAt = null }) {
    const res = await http.post(`/debtors/${clientId}/notes`, {
      text, kind, remind_at: remindAt,
    })
    return res.data
  },

  async updateNote(noteId, patch) {
    const body = {}
    if (patch.done !== undefined)     body.done = patch.done
    if (patch.text !== undefined)     body.text = patch.text
    if (patch.remindAt !== undefined) body.remind_at = patch.remindAt
    const res = await http.patch(`/debtors/notes/${noteId}`, body)
    return res.data
  },

  async removeNote(noteId) {
    await http.delete(`/debtors/notes/${noteId}`)
  },

  // Bugungi va kechikkan eslatmalar (bildirishnoma uchun)
  async reminders() {
    const res = await http.get('/debtors/reminders')
    return res.data
  },
}
