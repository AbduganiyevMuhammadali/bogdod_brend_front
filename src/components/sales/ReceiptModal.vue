<script setup>
import BaseModal from './BaseModal.vue'
import AppIcon   from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'

const props = defineProps({
  receipt: { type: Object, required: true },
})
const emit = defineEmits(['close', 'new-sale'])

const { t } = useI18n()

function fmt(v) {
  return new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'
}

function paymentLabel(m) {
  const map = { cash: t('sales.payment.cash'), card: t('sales.payment.card'), transfer: t('sales.payment.transfer') }
  return map[m] || m
}

function printReceipt() {
  window.print()
}
</script>

<template>
  <BaseModal :title="t('sales.receiptModal.title')" width="400px" no-pad @close="emit('close')">
    <div class="rcpt" id="printable-receipt">
      <!-- Header -->
      <div class="rcpt__hdr">
         <img style="width: 240px;" src="../../assets/ll.jpg" alt="">
        <p class="rcpt__brand">POS Tizimi</p>
        <p class="rcpt__sub">Chakana savdo Pro</p>
        <div class="rcpt__sep rcpt__sep--dashed" />
        <div class="rcpt__meta">
          <span>{{ t('sales.orderNum') }} <strong>{{ receipt.id }}</strong></span>
          <span>{{ receipt.date }} · {{ receipt.time }}</span>
        </div>
        <div class="rcpt__meta">
          <span>{{ t('sales.cashier') }}: <strong>{{ receipt.cashier }}</strong></span>
          <span>{{ paymentLabel(receipt.payment) }}</span>
        </div>
      </div>

      <!-- Items -->
      <div class="rcpt__sep rcpt__sep--dashed" />
      <div class="rcpt__items">
        <div v-for="item in receipt.items" :key="item.id" class="rcpt__item">
          <div class="rcpt__item-left">
            <span class="rcpt__item-emoji">{{ item.emoji }}</span>
            <div>
              <p class="rcpt__item-name">{{ item.name }}</p>
              <p class="rcpt__item-qty">{{ item.qty }} × {{ fmt(item.price) }}</p>
            </div>
          </div>
          <span class="rcpt__item-total">{{ fmt(item.price * item.qty) }}</span>
        </div>
      </div>

      <!-- Totals -->
      <div class="rcpt__sep rcpt__sep--dashed" />
      <div class="rcpt__totals">
        <div class="rcpt__trow">
          <span>{{ t('sales.subtotal') }}</span>
          <span>{{ fmt(receipt.subtotal) }}</span>
        </div>
        <div v-if="receipt.discount > 0" class="rcpt__trow rcpt__trow--disc">
          <span>{{ t('sales.discount') }}</span>
          <span>- {{ fmt(receipt.discount) }}</span>
        </div>
        <div class="rcpt__trow">
          <span>{{ t('sales.tax') }}</span>
          <span>{{ fmt(receipt.tax) }}</span>
        </div>
        <div class="rcpt__sep" />
        <div class="rcpt__trow rcpt__trow--total">
          <span>{{ t('sales.total') }}</span>
          <span>{{ fmt(receipt.total) }}</span>
        </div>
        <template v-if="receipt.payment === 'cash'">
          <div class="rcpt__trow">
            <span>{{ t('sales.payment.tendered') }}</span>
            <span>{{ fmt(receipt.tendered) }}</span>
          </div>
          <div class="rcpt__trow rcpt__trow--change">
            <span>{{ t('sales.changeGiven') }}</span>
            <span>{{ fmt(receipt.change) }}</span>
          </div>
        </template>
      </div>

      <!-- Thank you -->
      <div class="rcpt__thanks">
        <p>{{ t('sales.thankYou') }}</p>
      </div>
    </div>

    <template #footer>
      <button class="btn-print" @click="printReceipt">
        <AppIcon name="eye" :size="14" />
        {{ t('sales.receiptModal.print') }}
      </button>
      <button class="btn-new" @click="emit('new-sale')">
        <AppIcon name="shopping-cart" :size="14" />
        {{ t('sales.newSale') }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.rcpt { padding: 20px; display: flex; flex-direction: column; gap: 0; }

.rcpt__hdr {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  padding-bottom: 16px;
}



.rcpt__brand { font-size: 16px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.rcpt__sub   { font-size: 11.5px; color: var(--color-text-3); }

.rcpt__meta {
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 4px;
}
.rcpt__meta strong { color: var(--color-text-2); font-weight: 600; }

.rcpt__sep { height: 1px; background: var(--color-border); margin: 12px 0; }
.rcpt__sep--dashed {
  height: 0;
  border-top: 1.5px dashed var(--color-border);
  background: transparent;
  margin: 12px 0;
}

.rcpt__items { display: flex; flex-direction: column; gap: 8px; }
.rcpt__item  { display: flex; justify-content: space-between; align-items: center; }
.rcpt__item-left { display: flex; align-items: center; gap: 9px; }
.rcpt__item-emoji { font-size: 20px; flex-shrink: 0; }
.rcpt__item-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.rcpt__item-qty  { font-size: 11.5px; color: var(--color-text-3); margin-top: 1px; }
.rcpt__item-total { font-size: 13.5px; font-weight: 700; color: var(--color-text); white-space: nowrap; }

.rcpt__totals { display: flex; flex-direction: column; gap: 7px; }
.rcpt__trow {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-2);
}
.rcpt__trow--disc { color: var(--rose-600); }
.rcpt__trow--total {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.02em;
}
.rcpt__trow--change { color: var(--emerald-600); font-weight: 600; }

.rcpt__thanks {
  padding: 14px 0 4px;
  text-align: center;
  font-size: 12.5px;
  color: var(--color-text-3);
  font-style: italic;
}

.btn-print {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px;
  border-radius: var(--r-lg);
  border: 1.5px solid var(--color-border);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-2);
  cursor: pointer;
  transition: background var(--t-base);
}
.btn-print:hover { background: var(--slate-50); }

.btn-new {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  font-size: 13.5px;
  font-weight: 700;
  color: white;
  cursor: pointer;
  transition: opacity var(--t-base);
  box-shadow: 0 4px 16px rgba(99,102,241,0.3);
}
.btn-new:hover { opacity: 0.9; }
</style>
