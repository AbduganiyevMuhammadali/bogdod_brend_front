<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { usersApi } from '@/api/users.js'

const WAREHOUSES = ['Asosiy sklad', 'Filial №1', 'Filial №2', 'Omborxona']

// Kalitlar router sahifalariga 1:1 mos — ruxsat tekshiruvi shu kalitlar bo'yicha ishlaydi
const MODULES = [
  { key: 'dashboard', label: 'Bosh sahifa'      },
  { key: 'sales',     label: 'Sotuv (POS)'      },
  { key: 'purchases', label: 'Kirim (Xarid)'    },
  { key: 'partiya',   label: 'Partiyalar (Lot)' },
  { key: 'returns',   label: 'Qaytarishlar'     },
  { key: 'products',  label: 'Mahsulotlar'      },
  { key: 'partners',  label: 'Mijozlar'         },
  { key: 'suppliers', label: 'Yetkazuvchilar'   },
  { key: 'payments',  label: 'Kassa'            },
  { key: 'reports',   label: 'Hisobotlar'       },
  { key: 'users',     label: 'Foydalanuvchilar' },
  { key: 'settings',  label: 'Sozlamalar'       },
]

const PERMS = ['korish', 'qoshish', 'tahrir']

function emptyPerms() {
  const p = {}
  MODULES.forEach(m => { p[m.key] = { korish: false, qoshish: false, tahrir: false } })
  return p
}

const users   = ref([])
const loading = ref(false)
const apiErr  = ref('')

async function loadUsers() {
  loading.value = true
  apiErr.value  = ''
  try {
    users.value = await usersApi.getAll()
  } catch (e) {
    apiErr.value = e.response?.data?.message ?? "Serverga ulanib bo'lmadi"
  } finally {
    loading.value = false
  }
}

onMounted(loadUsers)

// ── Search ───────────────────────────────────────────────
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(u =>
    u.name.toLowerCase().includes(q) ||
    u.surname.toLowerCase().includes(q) ||
    u.login.toLowerCase().includes(q)
  )
})

// ── Modal state ──────────────────────────────────────────
const showModal = ref(false)
const editId    = ref(null)

const form = ref(makeForm())

function makeForm(u = null) {
  return {
    name:      u?.name      ?? '',
    surname:   u?.surname   ?? '',
    email:     u?.email     ?? '',
    warehouse: u?.warehouse ?? WAREHOUSES[0],
    login:     u?.login     ?? '',
    role:      u?.role      ?? 'operator',
    active:    u?.active    !== false,
    password:  '',
    confirm:   '',
    mobileIn:  false,
    mobileOut: false,
    perms:     u?.perms ? JSON.parse(JSON.stringify(u.perms)) : emptyPerms(),
  }
}

function openAdd() {
  editId.value = null
  form.value = makeForm()
  showModal.value = true
}

function openEdit(u) {
  editId.value = u.id
  form.value = makeForm(u)
  showModal.value = true
}

function closeModal() {
  showModal.value = false
}

const saving  = ref(false)
const saveErr = ref('')

async function save() {
  if (!form.value.name.trim() || !form.value.login.trim()) return
  saving.value  = true
  saveErr.value = ''
  try {
    if (editId.value) {
      const updated = await usersApi.update(editId.value, { ...form.value, role: form.value.role ?? 'operator' })
      const idx = users.value.findIndex(u => u.id === editId.value)
      if (idx !== -1) {
        users.value[idx] = { ...users.value[idx], ...updated, perms: JSON.parse(JSON.stringify(form.value.perms)) }
      }
    } else {
      const created = await usersApi.create({ ...form.value, role: 'operator' })
      users.value.push({ ...created, perms: JSON.parse(JSON.stringify(form.value.perms)) })
    }
    closeModal()
  } catch (e) {
    saveErr.value = e.response?.data?.message ?? "Saqlashda xatolik"
  } finally {
    saving.value = false
  }
}

