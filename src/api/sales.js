import http from './http'

function itemToFront(i) {
  return {
    id:           i.id,
    productId:    i.product_id   ?? null,
    barcode:      i.barcode      ?? '',
    productName:  i.product_name ?? '',
    qty:          Number(i.qty)        || 0,
    price:        Number(i.price)      || 0,
    priceUSD:     Number(i.price_usd)  || 0,
    totalSum:     Number(i.total_sum)  || 0,
    totalUSD:     Number(i.total_usd)  || 0,
    priceType:    i.price_type   ?? 'chakana',
  }
}

function toFront(s) {
  return {
    id:           s.id,
    docNumber:    s.doc_number,
    date:         s.date,
    warehouse:    s.warehouse     ?? '',
    clientId:     s.client_id     ?? null,
    client:       s.client        ?? null,
    paymentType:  s.payment_type  ?? 'Naqd',
    priceType:    s.price_type    ?? 'chakana',
    totalSum:     Number(s.total_sum)    || 0,
    totalUSD:     Number(s.total_usd)    || 0,
    discount:     Number(s.discount)     || 0,
    discountUSD:  Number(s.discount_usd) || 0,
    paidSum:      Number(s.paid_sum)     || 0,
    paidUSD:      Number(s.paid_usd)     || 0,
    debtSum:      Number(s.debt_sum)     || 0,
    debtUSD:      Number(s.debt_usd)     || 0,
    exchangeRate: Number(s.exchange_rate)|| 0,
    status:       s.status        ?? 'completed',
    comment:      s.comment       ?? '',
    cashierName:  s.cashier_name  ?? null,
    cashierId:    s.cashier_id    ?? null,
    itemCount:    s.items?.length ?? 0,
    items:        (s.items ?? []).map(itemToFront),
  }
}

export const salesApi = {
  async getAll(params = {}) {
    const res = await http.get('/sales', { params })
    return { total: res.data.total, data: res.data.data.map(toFront) }
  },
  async getById(id) {
    const res = await http.get(`/sales/${id}`)
    return toFront(res.data)
  },
  async getNextDocNumber() {
    const res = await http.get('/sales/next-number')
    return res.data.doc_number
  },
  async complete(payload) {
    const res = await http.post('/sales/complete', payload)
    return toFront(res.data)
  },
  async cancel(id) {
    const res = await http.post(`/sales/${id}/cancel`)
    return toFront(res.data)
  },
  async payDebt(data) {
    const res = await http.post('/sales/pay-debt', data)
    return res.data
  },
  async getCashReport(params = {}) {
    const res = await http.get('/sales/cash-report', { params })
    return res.data
  },
  async cashEntry(data) {
    const res = await http.post('/sales/cash-entry', data)
    return res.data
  },
}
