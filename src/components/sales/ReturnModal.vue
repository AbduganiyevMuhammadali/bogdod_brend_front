<script setup>
import { ref, computed } from 'vue'
import BaseModal from './BaseModal.vue'
import AppIcon   from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'
import { PAST_ORDERS } from '@/composables/useSales.js'

const emit = defineEmits(['close'])
const { t } = useI18n()

const searchVal    = ref('')
const foundOrder   = ref(null)
const notFound     = ref(false)
const selectedIds  = ref([])
const reason       = ref('')
const done         = ref(false)
const returnReceipt = ref(null)

function doSearch() {
  const q = searchVal.value.trim().toUpperCase()
  const order = PAST_ORDERS.find(o => o.id.toUpperCase() === q)
  if (order) {
    foundOrder.value = order
    selectedIds.value = order.items.map(i => i.productId)
    notFound.value = false
  } else {
    foundOrder.value = null
    notFound.value = true
  }
}

function toggleItem(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else          selectedIds.value.push(id)
}

function toggleAll() {
  if (selectedIds.value.length === foundOrder.value.items.length)
    selectedIds.value = []
  else
    selectedIds.value = foundOrder.value.items.map(i => i.productId)
}

const returnItems = computed(() =>
  foundOrder.value?.items.filter(i => selectedIds.value.includes(i.productId)) ?? []
)

const returnTotal = computed(() =>
  returnItems.value.reduce((s, i) => s + i.price * i.qty, 0)
)

const canConfirm = computed(() => returnItems.value.length > 0)

function confirm() {
  returnReceipt.value = {
    orderId: foundOrder.value.id,
    items:   returnItems.value,
    total:   returnTotal.value,
    reason:  reason.value,
    date:    new Date().toLocaleString('uz-UZ'),
  }
  done.value = true
}

function fmt(v) {
  return new Intl.NumberFormat('uz-UZ').format(v) + ' so\'m'
}

function payLabel(m) {
  const map = { cash: t('sales.payment.cash'), card: t('sales.payment.card'), transfer: t('sales.payment.transfer') }
  return map[m] || m
}
</script>

<template>
  <BaseModal :title="t('sales.returnModal.title')" width="500px" @close="emit('close')">

    <!-- Success state -->
    <div v-if="done" class="ret-done">
      <div class="ret-done__ico">
        <AppIcon name="check" :size="28" :stroke-width="2" />
      </div>
      <h3 class="ret-done__title">{{ t('sales.returnModal.success') }}</h3>
      <div class="ret-done__info">
        <div class="ret-done__row">
          <span>Buyurtma</span>
          <strong>{{ returnReceipt.orderId }}</strong>
        </div>
        <div class="ret-done__row">
          <span>Qaytarilgan summa</span>
          <strong class="ret-done__amt">{{ fmt(returnReceipt.total) }}</strong>
        </div>
        <div class="ret-done__row">
          <span>Sana</span>
          <strong>{{ returnReceipt.date }}</strong>
        </div>
      </div>
      <button class="btn-close-done" @click="emit('close')">Yopish</button>
    </div>

    <!-- Search & select state -->
    <template v-else>
      <!-- Search bar -->
      <div class="ret-search">
        <div class="ret-search__wrap">
          <AppIcon name="search" :size="14" class="ret-search__ico" />
          <input
            v-model="searchVal"
            type="text"
            class="ret-search__inp"
            :placeholder="t('sales.returnModal.searchPh')"
            @keyup.enter="doSearch"
          />
        </div>
        <button class="ret-search__btn" @click="doSearch">
          {{ t('sales.returnModal.search') }}
        </button>
      </div>

      <!-- Quick examples -->
      <div v-if="!foundOrder && !notFound" class="ret-hint">
        <p>Misol: ORD-1042, ORD-1041, ORD-1040</p>
      </div>

      <!-- Not found -->
      <div v-if="notFound" class="ret-empty">
        <AppIcon name="alert-circle" :size="24" :stroke-width="1.4" />
        <p>{{ t('sales.returnModal.notFound') }}</p>
      </div>

      <!-- Found order -->
      <template v-if="foundOrder">
        <!-- Order header -->
        <div class="ret-order-hdr">
          <div class="ret-order-meta">
            <strong>{{ foundOrder.id }}</strong>
            <span>{{ foundOrder.date }} · {{ foundOrder.time }}</span>
            <span class="ret-badge">{{ payLabel(foundOrder.payment) }}</span>
          </div>
          <button class="ret-sel-all" @click="toggleAll">
            <AppIcon name="check" :size="12" />
            {{ t('sales.returnModal.selectAll') }}
          </button>
        </div>

        <!-- Items -->
        <div class="ret-items">
          <label
            v-for="item in foundOrder.items"
            :key="item.productId"
            class="ret-item"
            :class="{ 'is-selected': selectedIds.includes(item.productId) }"
          >
            <input
              type="checkbox"
              :checked="selectedIds.includes(item.productId)"
              @change="toggleItem(item.productId)"
              class="ret-item__chk"
            />
            <div class="ret-item__info">
              <span class="ret-item__name">{{ item.name }}</span>
              <span class="ret-item__detail">{{ item.qty }} × {{ fmt(item.price) }}</span>
            </div>
            <span class="ret-item__total">{{ fmt(item.price * item.qty) }}</span>
          </label>
        </div>

        <!-- Reason -->
        <div class="ret-reason">
          <label class="ret-label">{{ t('sales.returnModal.reason') }}</label>
          <input
            v-model="reason"
            type="text"
            class="ret-reason__inp"
            placeholder="Noto'g'ri mahsulot, sifat..."
          />
        </div>

        <!-- Return total -->
        <div class="ret-total">
          <span>Qaytarish summasi</span>
          <strong>{{ fmt(returnTotal) }}</strong>
        </div>

        <!-- Confirm -->
        <button class="btn-confirm" :disabled="!canConfirm" @click="confirm">
          <AppIcon name="refresh" :size="15" />
          {{ t('sales.returnModal.confirm') }} ({{ returnItems.length }} ta)
        </button>
      </template>
    </template>

  </BaseModal>
