import http from './http'

function itemToFrontend(i) {
  const expected = Number(i.expected_qty) || 0
  const counted  = Number(i.counted_qty)  || 0
  return {
    id:          i.id,
    productId:   i.product_id,
    productName: i.product_name,
    barcode:     i.barcode,
    expectedQty: expected,
    countedQty:  counted,
    costPrice:   Number(i.cost_price) || 0,
    isExtra:     !!i.is_extra,
    scannedAt:   i.scanned_at,
    diff:        counted - expected,
  }
}

function toFrontend(d) {
  return {
    id:         d.id,
    docNumber:  d.doc_number,
    date:       d.date,
    warehouse:  d.warehouse,
    comment:    d.comment,
    status:     d.status,
    totalExpected: Number(d.total_expected) || 0,
    totalCounted:  Number(d.total_counted)  || 0,
    totalDiffSum:  Number(d.total_diff_sum) || 0,
    finishedAt: d.finished_at,
    createdAt:  d.createdAt,
    items:      (d.items || []).map(itemToFrontend),
    itemCount:  d.items?.length ?? 0,
  }
}

export const inventoriesApi = {
  async getAll(params = {}) {
    const res = await http.get('/inventories', { params })
    return res.data.map(toFrontend)
  },

  async getById(id) {
    const res = await http.get(`/inventories/${id}`)
    return toFrontend(res.data)
  },

  async create(payload = {}) {
    const res = await http.post('/inventories', {
      warehouse:     payload.warehouse || 'Asosiy ombor',
      comment:       payload.comment   || null,
      only_in_stock: payload.onlyInStock !== false,
    })
    return toFrontend(res.data)
  },

  // Javobdagi `holat` ga qarab frontend tegishli ovozni chaladi:
  // topildi | takror | ortiqcha | notanish
  async scan(id, barcode, qty = 1) {
    const res = await http.post(`/inventories/${id}/scan`, { barcode, qty })
    return {
      holat:    res.data.holat,
      takroriy: res.data.takroriy,
      item:     itemToFrontend(res.data.item),
    }
  },

  async updateItem(itemId, countedQty) {
    const res = await http.patch(`/inventories/items/${itemId}`, { counted_qty: countedQty })
    return itemToFrontend(res.data)
  },

  async deleteItem(itemId) {
    await http.delete(`/inventories/items/${itemId}`)
  },

  async finish(id) {
    const res = await http.post(`/inventories/${id}/finish`)
    return toFrontend(res.data)
  },

  async cancel(id) {
    await http.post(`/inventories/${id}/cancel`)
  },

  async remove(id) {
    await http.delete(`/inventories/${id}`)
  },
}
