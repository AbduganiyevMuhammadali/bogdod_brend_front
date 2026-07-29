import http from './http'

function toFront(s) {
  return {
    id:      s.id,
    code:    s.code    ?? '',
    name:    s.name    ?? '',
    phone:   s.phone   ?? '',
    address: s.address ?? '',
    balance: Number(s.balance) || 0,
    comment: s.comment ?? '',
    active:  s.active  ?? true,
  }
}

export const suppliersApi = {
  async getAll(params = {}) {
    const res = await http.get('/suppliers', { params })
    return res.data.map(toFront)
  },
  async getById(id) {
    const res = await http.get(`/suppliers/${id}`)
    return toFront(res.data)
  },
  async create(form) {
    const res = await http.post('/suppliers', form)
    return toFront(res.data)
  },
  async update(id, form) {
    const res = await http.put(`/suppliers/${id}`, form)
    return toFront(res.data)
  },
  async remove(id) {
    await http.delete(`/suppliers/${id}`)
  },
  // To'lov qilish — yetkazuvchiga qarzni to'lash
  async pay(id, { amount, payment_type, purchase_id, comment }) {
    const res = await http.post(`/suppliers/${id}/pay`, {
      amount, payment_type, purchase_id, comment,
    })
    return toFront(res.data)
  },
  async getPurchases(id) {
    const res = await http.get(`/suppliers/${id}/purchases`)
    return res.data
  },
  async getLedger(id) {
    const res = await http.get(`/suppliers/${id}/ledger`)
    return res.data
  },
}
