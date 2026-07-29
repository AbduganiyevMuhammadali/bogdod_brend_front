<script setup>
defineProps({
  padding: {
    type: String,
    default: '24px',
  },
  hoverable: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div class="base-card" :class="{ 'base-card--hoverable': hoverable }" :style="{ padding }">
    <slot />
  </div>
</template>

<style scoped>
.base-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition), transform var(--transition);
}

.base-card--hoverable:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
</style>
