import http from './http'

export const reportsApi = {
  async getOverview()                    { return (await http.get('/reports/overview')).data },
  async getTodaySales(params = {})       { return (await http.get('/reports/today', { params })).data },
  async getProductSales(params = {})     { return (await http.get('/reports/products', { params })).data },
  async getClientReport(params = {})     { return (await http.get('/reports/clients', { params })).data },
  async getCashierReport(params = {})    { return (await http.get('/reports/cashiers', { params })).data },
  async getCashRegister(params = {})     { return (await http.get('/reports/cash-register', { params })).data },
  async getProfitReport(params = {})     { return (await http.get('/reports/profit', { params })).data },
  async getDashboardExtra(params = {})   { return (await http.get('/reports/dashboard-extra', { params })).data },
  async getSupplierReport(params = {})   { return (await http.get('/reports/suppliers', { params })).data },
}
