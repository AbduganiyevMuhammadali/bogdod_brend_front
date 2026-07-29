import http from './http'

function toFront(c) {
  return {
    id:      c.id,
    code:    c.code    ?? '',
    name:    c.name    ?? '',
    phone:   c.phone   ?? '',
    address: c.address ?? '',
    balance: Number(c.balance) || 0,
    comment: c.comment ?? '',
    active:  c.active  ?? true,
  }
}

export const clientsApi = {
  async getAll(params = {}) {
    const res = await http.get('/clients', { params })
    return { total: res.data.total, data: res.data.data.map(toFront) }
  },
  async getById(id) {
    const res = await http.get(`/clients/${id}`)
    return toFront(res.data)
  },
  async getHistory(id, params = {}) {
    const res = await http.get(`/clients/${id}/history`, { params })
    return res.data
  },
  async getLedger(id) {
    const res = await http.get(`/clients/${id}/ledger`)
    return res.data
  },
  async create(data) {
    const res = await http.post('/clients', data)
    return toFront(res.data)
  },
  async update(id, data) {
    const res = await http.put(`/clients/${id}`, data)
    return toFront(res.data)
  },
  async remove(id) {
    await http.delete(`/clients/${id}`)
  },
  async payDebt({ client_id, amount, payment_type, description }) {
    const res = await http.post('/sales/pay-debt', { client_id, amount, payment_type, description })
    return res.data
  },
}
