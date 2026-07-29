<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from 'chart.js'

Chart.register(DoughnutController, ArcElement, Tooltip, Legend)

const props = defineProps({
  data:    { type: Object,  default: null },
  loading: { type: Boolean, default: false },
})

const canvasRef = ref(null)
let chartInstance = null

function buildChart() {
  if (!canvasRef.value || !props.data) return
  if (chartInstance) chartInstance.destroy()

  chartInstance = new Chart(canvasRef.value.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: props.data.labels,
      datasets: [{
        data: props.data.data,
        backgroundColor: props.data.colors,
        borderWidth: 4,
        borderColor: '#ffffff',
        hoverBorderColor: '#ffffff',
        hoverBorderWidth: 4,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '74%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 20,
            font: { size: 12, weight: '500', family: 'Inter' },
            color: '#64748b',
            usePointStyle: true,
            pointStyleWidth: 8,
            boxHeight: 8,
          },
        },
        tooltip: {
          backgroundColor: '#111827',
          titleColor: '#6b7280',
          bodyColor: '#f9fafb',
          padding: { x: 14, y: 11 },
          cornerRadius: 12,
          titleFont: { size: 11, weight: '500', family: 'Inter' },
          bodyFont: { size: 14, weight: '700', family: 'Inter' },
          displayColors: true,
          boxWidth: 8, boxHeight: 8, boxPadding: 4,
          callbacks: {
            label: (ctx) => ` ${ctx.parsed}%`,
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
    <template v-if="loading">
      <div class="chart-sk-ring">
        <div class="skeleton" style="width:140px;height:140px;border-radius:50%;" />
      </div>
    </template>
    <canvas v-else ref="canvasRef" />
  </div>
</template>

<style scoped>
.chart-wrap    { position: relative; width: 100%; height: 260px; }
.chart-sk-ring { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
</style>
