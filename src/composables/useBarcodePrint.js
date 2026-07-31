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

function barcodeToPng(code, opts = {}) {
  const canvas = document.createElement('canvas')
  const cfg = {
    format: 'CODE128',
    width: 2,
    height: 55,
    displayValue: true,
    fontSize: 15,
    margin: 6,
    ...opts,
  }
  try {
    JsBarcode(canvas, code, cfg)
  } catch {
    // Yaroqsiz belgilar (masalan bo'sh/juda qisqa) bo'lsa ham chek qolmasin
    JsBarcode(canvas, code || '0000000000000', cfg)
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
const LABEL_W_MM = 58
const LABEL_H_MM = 40

function labelHtml58x40(item) {
  // Etiket tor bo'lgani uchun shtrix-kod ham ixchamroq chiziladi;
  // raqamni pastida alohida yozamiz, shunda skaner zonasi kengroq qoladi.
  const png = barcodeToPng(item.barcode, {
    width: 2,
    height: 40,
    displayValue: false,
    margin: 0,
  })
  const name = String(item.name || '').trim()
  return `
    <div class="lb">
      <div class="lb__name">${escapeHtml(name)}</div>
      <div class="lb__price">${fmt(item.price)} so'm</div>
      <img class="lb__bc" src="${png}" />
      <div class="lb__code">${escapeHtml(item.barcode)}</div>
    </div>`
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

  const labels = list
    .flatMap(i => Array.from({ length: Math.max(1, Number(i.qty) || 1) }, () => labelHtml58x40(i)))
    .join('')

  const win = window.open('', '_blank', 'width=420,height=560,scrollbars=yes')
  if (!win) return false

  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Yorliqlar ${LABEL_W_MM}×${LABEL_H_MM}mm</title><style>
    @page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Segoe UI', sans-serif; background: #e5e7eb; }

    .lb {
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      padding: 1.5mm 2mm;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      overflow: hidden;
      /* Har yorliq — alohida sahifa */
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .lb:last-child { page-break-after: auto; break-after: auto; }

    .lb__name {
      width: 100%;
      font-size: 3mm;
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      /* Uzun nomlar 2 qatorda kesiladi */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      max-height: 7.2mm;
    }
    .lb__price {
      font-size: 6mm;
      font-weight: 900;
      line-height: 1;
      color: #000;
      white-space: nowrap;
    }
    .lb__bc {
      width: 100%;
      height: 15mm;
      object-fit: contain;
      display: block;
    }
    .lb__code {
      font-size: 3mm;
      font-weight: 600;
      letter-spacing: .35mm;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    /* Ekranda ko'rish uchun — chop etishda yo'qoladi */
    @media screen {
      body { padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .lb { border: 1px solid #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    }
    @media print {
      body { background: #fff; padding: 0; display: block; }
      .lb { border: none; box-shadow: none; }
    }
  </style></head><body>${labels}</body></html>`)

  win.document.close()
  win.focus()
  // Rasm yuklanishiga ulgurishi uchun biroz kutamiz
  setTimeout(() => { win.print() }, 600)
  return true
}
