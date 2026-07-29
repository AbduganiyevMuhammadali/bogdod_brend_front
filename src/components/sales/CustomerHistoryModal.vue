<script setup>
import { computed } from 'vue'
import BaseModal from './BaseModal.vue'
import AppIcon   from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'

const props = defineProps({
  customer:     { type: Object, default: null },
  orderHistory: { type: Array,  default: () => [] },
})
const emit = defineEmits(['close'])
const { locale } = useI18n()

const orders = computed(() =>
  props.customer
    ? props.orderHistory.filter(o => o.customer?.id === props.customer.id)
    : props.orderHistory
)

const totalSpent = computed(() =>
  orders.value.reduce((s, o) => s + (o.total ?? calcTotal(o)), 0)
)

function calcTotal(o) {
  return o.items.reduce((s, i) => s + i.price * i.qty, 0)
}

function fmt(v) {
  return new Intl.NumberFormat('uz-UZ').format(v)
}

const payIcon = { cash: '💵', card: '💳', transfer: '📲' }
const payLabel = {
  uz: { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" },
  ru: { cash: 'Наличные', card: 'Карта', transfer: 'Перевод' },
}
function payText(method) {
  return (payLabel[locale.value] ?? payLabel.uz)[method] ?? method
}
</script>

<template>
  <BaseModal
    :title="customer ? customer.name : (locale === 'ru' ? 'История продаж' : 'Sotuvlar tarixi')"
    width="560px"
    @close="emit('close')"
  >
    <!-- Customer info bar -->
    <div v-if="customer" class="cust-bar">
      <div class="cust-bar__avatar">{{ customer.name[0] }}</div>
      <div class="cust-bar__info">
        <p class="cust-bar__name">{{ customer.name }}</p>
        <p class="cust-bar__phone">{{ customer.phone }}</p>
      </div>
      <div class="cust-bar__stats">
        <div class="cust-bar__stat">
          <span class="cust-bar__stat-val">{{ orders.length }}</span>
          <span class="cust-bar__stat-lbl">{{ locale === 'ru' ? 'Заказов' : 'Buyurtma' }}</span>
        </div>
        <div class="cust-bar__divider" />
        <div class="cust-bar__stat">
          <span class="cust-bar__stat-val">{{ fmt(totalSpent) }}</span>
          <span class="cust-bar__stat-lbl">{{ locale === 'ru' ? 'Сумма' : "Jami so'm" }}</span>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-if="orders.length === 0" class="hist-empty">
      <AppIcon name="shopping-bag" :size="32" :stroke-width="1.2" />
      <p>{{ locale === 'ru' ? 'Нет продаж' : 'Sotuvlar yo\'q' }}</p>
    </div>

    <!-- Orders list -->
    <div v-else class="hist-list">
      <div v-for="order in orders" :key="order.id" class="hist-item">
        <div class="hist-item__top">
          <span class="hist-item__id">{{ order.id }}</span>
          <span class="hist-item__date">{{ order.date }} · {{ order.time }}</span>
          <span class="hist-item__pay">{{ payIcon[order.payment] }} {{ payText(order.payment) }}</span>
        </div>
        <div class="hist-item__products">
          <span v-for="(it, idx) in order.items" :key="idx" class="hist-item__tag">
            {{ it.name }} × {{ it.qty }}
          </span>
        </div>
        <div class="hist-item__total">
          {{ fmt(order.total ?? calcTotal(order)) }} so'm
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.cust-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--indigo-50);
  border: 1px solid var(--indigo-100);
  border-radius: var(--r-xl);
  margin-bottom: 16px;
}
.cust-bar__avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--indigo-500);
  color: white;
  font-size: 17px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cust-bar__info { flex: 1; min-width: 0; }
.cust-bar__name  { font-size: 14px; font-weight: 700; color: var(--color-text); }
.cust-bar__phone { font-size: 12px; color: var(--color-text-3); margin-top: 2px; }
.cust-bar__stats { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.cust-bar__stat  { display: flex; flex-direction: column; align-items: center; }
.cust-bar__stat-val { font-size: 15px; font-weight: 800; color: var(--indigo-600); }
.cust-bar__stat-lbl { font-size: 10.5px; color: var(--color-text-3); margin-top: 1px; }
.cust-bar__divider  { width: 1px; height: 32px; background: var(--indigo-200); }

.hist-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--color-text-3);
  font-size: 13px;
}

.hist-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hist-item {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  display: flex;
  flex-direction: column;
  gap: 7px;
  background: var(--color-surface);
  transition: border-color var(--t-base);
}
.hist-item:hover { border-color: var(--indigo-200); }

.hist-item__top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hist-item__id {
  font-size: 12px;
  font-weight: 700;
  color: var(--indigo-600);
  background: var(--indigo-50);
  padding: 2px 8px;
  border-radius: 99px;
  flex-shrink: 0;
}
.hist-item__date {
  font-size: 11.5px;
  color: var(--color-text-3);
  flex: 1;
}
.hist-item__pay {
  font-size: 11.5px;
  color: var(--color-text-2);
  font-weight: 600;
  flex-shrink: 0;
}

.hist-item__products {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.hist-item__tag {
  font-size: 11px;
  color: var(--color-text-2);
  background: var(--slate-100);
  padding: 2px 8px;
  border-radius: 99px;
}

.hist-item__total {
  font-size: 14px;
  font-weight: 800;
  color: var(--color-text);
  text-align: right;
  letter-spacing: -0.02em;
}
</style>
