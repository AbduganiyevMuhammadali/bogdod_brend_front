import http from './http'

/**
 * Filiallar API.
 *
 * Joriy filial `X-Branch-Id` sarlavhasi orqali tanlanadi (http.js qo'yadi).
 * Filialga biriktirilgan xodim uchun server sarlavhani e'tiborsiz qoldiradi.
 */
function toFront(b) {
  return {
    id:      b.id,
    name:    b.name ?? '',
    code:    b.code ?? '',
    address: b.address ?? '',
    phone:   b.phone ?? '',
    isMain:  !!b.is_main,
    active:  b.active !== false,
    users:   Number(b.users) || 0,
    current: !!b.current,
    locked:  !!b.locked,
  }
}

export const branchesApi = {
  async getAll(params = {}) {
    const res = await http.get('/branches', { params })
    return res.data.map(toFront)
  },
  async getCurrent() {
    const res = await http.get('/branches/current')
    return toFront(res.data)
  },
  async create(data) {
    const res = await http.post('/branches', data)
    return toFront(res.data)
  },
  async update(id, data) {
    const res = await http.put(`/branches/${id}`, data)
    return toFront(res.data)
  },
}
