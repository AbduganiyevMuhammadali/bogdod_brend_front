// Tovar yorliqlarini (nomi + narxi + shtrix-kod) yangi oynada chop etish.
// Shtrix-kod jsbarcode bilan asosiy oynadagi <canvas>da chiziladi, so'ng
// PNG rasm sifatida print oynasiga yuboriladi (canvas boshqa documentga
// ko'chirilmaydi, shuning uchun rasmga aylantirish kerak).
import JsBarcode from 'jsbarcode'

// EAN-13 formatida tasodifiy shtrix-kod (to'g'ri nazorat raqami bilan)
export function genBarcode() {
  const d = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10))
  const s = d.reduce((a, v, i) => a + v * (i % 2 === 0 ? 1 : 3), 0)
  return d.join('') + ((10 - (s % 10)) % 10)
}

// genBarcode() EAN-13 qoidasi bo'yicha raqam yasaydi (13 xona + nazorat
// raqami). EAN-13 do'kon skanerlari uchun standart va CODE128 dan ixcham —
// tor yorliqqa yaxshiroq sig'adi. Qo'lda kiritilgan yoki boshqa uzunlikdagi
// kodlar EAN-13 ga to'g'ri kelmaydi, ular uchun CODE128 ga qaytamiz.
function isValidEan13(code) {
  const s = String(code || '')
  if (!/^\d{13}$/.test(s)) return false
  const sum = s.slice(0, 12).split('').reduce(
    (a, d, i) => a + Number(d) * (i % 2 === 0 ? 1 : 3), 0
  )
  return ((10 - (sum % 10)) % 10) === Number(s[12])
}

function barcodeToPng(code, opts = {}) {
  const canvas = document.createElement('canvas')
  const base = {
    width: 2,
    height: 55,
    displayValue: true,
    fontSize: 15,
    margin: 6,
    ...opts,
  }

  const useEan = isValidEan13(code)
  try {
    JsBarcode(canvas, code, { ...base, format: useEan ? 'EAN13' : 'CODE128' })
  } catch {
    try {
      // EAN13 rad etsa — CODE128 deyarli har qanday matnni qabul qiladi
      JsBarcode(canvas, code, { ...base, format: 'CODE128' })
    } catch {
      // Bo'sh/yaroqsiz bo'lsa ham chop etish to'xtab qolmasin
      JsBarcode(canvas, '0000000000000', { ...base, format: 'CODE128' })
    }
  }
  return canvas.toDataURL('image/png')
}

const fmt = v => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0))

function labelHtml(item) {
  const png = barcodeToPng(item.barcode)
  return `
    <div class="label">
      <div class="label__name">${item.name}</div>
      <div class="label__price">${fmt(item.price)} so'm</div>
      <img class="label__bc" src="${png}" />
    </div>`
}

/**
 * items: [{ name, price, barcode, qty }]
 * qty — nechta nusxada chop etilsin (standart 1)
 */