async function deleteUser(id) {
  try {
    await usersApi.remove(id)
    users.value = users.value.filter(u => u.id !== id)
  } catch (e) {
    alert(e.response?.data?.message ?? "O'chirishda xatolik")
  }
}

// ── Permissions helpers ──────────────────────────────────
function toggleAll() {
  const allOn = MODULES.every(m => PERMS.every(p => form.value.perms[m.key][p]))
  MODULES.forEach(m => PERMS.forEach(p => { form.value.perms[m.key][p] = !allOn }))
}

function toggleRow(key) {
  const allOn = PERMS.every(p => form.value.perms[key][p])
  PERMS.forEach(p => { form.value.perms[key][p] = !allOn })
}

function allChecked() {
  return MODULES.every(m => PERMS.every(p => form.value.perms[m.key][p]))
}

const initials = (u) => `${u.name[0] ?? ''}${u.surname[0] ?? ''}`.toUpperCase()
</script>

<template>
<div class="users-root">

  <!-- ══════════ LIST PAGE ══════════ -->
  <div class="pg">

    <!-- Top bar -->
    <div class="pg__topbar">
      <div class="pg__topbar-left">
        <h2 class="pg__title">Foydalanuvchilar</h2>
        <div class="pg__search">
          <AppIcon name="search" :size="13" class="pg__search-ico" />
          <input v-model="search" type="text" class="pg__search-inp" placeholder="Ismi yoki login..." />
        </div>
      </div>
      <button class="pg__add-btn" @click="openAdd">
        <AppIcon name="plus" :size="16" :stroke-width="2.5" />
        Foydalanuvchi qo'shish
      </button>
    </div>

    <!-- Stats -->
    <div class="pg__stats">
      <div class="scard">
        <div class="scard__ico scard__ico--indigo"><AppIcon name="users" :size="16" :stroke-width="2" /></div>
        <div><p class="scard__val">{{ users.length }}</p><p class="scard__lbl">Jami</p></div>
      </div>
      <div class="scard">
        <div class="scard__ico scard__ico--green"><AppIcon name="check-circle" :size="16" :stroke-width="2" /></div>
        <div><p class="scard__val">{{ users.filter(u=>u.active).length }}</p><p class="scard__lbl">Faol</p></div>
      </div>
      <div class="scard">
        <div class="scard__ico scard__ico--violet"><AppIcon name="user-check" :size="16" :stroke-width="2" /></div>
        <div><p class="scard__val">{{ users.filter(u=>u.role==='admin').length }}</p><p class="scard__lbl">Admin</p></div>
      </div>
      <div class="scard">
        <div class="scard__ico scard__ico--amber"><AppIcon name="user" :size="16" :stroke-width="2" /></div>
        <div><p class="scard__val">{{ users.filter(u=>u.role==='operator').length }}</p><p class="scard__lbl">Operator</p></div>
      </div>
    </div>

    <!-- API error -->
    <div v-if="apiErr" class="pg__err">
      <AppIcon name="alert-circle" :size="14" />
      {{ apiErr }}
      <button class="pg__err-retry" @click="loadUsers">Qayta urinish</button>
    </div>

    <!-- Table -->
    <div class="pg__table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>Foydalanuvchi</th>
            <th>Login</th>
            <th>Sklad</th>
            <th>Rol</th>
            <th>Holat</th>
            <th style="width:80px"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id" class="tbl__row" @click="openEdit(u)">
            <td>
              <div class="usr-cell">
                <div class="usr-av" :class="u.role === 'admin' ? 'usr-av--admin' : 'usr-av--op'">
                  {{ initials(u) }}
                </div>
                <div>
                  <p class="usr-name">{{ u.name }} {{ u.surname }}</p>
                  <p class="usr-email">{{ u.email }}</p>
                </div>
              </div>
            </td>
            <td><code class="usr-login">{{ u.login }}</code></td>
            <td><span class="wh-tag">{{ u.warehouse }}</span></td>
            <td>
              <span class="role-badge" :class="u.role === 'admin' ? 'role-badge--admin' : 'role-badge--op'">
                {{ u.role === 'admin' ? 'Admin' : 'Operator' }}
              </span>
            </td>
            <td>
              <span class="status-dot" :class="u.active ? 'status-dot--on' : 'status-dot--off'">
                {{ u.active ? 'Faol' : 'Nofaol' }}
              </span>
            </td>
            <td @click.stop>
              <div class="tbl__actions">
                <button class="tbl__act tbl__act--edit" @click="openEdit(u)" title="Tahrirlash">
                  <AppIcon name="edit-2" :size="13" />
                </button>
                <button class="tbl__act tbl__act--del" @click="deleteUser(u.id)" title="O'chirish">
                  <AppIcon name="trash-2" :size="13" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="loading">
            <td colspan="6" class="tbl__empty">
              <span class="tbl__spinner"></span> Yuklanmoqda...
            </td>
          </tr>
          <tr v-else-if="!filtered.length">
            <td colspan="6" class="tbl__empty">Foydalanuvchi topilmadi</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ══════════ MODAL ══════════ -->
  <Teleport to="body">
    <div v-if="showModal" class="overlay" @click.self="closeModal">
      <div class="modal">

        <!-- Header -->
        <div class="modal__hdr">
          <div class="modal__hdr-left">
            <div class="modal__hdr-ico">
              <AppIcon name="user-plus" :size="18" :stroke-width="1.8" />
            </div>
            <div>
              <h3 class="modal__title">{{ editId ? 'Foydalanuvchini tahrirlash' : "Yangi foydalanuvchi qo'shish" }}</h3>
              <p class="modal__sub">Kirish ma'lumotlari va huquqlarni belgilang</p>
            </div>
          </div>
          <div class="modal__hdr-actions">
            <span v-if="saveErr" class="modal__save-err">{{ saveErr }}</span>
            <button class="modal__save-btn" :disabled="saving" @click="save">
              <AppIcon :name="saving ? 'refresh' : 'check'" :size="15" :stroke-width="2.5" :class="{ 'spin': saving }" />
              {{ saving ? 'Saqlanmoqda...' : 'Saqlash' }}
            </button>
            <button class="modal__close-btn" @click="closeModal">
              <AppIcon name="x" :size="15" :stroke-width="2.5" />
              Yopish
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="modal__body">

          <!-- LEFT: Form -->
          <div class="mform">

            <!-- Avatar -->
            <div class="mform__avatar-row">
              <div class="mform__avatar">
                <span class="mform__avatar-initials">
                  {{ (form.name[0] ?? '?') }}{{ (form.surname[0] ?? '') }}
                </span>
              </div>
              <div>
                <p class="mform__avatar-name">{{ form.name || 'Ism' }} {{ form.surname }}</p>
                <p class="mform__avatar-role">{{ editId ? 'Foydalanuvchi' : 'Yangi foydalanuvchi' }}</p>
              </div>
            </div>

            <!-- Section: Shaxsiy ma'lumot -->
            <p class="mform__section-lbl">Shaxsiy ma'lumot</p>

            <div class="mform__row mform__row--2">
              <div class="mform__field">
                <label class="mform__lbl">Ismi <span class="req">*</span></label>
                <input v-model="form.name" class="mform__inp" placeholder="Muhammadali" />
              </div>
              <div class="mform__field">
                <label class="mform__lbl">Familiyasi</label>
                <input v-model="form.surname" class="mform__inp" placeholder="Aliyev" />
              </div>
            </div>

            <div class="mform__field">
              <label class="mform__lbl">Elektron pochta</label>
              <div class="mform__inp-wrap">
                <AppIcon name="mail" :size="14" class="mform__inp-ico" />
                <input v-model="form.email" type="email" class="mform__inp mform__inp--icon" placeholder="user@company.uz" />
              </div>
            </div>

            <div class="mform__field">
              <label class="mform__lbl">Sklad</label>
              <div class="mform__inp-wrap">
                <AppIcon name="archive" :size="14" class="mform__inp-ico" />
                <select v-model="form.warehouse" class="mform__inp mform__inp--icon mform__select">
                  <option v-for="w in WAREHOUSES" :key="w" :value="w">{{ w }}</option>
                </select>
              </div>
            </div>

            <!-- Section: Kirish -->
            <p class="mform__section-lbl">Kirish ma'lumotlari</p>

            <div class="mform__field">
              <label class="mform__lbl">Login <span class="req">*</span></label>
              <div class="mform__inp-wrap">
                <AppIcon name="user" :size="14" class="mform__inp-ico" />
                <input v-model="form.login" class="mform__inp mform__inp--icon" placeholder="login123" autocomplete="off" />
              </div>
            </div>

            <div class="mform__row mform__row--2">
              <div class="mform__field">
                <label class="mform__lbl">Parol</label>
                <div class="mform__inp-wrap">
                  <AppIcon name="hash" :size="14" class="mform__inp-ico" />
                  <input v-model="form.password" type="password" class="mform__inp mform__inp--icon" placeholder="••••••••" autocomplete="new-password" />
                </div>
              </div>
              <div class="mform__field">
                <label class="mform__lbl">Tasdiqlash</label>
                <div class="mform__inp-wrap">
                  <AppIcon name="hash" :size="14" class="mform__inp-ico" />
                  <input v-model="form.confirm" type="password" class="mform__inp mform__inp--icon"
                    :class="{ 'mform__inp--err': form.confirm && form.password !== form.confirm }"
                    placeholder="••••••••" />
                </div>
              </div>
            </div>

            <!-- Section: Mobil -->
            <p class="mform__section-lbl">Mobil kirish</p>
            <div class="mform__checks">
              <label class="mform__check">
                <input type="checkbox" v-model="form.mobileIn" class="mform__checkbox" />
                <span class="mform__check-box"></span>
                <span class="mform__check-lbl">Mobil Kirim</span>
              </label>
              <label class="mform__check">
                <input type="checkbox" v-model="form.mobileOut" class="mform__checkbox" />
                <span class="mform__check-box"></span>
                <span class="mform__check-lbl">Mobil Chiqim</span>
              </label>
            </div>
          </div>

          <!-- RIGHT: Permissions -->
          <div class="mperms">
            <div class="mperms__hdr">
              <div>
                <p class="mperms__title">Huquqlar</p>
                <p class="mperms__sub">Modullar bo'yicha ruxsatlar</p>
              </div>
              <button class="mperms__all-btn" :class="{ 'is-all': allChecked() }" @click="toggleAll">
                <AppIcon :name="allChecked() ? 'check-circle' : 'check'" :size="13" :stroke-width="2.2" />
                {{ allChecked() ? 'Barchasini olib tashlash' : 'Barchasini tanlash' }}
              </button>
            </div>

            <div class="mperms__table-wrap">
              <table class="ptbl">
                <thead>
                  <tr>
                    <th class="ptbl__name-col">Modul</th>
                    <th>Ko'rish</th>
                    <th>Qo'shish</th>
                    <th>Tahrirlash</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="mod in MODULES"
                    :key="mod.key"
                    class="ptbl__row"
                    :class="{ 'ptbl__row--active': PERMS.some(p => form.perms[mod.key][p]) }"
                  >
                    <td class="ptbl__lbl" @click="toggleRow(mod.key)">
                      <span class="ptbl__row-dot"
                        :class="PERMS.every(p => form.perms[mod.key][p]) ? 'ptbl__row-dot--full' : PERMS.some(p => form.perms[mod.key][p]) ? 'ptbl__row-dot--part' : ''"
                      ></span>
                      {{ mod.label }}
                    </td>
                    <td v-for="perm in PERMS" :key="perm">
                      <label class="pchk">
                        <input type="checkbox" v-model="form.perms[mod.key][perm]" class="pchk__inp" />
                        <span class="pchk__box"></span>
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  </Teleport>

