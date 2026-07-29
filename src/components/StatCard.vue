<script setup>
import AppIcon from '@/components/AppIcon.vue'

defineProps({
  title:        { type: String,           default: '' },
  value:        { type: [Number, String], default: 0  },
  format:       { type: String,           default: 'currency' },
  trend:        { type: String,           default: '' },
  trendUp:      { type: Boolean,          default: true },
  icon:         { type: String,           default: 'dollar-sign' },
  gradient:     { type: String,           default: 'indigo' },
  compareLabel: { type: String,           default: 'vs yesterday' },
  loading:      { type: Boolean,          default: false },
})

const gradients = {
  indigo: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  cyan:   'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
  violet: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
  amber:  'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
  rose:   'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)',
}

function fmt(val, format) {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(val)
  }
  return new Intl.NumberFormat('en-US').format(val)
}
</script>

<template>
  <div class="stat-card">
    <!-- Loading -->
    <template v-if="loading">
      <div class="stat-card__sk">
        <div class="skeleton" style="width:44px; height:44px; border-radius: 12px;" />
        <div style="margin-top: 20px; display:flex; flex-direction:column; gap:8px;">
          <div class="skeleton" style="width:55%; height:11px;" />
          <div class="skeleton" style="width:70%; height:26px; border-radius:6px;" />
          <div class="skeleton" style="width:40%; height:10px;" />
        </div>
      </div>
    </template>

    <template v-else>
      <!-- Icon -->
      <div class="stat-card__icon" :style="{ background: gradients[gradient] }">
        <AppIcon :name="icon" :size="18" :stroke-width="1.8" />
      </div>

      <!-- Body -->
      <div class="stat-card__body">
        <p class="stat-card__label">{{ title }}</p>
        <p class="stat-card__value">{{ fmt(value, format) }}</p>
      </div>

      <!-- Trend -->
      <div class="stat-card__footer">
        <span class="trend" :class="trendUp ? 'trend--up' : 'trend--down'">
          <AppIcon :name="trendUp ? 'trending-up' : 'trending-down'" :size="12" :stroke-width="2.2" />
          {{ trend }}
        </span>
        <span class="stat-card__period">{{ compareLabel }}</span>
      </div>

      <!-- Decorative gradient bar at bottom -->
      <div class="stat-card__bar" :style="{ background: gradients[gradient] }" />
    </template>
  </div>
</template>

<style scoped>
.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  padding: 22px 22px 18px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--t-md), transform var(--t-md);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.stat-card__sk { display: flex; flex-direction: column; }

.stat-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: 18px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
}

.stat-card__label {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-3);
  margin-bottom: 5px;
}

.stat-card__value {
  font-size: 28px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.04em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin-bottom: 12px;
}

.stat-card__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}

.trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
}

.trend--up   { background: var(--emerald-50);  color: var(--emerald-700); }
.trend--down { background: var(--rose-50);     color: var(--rose-700); }

.stat-card__period {
  font-size: 11.5px;
  color: var(--color-text-3);
}

/* Bottom gradient accent bar */
.stat-card__bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 0 0 var(--r-xl) var(--r-xl);
  opacity: 0.7;
  transition: opacity var(--t-base);
}

.stat-card:hover .stat-card__bar { opacity: 1; }
</style>