export function printBarcodeLabels(items) {
  const list = items.filter(i => i.barcode)
  if (!list.length) return false

  const labels = list.flatMap(i => Array.from({ length: Math.max(1, Number(i.qty) || 1) }, () => labelHtml(i))).join('')

  const win = window.open('', '_blank', 'width=480,height=640,scrollbars=yes')
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Yorliqlar</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#e5e7eb;padding:16px;font-family:'Segoe UI',Arial,sans-serif}
    .sheet{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start}
    .label{
      width:220px;height:120px;background:white;border:1px solid #d1d5db;border-radius:4px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:8px;gap:2px;page-break-inside:avoid;
    }
    .label__name{font-size:12px;font-weight:700;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .label__price{font-size:15px;font-weight:900;color:#111}
    .label__bc{width:100%;max-width:200px;height:auto}
    @media print{
      body{background:white;padding:0}
      .sheet{gap:0}
      .label{border:1px dashed #999;border-radius:0}
    }
  </style></head><body><div class="sheet">${labels}</div></body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
  return true
}

// ── Etiket printeri uchun: 58 × 40 mm, har yorliq alohida sahifa ────────
//
// Termal etiket printerlari rulon bilan ishlaydi va har bir yorliqni
// alohida "sahifa" deb qabul qiladi. Shuning uchun A4 dagidek yonma-yon
// terish mumkin emas — @page o'lchami aynan yorliq o'lchamiga teng
// bo'lishi va har element o'zidan keyin sahifa uzishi kerak.
//
// 58×40 mm ichida joy taqsimoti (chetlardan 2 mm hoshiya qolgan holda):
//   nomi     — 2 qatorgacha, o'lchami avtomatik qisqaradi
//   narxi    — eng yirik, xaridor uzoqdan ko'radi
//   shtrix   — pastda, skaner ishonchli o'qishi uchun kengaytirilgan
// Yorliq o'lchami. Printer va lenta har xil bo'lgani uchun sozlanadi —
// qiymat localStorage'da saqlanadi, Sozlamalardan o'zgartiriladi.
const DEFAULT_W_MM = 58
const DEFAULT_H_MM = 40

// Printerlar qog'ozni bir oz siljitib tortadi va chetiga bosa olmaydi.
// Shuni brauzerning chop etish oynasida har safar qo'lda ("Поля", "Масштаб")
// tuzatish o'rniga shu yerda saqlaymiz — bir marta sozlanadi va hamma
// yorliqqa o'zi qo'llanadi.
const DEFAULT_SHIFT_X_MM = 0   // musbat — o'ngga, manfiy — chapga
const DEFAULT_SHIFT_Y_MM = 0   // musbat — pastga, manfiy — yuqoriga

export function getLabelSize() {
  const w = Number(localStorage.getItem('label_w_mm'))
  const h = Number(localStorage.getItem('label_h_mm'))
  const x = Number(localStorage.getItem('label_shift_x_mm'))
  const y = Number(localStorage.getItem('label_shift_y_mm'))
  return {
    w: w > 0 ? w : DEFAULT_W_MM,
    h: h > 0 ? h : DEFAULT_H_MM,
    x: Number.isFinite(x) ? x : DEFAULT_SHIFT_X_MM,
    y: Number.isFinite(y) ? y : DEFAULT_SHIFT_Y_MM,
  }
}

export function setLabelSize(w, h, x, y) {
  if (Number(w) > 0) localStorage.setItem('label_w_mm', String(w))
  if (Number(h) > 0) localStorage.setItem('label_h_mm', String(h))
  if (x !== undefined && Number.isFinite(Number(x))) localStorage.setItem('label_shift_x_mm', String(Number(x)))
  if (y !== undefined && Number.isFinite(Number(y))) localStorage.setItem('label_shift_y_mm', String(Number(y)))
}

function labelHtml58x40(item) {
  // Shtrix-kodni yuqori aniqlikda chizamiz (width: 3), so'ng CSS bilan
  // yorliq kengligiga siqamiz — termal printerda chiziqlar tiniq chiqadi.
  const png = barcodeToPng(item.barcode, {
    width: 3,
    height: 70,
    displayValue: false,
    margin: 0,
  })

  // Model / razmer nomning boshida turadi — do'konda tovarni topishda
  // aynan shu ishlatiladi, shuning uchun birinchi ko'zga tashlansin.
  //
  // Nom odatda "Brend Nom Model Rang" tartibida yasalgan, ya'ni model
  // uning ichida ham bor. Uni oldiga qo'shishdan avval nomdan olib
  // tashlaymiz — aks holda "X-500 Antony Finka X-500 Ko'k" bo'lib ketardi.
  const model   = String(item.model || '').trim()
  const rawName = String(item.name  || '').trim()

  let name = rawName
  if (model) {
    const stripped = rawName
      // Nom ichidagi modelni butun so'z sifatida olib tashlaymiz
      .replace(new RegExp(`(^|\\s)${escapeRe(model)}(?=\\s|$)`, 'i'), ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    name = `${model} ${stripped}`.trim()
  }
  const price = Number(item.price) || 0
  // Narx 0 bo'lsa yozmaymiz — bo'sh joy nom uchun qoladi va
  // yorliqda "0 so'm" degan chalg'ituvchi yozuv turmaydi.
  const priceHtml = price > 0
    ? `<div class="lb__price">${fmt(price)} so'm</div>`
    : ''

  // Uzun nomni kichraytiramiz. Ilgari o'lcham qat'iy edi va "Stefano Ricci
  // Finka M To'q ko'k" kabi nomlar 2 qatorga chiqib, yorliqdan toshib
  // ketardi. Endi nom uzunligiga qarab sinf beriladi — sig'maydigan holat
  // umuman yuzaga kelmaydi.
  const nameClass = name.length > 42 ? 'lb__name--xs'
                  : name.length > 26 ? 'lb__name--sm'
                  : ''

  return `
    <div class="lb"><div class="lb__in">
      <div class="lb__name ${nameClass}">${escapeHtml(name)}</div>
      ${priceHtml}
      <img class="lb__bc" src="${png}" />
      <div class="lb__code">${escapeHtml(item.barcode)}</div>
    </div></div>`
}

// Model ichida regexp uchun maxsus belgi bo'lishi mumkin (X-500, L/XL, 40+)
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/**
 * 58×40 mm etiket printerida chop etadi — har yorliq alohida sahifada.
 * items: [{ name, price, barcode, qty }]
 */
export function printLabels58x40(items) {
  const list = (items || []).filter(i => i && i.barcode)
  if (!list.length) return false

  const { w: LABEL_W_MM, h: LABEL_H_MM, x: SHIFT_X_MM, y: SHIFT_Y_MM } = getLabelSize()

  const labels = list
    .flatMap(i => Array.from({ length: Math.max(1, Number(i.qty) || 1) }, () => labelHtml58x40(i)))
    .join('')

  const win = window.open('', '_blank', 'width=420,height=560,scrollbars=yes')
  if (!win) return false

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Yorliqlar ${LABEL_W_MM}×${LABEL_H_MM}mm</title><style>
    /* Sahifa aynan yorliq o'lchamida — printer har yorliqni alohida
       sahifa deb qabul qiladi va A4 ga terib yubormaydi */
    @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${LABEL_W_MM}mm; }
    body { font-family: Arial, 'Segoe UI', sans-serif; }

    .lb {
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      background: #fff;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      /* Printer siljishini shu yerda tuzatamiz — chop etish oynasida
         "Поля" va "Масштаб" ni qo'lda o'zgartirish shart emas */
      position: relative;
    }
    .lb:last-child { page-break-after: auto; break-after: auto; }

    /* Ichki qatlam — hoshiya va siljish shu yerda. Tashqi .lb aynan
       sahifa o'lchamida qoladi, shuning uchun siljitsak ham yorliqlar
       bir-biriga surilib ketmaydi. */
    .lb__in {
      position: absolute;
      left: ${SHIFT_X_MM}mm;
      top: ${SHIFT_Y_MM}mm;
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      /* Termal printerlar chetlarga bosa olmaydi — hoshiya qoldiramiz */
      padding: 1.5mm 2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      /* center emas — space-between. Markazlashtirilganda kontent
         balandlikdan oshsa yuqoridan ham kesilardi (nomning tepasi
         qirqilib qolardi). Bunda esa yuqoridan boshlanadi. */
      justify-content: space-between;
      overflow: hidden;
    }

    .lb__name {
      width: 100%;
      font-size: 2.9mm;
      font-weight: 700;
      line-height: 1.15;
      text-align: center;
      /* Uzun nomlar 2 qatorda kesiladi, yorliqdan chiqib ketmaydi */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      /* Aynan 2 qator × 1.15 line-height — kasr qoldiq kesilmasin */
      height: 6.7mm;
      flex: 0 0 auto;
    }
    /* Uzun nomlar uchun kichikroq shrift — 2 qatorga baribir sig'adi */
    .lb__name--sm { font-size: 2.6mm; height: 6mm; }
    .lb__name--xs { font-size: 2.3mm; height: 5.3mm; }

    .lb__price {
      font-size: 5.2mm;
      font-weight: 900;
      line-height: 1.1;
      color: #000;
      white-space: nowrap;
      /* Juda uzun narx ham yorliqdan chiqmasin */
      max-width: 100%;
      overflow: hidden;
      flex: 0 0 auto;
    }
    .lb__bc {
      width: 100%;
      /* Qolgan bo'sh joyni shtrix-kod egallaydi: nom 1 qatormi yoki
         2 qatormi — pastdagi kod raqami har doim bir joyda turadi */
      flex: 1 1 auto;
      min-height: 9mm;
      max-height: 15mm;
      /* fill emas — nisbat buzilmasin, skaner o'qishi shunga bog'liq */
      object-fit: contain;
      display: block;
    }
    .lb__code {
      font-size: 2.9mm;
      font-weight: 600;
      letter-spacing: .3mm;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      flex: 0 0 auto;
    }

    /* Ekranda ko'rish uchun — chop etishda yo'qoladi */
    @media screen {
      html, body { width: auto; }
      body {
        background: #e5e7eb; padding: 14px;
        display: flex; flex-direction: column; align-items: center; gap: 10px;
      }
      .lb { border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
      /* Siljish faqat printer uchun — ekranda yorliq qanday
         terilganini toza ko'rish kerak */
      .lb__in { left: 0; top: 0; }
    }
    @media print {
      html, body { background: #fff; }
      body { padding: 0; display: block; }
      .lb { border: none; box-shadow: none; }
      /* Termal printerda kulrang tuslar yo'qoladi — qora aniq bosilsin */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head><body>${labels}</body></html>`)

  win.document.close()
  win.focus()
  // Rasm yuklanishiga ulgurishi uchun biroz kutamiz
  setTimeout(() => { win.print() }, 600)
  return true
}
