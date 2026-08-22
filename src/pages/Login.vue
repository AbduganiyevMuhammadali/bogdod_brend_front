<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import { login, logout } from '@/composables/useAuth.js'
import { API_URL as apiUrl } from '@/api/http.js'
import { firstAllowedPath } from '@/router/index.js'
import { showToast } from '@/composables/useToast.js'
import { beep } from '@/composables/useBeep.js'

const router   = useRouter()
const username = ref('')
const password = ref('')
const showPass = ref(false)
const loading  = ref(false)
const error    = ref('')

const diag     = ref('')
const diagBusy = ref(false)

// Serverga yetib borish-bormasligini bosqichma-bosqich tekshiradi. axios emas,
// to'g'ridan-to'g'ri fetch ishlatamiz — shunda xato axios qatlamida
// o'ralmasdan, asl holida ko'rinadi.
async function runDiag() {
  diagBusy.value = true
  diag.value = ''
  // Sahifa qaysi sxemadan yuklangani muhim: https:// dan http:// ga so'rov
  // yuborish "mixed content" hisoblanadi va WebView uni bloklaydi.
  const lines = [
    `Manzil: ${apiUrl}`,
    `Sahifa: ${location.origin}`,
  ]
  if (location.protocol === 'https:' && apiUrl.startsWith('http://')) {
    lines.push('OGOHLANTIRISH: https sahifadan http so\'rov — WebView bloklashi mumkin.')
  }

  try {
    const t0 = Date.now()
    const r = await fetch(`${apiUrl}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '__ping__', password: '__ping__' }),
    })
    lines.push(`Javob: HTTP ${r.status} (${Date.now() - t0} ms)`)
    lines.push(r.status === 401
      ? 'Server ishlayapti. Demak login yoki parol xato.'
      : 'Server javob berdi, lekin kutilmagan holat.')
  } catch (e) {
    lines.push(`Ulanmadi: ${e.name} — ${e.message}`)
    lines.push(location.protocol === 'https:'
      ? 'Ehtimoliy sabab: mixed content (https sahifa → http server).'
      : 'Server topilmadi. Sabab: internet yo\'q yoki port yopiq.')
  }

  diag.value = lines.join('\n')
  diagBusy.value = false
}

// Kunning vaqtiga qarab salomlashuv — quruq "Xush kelibsiz" dan
// tabiiyroq eshitiladi.
function salomlashuv(user) {
  const ism = [user?.name, user?.surname].filter(Boolean).join(' ').trim()
             || user?.login || ''
  const soat = new Date().getHours()
  const salom = soat < 6  ? 'Xayrli tun'
              : soat < 12 ? 'Xayrli tong'
              : soat < 18 ? 'Xayrli kun'
              :             'Xayrli kech'
  return ism
    ? `${salom}, ${ism}! Sellz'ga xush kelibsiz`
    : `${salom}! Sellz'ga xush kelibsiz`
}

async function submit() {
  if (!username.value.trim() || !password.value) return
  loading.value = true
  error.value   = ''
  try {
    const user = await login(username.value.trim(), password.value)
    const target = firstAllowedPath()
    if (!target) {
      logout()
      error.value = "Sizga hech qanday bo'lim ochilmagan. Administratorga murojaat qiling."
      return
    }
    // Salomlashuv — ovoz va bildirishnoma.
    //
    // Ovoz `submit()` ichida, ya'ni foydalanuvchi bosgan tugma
    // hodisasidan keyin chalinadi: brauzer avtomatik ovozni bloklaydi,
    // faqat foydalanuvchi harakatidan keyin ruxsat beradi.
    beep('welcome')
    showToast(salomlashuv(user), 'ok', 4000)

    router.push(target)
  } catch (e) {
    // Server javob bergan bo'lsa — uning xabarini ko'rsatamiz (401 = parol xato).
    // Javob umuman kelmagan bo'lsa, bu tarmoq muammosi: serverga ulanib
    // bo'lmadi. Ilgari bu ham "parol xato" deb ko'rsatilardi va sabab
    // yashirinib qolardi — shuning uchun ularni ajratamiz.
    if (e.response) {
      error.value = e.response.data?.message ?? "Login yoki parol noto'g'ri"
    } else {
      const reason = e.code === 'ECONNABORTED' ? 'so\'rov muddati tugadi' : (e.message || 'noma\'lum xato')
      error.value = `Serverga ulanib bo'lmadi (${reason}). Manzil: ${apiUrl}`
    }
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
        <img src="@/assets/logo.png" alt="Sellz POS" class="login-card__logo-img"/>
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

        <!-- Ulanish diagnostikasi: xato chiqqanda serverga yetib borish-bormasligini
             tekshirish uchun. Telefonda log ko'rish imkoni yo'q holatlar uchun. -->
        <div v-if="error" class="lf__diag">
          <button type="button" class="lf__diag-btn" :disabled="diagBusy" @click="runDiag">
            {{ diagBusy ? 'Tekshirilmoqda...' : 'Ulanishni tekshirish' }}
          </button>
          <pre v-if="diag" class="lf__diag-out">{{ diag }}</pre>
        </div>

        <button type="submit" class="lf__btn" :disabled="loading">
          <span v-if="loading" class="lf__spinner"></span>
          <AppIcon v-else name="log-in" :size="16" :stroke-width="2.2" />
          {{ loading ? 'Kirilmoqda...' : 'Kirish' }}
        </button>

      </form>

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
  padding: 32px 32px 30px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  /* Oraliq 18px: logotip -> sarlavha -> forma zich va uyg'un tursin.
     24px da logotip bilan sarlavha orasi uzilib qolardi. */
  gap: 18px;
  position: relative;
  z-index: 1;
}

/* Logo — kartaning eng tepasida, markazda.
   Butun karta shu belgi atrofida markazlashtirilgan: sarlavha, matn va
   pastdagi build yozuvi ham bir o'qda turadi. */
.login-card__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}
.login-card__logo-img {
  /* Logotip nisbati 3.34:1 (828x248) — balandlik bo'yicha cheklaganda
     kenglik uch barobar katta chiqadi. 44px da ~147px bo'ladi va
     400px kartada muvozanatli ko'rinadi. Ilgari 64px edi va logotip
     kartaning yarmidan ko'pini egallardi. */
  height: 44px;
  max-width: 60%;
  width: auto;
  object-fit: contain;
  display: block;
}

/* Heading */
.login-card__hd { display: flex; flex-direction: column; gap: 5px; text-align: center; }
.login-card__title {
  font-size: 20px; font-weight: 800;
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


.lf__diag { display: flex; flex-direction: column; gap: 8px; }

.lf__diag-btn {
  align-self: flex-start;
  padding: 7px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}
.lf__diag-btn:disabled { opacity: .6; cursor: default; }

.lf__diag-out {
  margin: 0;
  padding: 10px 12px;
  background: #0f172a;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.55;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-all;
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

</style>
