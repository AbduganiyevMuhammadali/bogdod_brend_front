<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { useI18n, languages } from '@/i18n/index.js'
import { openSearch } from '@/composables/useGlobalSearch.js'
import { useAuth, logout } from '@/composables/useAuth.js'

defineProps({ title: { type: String, default: '' } })

const { locale, t, setLocale } = useI18n()
const { me } = useAuth()
const router = useRouter()

// Joriy foydalanuvchi
const displayName = computed(() => {
  const n = [me.value?.name, me.value?.surname].filter(Boolean).join(' ').trim()
  return n || me.value?.login || 'Foydalanuvchi'
})
const initials = computed(() =>
  displayName.value.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
)
const roleLabel = computed(() => (me.value?.role === 'admin' ? 'Administrator' : 'Operator'))

function signOut() {
  logout()
  router.push('/login')
}

const now            = ref(new Date())
const profileOpen    = ref(false)
const langOpen       = ref(false)
let timer

onMounted(() => {
  timer = setInterval(() => { now.value = new Date() }, 1000)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('click', onDocClick)
})

function onDocClick(e) {
  if (!e.target.closest('.profile-btn')) profileOpen.value = false
  if (!e.target.closest('.lang-btn'))    langOpen.value    = false
}

const time = () => now.value.toLocaleTimeString('en-US', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const date = () => now.value.toLocaleDateString('en-US', {
  weekday: 'short', month: 'short', day: 'numeric',
})

const currentLang = () => languages.find(l => l.code === locale.value) ?? languages[0]

function chooseLang(code) {
  setLocale(code)
  langOpen.value = false
}
</script>

<template>
  <header class="hdr">
    <!-- Left: breadcrumb -->
    <div class="hdr__left">
      <div class="breadcrumb">
        <span class="breadcrumb__root">POS</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span class="breadcrumb__page">{{ title }}</span>
      </div>
    </div>

    <!-- Center: search -->
    <div class="hdr__search">
      <div class="search" @click="openSearch()">
        <AppIcon name="search" :size="14" class="search__ico" />
        <input
          type="text"
          :placeholder="t('header.search')"
          class="search__inp"
          readonly
          @focus="openSearch(); $event.target.blur()"
        />
        <kbd class="search__kbd">⌘K</kbd>
      </div>
    </div>

    <!-- Right: clock + lang + notif + profile -->
    <div class="hdr__right">
      <!-- Clock -->
      <div class="clock">
        <AppIcon name="calendar" :size="13" />
        <span class="clock__date">{{ date() }}</span>
        <span class="clock__sep" />
        <span class="clock__time">{{ time() }}</span>
      </div>

      <!-- Language switcher -->
      <div class="lang-btn" @click.stop="langOpen = !langOpen">
        <span class="lang-btn__flag">{{ currentLang().flag }}</span>
        <span class="lang-btn__code">{{ currentLang().code.toUpperCase() }}</span>
        <AppIcon name="chevron-down" :size="12" class="lang-btn__chev" :class="{ rotated: langOpen }" />

        <transition name="dd">
          <div v-if="langOpen" class="lang-drop" @click.stop>
            <p class="lang-drop__label">Tilni tanlang</p>
            <button
              v-for="lang in languages"
              :key="lang.code"
              class="lang-item"
              :class="{ 'is-active': locale === lang.code }"
              @click="chooseLang(lang.code)"
            >
              <span class="lang-item__flag">{{ lang.flag }}</span>
              <span class="lang-item__label">{{ lang.label }}</span>
              <AppIcon v-if="locale === lang.code" name="check" :size="13" class="lang-item__check" />
            </button>
          </div>
        </transition>
      </div>

      <!-- Notifications -->
      <button class="ico-btn">
        <AppIcon name="bell" :size="16" />
        <span class="ico-btn__dot">3</span>
      </button>

      <!-- Profile -->
      <div class="profile-btn" @click.stop="profileOpen = !profileOpen">
        <div class="profile-btn__av">{{ initials }}</div>
        <div class="profile-btn__info">
          <span class="profile-btn__name">{{ displayName }}</span>
          <span class="profile-btn__role">{{ roleLabel }}</span>
        </div>
        <AppIcon name="chevron-down" :size="13" class="profile-btn__chev" :class="{ rotated: profileOpen }" />

        <transition name="dd">
          <div v-if="profileOpen" class="profile-drop" @click.stop>
            <div class="profile-drop__hero">
              <div class="profile-drop__av">{{ initials }}</div>
              <div>
                <p class="profile-drop__name">{{ displayName }}</p>
                <p class="profile-drop__email">{{ me?.email || '@' + (me?.login || '') }}</p>
              </div>
            </div>
            <div class="drop-hr" />
            <div class="drop-body">
              <button class="drop-item">
                <AppIcon name="user" :size="14" />
                {{ t('user.profile') }}
              </button>
              <button class="drop-item">
                <AppIcon name="settings" :size="14" />
                {{ t('nav.settings') }}
              </button>
              <button class="drop-item">
                <AppIcon name="bell" :size="14" />
                {{ t('user.notif') }}
              </button>
            </div>
            <div class="drop-hr" />
            <div class="drop-body">
              <button class="drop-item drop-item--danger" @click="signOut">
                <AppIcon name="log-out" :size="14" />
                {{ t('user.signOut') }}
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hdr {
  height: var(--header-h);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 22px;
  position: sticky;
  top: 0;
  z-index: 20;
  flex-shrink: 0;
}

/* Breadcrumb */
.hdr__left { display: flex; align-items: center; flex-shrink: 0; }
.breadcrumb { display: flex; align-items: center; gap: 5px; font-size: 13px; }
.breadcrumb svg { color: var(--color-text-3); }
.breadcrumb__root { color: var(--color-text-3); font-weight: 500; }
.breadcrumb__page { color: var(--color-text); font-weight: 600; }

/* Search */
.hdr__search { flex: 1; display: flex; justify-content: center; }
.search {
  position: relative;
  width: 100%;
  max-width: 400px;
  display: flex;
  align-items: center;
}
.search__ico {
  position: absolute;
  left: 11px;
  color: var(--color-text-3);
  pointer-events: none;
}
.search__inp {
  width: 100%;
  height: 36px;
  padding: 0 40px 0 33px;
  background: var(--slate-50);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  font-size: 13px;
  color: var(--color-text);
  outline: none;
  transition: border-color var(--t-base), box-shadow var(--t-base);
  font-family: inherit;
}
.search__inp::placeholder { color: var(--color-text-3); }
.search__inp:focus {
  border-color: var(--indigo-200, #c7d2fe);
  box-shadow: 0 0 0 3px rgba(99,102,241,0.08);
  background: #fff;
}
.search__kbd {
  position: absolute;
  right: 9px;
  padding: 2px 6px;
  border: 1px solid var(--color-border);
  border-radius: 5px;
  font-size: 10.5px;
  color: var(--color-text-3);
  background: #fff;
  font-family: inherit;
}

/* Right row */
.hdr__right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Clock */
.clock {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  background: var(--slate-50);
  border: 1px solid var(--color-border);
  border-radius: 99px;
  font-size: 12px;
  color: var(--color-text-2);
  white-space: nowrap;
}
.clock__date { color: var(--color-text-3); }
.clock__sep  { width: 1px; height: 11px; background: var(--color-border); }
.clock__time { font-weight: 600; color: var(--color-text); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

/* Language switcher */
.lang-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  background: var(--color-surface);
  cursor: pointer;
  transition: background var(--t-base);
  user-select: none;
}
.lang-btn:hover { background: var(--slate-50); }
.lang-btn__flag { font-size: 15px; line-height: 1; }
.lang-btn__code { font-size: 11.5px; font-weight: 700; color: var(--color-text); letter-spacing: 0.03em; }
.lang-btn__chev { color: var(--color-text-3); transition: transform var(--t-base); }
.lang-btn__chev.rotated { transform: rotate(180deg); }

.lang-drop {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  width: 190px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  z-index: 110;
  padding: 8px;
  overflow: hidden;
}
.lang-drop__label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-3);
  padding: 4px 8px 6px;
}
.lang-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  font-size: 13.5px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--t-base);
  text-align: left;
}
.lang-item:hover  { background: var(--slate-50); }
.lang-item.is-active { background: var(--indigo-50); color: var(--indigo-700); font-weight: 600; }
.lang-item__flag  { font-size: 16px; line-height: 1; flex-shrink: 0; }
.lang-item__label { flex: 1; }
.lang-item__check { color: var(--indigo-500); flex-shrink: 0; }

