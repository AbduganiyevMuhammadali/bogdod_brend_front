// Do'kon/brend sozlamalarini (nomi, manzili, telefoni, chek matni) o'qish.
// Sozlamalar.vue shu kalit ostida saqlaydi; standart qiymatlar hech narsa
// kiritilmagan holatda ham chek bo'sh ko'rinmasligi uchun.
const STORAGE_KEY = 'pos_settings'

export function loadStoreSettings() {
  let s = {}
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { /* ignore */ }
  return {
    name:    s.storeName?.trim()    || 'Sellz',
    address: s.storeAddress?.trim() || '',
    phone:   s.storePhone?.trim()   || '',
    header:  s.receiptHeader?.trim() || '',
    footer:  s.receiptFooter?.trim() || "RAHMAT! Yana tashrif buyuring",
  }
}
