<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import {
  Chart, BarController, BarElement,
  CategoryScale, LinearScale, Tooltip,
} from 'chart.js'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

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
    type: 'bar',
    data: {
      labels: props.data.labels,
      datasets: [{
        data: props.data.data,
        backgroundColor: (ctx) => {
          const max = Math.max(...props.data.data)
          return ctx.parsed.y === max
            ? '#6366f1'
            : 'rgba(99,102,241,0.18)'
        },
        hoverBackgroundColor: '#6366f1',
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.8,
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
          padding: { x: 14, y: 10 },
          cornerRadius: 10,
          displayColors: false,
          titleFont: { size: 11, weight: '500', family: 'Inter' },
          bodyFont: { size: 13, weight: '700', family: 'Inter' },
          callbacks: {
            title: ([item]) => item.label,
            label: (ctx) => `${ctx.parsed.y} orders`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#9ca3af',
            font: { size: 11, family: 'Inter' },
            padding: 6,
            maxRotation: 0,
          },
        },
        y: {
          grid: { color: '#f1f5f9', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#9ca3af',
            font: { size: 11, family: 'Inter' },
            padding: 10,
          },
          beginAtZero: true,
        },
      },
    },
  })
}

onMounted(buildChart)
watch(() => props.data, buildChart, { deep: true })
onUnmounted(() => { if (chartInstance) chartInstance.destroy() })
</script>

<template>
  <div class="bar-wrap">
    <div v-if="loading" class="skeleton" style="width:100%;height:100%;border-radius:10px;" />
    <canvas v-else ref="canvasRef" />
  </div>
</template>

<style scoped>
.bar-wrap { position: relative; width: 100%; height: 200px; }
</style>