</div>
</template>

<style scoped>
.users-root { display: contents; }

/* ── Page shell ─────────────────────────────────────── */
.pg {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-h));
  overflow: hidden;
}

/* ── Topbar ─────────────────────────────────────────── */
.pg__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 16px;
}
.pg__topbar-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }

.pg__title {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.pg__search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 280px;
  flex: 1;
}
.pg__search-ico { position: absolute; left: 11px; color: var(--color-text-3); pointer-events: none; }
.pg__search-inp {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 32px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-lg);
  font-size: 13px;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  transition: border-color var(--t-base);
}
.pg__search-inp:focus { border-color: var(--indigo-400); }

.pg__add-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 18px;
  height: 38px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  box-shadow: var(--shadow-indigo);
  transition: opacity var(--t-base), transform var(--t-base);
}
.pg__add-btn:hover { opacity: 0.9; transform: translateY(-1px); }

/* ── Stats ──────────────────────────────────────────── */
.pg__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px 24px;
  flex-shrink: 0;
}

.scard {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  padding: 14px 16px;
  box-shadow: var(--shadow-xs);
}
.scard__ico {
  width: 38px; height: 38px;
  border-radius: var(--r-md);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.scard__ico--indigo { background: var(--indigo-50);  color: var(--indigo-500); }
.scard__ico--green  { background: var(--emerald-50); color: var(--emerald-600); }
.scard__ico--violet { background: #f5f3ff;           color: var(--violet-600); }
.scard__ico--amber  { background: var(--amber-50);   color: var(--amber-600); }
.scard__val { font-size: 22px; font-weight: 800; color: var(--color-text); letter-spacing: -0.04em; line-height: 1.1; }
.scard__lbl { font-size: 11.5px; color: var(--color-text-3); margin-top: 2px; }

/* ── Table ──────────────────────────────────────────── */
.pg__table-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.tbl {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border-radius: var(--r-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.tbl thead th {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-3);
  background: var(--slate-50);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}
.tbl__row {
  border-bottom: 1px solid var(--color-border-sub);
  transition: background var(--t-fast);
  cursor: pointer;
}
.tbl__row:last-child { border-bottom: none; }
.tbl__row:hover { background: var(--indigo-50); }
.tbl tbody td { padding: 12px 14px; font-size: 13px; }

.usr-cell { display: flex; align-items: center; gap: 10px; }
.usr-av {
  width: 34px; height: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: white;
  flex-shrink: 0;
}
.usr-av--admin { background: linear-gradient(135deg, var(--indigo-500), var(--violet-500)); }
.usr-av--op    { background: linear-gradient(135deg, var(--emerald-500), var(--cyan-500)); }
.usr-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.usr-email { font-size: 11.5px; color: var(--color-text-3); }
.usr-login {
  font-size: 12px;
  font-family: 'Menlo', monospace;
  background: var(--slate-100);
  color: var(--indigo-600);
  padding: 2px 7px;
  border-radius: var(--r-xs);
}
.wh-tag {
  font-size: 12px;
  background: var(--slate-100);
  color: var(--color-text-2);
  padding: 3px 8px;
  border-radius: var(--r-sm);
}
.role-badge {
  font-size: 11px; font-weight: 700;
  padding: 3px 9px;
  border-radius: 99px;
}
.role-badge--admin { background: var(--indigo-100); color: var(--indigo-700); }
.role-badge--op    { background: var(--emerald-100); color: var(--emerald-700); }
.status-dot {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600;
}
.status-dot--on  { color: var(--emerald-600); }
.status-dot--off { color: var(--color-text-3); }
.status-dot--on::before  { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--emerald-500); }
.status-dot--off::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--slate-300); }

