<script setup>
defineProps({
  variant: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'success', 'warning', 'danger', 'info', 'indigo'].includes(v),
  },
})
</script>

<template>
  <span class="badge" :class="`badge--${variant}`">
    <span class="badge__dot" />
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.badge__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.badge--default { background: var(--slate-100); color: var(--slate-500); }
.badge--default .badge__dot { background: var(--slate-400); }

.badge--success { background: var(--emerald-50); color: var(--emerald-700); }
.badge--success .badge__dot { background: var(--emerald-500); }

.badge--warning { background: var(--amber-50); color: var(--amber-600); }
.badge--warning .badge__dot { background: var(--amber-500); }

.badge--danger { background: var(--rose-50); color: var(--rose-700); }
.badge--danger .badge__dot { background: var(--rose-500); }

.badge--info { background: #eff6ff; color: #1d4ed8; }
.badge--info .badge__dot { background: #3b82f6; }

.badge--indigo { background: var(--indigo-50); color: var(--indigo-700); }
.badge--indigo .badge__dot { background: var(--indigo-500); }
</style>
