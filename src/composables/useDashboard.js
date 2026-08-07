import { ref } from 'vue'
import { reportsApi } from '@/api/reports.js'
import { todayKey } from './useDateTime.js'

export function useDashboard() {
  const loading  = ref(false)
  const error    = ref(null)
  const overview = ref(null)   // { today, week, month, hourly }
  const products = ref([])     // top products today
  const cashiers = ref([])     // cashier stats today
  const profit   = ref(null)   // { summary, rows }

  async function fetchDashboard() {
    loading.value = true
    error.value   = null
    const today = todayKey()
    try {
      const [ov, prod, cash, prof] = await Promise.all([
        reportsApi.getOverview(),
        reportsApi.getProductSales({ date_from: today, date_to: today }),
        reportsApi.getCashierReport({ date_from: today, date_to: today }),
        reportsApi.getProfitReport({ date_from: today, date_to: today }),
      ])
      overview.value  = ov
      products.value  = prod.slice(0, 7)
      cashiers.value  = cash
      profit.value    = prof
    } catch {
      error.value = 'Ma\'lumot yuklanmadi'
    } finally {
      loading.value = false
    }
  }

  return { loading, error, overview, products, cashiers, profit, fetchDashboard }
}
