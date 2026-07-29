<script setup>
import AppIcon from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'

defineProps({
  columns:      { type: Array,   required: true },
  rows:         { type: Array,   default: () => [] },
  loading:      { type: Boolean, default: false },
  emptyTextKey: { type: String,  default: 'table.noResults' },
  skeletonRows: { type: Number,  default: 5 },
})

const { t } = useI18n()
</script>

<template>
  <div class="table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="{ width: col.width, textAlign: col.align || 'left' }"
          >
            {{ t(col.labelKey ?? col.label ?? col.key) }}
          </th>
        </tr>
      </thead>
      <tbody>

        <template v-if="loading">
          <tr v-for="n in skeletonRows" :key="`sk-${n}`" class="sk-row">
            <td v-for="col in columns" :key="col.key">
              <div class="skeleton" :style="{ height: '12px', width: col.key === 'status' ? '64px' : col.key === 'id' ? '56px' : '75%' }" />
            </td>
          </tr>
        </template>

        <template v-else-if="rows.length === 0">
          <tr>
            <td :colspan="columns.length" class="empty-td">
              <div class="empty">
                <div class="empty__ring">
                  <AppIcon name="filter" :size="20" :stroke-width="1.4" />
                </div>
                <p class="empty__title">{{ t('table.noResults') }}</p>
                <p class="empty__sub">{{ t(emptyTextKey) }}</p>
              </div>
            </td>
          </tr>
        </template>

        <template v-else>
          <tr v-for="(row, i) in rows" :key="i" class="data-row">
            <td v-for="col in columns" :key="col.key" :style="{ textAlign: col.align || 'left' }">
              <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] }}
              </slot>
            </td>
          </tr>
        </template>

      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll { width: 100%; overflow-x: auto; }

.table { width: 100%; border-collapse: collapse; font-size: 13.5px; }

thead th {
  padding: 0 18px 10px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-3);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

tbody td {
  padding: 11px 18px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border-sub);
  vertical-align: middle;
}

.data-row { transition: background var(--t-fast); }
.data-row:hover { background: var(--slate-50); }
.data-row:last-child td { border-bottom: none; }

.sk-row td { padding: 13px 18px; border-bottom: 1px solid var(--color-border-sub); }
.sk-row:last-child td { border-bottom: none; }

.empty-td { border-bottom: none !important; padding: 52px 18px !important; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 7px;
}

.empty__ring {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: var(--slate-100);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  margin-bottom: 4px;
}

.empty__title { font-size: 14px; font-weight: 600; color: var(--color-text); }
.empty__sub   { font-size: 12.5px; color: var(--color-text-3); }
</style>
