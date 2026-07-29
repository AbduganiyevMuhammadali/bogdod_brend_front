<script setup>
import { ref, computed } from 'vue'
import BaseModal from './BaseModal.vue'
import { useI18n } from '@/i18n/index.js'
import { useSales } from '@/composables/useSales.js'

const props = defineProps({
  subtotal: { type: Number, required: true },
})
const emit = defineEmits(['close'])

const { t } = useI18n()
const { discountType, discountVal, applyDiscount, removeDiscount } = useSales()

const localType = ref(discountType.value || 'percent')
const localVal  = ref(discountVal.value > 0 ? String(discountVal.value) : '')

const previewAmount = computed(() => {
  const v = parseFloat(localVal.value) || 0
  if (localType.value === 'percent')
    return Math.round(props.subtotal * v / 100)
  return Math.min(v, props.subtotal)
})

const afterDiscount = computed(() => props.subtotal - previewAmount.value)
const hasValue      = computed(() => parseFloat(localVal.value) > 0)

function apply() {
  applyDiscount(localType.value, parseFloat(localVal.value) || 0)
  emit('close')
}

function remove() {
  removeDiscount()
  emit('close')
}

function fmt(v) {
  return new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'
}
</script>

<template>
  <BaseModal :title="t('sales.disc.title')" width="420px" @close="emit('close')">
    <div class="disc">
      <!-- Type tabs -->
      <div class="disc__tabs">
        <button
          class="disc__tab"
          :class="{ 'is-active': localType === 'percent' }"
          @click="localType = 'percent'"
        >% {{ t('sales.disc.percent') }}</button>
        <button
          class="disc__tab"
          :class="{ 'is-active': localType === 'fixed' }"
          @click="localType = 'fixed'"
        >💲 {{ t('sales.disc.fixed') }}</button>
      </div>

      <!-- Input -->
      <div class="disc__field">
        <label class="disc__label">{{ t('sales.disc.value') }}</label>
        <div class="disc__inp-wrap">
          <input
            v-model="localVal"
            type="number"
            min="0"
            :max="localType === 'percent' ? 100 : subtotal"
            class="disc__inp"
            :placeholder="localType === 'percent' ? '0 – 100' : '0'"
            autofocus
          />
          <span class="disc__inp-badge">{{ localType === 'percent' ? '%' : 'so\'m' }}</span>
        </div>
      </div>

      <!-- Preview -->
      <div v-if="hasValue" class="disc__preview">
        <div class="disc__preview-row">
          <span>Asl summa</span>
          <span>{{ fmt(subtotal) }}</span>
        </div>
        <div class="disc__preview-row disc__preview-row--disc">
          <span>Chegirma</span>
          <span>- {{ fmt(previewAmount) }}</span>
        </div>
        <div class="disc__preview-sep" />
        <div class="disc__preview-row disc__preview-row--total">
          <span>Chegirmadan keyin</span>
          <span>{{ fmt(afterDiscount) }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <button v-if="discountVal > 0" class="btn-remove" @click="remove">
        {{ t('sales.disc.remove') }}
      </button>
      <button class="btn-cancel" @click="emit('close')">Bekor qilish</button>
      <button class="btn-apply" :disabled="!hasValue" @click="apply">
        {{ t('sales.disc.apply') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.disc { display: flex; flex-direction: column; gap: 16px; }

.disc__tabs {
  display: flex;
  gap: 6px;
  background: var(--slate-100);
  border-radius: var(--r-lg);
  padding: 4px;
}
.disc__tab {
  flex: 1;
  padding: 9px 8px;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-3);
  cursor: pointer;
  transition: background var(--t-base), color var(--t-base), box-shadow var(--t-base);
  text-align: center;
}
.disc__tab.is-active {
  background: var(--color-surface);
  color: var(--indigo-600);
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.disc__label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-3); margin-bottom: 7px; }

.disc__inp-wrap {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.disc__inp-wrap:focus-within {
  border-color: var(--indigo-400);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.disc__inp {
  flex: 1;
  padding: 12px 14px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  background: transparent;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.disc__inp-badge {
  padding: 0 16px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--indigo-500);
}

.disc__preview {
  background: var(--slate-50);
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.disc__preview-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-2);
}
.disc__preview-row--disc { color: var(--rose-600); font-weight: 600; }
.disc__preview-row--total { font-size: 15px; font-weight: 800; color: var(--color-text); }
.disc__preview-sep { height: 1px; background: var(--color-border); margin: 2px 0; }

.btn-remove {
  padding: 11px 14px;
  border-radius: var(--r-lg);
  border: 1.5px solid var(--rose-200);
  background: var(--rose-50);
  font-size: 13px;
  font-weight: 600;
  color: var(--rose-600);
  cursor: pointer;
  transition: background var(--t-base);
  white-space: nowrap;
}
.btn-remove:hover { background: var(--rose-100); }

.btn-cancel {
  flex: 1;
  padding: 11px;
  border-radius: var(--r-lg);
  border: 1.5px solid var(--color-border);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-2);
  cursor: pointer;
  transition: background var(--t-base);
}
.btn-cancel:hover { background: var(--slate-50); }

.btn-apply {
  flex: 1;
  padding: 11px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  font-size: 13.5px;
  font-weight: 700;
  color: white;
  cursor: pointer;
  transition: opacity var(--t-base);
}
.btn-apply:hover:not(:disabled) { opacity: 0.9; }
.btn-apply:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
