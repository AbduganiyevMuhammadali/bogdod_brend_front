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

function barcodeToPng(code) {
  const canvas = document.createElement('canvas')
  try {
    JsBarcode(canvas, code, {
      format: 'CODE128',
      width: 2,
      height: 55,
      displayValue: true,
      fontSize: 15,
      margin: 6,
    })
  } catch {
    // Yaroqsiz belgilar (masalan bo'sh/juda qisqa) bo'lsa ham chek qolmasin
    JsBarcode(canvas, code || '0000000000000', { format: 'CODE128', width: 2, height: 55, displayValue: true, fontSize: 15, margin: 6 })
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
