<script setup>
import AppIcon from '@/components/AppIcon.vue'

defineProps({
  title:    { type: String, default: '' },
  width:    { type: String, default: '480px' },
  noPad:    { type: Boolean, default: false },
})
const emit = defineEmits(['close'])
</script>

<template>
  <teleport to="body">
    <div class="modal-overlay" @click.self="emit('close')">
      <div class="modal" :style="{ width, maxWidth: '95vw' }" role="dialog">
        <div class="modal__hdr">
          <h3 class="modal__title">{{ title }}</h3>
          <button class="modal__close" @click="emit('close')">
            <AppIcon name="x" :size="16" :stroke-width="2" />
          </button>
        </div>
        <div class="modal__body" :class="{ 'no-pad': noPad }">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal__footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  animation: overlay-in 0.18s ease;
}
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }

.modal {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-2xl);
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modal-in 0.2s var(--ease-spring);
}
@keyframes modal-in {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

.modal__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.modal__close {
  width: 30px;
  height: 30px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  transition: background var(--t-base), color var(--t-base);
  cursor: pointer;
  flex-shrink: 0;
}
.modal__close:hover { background: var(--slate-100); color: var(--color-text); }

.modal__body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}
.modal__body.no-pad { padding: 0; }

.modal__footer {
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
</style>
