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
import { ref } from 'vue'
import {
  pushSupported, pushPermission, pushSubscribed,
  checkPushStatus, enablePush,
} from '@/composables/usePushNotifications.js'

const { t } = useI18n()
const route  = useRoute()
const router = useRouter()

// Ruxsatlar o'zgargan bo'lsa qayta login talab qilinmasin
onMounted(refreshMe)

// ── Push-bildirishnoma taklifi (login qilingandan keyin, bir marta so'raladi) ──
const PROMPT_DISMISSED_KEY = 'push_prompt_dismissed'
const showPushPrompt = ref(false)
onMounted(async () => {
  if (!isLoggedIn.value) return
  await checkPushStatus()
  const dismissed = localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true'
  showPushPrompt.value = pushSupported.value && pushPermission.value === 'default' && !pushSubscribed.value && !dismissed
})
async function acceptPush() {
  const ok = await enablePush()
  if (ok) showPushPrompt.value = false
}
function dismissPush() {
  showPushPrompt.value = false
  localStorage.setItem(PROMPT_DISMISSED_KEY, 'true')
}

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

    <!-- Fullscreen sahifalar (masalan Sotuv) o'zining mobil pastki menyusiga ega,
         shuning uchun umumiy BottomNav u yerda butunlay yashiriladi. -->
    <BottomNav v-if="!isFullscreen" class="app__bottom-nav" />

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

  <!-- Push-bildirishnoma taklifi -->
  <transition name="toast">
    <div v-if="showPushPrompt" class="push-prompt">
      <div class="push-prompt__ico"><AppIcon name="bell" :size="18"/></div>
      <div class="push-prompt__body">
        <p class="push-prompt__title">Kunlik xush kelibsiz xabarini olasizmi?</p>
        <p class="push-prompt__sub">Har kuni ertalab Sellz'dan iliq xabar keladi</p>
      </div>
      <button class="push-prompt__btn push-prompt__btn--ok" @click="acceptPush">Yoqish</button>
      <button class="push-prompt__btn push-prompt__btn--x" @click="dismissPush">
        <AppIcon name="x" :size="14"/>
      </button>
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

/* ── Push-bildirishnoma taklifi ────────────────────── */
.push-prompt {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 9998;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 420px;
  width: calc(100% - 32px);
  padding: 14px 14px 14px 16px;
  border-radius: 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 12px 32px rgba(15,23,42,0.18);
}
.push-prompt__ico {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(99,102,241,0.12); color: #6366f1;
}
.push-prompt__body { flex: 1; min-width: 0; }
.push-prompt__title { font-size: 13px; font-weight: 700; color: var(--color-text, #1e293b); }
.push-prompt__sub { font-size: 11.5px; color: var(--color-text-3, #94a3b8); margin-top: 1px; }
.push-prompt__btn {
  flex-shrink: 0; border-radius: 10px; font-family: inherit; cursor: pointer;
  transition: opacity 0.15s ease;
}
.push-prompt__btn--ok {
  height: 34px; padding: 0 14px; font-size: 12.5px; font-weight: 700;
  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
}
.push-prompt__btn--ok:hover { opacity: 0.9; }
.push-prompt__btn--x {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  color: var(--color-text-3, #94a3b8);
}
.push-prompt__btn--x:hover { background: var(--slate-100, #f1f5f9); }
</style>
