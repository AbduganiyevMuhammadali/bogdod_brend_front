import http from './http'

function itemToFront(i) {
  return {
    id:                 i.id,
    productId:          i.product_id       ?? null,
    barcode:            i.barcode          ?? '',
    productName:        i.product_name     ?? '',
    stockQty:           Number(i.stock_qty)           || 0,
    pkgQty:             Number(i.pkg_qty)             || 0,
    unitQty:            Number(i.unit_qty)            || 0,
    unitsPerPkg:        Number(i.units_per_pkg)       || 1,
    pkgPrice:           Number(i.pkg_price)           || 0,
    unitPrice:          Number(i.unit_price)          || 0,
    costPrice:          Number(i.cost_price)          || 0,
    totalSum:           Number(i.total_sum)           || 0,
    totalCostSum:       Number(i.total_cost_sum)      || 0,
    retailMarkupPct:    Number(i.retail_markup_pct)   || 0,
    wholesaleMarkupPct: Number(i.wholesale_markup_pct)|| 0,
    retailPriceSum:     Number(i.retail_price_sum)    || 0,
    retailPriceUsd:     Number(i.retail_price_usd)    || 0,
    wholesalePriceSum:  Number(i.wholesale_price_sum) || 0,
    wholesalePriceUsd:  Number(i.wholesale_price_usd) || 0,
  }
}

function itemToBack(i) {
  return {
    product_id:           i.productId          ?? null,
    barcode:              i.barcode            || null,
    product_name:         i.productName        || '',
    stock_qty:            i.stockQty           || 0,
    pkg_qty:              i.pkgQty             || 0,
    unit_qty:             i.unitQty            || 0,
    units_per_pkg:        i.unitsPerPkg        || 1,
    pkg_price:            i.pkgPrice           || 0,
    unit_price:           i.unitPrice          || 0,
    cost_price:           i.costPrice          || 0,
    total_sum:            i.totalSum           || 0,
    total_cost_sum:       i.totalCostSum       || 0,
    retail_markup_pct:    i.retailMarkupPct    || 0,
    wholesale_markup_pct: i.wholesaleMarkupPct || 0,
    retail_price_sum:     i.retailPriceSum     || 0,
    retail_price_usd:     i.retailPriceUsd     || 0,
    wholesale_price_sum:  i.wholesalePriceSum  || 0,
    wholesale_price_usd:  i.wholesalePriceUsd  || 0,
  }
}

function toFront(p) {
  return {
    id:           p.id,
    docNumber:    p.doc_number,
    date:         p.date,
    warehouse:    p.warehouse     ?? '',
    supplier:     p.supplier      ?? '',
    supplierId:   p.supplier_id   ?? null,
    supplierRef:  p.supplierRef   ? {
      id:      p.supplierRef.id,
      name:    p.supplierRef.name,
      balance: Number(p.supplierRef.balance) || 0,
    } : null,
    paymentType:  p.payment_type  ?? 'Naqd',
    paidSum:      Number(p.paid_sum)      || 0,
    expense:      Number(p.expense)       || 0,
    discount:     Number(p.discount)      || 0,
    exchangeRate: Number(p.exchange_rate) || 11000,
    comment:      p.comment       ?? '',
    // Hujjatni kim yaratgan — tezkor kiritish tarixida ko'rsatiladi
    createdBy:    p.created_by     ?? null,
    creatorName:  p.creator ? (p.creator.fullname || p.creator.username || '') : '',
    status:       p.status        ?? 'draft',
    totalSum:     Number(p.total_sum) || 0,
    totalUsd:     Number(p.total_usd) || 0,
    itemCount:    p.items?.length ?? 0,
    items:        (p.items ?? []).map(itemToFront),
  }
}

function toBack(form) {
  return {
    doc_number:    form.docNumber,
    date:          form.date,
    warehouse:     form.warehouse,
    supplier:      form.supplier    || null,
    supplier_id:   form.supplierId  || null,
    payment_type:  form.paymentType,
    paid_sum:      form.paidSum     || 0,
    expense:       form.expense     || 0,
    discount:      form.discount    || 0,
    exchange_rate: form.exchangeRate|| 11000,
    comment:       form.comment     || null,
    status:        form.status      || 'draft',
    items:         (form.items ?? []).map(itemToBack),
  }
}

export const purchasesApi = {
  async getAll(params = {}) {
    const res = await http.get('/purchases', { params })
    return { total: res.data.total, data: res.data.data.map(toFront) }
  },
  async getById(id) {
    const res = await http.get(`/purchases/${id}`)
    return toFront(res.data)
  },
  async getNextDocNumber() {
    const res = await http.get('/purchases/next-number')
    return res.data.doc_number
  },
  async create(form) {
    const res = await http.post('/purchases', toBack(form))
    return toFront(res.data)
  },
  async update(id, form) {
    const res = await http.put(`/purchases/${id}`, toBack(form))
    return toFront(res.data)
  },
  async confirm(id) {
    const res = await http.post(`/purchases/${id}/confirm`)
    return toFront(res.data)
  },
  async cancel(id) {
    const res = await http.post(`/purchases/${id}/cancel`)
    return toFront(res.data)
  },
  async remove(id) {
    await http.delete(`/purchases/${id}`)
  },
  // Saqlangan hujjat qatoridagi tannarx / sotuv narxini keyinchalik to'g'rilash.
  // prices: { costPrice?, retailPrice? } — faqat yuborilgani o'zgaradi.
  async updateItemPrices(purchaseId, itemId, prices = {}) {
    const body = {}
    if (prices.costPrice   !== undefined) body.cost_price       = Number(prices.costPrice)   || 0
    if (prices.retailPrice !== undefined) body.retail_price_sum = Number(prices.retailPrice) || 0
    const res = await http.patch(`/purchases/${purchaseId}/items/${itemId}/prices`, body)
    return itemToFront(res.data)
  },
  // ids berilsa faqat o'sha mahsulotlar uchun hisoblanadi — sotuv sahifasi
  // ekranda ko'rinayotgan tovarlarnigina so'raydi, butun bazani emas.
  async getFifoPrices(ids = null) {
    const params = (Array.isArray(ids) && ids.length) ? { ids: ids.join(',') } : {}
    const res = await http.get('/purchases/fifo-prices', { params })
    const map = {}
    res.data.forEach(b => {
      map[b.product_id] = {
        retailPrice:    Number(b.retail_price)    || 0,
        wholesalePrice: Number(b.wholesale_price) || 0,
        costPrice:      Number(b.cost_price)      || 0,
      }
    })
    return map  // { [productId]: { retailPrice, wholesalePrice, costPrice } }
  },
  async getBatches(params = {}) {
    const res = await http.get('/purchases/batches', { params })
    return res.data.map(b => ({
      id:           b.id,
      productId:    b.product_id,
      productName:  b.product_name,
      productCode:  b.product_code || '',
      productUnit:  b.product_unit || 'Dona',
      purchaseId:   b.purchase_id,
      purchaseDoc:  b.purchase_doc,
      purchaseDate: b.purchase_date,
      supplier:     b.supplier || '',
      costPrice:    Number(b.cost_price)  || 0,
      unitQty:      Number(b.unit_qty)    || 0,
      soldQty:      Number(b.sold_qty)    || 0,
      remaining:    Number(b.remaining)   || 0,
      soldSum:      Number(b.sold_sum)    || 0,
      totalCost:    Number(b.total_cost)  || 0,
    }))
  },
}
