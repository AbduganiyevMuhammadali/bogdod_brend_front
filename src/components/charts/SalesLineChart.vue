<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  Chart, LineElement, PointElement, LineController,
  CategoryScale, LinearScale, Filler, Tooltip,
} from 'chart.js'

Chart.register(LineElement, PointElement, LineController, CategoryScale, LinearScale, Filler, Tooltip)

const props = defineProps({
  data:    { type: Object,  default: null },
  loading: { type: Boolean, default: false },
})

const canvasRef = ref(null)
let chartInstance = null

function buildChart() {
  if (!canvasRef.value || !props.data) return
  if (chartInstance) chartInstance.destroy()

  const ctx = canvasRef.value.getContext('2d')

  const gradFill = ctx.createLinearGradient(0, 0, 0, 240)
  gradFill.addColorStop(0, 'rgba(99,102,241,0.18)')
  gradFill.addColorStop(0.7, 'rgba(99,102,241,0.04)')
  gradFill.addColorStop(1, 'rgba(99,102,241,0)')

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: props.data.labels,
      datasets: [{
        data: props.data.data,
        borderColor: '#6366f1',
        borderWidth: 2.5,
        backgroundColor: gradFill,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#6366f1',
        pointBorderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHoverBackgroundColor: '#6366f1',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          titleColor: '#6b7280',
          bodyColor: '#f9fafb',
          padding: { x: 14, y: 11 },
          cornerRadius: 12,
          displayColors: false,
          titleFont: { size: 11, weight: '500', family: 'Inter' },
          bodyFont: { size: 14, weight: '700', family: 'Inter' },
          callbacks: {
            title: ([item]) => item.label,
            label: (ctx) => `$${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#9ca3af',
            font: { size: 12, weight: '500', family: 'Inter' },
            padding: 8,
          },
        },
        y: {
          position: 'right',
          grid: { color: '#f1f5f9' },
          border: { display: false, dash: [3, 3] },
          ticks: {
            color: '#9ca3af',
            font: { size: 12, family: 'Inter' },
            padding: 12,
            callback: (v) => `$${(v / 1000).toFixed(0)}k`,
          },
        },
      },
    },
  })
}

onMounted(buildChart)
watch(() => props.data, buildChart)
onUnmounted(() => { if (chartInstance) chartInstance.destroy() })
</script>

<template>
  <div class="chart-wrap">
    <div v-if="loading" class="chart-sk">
      <div class="skeleton" style="width:100%; height:100%; border-radius:12px;" />
    </div>
    <canvas v-else ref="canvasRef" />
  </div>
</template>

<style scoped>
.chart-wrap { position: relative; width: 100%; height: 240px; }
.chart-sk   { width: 100%; height: 100%; }
</style>
