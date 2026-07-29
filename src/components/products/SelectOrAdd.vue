<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  modelValue:  { type: String, default: '' },
  options:     { type: Array,  default: () => [] },
  placeholder: { type: String, default: 'Tanlang...' },
})
const emit = defineEmits(['update:modelValue'])

const open      = ref(false)
const search    = ref('')
const rootEl    = ref(null)
const searchEl  = ref(null)
const localOpts = ref([...props.options])

// Sync when parent updates options (e.g. after async load)
watch(() => props.options, (newOpts) => {
  newOpts.forEach(o => {
    if (!localOpts.value.includes(o)) localOpts.value.push(o)
  })
}, { deep: true })

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return localOpts.value
  return localOpts.value.filter(o => o.toLowerCase().includes(q))
})

const canAdd = computed(() => {
  const q = search.value.trim()
  return q.length > 0 && !localOpts.value.some(o => o.toLowerCase() === q.toLowerCase())
})

async function toggle() {
  open.value = !open.value
  if (open.value) {
    search.value = ''
    await nextTick()
    searchEl.value?.focus()
  }
}

function pick(opt) {
  emit('update:modelValue', opt)
  open.value = false
  search.value = ''
}

function addNew() {
  const v = search.value.trim()
  if (!v) return
  localOpts.value.push(v)
  pick(v)
}

function clear(e) {
  e.stopPropagation()
  emit('update:modelValue', '')
}

function onOutside(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    open.value = false
    search.value = ''
  }
}

onMounted(() => document.addEventListener('mousedown', onOutside))
onUnmounted(() => document.removeEventListener('mousedown', onOutside))
</script>

<template>
  <div ref="rootEl" class="soa">
    <!-- Trigger -->
    <button
      type="button"
      class="soa__trigger"
      :class="{ 'has-val': modelValue, 'is-open': open }"
      @click="toggle"
    >
      <span class="soa__val">{{ modelValue || placeholder }}</span>
      <span class="soa__icons">
        <span v-if="modelValue" class="soa__clr" @click="clear">
          <AppIcon name="x" :size="10" :stroke-width="3" />
        </span>
        <AppIcon name="chevron-down" :size="13" class="soa__arrow" :class="{ up: open }" />
      </span>
    </button>

    <!-- Dropdown -->
    <div v-if="open" class="soa__drop">
      <div class="soa__search-row">
        <AppIcon name="search" :size="12" class="soa__search-ico" />
        <input
          ref="searchEl"
          v-model="search"
          class="soa__search-inp"
          placeholder="Qidirish yoki qo'shish..."
          @keyup.enter="canAdd ? addNew() : (filtered[0] && pick(filtered[0]))"
        />
      </div>

      <div class="soa__list">
        <button
          v-for="opt in filtered"
          :key="opt"
          type="button"
          class="soa__opt"
          :class="{ 'is-sel': modelValue === opt }"
          @click="pick(opt)"
        >
          <span class="soa__opt-check">
            <AppIcon v-if="modelValue === opt" name="check" :size="11" :stroke-width="2.5" />
          </span>
          {{ opt }}
        </button>

        <p v-if="filtered.length === 0 && !canAdd" class="soa__none">
          Topilmadi
        </p>
      </div>

      <button v-if="canAdd" type="button" class="soa__add-btn" @click="addNew">
        <AppIcon name="plus" :size="13" :stroke-width="2.5" />
        "{{ search.trim() }}" ni qo'shish
      </button>
    </div>
  </div>
</template>

<style scoped>
.soa { position: relative; width: 100%; }

/* Trigger */
.soa__trigger {
  width: 100%;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px 0 12px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  background: var(--color-surface);
  cursor: pointer;
  font-family: inherit;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.soa__trigger:hover    { border-color: var(--indigo-300); }
.soa__trigger.is-open  { border-color: var(--indigo-400); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

.soa__val {
  flex: 1;
  text-align: left;
  font-size: 13.5px;
  color: var(--color-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.soa__trigger.has-val .soa__val { color: var(--color-text); font-weight: 500; }

.soa__icons { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.soa__clr {
  width: 16px; height: 16px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-3);
  transition: background var(--t-fast), color var(--t-fast);
}
.soa__clr:hover { background: var(--slate-200); color: var(--color-text); }
.soa__arrow { color: var(--color-text-3); transition: transform 0.2s ease; }
.soa__arrow.up { transform: rotate(180deg); }

/* Dropdown */
.soa__drop {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  right: 0;
  z-index: 300;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-xl);
  box-shadow: 0 10px 36px rgba(0,0,0,0.14);
  overflow: hidden;
  animation: drop-in 0.14s ease;
}
@keyframes drop-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}

.soa__search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--color-border);
}
.soa__search-ico { color: var(--color-text-3); flex-shrink: 0; }
.soa__search-inp {
  flex: 1;
  font-size: 13px;
  color: var(--color-text);
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
}
.soa__search-inp::placeholder { color: var(--color-text-3); }

.soa__list { max-height: 190px; overflow-y: auto; padding: 4px; }

.soa__opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  font-size: 13px;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
  transition: background var(--t-fast);
}
.soa__opt:hover { background: var(--slate-100); }
.soa__opt.is-sel { background: var(--indigo-50); color: var(--indigo-600); font-weight: 600; }
.soa__opt-check { width: 16px; flex-shrink: 0; color: var(--indigo-500); display: flex; }

.soa__none { padding: 14px; font-size: 13px; color: var(--color-text-3); text-align: center; }

.soa__add-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--indigo-500);
  background: transparent;
  cursor: pointer;
  transition: background var(--t-base);
  text-align: left;
  font-family: inherit;
}
.soa__add-btn:hover { background: var(--indigo-50); }
</style>
