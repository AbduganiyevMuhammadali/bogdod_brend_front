import http from './http'

// Map backend shape → frontend shape
function toFrontend(u) {
  const [name = '', ...rest] = (u.fullname ?? '').split(' ')
  return {
    id:          u.id,
    name,
    surname:     rest.join(' '),
    login:       u.username,
    email:       u.email    ?? '',
    warehouse:   u.warehouse ?? '',
    role:        ['Admin', 'Programmer', 'Dasturchi'].includes(u.role) ? 'admin' : 'operator',
    active:      u.active !== false,
    perms:       u.permissions ?? null,
  }
}

// Map frontend form → backend payload
function toBackend(form, isNew = false) {
  const payload = {
    username:    form.login,
    fullname:    `${form.name} ${form.surname}`.trim(),
    role:        form.role === 'admin' ? 'Admin' : 'User',
    email:       form.email       || null,
    warehouse:   form.warehouse   || null,
    permissions: form.perms       || null,
    active:      form.active !== undefined ? form.active : true,
  }
  if (form.password) {
    payload.password        = form.password
    payload.confirmPassword = form.confirm
  } else if (isNew) {
    payload.password        = form.password
    payload.confirmPassword = form.confirm
  }
  return payload
}

export const usersApi = {
  getAll() {
    return http.get('/users').then(r => r.data.map(toFrontend))
  },

  // Joriy foydalanuvchi (ruxsatlari bilan) — sessiya davomida yangilash uchun
  getMe() {
    return http.get('/users/whoami').then(r => toFrontend(r.data))
  },

  create(form) {
    return http.post('/users', toBackend(form, true)).then(r => toFrontend(r.data))
  },

  update(id, form) {
    return http.patch(`/users/id/${id}`, toBackend(form, false)).then(r => toFrontend(r.data))
  },

  remove(id) {
    return http.delete(`/users/id/${id}`)
  },

  login(username, password) {
    return http.post('/users/login', { username, password }).then(r => {
      const user = r.data
      if (user.token) localStorage.setItem('token', user.token)
      return toFrontend(user)
    })
  },
}
