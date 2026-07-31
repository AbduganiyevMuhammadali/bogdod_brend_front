import http from './http'

// Backend → Frontend shape
function toFrontend(p) {
  return {
    id:               p.id,
    code:             p.code             ?? '',
    name:             p.name,
    generalName:      p.general_name     ?? '',
    unit:             p.unit             ?? 'Dona',
    brand:            p.brand            ?? '',
    model:            p.model            ?? '',
    country:          p.country          ?? '',
    category:         p.category         ?? '',
    color:            p.color            ?? '',
    extraName1:       p.extra_name1      ?? '',
    extraName2:       p.extra_name2      ?? '',
    extraName3:       p.extra_name3      ?? '',
    barcodes:         Array.isArray(p.barcodes) ? p.barcodes : [],
    photo:            p.photo            || null,
    wholesalePrice:   Number(p.wholesale_price)     || 0,
    wholesalePriceUSD:Number(p.wholesale_price_usd) || 0,
    retailPrice:      Number(p.retail_price)        || 0,
    retailPriceUSD:   Number(p.retail_price_usd)    || 0,
    currency:         p.currency         ?? "So'm",
    qty:              Number(p.qty)      || 0,
    minQty:           Number(p.min_qty)  || 0,
    isFolder:         !!p.is_folder,
    active:           p.active !== false,
  }
}

// Frontend form → Backend payload
function toBackend(form) {
  return {
    code:                form.code             || null,
    name:                form.name             || form.generalName,
    general_name:        form.generalName      || null,
    unit:                form.unit             || null,
    brand:               form.brand            || null,
    model:               form.model            || null,
    country:             form.country          || null,
    category:            form.group            || form.category || null,
    color:               form.color            || null,
    extra_name1:         form.extraName1       || null,
    extra_name2:         form.extraName2       || null,
    extra_name3:         form.extraName3       || null,
    barcodes:            form.barcodes         ?? [],
    photo:               form.photo            ?? null,
    wholesale_price:     Number(form.wholesalePrice)     || 0,
    wholesale_price_usd: Number(form.wholesalePriceUSD)  || 0,
    retail_price:        Number(form.retailPrice)        || 0,
    retail_price_usd:    Number(form.retailPriceUSD)     || 0,
    currency:            form.currency         || "So'm",
    ...(form.qty != null ? { qty: Number(form.qty) || 0 } : {}),
    min_qty:             Number(form.minQty)   || 0,
    is_folder:           !!form.isFolder,
    active:              form.active !== false,
  }
}

export const productsApi = {
  async getAll(params = {}) {
    const res = await http.get('/products', { params })
    return {
      total: res.data.total,
      data:  res.data.data.map(toFrontend),
    }
  },

  async getLowStockCount() {
    const res = await http.get('/products/low-stock-count')
    return res.data.count ?? 0
  },

  async getById(id) {
    const res = await http.get(`/products/${id}`)
    return toFrontend(res.data)
  },

  async getByBarcode(code) {
    try {
      const res = await http.get(`/products/by-barcode/${encodeURIComponent(code)}`)
      return toFrontend(res.data)
    } catch (e) {
      if (e.response?.status === 404) return null
      throw e
    }
  },

  async getCategories() {
    const res = await http.get('/products/categories')
    return res.data
  },

  async create(form) {
    const res = await http.post('/products', toBackend(form))
    return toFrontend(res.data)
  },

  // Tezkor kiritish: ko'p mahsulotni bir so'rovda yaratadi va ular uchun
  // bitta "boshlang'ich qoldiq" kirim hujjatini ochadi (FIFO tannarx uchun).
  // Har element qo'shimcha `costPrice`, `qty` va ixtiyoriy `sizes` oladi.
  async bulkCreate(rows, opts = {}) {
    const items = rows.map(r => ({
      ...toBackend(r),
      cost_price: Number(r.costPrice) || 0,
      qty:        Number(r.qty)       || 0,
      ...(r.sizes?.length ? { sizes: r.sizes } : {}),
    }))
    const res = await http.post('/products/bulk', {
      items,
      supplier_id: opts.supplierId ?? null,
      doc_date:    opts.docDate    ?? null,
    })
    return res.data
  },

  async update(id, form) {
    const res = await http.put(`/products/${id}`, toBackend(form))
    return toFrontend(res.data)
  },

  async patch(id, fields) {
    const res = await http.patch(`/products/${id}`, fields)
    return toFrontend(res.data)
  },

  async remove(id) {
    await http.delete(`/products/${id}`)
  },

  async uploadPhoto(file) {
    const fd = new FormData()
    fd.append('photo', file)
    const res = await http.post('/products/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.url  // e.g. /uploads/product_1234.jpg
  },
}
