<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'
import { productsApi } from '@/api/products.js'
import { useAuth } from '@/composables/useAuth.js'
import { canView } from '@/composables/usePerms.js'

const emit = defineEmits(['logout'])
const { t } = useI18n()
const route  = useRoute()
const router = useRouter()
const { me } = useAuth()

function isActive(key) { return route.path === '/' + key }
function go(key)       { router.push('/' + key) }

// Joriy foydalanuvchi (real ism, rol, bosh harflar)
const displayName = computed(() => {
  const n = [me.value?.name, me.value?.surname].filter(Boolean).join(' ').trim()
  return n || me.value?.login || 'Foydalanuvchi'
})
const initials = computed(() =>
  displayName.value.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
)
const roleLabel = computed(() => (me.value?.role === 'admin' ? 'Administrator' : 'Operator'))

// Faqat "ko'rish" ruxsati bor bo'limlar; bo'sh qolgan guruh butunlay yashiriladi
const visibleGroups = computed(() =>
  navGroups
    .map(g => ({ ...g, items: g.items.filter(i => canView(i.key)) }))
    .filter(g => g.items.length)
)

// Kam qolgan tovarlar soni — Mahsulotlar bandida ogohlantirish badge
const lowStock = ref(0)
onMounted(async () => {
  try { lowStock.value = await productsApi.getLowStockCount() } catch { /* jim */ }
})
function badgeFor(item) {
  if (item.key === 'products' && lowStock.value > 0) return lowStock.value
  return item.badge
}

const navGroups = [
  {
    label: 'Asosiy',
    items: [
      { key: 'dashboard', label: 'Bosh sahifa', icon: 'home',          color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
      { key: 'sales',     label: 'Sotuvlar',    icon: 'shopping-cart', color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
      { key: 'payments',  label: 'Kassa',       icon: 'layers',        color: '#fbbf24', bg: 'rgba(251,191,36,0.14)'  },
    ],
  },
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
      { key: 'products',   label: 'Mahsulotlar',   icon: 'package',    color: '#38bdf8', bg: 'rgba(56,189,248,0.14)'  },
      { key: 'partners',   label: 'Mijozlar',      icon: 'users',      color: '#38bdf8', bg: 'rgba(56,189,248,0.14)'  },
      { key: 'suppliers',  label: 'Yetkazuvchilar', icon: 'truck',      color: '#fb923c', bg: 'rgba(251,146,60,0.14)'  },
    ],
  },
  {
    label: 'Tahlil',
    items: [
      { key: 'reports', label: 'Hisobotlar', icon: 'bar-chart-2', color: '#c084fc', bg: 'rgba(192,132,252,0.14)' },
    ],
  },
  {
    label: 'Tizim',
    items: [
      { key: 'users', label: 'Foydalanuvchilar', icon: 'user-check', color: '#34d399', bg: 'rgba(52,211,153,0.14)' },
    ],
  },
]
</script>

