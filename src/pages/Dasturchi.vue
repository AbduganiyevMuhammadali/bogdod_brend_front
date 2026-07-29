<script setup>
import { ref, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { notificationsApi } from '@/api/notifications.js'
import {
  pushSupported, pushPermission, pushSubscribed, pushBusy, pushError,
  checkPushStatus, enablePush, disablePush,
} from '@/composables/usePushNotifications.js'
import { showToast } from '@/composables/useToast.js'

const loading = ref(true)
const saving  = ref(false)
const saved   = ref(false)
const testing = ref(false)

const enabled = ref(true)
const time    = ref('08:00')

async function loadSettings() {
  loading.value = true
  try {
    const s = await notificationsApi.getSettings()
    enabled.value = s.enabled
    time.value    = s.time
  } catch (e) {
    showToast(e.response?.data?.message ?? "Sozlamalarni yuklab bo'lmadi", 'err')
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    await notificationsApi.updateSettings({ enabled: enabled.value, time: time.value })
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e) {
    showToast(e.response?.data?.message ?? 'Saqlashda xatolik', 'err')
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  try {
    const r = await notificationsApi.sendTest()
    showToast(r.sent > 0 ? `Sinov xabari ${r.sent} ta qurilmaga yuborildi` : "Obunachi topilmadi — avval bildirishnomaga obuna bo'ling", r.sent > 0 ? 'ok' : 'hold')
  } catch (e) {
    showToast(e.response?.data?.message ?? 'Yuborishda xatolik', 'err')
  } finally {
    testing.value = false
  }
}

onMounted(async () => {
  await loadSettings()
  await checkPushStatus()
})
</script>

<template>
  <div class="dev-page">
    <div class="dev-page__topbar">
      <h2 class="dev-page__title">
        <AppIcon name="settings" :size="18" :stroke-width="2"/>
        Dasturchi paneli
      </h2>
    </div>

    <div class="dev-page__content">

      <!-- ── Push obuna holati (shu qurilma) ──────────────────────── -->
      <div class="dev-card">
        <h3 class="dev-card__title">
          <AppIcon name="bell" :size="15"/>
          Shu qurilmada bildirishnoma
        </h3>
        <p class="dev-card__sub">Kunlik xabarlarni shu brauzer/qurilmada olish uchun obuna bo'ling.</p>

        <div v-if="!pushSupported" class="dev-alert dev-alert--warn">
          <AppIcon name="alert-triangle" :size="14"/>
          Bu brauzer/qurilma push-bildirishnomani qo'llab-quvvatlamaydi.
        </div>
        <template v-else>
          <div class="dev-status-row">
            <span class="dev-status-lbl">Holat:</span>
            <span class="dev-status-badge" :class="pushSubscribed ? 'is-on' : 'is-off'">
              {{ pushSubscribed ? 'Obuna faol' : 'Obuna yoqilmagan' }}
            </span>
          </div>
          <div v-if="pushError" class="dev-alert dev-alert--err">{{ pushError }}</div>
          <button
            v-if="!pushSubscribed"
            class="dev-btn dev-btn--primary"
            :disabled="pushBusy"
            @click="enablePush"
          >
            <AppIcon name="bell" :size="14"/>
            {{ pushBusy ? 'Yoqilmoqda...' : 'Bildirishnomani yoqish' }}
          </button>
          <button v-else class="dev-btn dev-btn--ghost" :disabled="pushBusy" @click="disablePush">
            {{ pushBusy ? '...' : "O'chirish" }}
          </button>
        </template>
      </div>

      <!-- ── Kunlik xabar sozlamalari ──────────────────────────────── -->
      <div class="dev-card">
        <h3 class="dev-card__title">
          <AppIcon name="clock" :size="15"/>
          Kunlik xush kelibsiz xabari
        </h3>
        <p class="dev-card__sub">Har kuni belgilangan vaqtda barcha obunachilarga tabrik xabari yuboriladi.</p>

        <div v-if="loading" class="dev-loading">Yuklanmoqda...</div>
        <template v-else>
          <label class="dev-toggle-row">
            <span>Kunlik xabar yoqilgan</span>
            <input type="checkbox" v-model="enabled" class="dev-toggle"/>
          </label>

          <div class="dev-field">
            <label class="dev-field__lbl">Yuborish vaqti</label>
            <input type="time" v-model="time" class="dev-time-inp" :disabled="!enabled"/>
          </div>

          <div class="dev-actions">
            <button class="dev-btn dev-btn--primary" :disabled="saving" @click="saveSettings">
              <AppIcon :name="saved ? 'check' : 'save'" :size="14"/>
              {{ saved ? 'Saqlandi!' : (saving ? 'Saqlanmoqda...' : 'Saqlash') }}
            </button>
            <button class="dev-btn dev-btn--ghost" :disabled="testing" @click="sendTest">
              <AppIcon name="zap" :size="14"/>
              {{ testing ? 'Yuborilmoqda...' : 'Sinov xabarini yuborish' }}
            </button>
          </div>
        </template>
      </div>

    </div>
  </div>
</template>

<style scoped>
.dev-page { display: flex; flex-direction: column; height: 100%; }
.dev-page__topbar { padding: 18px 24px 14px; border-bottom: 1px solid var(--color-border); }
.dev-page__title { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; color: var(--color-text); letter-spacing: -0.03em; }
.dev-page__content { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; max-width: 560px; }

.dev-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--r-xl); padding: 18px 20px; }
.dev-card__title { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 700; color: var(--color-text); margin-bottom: 4px; }
.dev-card__sub { font-size: 12.5px; color: var(--color-text-3); margin-bottom: 14px; }

.dev-alert { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--r-md); font-size: 12.5px; margin-bottom: 12px; }
.dev-alert--warn { background: var(--amber-50); color: var(--amber-700); }
.dev-alert--err  { background: var(--rose-50);  color: var(--rose-600); }

.dev-status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.dev-status-lbl { font-size: 12.5px; color: var(--color-text-3); }
.dev-status-badge { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px; }
.dev-status-badge.is-on  { background: var(--emerald-50); color: var(--emerald-700); }
.dev-status-badge.is-off { background: var(--slate-100);  color: var(--color-text-3); }

.dev-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; font-size: 13.5px; font-weight: 600; color: var(--color-text-2); cursor: pointer; }
.dev-toggle { width: 40px; height: 22px; cursor: pointer; }

.dev-field { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 16px; }
.dev-field__lbl { font-size: 12px; font-weight: 600; color: var(--color-text-3); }
.dev-time-inp {
  width: 140px; height: 38px; padding: 0 12px;
  border: 1.5px solid var(--color-border); border-radius: var(--r-md);
  font-size: 14px; font-family: inherit; color: var(--color-text);
  background: var(--color-surface); outline: none;
}
.dev-time-inp:focus { border-color: var(--indigo-400); }
.dev-time-inp:disabled { opacity: 0.5; }

.dev-actions { display: flex; gap: 10px; }
.dev-loading { font-size: 13px; color: var(--color-text-3); padding: 8px 0; }

.dev-btn {
  display: flex; align-items: center; gap: 7px;
  height: 38px; padding: 0 16px; border-radius: var(--r-lg);
  font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer;
  transition: opacity var(--t-base), background var(--t-base);
}
.dev-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dev-btn--primary { background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); color: white; }
.dev-btn--primary:hover:not(:disabled) { opacity: 0.9; }
.dev-btn--ghost { background: var(--slate-100); color: var(--color-text-2); }
.dev-btn--ghost:hover:not(:disabled) { background: var(--slate-200); }
</style>