.tbl__actions { display: flex; gap: 4px; }
.tbl__act {
  width: 28px; height: 28px;
  border-radius: var(--r-sm);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background var(--t-fast), color var(--t-fast);
}
.tbl__act--edit { color: var(--color-text-3); }
.tbl__act--edit:hover { background: var(--indigo-50); color: var(--indigo-500); }
.tbl__act--del { color: var(--color-text-3); }
.tbl__act--del:hover { background: var(--rose-50); color: var(--rose-500); }
.tbl__empty { text-align: center; padding: 40px; color: var(--color-text-3); font-size: 13px; }

/* ── Modal overlay ──────────────────────────────────── */
.overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}

.modal {
  width: 100%;
  max-width: 960px;
  max-height: calc(100vh - 48px);
  background: var(--color-surface);
  border-radius: var(--r-2xl);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Modal header ───────────────────────────────────── */
.modal__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--indigo-50) 0%, #faf5ff 100%);
}
.modal__hdr-left { display: flex; align-items: center; gap: 14px; }
.modal__hdr-ico {
  width: 44px; height: 44px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  display: flex; align-items: center; justify-content: center;
  color: white;
  box-shadow: var(--shadow-indigo);
}
.modal__title { font-size: 15px; font-weight: 800; color: var(--color-text); letter-spacing: -0.02em; }
.modal__sub   { font-size: 12px; color: var(--color-text-3); margin-top: 2px; }

