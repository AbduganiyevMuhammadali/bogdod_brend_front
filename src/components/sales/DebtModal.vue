<script setup>
/**
 * Qarzga sotish oynasi.
 *
 * "Qarz" to'lov turi tanlanganda darhol ochiladi va bitta joyda
 * hammasini so'raydi: kimga qarz beriladi va qachon qaytariladi.
 *
 * Mijoz topilmasa — shu yerda yangisi yaratiladi, sotuvdan chiqmasdan.
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { clientsApi } from '@/api/clients.js'

const props = defineProps({
  debtSum:  { type: Number, default: 0 },
  client:   { type: Object, default: null },   // oldindan tanlangan bo'lsa
})
const emit = defineEmits(['close', 'confirm'])

const fmt = v => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(v) || 0))

// ── Sana ────────────────────────────────────────────────────────────
function bugunKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function kunQosh(n) {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const TEZ = [
  { nom: 'Bugun', kun: 0 }, { nom: 'Ertaga', kun: 1 }, { nom: '3 kun', kun: 3 },
  { nom: '1 hafta', kun: 7 }, { nom: '2 hafta', kun: 14 }, { nom: '1 oy', kun: 30 },
]
const dueDate = ref(kunQosh(7))   // standart: bir hafta

const dueLabel = computed(() => {
  if (!dueDate.value) return ''
  const kun = Math.round((new Date(dueDate.value) - new Date(bugunKey())) / 86400000)
  const s = new Date(dueDate.value).toLocaleDateString('uz-UZ',
    { day: 'numeric', month: 'long', weekday: 'long' })
  if (kun === 0) return `${s} — bugun`
  if (kun === 1) return `${s} — ertaga`
  if (kun < 0)   return `${s} — o'tgan sana!`
  return `${s} — ${kun} kundan keyin`
})

// ── Mijoz ──────────────────────────────────────────────────────────
//
// Bitta maydon: kassir ismni yozadi, dastur bazadan qidiradi.
//   • topilsa   — ro'yxatdan tanlanadi (eski qarzi ham ko'rinadi)
//   • topilmasa — tasdiqlashda o'sha nom bilan yangi mijoz yaratiladi
//
// Alohida "yangi mijoz qo'shish" tugmasi yo'q: kassir uchun bu ortiqcha
// qadam edi va ism ikki marta yozilardi.
const tanlangan  = ref(props.client)
const ism        = ref('')
const telefon    = ref('')
const natija     = ref([])
const qidirmoqda = ref(false)
const ismEl      = ref(null)
const saqlanmoqda = ref(false)
const xato       = ref('')

let timer = null
watch(ism, (q) => {
  clearTimeout(timer)
  // Yozilayotgan bo'lsa, oldingi tanlov bekor bo'ladi
  if (tanlangan.value) tanlangan.value = null
  const t = q.trim()
  if (t.length < 2) { natija.value = []; qidirmoqda.value = false; return }
  qidirmoqda.value = true
  timer = setTimeout(async () => {
    try {
      const r = await clientsApi.getAll({ search: t, limit: 6 })
      natija.value = r.data
    } catch { natija.value = [] }
    finally { qidirmoqda.value = false }
  }, 250)
})

function tanla(c) {
  tanlangan.value = c
  ism.value     = c.name || ''
  telefon.value = c.phone || ''
  natija.value  = []
}

function tozala() {
  tanlangan.value = null
  ism.value = ''
  telefon.value = ''
  natija.value = []
  ismEl.value?.focus()
}

// Yozilgan nom bazadagi biror mijozga aynan mos kelmasa — yangi bo'ladi
const yangiBoladi = computed(() =>
  !tanlangan.value && ism.value.trim().length >= 2
)

// ── Tasdiqlash ──────────────────────────────────────────────────────
const tayyor = computed(() => !!tanlangan.value || ism.value.trim().length >= 2)

async function tasdiqla() {
  xato.value = ''

  // Mavjud mijoz tanlangan — to'g'ridan-to'g'ri davom etamiz
  if (tanlangan.value) {
    emit('confirm', { client: tanlangan.value, dueDate: dueDate.value || null })
    return
  }

  const nom = ism.value.trim()
  if (nom.length < 2) { xato.value = 'Mijoz ismini kiriting'; return }

  // Yangi mijozni shu yerda yaratamiz — kassir alohida qadam bosmasin
  saqlanmoqda.value = true
  try {
    const c = await clientsApi.create({
      name: nom,
      phone: telefon.value.trim() || null,
    })
    emit('confirm', { client: c, dueDate: dueDate.value || null })
  } catch (e) {
    xato.value = e?.response?.data?.message || 'Mijozni saqlab bo\'lmadi'
  } finally { saqlanmoqda.value = false }
}

onMounted(async () => {
  // Oldindan mijoz tanlangan bo'lsa maydonlarni to'ldiramiz
  if (props.client) {
    ism.value     = props.client.name  || ''
    telefon.value = props.client.phone || ''
  }
  await nextTick()
  if (!tanlangan.value) ismEl.value?.focus()
})
</script>

<template>
  <div class="dm-overlay" @click.self="emit('close')">
    <div class="dm">

      <!-- Sarlavha -->
      <div class="dm__hdr">
        <div class="dm__hdr-l">
          <div class="dm__hdr-ico"><AppIcon name="clock" :size="17" :stroke-width="2.2"/></div>
          <div>
            <div class="dm__hdr-t">Qarzga sotish</div>
            <div class="dm__hdr-s">{{ fmt(debtSum) }} so'm</div>
          </div>
        </div>
        <button class="dm__x" @click="emit('close')"><AppIcon name="x" :size="17"/></button>
      </div>

      <div class="dm__body">

        <!-- ── 1. Mijoz ──────────────────────────────────────────── -->
        <div class="dm__sec">
          <div class="dm__lbl"><span class="dm__num">1</span> Kimga qarz beriladi?</div>

          <!-- Ism maydoni: yozgan sari bazadan qidiradi.
               Topilsa tanlanadi, topilmasa Tasdiqlashda yangi yaratiladi. -->
          <div class="dm-field">
            <AppIcon name="user" :size="14" class="dm-field__ico"/>
            <input
              ref="ismEl"
              v-model="ism"
              class="dm-field__inp"
              :class="{ 'is-found': tanlangan }"
              placeholder="Ism familiya"
              autocomplete="off"
              @keyup.enter="natija.length === 1 && tanla(natija[0])"
            />
            <button v-if="ism" class="dm-field__x" @click="tozala" title="Tozalash">
              <AppIcon name="x" :size="13"/>
            </button>
          </div>

          <!-- Topilgan mijozlar -->
          <div v-if="natija.length && !tanlangan" class="dm-results">
            <button v-for="c in natija" :key="c.id" class="dm-result" @click="tanla(c)">
              <div class="dm-result__av">{{ (c.name || '?')[0].toUpperCase() }}</div>
              <div class="dm-result__body">
                <div class="dm-result__name">{{ c.name }}</div>
                <div class="dm-result__meta">
                  <span v-if="c.phone">{{ c.phone }}</span>
                  <span v-if="Number(c.balance) < 0" class="dm-result__debt">
                    qarzi: {{ fmt(Math.abs(c.balance)) }}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <!-- Telefon: yangi mijoz uchun ixtiyoriy -->
          <div v-if="!tanlangan" class="dm-field dm-field--phone">
            <AppIcon name="phone" :size="14" class="dm-field__ico"/>
            <input
              v-model="telefon"
              class="dm-field__inp"
              placeholder="Telefon (ixtiyoriy)"
              autocomplete="off"
            />
          </div>

          <!-- Holat izohi -->
          <div v-if="tanlangan" class="dm-hint dm-hint--ok">
            <AppIcon name="check-circle" :size="13"/>
            Bazadan topildi
            <span v-if="Number(tanlangan.balance) < 0" class="dm-hint__debt">
              · eski qarzi {{ fmt(Math.abs(tanlangan.balance)) }} so'm
            </span>
          </div>
          <div v-else-if="qidirmoqda" class="dm-hint">Qidirilmoqda...</div>
          <div v-else-if="yangiBoladi" class="dm-hint dm-hint--new">
            <AppIcon name="user-plus" :size="13"/>
            Yangi mijoz sifatida saqlanadi
          </div>
        </div>

        <!-- ── 2. Muddat ─────────────────────────────────────────── -->
        <div class="dm__sec">
          <div class="dm__lbl"><span class="dm__num">2</span> Qachon qaytaradi?</div>

          <div class="dm-quick">
            <button
              v-for="q in TEZ" :key="q.kun"
              class="dm-quick__b" :class="{ on: dueDate === kunQosh(q.kun) }"
              @click="dueDate = kunQosh(q.kun)"
            >{{ q.nom }}</button>
          </div>

          <input v-model="dueDate" type="date" class="dm-date" :min="bugunKey()"/>
          <div v-if="dueDate" class="dm-date__info">{{ dueLabel }}</div>
          <div v-else class="dm-date__warn">Sana belgilanmasa — muddatsiz qarz</div>
        </div>

        <div v-if="xato" class="dm__err">{{ xato }}</div>
      </div>

      <!-- Tasdiqlash -->
      <div class="dm__foot">
        <button class="dm__cancel" @click="emit('close')">Bekor qilish</button>
        <button class="dm__ok" :disabled="!tayyor || saqlanmoqda" @click="tasdiqla">
          <AppIcon name="check-circle" :size="16" :stroke-width="2.2"/>
          {{ saqlanmoqda ? 'Saqlanmoqda...' : 'Tasdiqlash' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dm-overlay {
  position: fixed; inset: 0;
  /* To'lov oynasi (.pov) z-index: 9000 bilan ishlaydi. Qarz oynasi
     uning USTIDA turishi kerak — u yerdagi "Qarz" tugmasidan ham
     ochiladi, aks holda ostida qolib ko'rinmasdi. */
  z-index: 9500;
  display: flex; align-items: center; justify-content: center;
  background: rgba(15,23,42,.6); padding: 20px;
  backdrop-filter: blur(2px);
}
.dm {
  width: 100%; max-width: 440px; max-height: 90vh;
  display: flex; flex-direction: column;
  background: #fff; border-radius: 16px; overflow: hidden;
  box-shadow: 0 24px 64px rgba(0,0,0,.32);
}