</template>

<style scoped>
.ret-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  text-align: center;
}
.ret-done__ico {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(16,185,129,0.1);
  border: 2px solid rgba(16,185,129,0.25);
  color: var(--emerald-500);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ret-done__title { font-size: 17px; font-weight: 800; color: var(--color-text); }
.ret-done__info {
  width: 100%;
  background: var(--slate-50);
  border-radius: var(--r-xl);
  border: 1px solid var(--color-border);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ret-done__row { display: flex; justify-content: space-between; font-size: 13px; color: var(--color-text-2); }
.ret-done__row strong { color: var(--color-text); }
.ret-done__amt { color: var(--emerald-600) !important; font-size: 16px; }
.btn-close-done {
  width: 100%;
  padding: 11px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
}

.ret-search {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.ret-search__wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.ret-search__ico {
  position: absolute;
  left: 11px;
  color: var(--color-text-3);
  pointer-events: none;
}
.ret-search__inp {
  width: 100%;
  height: 40px;
  padding: 0 12px 0 34px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  font-family: inherit;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.ret-search__inp:focus {
  border-color: var(--indigo-400);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.ret-search__btn {
  padding: 0 18px;
  height: 40px;
  border-radius: var(--r-lg);
  background: var(--indigo-500);
  color: white;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--t-base);
  white-space: nowrap;
}
.ret-search__btn:hover { opacity: 0.9; }

.ret-hint { font-size: 12px; color: var(--color-text-3); text-align: center; padding: 20px 0; }

.ret-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--rose-400);
  font-size: 13.5px;
  font-weight: 500;
}

.ret-order-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.ret-order-meta { display: flex; flex-direction: column; gap: 3px; }
.ret-order-meta strong { font-size: 15px; font-weight: 800; color: var(--color-text); }
.ret-order-meta span { font-size: 12px; color: var(--color-text-3); }
.ret-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--indigo-50);
  color: var(--indigo-600);
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--indigo-100);
  margin-top: 2px;
}
.ret-sel-all {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--indigo-500);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--r-md);
  transition: background var(--t-base);
}
.ret-sel-all:hover { background: var(--indigo-50); }

.ret-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.ret-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r-lg);
  border: 1.5px solid var(--color-border);
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color var(--t-base), background var(--t-base);
}
.ret-item.is-selected {
  border-color: var(--indigo-300);
  background: var(--indigo-50);
}
.ret-item__chk { accent-color: var(--indigo-500); width: 15px; height: 15px; flex-shrink: 0; cursor: pointer; }
.ret-item__info { flex: 1; min-width: 0; }
.ret-item__name { font-size: 13px; font-weight: 600; color: var(--color-text); display: block; }
.ret-item__detail { font-size: 11.5px; color: var(--color-text-3); display: block; margin-top: 1px; }
.ret-item__total { font-size: 13px; font-weight: 700; color: var(--color-text); white-space: nowrap; }

.ret-label { display: block; font-size: 12px; font-weight: 600; color: var(--color-text-3); margin-bottom: 6px; }
.ret-reason__inp {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  font-size: 13.5px;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  font-family: inherit;
  transition: border-color var(--t-base);
}
.ret-reason__inp:focus { border-color: var(--indigo-400); }
.ret-reason { margin-bottom: 14px; }

.ret-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: var(--r-lg);
  background: rgba(16,185,129,0.06);
  border: 1px solid rgba(16,185,129,0.2);
  margin-bottom: 14px;
  font-size: 13px;
  color: var(--color-text-2);
}
.ret-total strong { font-size: 16px; font-weight: 800; color: var(--emerald-600); }

.btn-confirm {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--emerald-500), #059669);
  color: white;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity var(--t-base), box-shadow var(--t-base);
  box-shadow: 0 4px 16px rgba(16,185,129,0.3);
}
.btn-confirm:hover:not(:disabled) { opacity: 0.9; box-shadow: 0 6px 20px rgba(16,185,129,0.35); }
.btn-confirm:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
</style>