.modal__hdr-actions { display: flex; align-items: center; gap: 8px; }
.modal__save-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 0 16px; height: 36px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  color: white; font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow-indigo);
  transition: opacity var(--t-base);
}
.modal__save-btn:hover { opacity: 0.88; }
.modal__close-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 0 14px; height: 36px;
  border-radius: var(--r-md);
  border: 1.5px solid var(--color-border);
  color: var(--color-text-2); font-size: 13px; font-weight: 600; font-family: inherit;
  cursor: pointer; background: white;
  transition: background var(--t-base), color var(--t-base);
}
.modal__close-btn:hover { background: var(--rose-50); color: var(--rose-500); border-color: var(--rose-100); }

/* ── Modal body ─────────────────────────────────────── */
.modal__body {
  display: grid;
  grid-template-columns: 360px 1fr;
  flex: 1;
  overflow: hidden;
}

/* ── Left: Form ─────────────────────────────────────── */
.mform {
  padding: 20px;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mform__avatar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--slate-50);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
}
.mform__avatar {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--indigo-500), var(--violet-500));
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(99,102,241,0.2);
}
.mform__avatar-initials { color: white; font-size: 16px; font-weight: 800; text-transform: uppercase; }
.mform__avatar-name { font-size: 13.5px; font-weight: 700; color: var(--color-text); }
.mform__avatar-role { font-size: 11.5px; color: var(--color-text-3); margin-top: 2px; }

