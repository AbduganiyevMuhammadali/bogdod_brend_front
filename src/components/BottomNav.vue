<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { openSearch } from '@/composables/useGlobalSearch.js'
import { canView } from '@/composables/usePerms.js'

const route  = useRoute()
const router = useRouter()

// Asosiy panelda DOIM shu 4 tasi (ruxsat bo'lsa) — qolgan hammasi "Ko'proq" ostida.
const allItems = [
  { key: 'dashboard', label: 'Bosh sahifa', icon: 'home' },
  { key: 'sales',     label: 'Sotuv',        icon: 'shopping-cart' },
  { key: 'payments',  label: 'Kassa',        icon: 'layers' },
  { key: 'reports',   label: 'Hisobot',      icon: 'bar-chart-2' },
]
const items = computed(() => allItems.filter(i => canView(i.key)))

const allMoreGroups = [
  {
    label: 'Hujjatlar',
    items: [
      { key: 'purchases', label: 'Xarid (Kirim)',    icon: 'download',   color: '#34d399', bg: 'rgba(52,211,153,0.14)'  },
      { key: 'partiya',   label: 'Partiyalar (Lot)', icon: 'archive',    color: '#34d399', bg: 'rgba(52,211,153,0.14)'  },
      { key: 'returns',   label: 'Qaytarishlar',     icon: 'rotate-ccw', color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { key: 'products',  label: 'Mahsulotlar',   icon: 'package', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' },
      { key: 'partners',  label: 'Mijozlar',      icon: 'users',   color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' },
      { key: 'suppliers', label: 'Yetkazuvchilar', icon: 'truck',   color: '#fb923c', bg: 'rgba(251,146,60,0.14)' },
    ],
  },
  {
    label: 'Tizim',
    items: [
      { key: 'users',    label: 'Foydalanuvchilar', icon: 'user-check', color: '#34d399', bg: 'rgba(52,211,153,0.14)' },
      { key: 'settings', label: 'Sozlamalar',       icon: 'settings',   color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
    ],
  },
]
const moreGroups = computed(() =>
  allMoreGroups
    .map(g => ({ ...g, items: g.items.filter(i => canView(i.key)) }))
    .filter(g => g.items.length)
)

const moreKeys = allMoreGroups.flatMap(g => g.items.map(i => i.key))
const showMore = ref(false)

function isActive(key) { return route.path === '/' + key && !route.query.mode }
const isMoreActive = computed(() => moreKeys.includes(route.path.slice(1)))

function go(key) {
  router.push('/' + key)
  showMore.value = false
}
</script>

<template>
  <nav class="bn">
    <button
      v-for="item in items"
      :key="item.key"
      class="bn__item"
      :class="{ 'is-active': isActive(item.key) }"
      @click="go(item.key)"
    >
      <span class="bn__ico-wrap">
        <span class="bn__ico"><AppIcon :name="item.icon" :size="20" :stroke-width="isActive(item.key) ? 2.3 : 1.9"/></span>
      </span>
      <span class="bn__lbl">{{ item.label }}</span>
    </button>

    <button
      v-if="moreGroups.length"
      class="bn__item"
      :class="{ 'is-active': isMoreActive }"
      @click="showMore = true"
    >
      <span class="bn__ico-wrap">
        <span class="bn__ico"><AppIcon name="more-horizontal" :size="20" :stroke-width="isMoreActive ? 2.3 : 1.9"/></span>
      </span>
      <span class="bn__lbl">Ko'proq</span>
    </button>
  </nav>

  <Teleport to="body">
    <transition name="bn-backdrop">
      <div v-if="showMore" class="bn-more-backdrop" @click="showMore = false" />
    </transition>
    <transition name="bn-sheet">
      <div v-if="showMore" class="bn-more-sheet">
        <div class="bn-more-handle" />
        <button class="bn-more-search" @click="showMore = false; openSearch()">
          <AppIcon name="search" :size="16"/>
          <span>Qidiruv — mahsulot, mijoz, hujjat...</span>
        </button>
        <div class="bn-more-body">
          <div v-for="group in moreGroups" :key="group.label" class="bn-more-group">
            <p class="bn-more-lbl">{{ group.label }}</p>
            <button
              v-for="item in group.items"
              :key="item.key"
              class="bn-more-item"
              :class="{ 'is-active': isActive(item.key) }"
              :style="{ '--item-color': item.color, '--item-bg': item.bg }"
              @click="go(item.key)"
            >
              <span class="bn-more-item-ico"><AppIcon :name="item.icon" :size="18" :stroke-width="1.9"/></span>
              <span class="bn-more-item-lbl">{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
/* Mobil-only komponent: desktopda hech qachon ko'rinmaydi.
   Gating shu yerda — tashqi (App.vue) CSS tartibiga bog'liq emas. */
.bn { display: none; }

@media (max-width: 768px) {
  .bn { display: flex; }
}

.bn {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 200;
  align-items: stretch;
  overflow: hidden;
  background:
    linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)),
    linear-gradient(120deg, #eef2ff, #fdf2f8, #ecfeff, #eef2ff);
  background-size: 100% 100%, 300% 300%;
  animation: bn-bg-flow 14s ease-in-out infinite;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(15,23,42,0.08);
  box-shadow: 0 -8px 24px rgba(15,23,42,0.06);
  padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0px));
  height: calc(64px + env(safe-area-inset-bottom, 0px));
}
@keyframes bn-bg-flow {
  0%, 100% { background-position: 0 0, 0% 50%; }
  50%      { background-position: 0 0, 100% 50%; }
}
@media (prefers-color-scheme: dark) {
  .bn {
    background:
      linear-gradient(rgba(15,15,26,0.85), rgba(15,15,26,0.85)),
      linear-gradient(120deg, #1e1b4b, #2a1a3e, #142033, #1e1b4b);
    background-size: 100% 100%, 300% 300%;
  }
}

.bn__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  position: relative;
  color: var(--slate-400);
  font-family: inherit;
  transition: color 0.2s ease, transform 0.15s ease;
}
.bn__item:active { transform: scale(0.92); }

.bn__ico-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 26px;
  border-radius: 14px;
  transition: background 0.25s var(--ease-spring), color 0.25s ease;
}

.bn__ico { display: flex; align-items: center; justify-content: center; transition: transform 0.25s var(--ease-spring); }

.bn__lbl {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  transition: color 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
  transform: translateY(0);
}

.bn__item.is-active { color: var(--indigo-600); }
.bn__item.is-active .bn__ico-wrap {
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white;
  box-shadow: 0 4px 14px rgba(99,102,241,0.45);
}
.bn__item.is-active .bn__ico { color: white; transform: translateY(-1px); }
.bn__item.is-active .bn__lbl { font-weight: 800; }

/* tap ripple-ish pop */
.bn__item.is-active .bn__ico-wrap {
  animation: bn-pop 0.32s var(--ease-spring);
}
@keyframes bn-pop {
  0%   { transform: scale(0.8); }
  60%  { transform: scale(1.08); }
  100% { transform: scale(1); }
}

/* ── "Ko'proq" bottom sheet ─────────────────────── */
.bn-more-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(15,23,42,0.45);
  backdrop-filter: blur(2px);
}

