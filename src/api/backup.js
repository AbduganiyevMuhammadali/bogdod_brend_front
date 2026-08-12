import http from './http'

export const backupApi = {
  // Zaxira nusxa olish mumkinmi va baza hajmi qancha
  async getInfo() {
    const res = await http.get('/backup/info')
    return res.data
  },

  // Bazaning to'liq nusxasini (.sql) yuklab oladi.
  //
  // Oddiy <a href> bilan bo'lmaydi: so'rovga JWT qo'shilishi kerak.
  // Shuning uchun fayl blob sifatida olinadi va brauzerga vaqtinchalik
  // havola orqali beriladi.
  async download({ onProgress } = {}) {
    const res = await http.get('/backup/download', {
      responseType: 'blob',
      // Katta baza bir necha daqiqa ketishi mumkin — umumiy 10s
      // cheklovini bekor qilamiz
      timeout: 0,
      onDownloadProgress: e => onProgress?.(e.loaded),
    })

    // Server xato qaytarsa, u ham blob bo'lib keladi — matnini o'qib,
    // tushunarli xabar chiqaramiz (aks holda buzuq .sql fayl saqlanardi)
    const type = res.data?.type || ''
    if (type.includes('application/json')) {
      const text = await res.data.text()
      let msg = 'Zaxira nusxa olishda xatolik'
      try { msg = JSON.parse(text).message || msg } catch { /* ignore */ }
      throw new Error(msg)
    }

    // Fayl nomini serverdagi Content-Disposition dan olamiz
    const cd = res.headers['content-disposition'] || ''
    const m  = /filename="?([^"]+)"?/.exec(cd)
    const name = m ? m[1] : `zaxira-${new Date().toISOString().slice(0, 10)}.sql`

    const url = URL.createObjectURL(res.data)
    const a   = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Brauzer faylni saqlab ulgursin, keyin xotirani bo'shatamiz
    setTimeout(() => URL.revokeObjectURL(url), 10000)

    return { name, size: res.data.size }
  },
}