.mform__section-lbl {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-3);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border);
}

.mform__row { display: flex; gap: 10px; }
.mform__row--2 > * { flex: 1; min-width: 0; }

.mform__field { display: flex; flex-direction: column; gap: 5px; }

.mform__lbl { font-size: 12px; font-weight: 600; color: var(--color-text-2); }
.req { color: var(--rose-500); }

.mform__inp-wrap { position: relative; display: flex; align-items: center; }
.mform__inp-ico { position: absolute; left: 10px; color: var(--color-text-3); pointer-events: none; }

.mform__inp {
  width: 100%; height: 38px;
  padding: 0 11px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--r-md);
  font-size: 13px; font-family: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.mform__inp--icon { padding-left: 32px; }
.mform__inp:focus { border-color: var(--indigo-400); box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
.mform__inp--err { border-color: var(--rose-400); box-shadow: 0 0 0 3px rgba(244,63,94,0.1); }
.mform__select { cursor: pointer; }

.mform__checks { display: flex; flex-direction: column; gap: 8px; }
.mform__check {
  display: flex; align-items: center; gap: 9px;
  cursor: pointer;
}
.mform__checkbox { display: none; }
.mform__check-box {
  width: 18px; height: 18px;
  border-radius: 5px;
  border: 1.5px solid var(--color-border);
  background: white;
  display: flex; align-items: center; justify-content: center;
  transition: border-color var(--t-base), background var(--t-base);
  flex-shrink: 0;
}
.mform__checkbox:checked ~ .mform__check-box {
  background: var(--indigo-500);
  border-color: var(--indigo-500);
}
.mform__checkbox:checked ~ .mform__check-box::after {
  content: '';
  display: block;
  width: 4px; height: 7px;
  border-right: 2px solid white;
  border-bottom: 2px solid white;
  transform: rotate(45deg) translate(-1px, -1px);
}
.mform__check-lbl { font-size: 13px; color: var(--color-text-2); }

/* ── Right: Permissions ─────────────────────────────── */
.mperms {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mperms__hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--slate-50);
}
.mperms__title { font-size: 13.5px; font-weight: 800; color: var(--color-text); }
.mperms__sub   { font-size: 11.5px; color: var(--color-text-3); margin-top: 2px; }