<template>
  <aside class="sb">

    <!-- ── Logo ───────────────────────────────────────────── -->
    <div class="sb__logo">
      <img src="@/assets/logo.png" alt="Sellz" class="sb__logo-img"/>
    </div>

    <!-- ── Nav (faqat ko'rish ruxsati bor bo'limlar) ───────── -->
    <nav class="sb__nav">
      <div v-for="group in visibleGroups" :key="group.label" class="sb__group">
        <p class="sb__group-lbl">{{ group.label }}</p>
        <ul>
          <li v-for="item in group.items" :key="item.key">
            <button
              class="sb__item"
              :class="{ 'is-active': isActive(item.key) }"
              :style="isActive(item.key) ? { '--item-color': item.color, '--item-bg': item.bg } : {}"
              @click="go(item.key)"
            >
              <span class="sb__item-ico" :class="{ 'is-active': isActive(item.key) }">
                <AppIcon :name="item.icon" :size="16" :stroke-width="isActive(item.key) ? 2.2 : 1.75"/>
              </span>
              <span class="sb__item-lbl">{{ item.label }}</span>
              <span v-if="badgeFor(item)" class="sb__item-badge" :class="item.key === 'products' && 'sb__item-badge--warn'">{{ badgeFor(item) }}</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>

    <!-- ── Footer ─────────────────────────────────────────── -->
    <div class="sb__footer">
      <!-- Settings (faqat ruxsat bo'lsa) -->
      <button
        v-if="canView('settings')"
        class="sb__item sb__item--settings"
        :class="{ 'is-active': isActive('settings') }"
        :style="isActive('settings') ? { '--item-color': '#818cf8', '--item-bg': 'rgba(129,140,248,0.15)' } : {}"
        @click="go('settings')"
      >
        <span class="sb__item-ico" :class="{ 'is-active': isActive('settings') }">
          <AppIcon name="settings" :size="16" :stroke-width="1.75" />
        </span>
        <span class="sb__item-lbl">{{ t('nav.settings') }}</span>
      </button>

      <!-- User row (joriy foydalanuvchi) -->
      <div class="sb__user">
        <div class="sb__user-av-wrap">
          <div class="sb__user-av">{{ initials }}</div>
          <span class="sb__user-dot" />
        </div>
        <div class="sb__user-info">
          <p class="sb__user-name">{{ displayName }}</p>
          <p class="sb__user-role">{{ roleLabel }}</p>
        </div>
        <button class="sb__user-out" :title="t('user.signOut')" @click="emit('logout')">
          <AppIcon name="log-out" :size="14" :stroke-width="1.75" />
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* ── Shell ──────────────────────────────────────── */
.sb {
  width: 256px;
  height: 100vh;
  background: linear-gradient(175deg, #1e1b4b 0%, #1a1740 60%, #16143a 100%);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  overflow: hidden;
  border-right: 1px solid rgba(99,102,241,0.12);
}
/* ── Logo ───────────────────────────────────────── */
.sb__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 20px 14px;
  border-bottom: 1px solid rgba(99,102,241,0.12);
  flex-shrink: 0;
}

.sb__logo-img {
  width: 100%;
  max-width: 130px;
  margin-top: 20px;
  height: auto;
  object-fit: contain;
  display: block;
  margin-left: -80px;
  /* Logoning ichki oq fill sidebar da ko'rinmasin */
  mix-blend-mode: screen;
  filter: brightness(1.08);
}

/* ── Nav ────────────────────────────────────────── */
.sb__nav {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: none;
}
.sb__nav::-webkit-scrollbar { display: none; }

.sb__group { display: flex; flex-direction: column; gap: 1px; }

.sb__group-lbl {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(148,163,184,0.35);
  padding: 6px 10px 4px;
  margin-top: 4px;
}

/* ── Nav item ───────────────────────────────────── */
.sb__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(148,163,184,0.7);
  transition: background 0.16s ease, color 0.16s ease;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.sb__item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--item-color, transparent);
  opacity: 0;
  transition: opacity 0.16s ease;
}

.sb__item:hover {
  background: rgba(255,255,255,0.04);
  color: #e2e8f0;
}

.sb__item.is-active {
  background: var(--item-bg);
  color: #f8fafc;
  font-weight: 600;
}
.sb__item.is-active::before { opacity: 1; }

/* ── Icon ───────────────────────────────────────── */
.sb__item-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.16s ease, color 0.16s ease;
  color: rgba(148,163,184,0.5);
}

.sb__item:hover .sb__item-ico { color: rgba(226,232,240,0.8); }

.sb__item-ico.is-active {
  background: rgba(255,255,255,0.08);
  color: var(--item-color);
}

.sb__item-lbl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.sb__item-badge {
  margin-left: auto;
  background: #6366f1;
  color: white;
  font-size: 9.5px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 99px;
  flex-shrink: 0;
}
.sb__item-badge--warn { background: #ef4444; animation: sb-badge-pulse 2s ease-in-out infinite; }
@keyframes sb-badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
  50%      { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
}

/* ── Footer ─────────────────────────────────────── */
.sb__footer {
  padding: 8px 10px 14px;
  border-top: 1px solid rgba(99,102,241,0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}

.sb__item--settings { margin-bottom: 2px; }

/* ── User card ──────────────────────────────────── */
.sb__user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 10px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(99,102,241,0.15);
  margin-top: 4px;
}

.sb__user-av-wrap { position: relative; flex-shrink: 0; }

.sb__user-av {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.35);
}

.sb__user-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  border: 1.5px solid #1e1b4b;
}

.sb__user-info { flex: 1; min-width: 0; }

.sb__user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.sb__user-role { font-size: 10.5px; color: rgba(148,163,184,0.5); margin-top: 1px; }

.sb__user-out {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: rgba(148,163,184,0.4);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
  flex-shrink: 0;
}
.sb__user-out:hover { background: rgba(244,63,94,0.15); color: #f87171; }
</style>
