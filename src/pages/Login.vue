<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { login, logout } from '@/composables/useAuth.js'
import { firstAllowedPath } from '@/router/index.js'

const router   = useRouter()
const username = ref('')
const password = ref('')
const showPass = ref(false)
const loading  = ref(false)
const error    = ref('')

async function submit() {
  if (!username.value.trim() || !password.value) return
  loading.value = true
  error.value   = ''
  try {
    await login(username.value.trim(), password.value)
    const target = firstAllowedPath()
    if (!target) {
      logout()
      error.value = "Sizga hech qanday bo'lim ochilmagan. Administratorga murojaat qiling."
      return
    }
    router.push(target)
  } catch (e) {
    error.value = e.response?.data?.message ?? "Login yoki parol noto'g'ri"
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-bg">
    <!-- Background decoration -->
    <div class="login-bg__orb login-bg__orb--1"></div>
    <div class="login-bg__orb login-bg__orb--2"></div>

    <div class="login-card">

      <!-- Logo -->
      <div class="login-card__logo">
        <div class="login-card__logo-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="1.8"
                  stroke-opacity="0.75" stroke-linecap="round"/>
          </svg>
        </div>
        <div>
          <p class="login-card__brand">SellZ POS</p>
          <p class="login-card__brand-sub">Savdo boshqaruv tizimi</p>
        </div>
      </div>

      <!-- Heading -->
      <div class="login-card__hd">
        <h1 class="login-card__title">Xush kelibsiz</h1>
        <p class="login-card__sub">Davom etish uchun tizimga kiring</p>
      </div>

      <!-- Form -->
      <form class="login-form" @submit.prevent="submit">

        <div class="lf__field">
          <label class="lf__lbl">Login</label>
          <div class="lf__inp-wrap">
            <AppIcon name="user" :size="15" class="lf__ico" />
            <input
              v-model="username"
              type="text"
              class="lf__inp"
              placeholder="Username"
              autocomplete="username"
              :disabled="loading"
            />
          </div>
        </div>

        <div class="lf__field">
          <label class="lf__lbl">Parol</label>
          <div class="lf__inp-wrap">
            <AppIcon name="hash" :size="15" class="lf__ico" />
            <input
              v-model="password"
              :type="showPass ? 'text' : 'password'"
              class="lf__inp lf__inp--pass"
              placeholder="••••••••"
              autocomplete="current-password"
              :disabled="loading"
              @keyup.enter="submit"
            />
            <button type="button" class="lf__eye" @click="showPass = !showPass" tabindex="-1">
              <AppIcon :name="showPass ? 'eye' : 'eye'" :size="14" />
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="lf__err">
          <AppIcon name="alert-circle" :size="13" />
          {{ error }}
        </div>

        <button type="submit" class="lf__btn" :disabled="loading">
          <span v-if="loading" class="lf__spinner"></span>
          <AppIcon v-else name="log-in" :size="16" :stroke-width="2.2" />
          {{ loading ? 'Kirilmoqda...' : 'Kirish' }}
        </button>

      </form>

      <p class="login-card__hint">
        <AppIcon name="info" :size="12" /> Standart: <strong>Admin</strong> / <strong>123456</strong>
      </p>

    </div>
  </div>
</template>

<style scoped>
.login-bg {
  min-height: 100vh;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.login-bg__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
}
.login-bg__orb--1 {
  width: 400px; height: 400px;
  background: rgba(99,102,241,0.3);
  top: -100px; right: -100px;
}
.login-bg__orb--2 {
  width: 300px; height: 300px;
  background: rgba(139,92,246,0.25);
  bottom: -80px; left: -80px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255,255,255,0.97);
  border-radius: 24px;
  padding: 36px 32px 28px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  z-index: 1;
}

/* Logo */
.login-card__logo {
  display: flex;
  align-items: center;
  gap: 12px;
}
.login-card__logo-mark {
  width: 44px; height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(99,102,241,0.45);
}
.login-card__brand {
  font-size: 17px; font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.04em;
  line-height: 1.1;
}
.login-card__brand-sub {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

/* Heading */
.login-card__hd { display: flex; flex-direction: column; gap: 4px; }
.login-card__title {
  font-size: 22px; font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.04em;
}
.login-card__sub { font-size: 13px; color: #64748b; }

/* Form */
.login-form { display: flex; flex-direction: column; gap: 16px; }

.lf__field { display: flex; flex-direction: column; gap: 6px; }
.lf__lbl { font-size: 12.5px; font-weight: 600; color: #475569; }

.lf__inp-wrap { position: relative; display: flex; align-items: center; }
.lf__ico {
  position: absolute; left: 12px;
  color: #94a3b8; pointer-events: none;
}

.lf__inp {
  width: 100%; height: 44px;
  padding: 0 12px 0 36px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px; font-family: inherit;
  color: #0f172a;
  background: #f8fafc;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.lf__inp--pass { padding-right: 40px; }
.lf__inp:focus {
  border-color: #818cf8;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
}
.lf__inp:disabled { opacity: 0.6; cursor: not-allowed; }

.lf__eye {
  position: absolute; right: 10px;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.lf__eye:hover { color: #6366f1; background: rgba(99,102,241,0.08); }

.lf__err {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 12px;
  background: #fff1f2;
  border: 1px solid #ffe4e6;
  border-radius: 8px;
  font-size: 12.5px;
  color: #e11d48;
}

.lf__btn {
  width: 100%; height: 46px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 14px; font-weight: 700; font-family: inherit;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 16px rgba(99,102,241,0.35);
  transition: opacity 0.15s ease, transform 0.15s ease;
  margin-top: 4px;
}
.lf__btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.lf__btn:active:not(:disabled) { transform: translateY(0); }
.lf__btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

@keyframes spin { to { transform: rotate(360deg); } }
.lf__spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.login-card__hint {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 11.5px;
  color: #94a3b8;
  text-align: center;
}
.login-card__hint strong { color: #475569; }
</style>
