<script setup>
import { ref, computed } from 'vue'
import BaseModal from './BaseModal.vue'
import AppIcon   from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'
import { useSales } from '@/composables/useSales.js'

const props = defineProps({
  total: { type: Number, required: true },
})
const emit = defineEmits(['close', 'paid'])

const { t } = useI18n()
const { processPayment } = useSales()

const methods = ['cash', 'card', 'transfer']
const method  = ref('cash')
const tendered = ref('')

const tenderedNum = computed(() => parseFloat(tendered.value) || 0)
const change      = computed(() => Math.max(0, tenderedNum.value - props.total))
const isValid     = computed(() => {
  if (method.value !== 'cash') return true
  return tenderedNum.value >= props.total
})

const quickAmounts = computed(() => {
  const t = props.total
  const rounded = Math.ceil(t / 5000) * 5000
  return [rounded, rounded + 5000, rounded + 10000, rounded + 20000].filter((v, i, a) => a.indexOf(v) === i)
})

function fmt(v) {
  return new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'
}

function pay() {
  if (!isValid.value) return
  const receipt = processPayment(method.value, method.value === 'cash' ? tenderedNum.value : props.total)
  emit('paid', receipt)
}
</script>

<template>
  <BaseModal :title="t('sales.payment.title')" width="440px" @close="emit('close')">
    <div class="pay">
      <!-- Amount due -->
      <div class="pay__due">
        <span class="pay__due-lbl">{{ t('sales.total') }}</span>
        <span class="pay__due-amt">{{ fmt(total) }}</span>
      </div>

      <!-- Method tabs -->
      <div class="pay__methods">
        <button
          v-for="m in methods"
          :key="m"
          class="pay__method"
          :class="{ 'is-active': method === m }"
          @click="method = m; tendered = ''"
        >
          <AppIcon
            :name="m === 'cash' ? 'wallet' : m === 'card' ? 'credit-card' : 'arrow-up-right'"
            :size="16"
          />
          {{ t(`sales.payment.${m}`) }}
        </button>
      </div>

      <!-- Cash input -->
      <template v-if="method === 'cash'">
        <div class="pay__field">
          <label class="pay__label">{{ t('sales.payment.tendered') }}</label>
          <div class="pay__inp-wrap">
            <input
              v-model="tendered"
              type="number"
              min="0"
              class="pay__inp"
              :placeholder="`≥ ${fmt(total)}`"
              @keyup.enter="pay"
            />
            <span class="pay__inp-suffix">so'm</span>
          </div>
        </div>

        <!-- Quick amounts -->
        <div class="pay__quick">
          <button
            v-for="qa in quickAmounts"
            :key="qa"
            class="pay__qa"
            @click="tendered = String(qa)"
          >
            {{ new Intl.NumberFormat('uz-UZ').format(qa) }}
          </button>
        </div>

        <!-- Change -->
        <div class="pay__change" :class="{ 'is-positive': change > 0 }">
          <span class="pay__change-lbl">{{ t('sales.payment.change') }}</span>
          <span class="pay__change-amt">{{ fmt(change) }}</span>
        </div>
      </template>

      <!-- Card/Transfer info -->
      <template v-else>
        <div class="pay__info-box">
          <AppIcon :name="method === 'card' ? 'credit-card' : 'arrow-up-right'" :size="28" :stroke-width="1.4" />
          <p>{{ t(`sales.payment.${method}`) }}</p>
          <strong>{{ fmt(total) }}</strong>
        </div>
      </template>
    </div>

    <template #footer>
      <button class="btn-cancel" @click="emit('close')">Bekor qilish</button>
      <button class="btn-pay" :disabled="!isValid" @click="pay">
        <AppIcon name="check" :size="15" :stroke-width="2.2" />
        {{ t('sales.payment.confirm') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.pay { display: flex; flex-direction: column; gap: 16px; }

.pay__due {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  border-radius: var(--r-xl);
  padding: 16px 20px;
  color: white;
}
.pay__due-lbl { font-size: 13px; font-weight: 500; opacity: 0.85; }
.pay__due-amt { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; }

.pay__methods {
  display: flex;
  gap: 6px;
  background: var(--slate-100);
  border-radius: var(--r-lg);
  padding: 4px;
}
.pay__method {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 8px;
  border-radius: var(--r-md);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-3);
  transition: background var(--t-base), color var(--t-base), box-shadow var(--t-base);
  cursor: pointer;
}
.pay__method.is-active {
  background: var(--color-surface);
  color: var(--indigo-600);
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

.pay__label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-3); margin-bottom: 7px; }

.pay__inp-wrap {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.pay__inp-wrap:focus-within {
  border-color: var(--indigo-400);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.pay__inp {
  flex: 1;
  padding: 11px 14px;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  background: transparent;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.pay__inp-suffix {
  padding: 0 14px 0 0;
  font-size: 13px;
  color: var(--color-text-3);
  font-weight: 500;
  white-space: nowrap;
}

.pay__quick {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pay__qa {
  flex: 1;
  min-width: 80px;
  padding: 8px 4px;
  border-radius: var(--r-md);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-2);
  cursor: pointer;
  transition: border-color var(--t-base), color var(--t-base), background var(--t-base);
  white-space: nowrap;
  text-align: center;
}
.pay__qa:hover { border-color: var(--indigo-300); color: var(--indigo-600); background: var(--indigo-50); }

.pay__change {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: var(--r-lg);
  background: var(--slate-50);
  border: 1px solid var(--color-border);
}
.pay__change.is-positive {
  background: rgba(16,185,129,0.06);
  border-color: rgba(16,185,129,0.2);
}
.pay__change-lbl { font-size: 13px; color: var(--color-text-3); font-weight: 500; }
.pay__change-amt { font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.pay__change.is-positive .pay__change-amt { color: var(--emerald-600); }

.pay__info-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 20px;
  border-radius: var(--r-xl);
  background: var(--slate-50);
  border: 1px solid var(--color-border);
  color: var(--color-text-3);
  text-align: center;
}
.pay__info-box p { font-size: 14px; font-weight: 500; color: var(--color-text-2); }
.pay__info-box strong { font-size: 20px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }

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

.btn-pay {
  flex: 2;
  padding: 11px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  font-size: 13.5px;
  font-weight: 700;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: opacity var(--t-base), box-shadow var(--t-base);
  box-shadow: 0 4px 16px rgba(99,102,241,0.3);
}
.btn-pay:hover:not(:disabled) { opacity: 0.92; box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
.btn-pay:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
</style>