.bn-more-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 301;
  max-height: 72vh;
  overflow-y: auto;
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -12px 32px rgba(15,23,42,0.18);
  padding: 10px 14px calc(14px + env(safe-area-inset-bottom, 0px));
}

.bn-more-handle {
  width: 40px;
  height: 4px;
  border-radius: 99px;
  background: rgba(15,23,42,0.14);
  margin: 0 auto 12px;
}

.bn-more-search {
  display: flex; align-items: center; gap: 10px;
  width: 100%; min-height: 46px; padding: 0 14px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: var(--slate-100, #f1f5f9);
  border: 1.5px solid var(--slate-200, #e2e8f0);
  color: var(--slate-400, #94a3b8);
  font-size: 13.5px; font-weight: 600; font-family: inherit;
  text-align: left; cursor: pointer;
  transition: transform 0.15s ease;
}
.bn-more-search:active { transform: scale(0.97); }

.bn-more-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bn-more-group { display: flex; flex-direction: column; gap: 4px; }

.bn-more-lbl {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--slate-400);
  padding: 0 6px 2px;
}

.bn-more-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 50px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  text-align: left;
  transition: background 0.15s ease, transform 0.15s ease;
}
.bn-more-item:active { transform: scale(0.97); background: rgba(15,23,42,0.04); }

.bn-more-item.is-active { background: var(--item-bg); color: var(--item-color); }

.bn-more-item-ico {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(15,23,42,0.05);
  color: inherit;
}
.bn-more-item.is-active .bn-more-item-ico { background: rgba(255,255,255,0.55); }

.bn-more-item-lbl { flex: 1; }

/* transitions */
.bn-backdrop-enter-active, .bn-backdrop-leave-active { transition: opacity 0.22s ease; }
.bn-backdrop-enter-from,   .bn-backdrop-leave-to      { opacity: 0; }

.bn-sheet-enter-active { transition: transform 0.32s var(--ease-spring); }
.bn-sheet-leave-active { transition: transform 0.22s ease; }
.bn-sheet-enter-from,   .bn-sheet-leave-to { transform: translateY(100%); }
</style>