.mperms__all-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 0 13px; height: 32px;
  border-radius: var(--r-md);
  border: 1.5px solid var(--color-border);
  background: white;
  font-size: 12px; font-weight: 600; font-family: inherit;
  color: var(--color-text-2); cursor: pointer;
  transition: all var(--t-base);
}
.mperms__all-btn:hover { border-color: var(--indigo-300); color: var(--indigo-600); }
.mperms__all-btn.is-all { background: var(--indigo-50); border-color: var(--indigo-300); color: var(--indigo-600); }

.mperms__table-wrap { flex: 1; overflow-y: auto; }

.ptbl { width: 100%; border-collapse: collapse; }
.ptbl thead th {
  position: sticky; top: 0;
  padding: 9px 14px;
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-text-3);
  background: white;
  border-bottom: 1px solid var(--color-border);
  text-align: center;
}
.ptbl thead th.ptbl__name-col { text-align: left; width: 50%; }

.ptbl__row { border-bottom: 1px solid var(--color-border-sub); transition: background var(--t-fast); }
.ptbl__row:last-child { border-bottom: none; }
.ptbl__row:hover { background: var(--slate-50); }
.ptbl__row--active { background: var(--indigo-50); }
.ptbl__row--active:hover { background: #e8eaff; }

.ptbl__lbl {
  padding: 10px 14px;
  font-size: 12.5px; color: var(--color-text);
  display: flex; align-items: center; gap: 8px;
  cursor: pointer;
  user-select: none;
}
.ptbl tbody td:not(.ptbl__lbl) { text-align: center; padding: 10px 8px; }

.ptbl__row-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--slate-200);
  flex-shrink: 0;
  transition: background var(--t-base);
}
.ptbl__row-dot--part { background: var(--amber-400); }
.ptbl__row-dot--full { background: var(--emerald-500); }

/* Permission checkbox */
.pchk { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.pchk__inp { display: none; }
.pchk__box {
  width: 18px; height: 18px;
  border-radius: 5px;
  border: 1.5px solid var(--slate-300);
  background: white;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--t-base);
}
.pchk__inp:checked ~ .pchk__box {
  background: var(--indigo-500);
  border-color: var(--indigo-500);
}
.pchk__inp:checked ~ .pchk__box::after {
  content: '';
  display: block;
  width: 4px; height: 7px;
  border-right: 2px solid white;
  border-bottom: 2px solid white;
  transform: rotate(45deg) translate(-1px, -1px);
}

/* ── API states ─────────────────────────────────────── */
.pg__err {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 24px 0;
  padding: 10px 14px;
  background: var(--rose-50);
  border: 1px solid var(--rose-100);
  border-radius: var(--r-md);
  font-size: 12.5px;
  color: var(--rose-600);
}
.pg__err-retry {
  margin-left: auto;
  font-size: 12px; font-weight: 600; font-family: inherit;
  color: var(--rose-600); cursor: pointer;
  text-decoration: underline;
}

.modal__save-err {
  font-size: 12px;
  color: var(--rose-500);
  max-width: 200px;
  text-align: right;
}

.modal__save-btn:disabled { opacity: 0.65; cursor: not-allowed; transform: none; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; display: inline-block; }

.tbl__spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid var(--slate-200);
  border-top-color: var(--indigo-500);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  vertical-align: middle;
  margin-right: 6px;
}
</style>
