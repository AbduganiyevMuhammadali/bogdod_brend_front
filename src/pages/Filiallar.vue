<script setup>
/**
 * Filiallar — faqat Admin/Dasturchi.
 *
 * Har filial o'z tovari, kirimi, sotuvi, mijozi va kassasiga ega; ular
 * bir-biriga aralashmaydi. Bosh ofis foydalanuvchisi (filialga
 * biriktirilmagan) yuqoridagi tanlagich orqali istalgan filialga o'tadi.
 *
 * O'chirish yo'q — filialda hujjatlar bo'ladi. Kerak bo'lsa "faol emas"
 * qilinadi: kirish to'xtaydi, tarix saqlanadi.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { branchesApi } from '@/api/branches.js'
import { useAuth } from '@/composables/useAuth.js'
import { showToast } from '@/composables/useToast.js'

const { branch: joriy, canSwitchBranch, setBranch, loadBranch } = useAuth()

const rows    = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try { rows.value = await branchesApi.getAll() }
  catch (e) { showToast(e?.response?.data?.message || 'Yuklab bo\'lmadi', 'err') }
  finally { loading.value = false }
}
onMounted(load)

const faol = computed(() => rows.value.filter(r => r.active).length)

// ── Forma ───────────────────────────────────────────────────────────
const showModal = ref(false)
const editId    = ref(null)
const saving    = ref(false)
const err       = ref('')
const form      = reactive({ name: '', code: '', phone: '', address: '', active: true, is_main: false })

function openAdd() {
  editId.value = null
  Object.assign(form, { name: '', code: '', phone: '', address: '', active: true, is_main: false })
  err.value = ''
  showModal.value = true
}
function openEdit(b) {
  editId.value = b.id
  Object.assign(form, { name: b.name, code: b.code, phone: b.phone, address: b.address, active: b.active, is_main: b.isMain })
  err.value = ''
  showModal.value = true
}

async function save() {
  const name = form.name.trim()
  if (!name) { err.value = 'Filial nomini kiriting'; return }
  saving.value = true; err.value = ''
  try {
    const payload = { name, code: form.code.trim() || null, phone: form.phone.trim() || null,
                      address: form.address.trim() || null, active: form.active, is_main: form.is_main }
    if (editId.value) await branchesApi.update(editId.value, payload)
    else              await branchesApi.create(payload)
    showModal.value = false
    showToast(editId.value ? 'Filial yangilandi' : 'Filial yaratildi', 'ok')
    await load()
    await loadBranch()
  } catch (e) {
    err.value = e?.response?.data?.message || 'Saqlashda xatolik'
  } finally { saving.value = false }
}

async function toggleActive(b) {
  if (b.isMain && b.active) { showToast('Asosiy filialni faolsizlantirib bo\'lmaydi', 'err'); return }
  if (!confirm(b.active
      ? `"${b.name}" faolsizlantirilsinmi? Uning xodimlari tizimga kira olmaydi, ma'lumotlar saqlanadi.`
      : `"${b.name}" qayta faollashtirilsinmi?`)) return
  try {
    await branchesApi.update(b.id, { active: !b.active })
    await load(); await loadBranch()
  } catch (e) { showToast(e?.response?.data?.message || 'Xatolik', 'err') }
}

function otish(b) {
  if (!canSwitchBranch.value || !b.active) return
  setBranch(b.id)
}
</script>

<template>
  <div class="br">
    <div class="br__top">
      <div>
        <h2 class="br__title">Filiallar</h2>
        <p class="br__sub">
          {{ rows.length }} ta filial · {{ faol }} ta faol ·
          hozir: <strong>{{ joriy?.name || '—' }}</strong>
        </p>
      </div>
      <button v-if="canSwitchBranch" class="br__add" @click="openAdd">
        <AppIcon name="plus" :size="15" :stroke-width="2.5"/> Yangi filial
      </button>
    </div>

    <div v-if="!canSwitchBranch" class="br__note">
      <AppIcon name="info" :size="14"/>
      Siz <strong>{{ joriy?.name }}</strong> filialiga biriktirilgansiz. Filiallarni faqat bosh ofis foydalanuvchisi boshqaradi.
    </div>

    <div class="br__hint">
      <AppIcon name="info" :size="13"/>
      Har filialning tovari, kirimi, sotuvi, mijozi va kassasi alohida — ular aralashmaydi.
      Xodim filialga <b>Foydalanuvchilar</b> bo'limida biriktiriladi; biriktirilmagan (bosh ofis) foydalanuvchi hamma filialni ko'radi.
    </div>

    <div class="br__grid">
      <div v-if="loading" class="br__empty">Yuklanmoqda...</div>
      <div
        v-for="b in rows" :key="b.id"
        class="bcard" :class="{ 'bcard--cur': b.current, 'bcard--off': !b.active }"
      >
        <div class="bcard__hdr">
          <div class="bcard__ico"><AppIcon name="map-pin" :size="18"/></div>
          <div class="bcard__t">
            <div class="bcard__name">{{ b.name }}</div>
            <div class="bcard__code">{{ b.code || '—' }}</div>
          </div>
          <div class="bcard__tags">
            <span v-if="b.isMain" class="btag btag--main">Asosiy</span>
            <span v-if="b.current" class="btag btag--cur">Joriy</span>
            <span v-if="!b.active" class="btag btag--off">Faol emas</span>
          </div>
        </div>
        <div class="bcard__body">
          <div class="bcard__row"><AppIcon name="phone" :size="12"/> {{ b.phone || '—' }}</div>
          <div class="bcard__row"><AppIcon name="home" :size="12"/> {{ b.address || '—' }}</div>
          <div class="bcard__row"><AppIcon name="users" :size="12"/> {{ b.users }} ta xodim biriktirilgan</div>
        </div>
        <div v-if="canSwitchBranch" class="bcard__acts">
          <button class="bbtn" :disabled="b.current || !b.active" @click="otish(b)">
            <AppIcon name="arrow-right" :size="13"/> {{ b.current ? 'Shu filialdasiz' : 'Shu filialga o\'tish' }}
          </button>
          <button class="bbtn bbtn--ghost" @click="openEdit(b)"><AppIcon name="edit-2" :size="13"/> Tahrir</button>
          <button class="bbtn bbtn--ghost" :class="{ 'bbtn--danger': b.active }" :disabled="b.isMain && b.active" @click="toggleActive(b)">
            <AppIcon :name="b.active ? 'eye-off' : 'eye'" :size="13"/> {{ b.active ? 'Faolsiz qil' : 'Faollashtir' }}
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="bmod" @click.self="showModal = false">
        <div class="bmod__box">
          <div class="bmod__hdr">
            <h3>{{ editId ? 'Filialni tahrirlash' : 'Yangi filial' }}</h3>
            <button class="bmod__x" @click="showModal = false"><AppIcon name="x" :size="16"/></button>
          </div>
          <div class="bmod__body">
            <label class="bf"><span>Nomi <b>*</b></span><input v-model="form.name" class="bf__inp" placeholder="Masalan: Chilonzor filiali" @keydown.enter="save"/></label>
            <div class="bf-row">
              <label class="bf"><span>Kod</span><input v-model="form.code" class="bf__inp" placeholder="CHL" maxlength="30"/></label>
              <label class="bf"><span>Telefon</span><input v-model="form.phone" class="bf__inp" placeholder="+998 90 000 00 00"/></label>
            </div>
            <label class="bf"><span>Manzil</span><input v-model="form.address" class="bf__inp" placeholder="Shahar, ko'cha..."/></label>
            <div class="bf-checks">
              <label class="bf-check"><input type="checkbox" v-model="form.active"/> Faol</label>
              <label class="bf-check"><input type="checkbox" v-model="form.is_main"/> Asosiy filial (bosh ofis uchun standart)</label>
            </div>
            <p v-if="err" class="bf-err">{{ err }}</p>
          </div>
          <div class="bmod__ftr">
            <button class="bbtn bbtn--ghost" @click="showModal = false">Bekor</button>
            <button class="bbtn" :disabled="saving" @click="save">
              <AppIcon :name="saving ? 'loader' : 'check'" :size="14"/> Saqlash
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.br { display:flex; flex-direction:column; gap:14px; padding:18px 24px 24px; height:calc(100vh - var(--header-h)); overflow-y:auto; }
.br__top { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.br__title { font-size:19px; font-weight:800; color:#0f172a; margin:0; }
.br__sub { font-size:12.5px; color:#64748b; margin:3px 0 0; }
.br__add { display:flex; align-items:center; gap:6px; padding:9px 16px; font-size:13px; font-weight:700; color:#fff; background:linear-gradient(135deg,#4f46e5,#7c3aed); border:none; border-radius:10px; cursor:pointer; font-family:inherit; }
.br__note, .br__hint { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:12.5px; border-radius:10px; }
.br__note { background:#fef3c7; color:#92400e; border:1px solid #fde68a; }
.br__hint { background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; }
.br__grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }
.br__empty { color:#94a3b8; padding:30px; }

.bcard { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
.bcard--cur { border-color:#4f46e5; box-shadow:0 0 0 3px rgba(79,70,229,.12); }
.bcard--off { opacity:.6; }
.bcard__hdr { display:flex; align-items:flex-start; gap:10px; }
.bcard__ico { width:38px; height:38px; border-radius:10px; background:#eef2ff; color:#4f46e5; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.bcard__t { flex:1; min-width:0; }
.bcard__name { font-size:15px; font-weight:800; color:#0f172a; }
.bcard__code { font-size:11.5px; color:#94a3b8; font-family:monospace; margin-top:1px; }
.bcard__tags { display:flex; flex-wrap:wrap; gap:4px; justify-content:flex-end; }
.btag { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; padding:2px 7px; border-radius:99px; }
.btag--main { color:#4338ca; background:#e0e7ff; }
.btag--cur  { color:#047857; background:#d1fae5; }
.btag--off  { color:#b91c1c; background:#fee2e2; }
.bcard__body { display:flex; flex-direction:column; gap:5px; }
.bcard__row { display:flex; align-items:center; gap:7px; font-size:12.5px; color:#475569; }
.bcard__acts { display:flex; flex-wrap:wrap; gap:6px; padding-top:6px; border-top:1px dashed #e2e8f0; }

.bbtn { display:inline-flex; align-items:center; gap:6px; padding:7px 12px; font-size:12.5px; font-weight:700; color:#fff; background:#4f46e5; border:1.5px solid #4f46e5; border-radius:8px; cursor:pointer; font-family:inherit; }
.bbtn:disabled { opacity:.45; cursor:not-allowed; }
.bbtn--ghost { color:#334155; background:#fff; border-color:#e2e8f0; }
.bbtn--ghost:hover:not(:disabled) { background:#f8fafc; }
.bbtn--danger { color:#b91c1c; }

.bmod { position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; background:rgba(15,23,42,.55); padding:20px; }
.bmod__box { width:100%; max-width:480px; background:#fff; border-radius:14px; overflow:hidden; }
.bmod__hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #e2e8f0; }
.bmod__hdr h3 { margin:0; font-size:16px; font-weight:800; color:#0f172a; }
.bmod__x { display:flex; padding:6px; color:#64748b; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; }
.bmod__body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
.bmod__ftr { display:flex; justify-content:flex-end; gap:8px; padding:14px 20px; border-top:1px solid #e2e8f0; }
.bf { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:600; color:#475569; }
.bf b { color:#e11d48; }
.bf__inp { height:38px; padding:0 12px; font-size:13.5px; border:1.5px solid #e2e8f0; border-radius:8px; outline:none; font-family:inherit; }
.bf__inp:focus { border-color:#818cf8; }
.bf-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.bf-checks { display:flex; flex-direction:column; gap:6px; }
.bf-check { display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; }
.bf-err { color:#b91c1c; font-size:12.5px; margin:0; }
</style>