.dm__hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 15px 18px;
  background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff;
}
.dm__hdr-l { display: flex; align-items: center; gap: 11px; }
.dm__hdr-ico {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; background: rgba(255,255,255,.2); border-radius: 10px;
}
.dm__hdr-t { font-size: 15px; font-weight: 700; }
.dm__hdr-s { font-size: 18px; font-weight: 900; letter-spacing: -.02em; margin-top: 1px; }
.dm__x {
  display: flex; padding: 6px; color: #fff;
  background: rgba(255,255,255,.15); border: none; border-radius: 8px; cursor: pointer;
}

.dm__body { flex: 1; overflow-y: auto; padding: 16px 18px; }
.dm__sec { margin-bottom: 18px; }
.dm__sec:last-child { margin-bottom: 0; }
.dm__lbl {
  display: flex; align-items: center; gap: 7px;
  font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 9px;
}
.dm__num {
  display: flex; align-items: center; justify-content: center;
  width: 19px; height: 19px; font-size: 11px; font-weight: 800;
  color: #4f46e5; background: #e0e7ff; border-radius: 50%;
}

/* Tanlangan mijoz */

/* Ism / telefon maydonlari */
.dm-field { position: relative; display: flex; align-items: center; }
.dm-field--phone { margin-top: 8px; }
.dm-field__ico { position: absolute; left: 11px; color: #94a3b8; pointer-events: none; }
.dm-field__inp {
  width: 100%; padding: 11px 34px 11px 34px;
  font-size: 14.5px; font-weight: 500; color: #0f172a;
  border: 1.5px solid #e2e8f0; border-radius: 9px;
  outline: none; font-family: inherit;
}
.dm-field__inp:focus { border-color: #6366f1; }
.dm-field__inp.is-found { border-color: #86efac; background: #f0fdf4; }
.dm-field__x {
  position: absolute; right: 9px; display: flex; padding: 4px;
  color: #94a3b8; background: #f1f5f9; border: none; border-radius: 50%; cursor: pointer;
}

/* Holat izohi */
.dm-hint {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  margin-top: 7px; font-size: 12px; color: #94a3b8;
}
.dm-hint--ok  { color: #047857; font-weight: 600; }
.dm-hint--new { color: #4f46e5; font-weight: 600; }
.dm-hint__debt { color: #b91c1c; font-weight: 600; }

/* Topilgan mijozlar */

.dm-results { margin-top: 7px; max-height: 210px; overflow-y: auto; }
.dm-result {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 11px; margin-bottom: 4px; text-align: left;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 9px;
  cursor: pointer; font-family: inherit;
}
.dm-result:hover { background: #f8fafc; border-color: #cbd5e1; }
.dm-result__av {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; flex-shrink: 0;
  font-size: 13px; font-weight: 700; color: #4338ca;
  background: #e0e7ff; border-radius: 8px;
}
.dm-result__name { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.dm-result__meta { display: flex; gap: 8px; font-size: 11px; color: #94a3b8; margin-top: 1px; }
.dm-result__debt { color: #b91c1c; font-weight: 600; }


/* Yangi mijoz */

/* Muddat */
.dm-quick { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
.dm-quick__b {
  padding: 7px 13px; font-size: 12.5px; font-weight: 600; color: #475569;
  background: #f1f5f9; border: 1.5px solid transparent; border-radius: 8px;
  cursor: pointer; font-family: inherit;
}
.dm-quick__b:hover { background: #e2e8f0; }
.dm-quick__b.on { background: #4f46e5; color: #fff; }
.dm-date {
  width: 100%; padding: 10px 12px;
  font-size: 14px; font-weight: 600; color: #0f172a;
  border: 1.5px solid #e2e8f0; border-radius: 9px; outline: none; font-family: inherit;
}
.dm-date:focus { border-color: #6366f1; }
.dm-date__info { margin-top: 6px; font-size: 12.5px; font-weight: 600; color: #4f46e5; }
.dm-date__warn { margin-top: 6px; font-size: 12px; color: #94a3b8; }

.dm__err {
  padding: 9px 12px; font-size: 12.5px; color: #b91c1c;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
}

.dm__foot {
  display: flex; gap: 9px; padding: 13px 18px;
  border-top: 1px solid #e2e8f0; background: #f8fafc;
}
.dm__cancel {
  flex: 1; padding: 11px; font-size: 13.5px; font-weight: 600; color: #64748b;
  background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
  cursor: pointer; font-family: inherit;
}
.dm__ok {
  flex: 2; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px; font-size: 13.5px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg,#6366f1,#4f46e5); border: none; border-radius: 10px;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 4px 14px rgba(79,70,229,.3);
}
.dm__ok:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }

@media (max-width: 480px) {
  .dm-overlay { padding: 0; align-items: flex-end; }
  .dm { max-width: 100%; max-height: 92vh; border-radius: 16px 16px 0 0; }
}
</style>
