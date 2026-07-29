<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sidebar      from '@/components/Sidebar.vue'
import Header       from '@/components/Header.vue'
import BottomNav    from '@/components/BottomNav.vue'
import GlobalSearch from '@/components/GlobalSearch.vue'
import AppIcon      from '@/components/AppIcon.vue'
import { useI18n } from '@/i18n/index.js'
import { isLoggedIn, logout, refreshMe } from '@/composables/useAuth.js'
import { toast } from '@/composables/useToast.js'

const { t } = useI18n()
const route  = useRoute()
const router = useRouter()

// Ruxsatlar o'zgargan bo'lsa qayta login talab qilinmasin
onMounted(refreshMe)

const isFullscreen = computed(() => !!route.meta?.fullscreen)

const pageTitle = computed(() => {
  const key = route.meta?.title
  return key ? t(key) : ''
})

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<template>
  <!-- Not logged in → just show Login page (router handles redirect) -->
  <RouterView v-if="!isLoggedIn" />

  <!-- Logged in → layout + page -->
  <div v-else class="app">
    <transition name="sidebar-slide">
      <Sidebar v-if="!isFullscreen" @logout="handleLogout" />
    </transition>

    <div class="app__main" :class="isFullscreen && 'app__main--full'">
      <Header v-if="!isFullscreen" :title="pageTitle" class="app__header-desktop" />

      <main class="app__content" :class="{ 'app__content--has-bn': !isFullscreen }">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </RouterView>
      </main>
    </div>

    <!-- Always rendered (CSS-gated to ≤768px); fullscreen pages (e.g. Sales) account for
         its height themselves so it can coexist with their own mobile bottom bars. -->
    <BottomNav class="app__bottom-nav" />

    <!-- Global tezkor qidiruv (Ctrl/Cmd+K) -->
    <GlobalSearch />
  </div>

  <!-- Global toast (session expiry, etc.) -->
  <transition name="toast">
    <div v-if="toast" class="g-toast" :class="`g-toast--${toast.type}`">
      <AppIcon :name="toast.type === 'ok' ? 'check-circle' : toast.type === 'hold' ? 'pause-circle' : 'alert-circle'" :size="18"/>
      {{ toast.message }}
    </div>
  </transition>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.app__main--full {
  height: 100vh;
}

.app__content {
  flex: 1;
  overflow-y: auto;
}

/* ── Mobile layout (≤768px) ──────────────────────── */
.app__bottom-nav { display: none; }

@media (max-width: 768px) {
  .app :deep(.sb) { display: none; }
  .app__header-desktop { display: none; }
  .app__bottom-nav { display: flex; }
  .app__content--has-bn { padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
}

.sidebar-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.sidebar-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }

/* ── Global toast ───────────────────────────────── */
.g-toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  color: white;
  padding: 12px 28px;
  border-radius: 99px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  white-space: nowrap;
  max-width: 520px;
  pointer-events: none;
}
.g-toast--ok   { background: #10b981; box-shadow: 0 6px 24px rgba(16,185,129,.35); }
.g-toast--err  { background: #ef4444; box-shadow: 0 6px 24px rgba(239,68,68,.35); }
.g-toast--hold { background: #f59e0b; box-shadow: 0 6px 24px rgba(245,158,11,.35); }

.toast-enter-active, .toast-leave-active { transition: all .25s; }
.toast-enter-from,   .toast-leave-to      { opacity: 0; transform: translateX(-50%) translateY(-12px); }
</style>