/* Icon button */
.ico-btn {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-md);
  color: var(--color-text-2);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  transition: background var(--t-base), color var(--t-base);
  cursor: pointer;
}
.ico-btn:hover { background: var(--slate-50); color: var(--color-text); }
.ico-btn__dot {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 99px;
  background: var(--rose-500);
  color: white;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--color-surface);
}

/* Profile button */
.profile-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px 4px 5px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  background: var(--color-surface);
  cursor: pointer;
  position: relative;
  transition: background var(--t-base);
}
.profile-btn:hover { background: var(--slate-50); }
.profile-btn__av {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--indigo-400), var(--violet-500));
  color: white;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.profile-btn__info { display: flex; flex-direction: column; line-height: 1.2; }
.profile-btn__name { font-size: 12.5px; font-weight: 600; color: var(--color-text); }
.profile-btn__role { font-size: 10.5px; color: var(--color-text-3); }
.profile-btn__chev { color: var(--color-text-3); transition: transform var(--t-base); }
.profile-btn__chev.rotated { transform: rotate(180deg); }

/* Profile dropdown */
.profile-drop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 230px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  z-index: 110;
  overflow: hidden;
}
.profile-drop__hero {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 12px;
}
.profile-drop__av {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--indigo-400), var(--violet-500));
  color: white;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.profile-drop__name  { font-size: 13.5px; font-weight: 600; color: var(--color-text); }
.profile-drop__email { font-size: 11.5px; color: var(--color-text-3); margin-top: 2px; }
.drop-hr   { height: 1px; background: var(--color-border); }
.drop-body { padding: 6px; }
.drop-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  font-size: 13.5px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--t-base);
  text-align: left;
}
.drop-item:hover { background: var(--slate-50); }
.drop-item--danger { color: var(--rose-600); }
.drop-item--danger:hover { background: var(--rose-50); }

/* Dropdown transition */
.dd-enter-active { transition: opacity 0.14s ease, transform 0.18s var(--ease-spring); }
.dd-leave-active { transition: opacity 0.1s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-7px) scale(0.97); }
</style>
