/*
 * Ayuda: preguntas frecuentes, formulario de contacto y bandeja de mensajes.
 *
 * Los mensajes se guardan en Firestore (colección `feedback`). Cualquiera puede
 * enviar uno, con o sin sesión. Solo pueden leerlos las cuentas administradoras:
 * las que tienen un documento en `admins/{uid}` (se crea a mano en la consola de
 * Firebase, ver README).
 */
const APP_VERSION = '2026.11.29'
const COOLDOWN_MS = 60 * 1000
const app = window.PalavrasApp
const $ = (id) => document.getElementById(id)

const dialog = $('help-dialog')
let cloud = window.PalavrasCloud || null
let isAdmin = false
let unsubInbox = null
let inbox = []
let inboxFilter = 'open'

const TYPES = {
  sugerencia: '💡 Sugerencia',
  problema: '🐞 Algo no funciona',
  pedido: '🙋 Pedido',
  otro: '💬 Otro'
}
const STATUS = { new: 'Nuevo', seen: 'Visto', resolved: 'Resuelto' }

// ---------- Abrir y cerrar ----------
function openHelp () {
  const user = cloud && cloud.user
  const email = $('fb-email')
  if (user && user.email && !email.value) email.value = user.email
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}
function closeHelp () {
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}
$('help-btn').addEventListener('click', openHelp)
$('help-close').addEventListener('click', closeHelp)
// Tocar fuera del panel lo cierra.
dialog.addEventListener('click', (e) => { if (e.target === dialog) closeHelp() })

// ---------- Formulario ----------
const message = $('fb-message')
message.addEventListener('input', () => { $('fb-count').textContent = message.value.length + ' / 2000' })

function setStatus (text, kind) {
  const el = $('fb-status')
  el.textContent = text
  el.className = 'small fb-status ' + (kind || '')
}

$('feedback-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = message.value.trim()
  if (text.length < 5) { setStatus('Escribe un poco más (al menos 5 caracteres).', 'warn'); message.focus(); return }
  let last = 0
  try { last = Number(localStorage.getItem('palabras-pt:feedback-ultimo') || 0) } catch (err) {}
  if (Date.now() - last < COOLDOWN_MS) { setStatus('Acabas de enviar un mensaje. Espera un minuto para enviar otro.', 'warn'); return }
  if (!cloud) { setStatus('No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.', 'warn'); return }

  const { fs, db } = cloud
  const user = cloud.user
  const email = $('fb-email').value.trim().slice(0, 200)
  const data = {
    type: $('fb-type').value,
    message: text.slice(0, 2000),
    email: email || null,
    uid: user ? user.uid : null,
    name: user ? (user.displayName || null) : null,
    createdAt: Date.now(),
    userAgent: $('fb-tech').checked ? navigator.userAgent.slice(0, 400) : '',
    appVersion: $('fb-tech').checked ? APP_VERSION : '',
    status: 'new'
  }
  const button = e.target.querySelector('button[type=submit]')
  button.disabled = true
  setStatus('Enviando…')
  try {
    await fs.addDoc(fs.collection(db, 'feedback'), data)
    try { localStorage.setItem('palabras-pt:feedback-ultimo', String(Date.now())) } catch (err) {}
    message.value = ''
    $('fb-count').textContent = '0 / 2000'
    setStatus('¡Gracias! Recibimos tu mensaje.' + (email ? ' Si hace falta, te responderemos a ' + email + '.' : ''), 'ok')
    app.toast('¡Gracias por tu mensaje!', 'ok')
  } catch (err) {
    console.error(err)
    setStatus(err.code === 'permission-denied'
      ? 'No se pudo enviar: falta actualizar las reglas de Firestore.'
      : 'No se pudo enviar (' + (err.code || 'sin conexión') + '). Inténtalo de nuevo.', 'warn')
  } finally {
    button.disabled = false
  }
})

// ---------- Bandeja (solo administradores) ----------
if (cloud) start()
else window.addEventListener('palavras-cloud', (e) => { cloud = e.detail; start() }, { once: true })

function start () {
  window.addEventListener('palavras-user', (e) => checkAdmin(e.detail))
  if (cloud.user) checkAdmin(cloud.user)
}

async function checkAdmin (user) {
  if (unsubInbox) { unsubInbox(); unsubInbox = null }
  isAdmin = false
  inbox = []
  users = null
  if ($('users-details')) $('users-details').open = false
  renderInbox()
  if (!user) return
  const { fs, db } = cloud
  try {
    const snap = await fs.getDoc(fs.doc(db, 'admins', user.uid))
    isAdmin = snap.exists()
  } catch (err) {
    isAdmin = false // sin permiso o sin conexión: no es administrador
  }
  if (!isAdmin || !cloud.user || cloud.user.uid !== user.uid) { renderInbox(); return }
  const q = fs.query(fs.collection(db, 'feedback'), fs.orderBy('createdAt', 'desc'), fs.limit(100))
  unsubInbox = fs.onSnapshot(q, (snap) => {
    inbox = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    renderInbox()
  }, (err) => { console.error(err); renderInbox() })
  renderInbox()
}

function setFeedbackStatus (item, status) {
  const { fs, db } = cloud
  fs.updateDoc(fs.doc(db, 'feedback', item.id), { status }).catch((err) => app.toast('No se pudo actualizar (' + (err.code || 'error') + ').', 'info'))
}
function deleteFeedback (item) {
  if (!confirm('¿Borrar este mensaje?')) return
  const { fs, db } = cloud
  fs.deleteDoc(fs.doc(db, 'feedback', item.id)).catch((err) => app.toast('No se pudo borrar (' + (err.code || 'error') + ').', 'info'))
}

document.querySelectorAll('.inbox-filters .chip').forEach((b) => {
  b.addEventListener('click', () => {
    inboxFilter = b.dataset.status
    document.querySelectorAll('.inbox-filters .chip').forEach((x) => x.classList.toggle('active', x === b))
    renderInbox()
  })
})

function el (tag, attrs, children) {
  const node = document.createElement(tag)
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v)
  })
  ;(children || []).forEach((c) => { if (c != null) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c) })
  return node
}

// ---------- Usuarios (solo administradores) ----------
let users = null // [{ uid, ...perfil, email }]
let usersLoading = false
let usersQuery = ''

$('users-details').addEventListener('toggle', () => { if ($('users-details').open && !users) loadUsers() })
$('users-refresh').addEventListener('click', loadUsers)
$('users-search').addEventListener('input', () => { usersQuery = $('users-search').value.trim().toLowerCase(); renderUsers() })

async function loadUsers () {
  if (!isAdmin || usersLoading) return
  usersLoading = true
  $('users-note').textContent = 'Cargando usuarios…'
  const { fs, db } = cloud
  try {
    const [profs, emails] = await Promise.all([
      fs.getDocs(fs.collection(db, 'profiles')),
      fs.getDocs(fs.collection(db, 'emails'))
    ])
    const emailOf = {}
    emails.docs.forEach((d) => { emailOf[d.data().uid] = d.id })
    users = profs.docs.map((d) => ({ uid: d.id, ...d.data(), email: emailOf[d.id] || '' }))
    users.sort((a, b) => (b.lastSeen || b.updatedAt || 0) - (a.lastSeen || a.updatedAt || 0))
    $('users-note').textContent = ''
  } catch (err) {
    console.error(err)
    $('users-note').textContent = err.code === 'permission-denied'
      ? 'Sin permiso: falta publicar las reglas nuevas de Firestore.'
      : 'No se pudieron cargar los usuarios (' + (err.code || 'error') + ').'
  }
  usersLoading = false
  renderUsers()
}

function ago (ms) {
  if (!ms) return '—'
  const days = Math.floor((Date.now() - ms) / 864e5)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return 'hace ' + days + ' días'
  return new Date(ms).toLocaleDateString('es')
}

function miniAvatar (u) {
  const a = u.avatar
  const wrap = el('span', { class: 'mini-avatar', style: 'width:32px;height:32px;font-size:17px' })
  if (a && (a.type === 'photo' || a.type === 'url') && a.value) wrap.appendChild(el('img', { src: a.value, alt: '', referrerpolicy: 'no-referrer' }))
  else if (a && a.type === 'emoji') wrap.textContent = a.value
  else { wrap.classList.add('initial'); wrap.textContent = ((u.name || '?').charAt(0) || '?').toUpperCase() }
  return wrap
}

function renderUsers () {
  $('admin-users').hidden = !isAdmin
  if (!isAdmin || !users) { $('users-total').textContent = ''; return }
  const week = 7 * 864e5
  const active = users.filter((u) => u.lastSeen && Date.now() - u.lastSeen < week).length
  const fresh = users.filter((u) => u.joinedAt && Date.now() - u.joinedAt < week).length
  const words = users.reduce((n, u) => n + (u.wordCount || 0), 0)
  $('users-total').textContent = '(' + users.length + ')'
  const stat = (n, label) => el('div', { class: 'score' }, [el('span', { text: String(n) }), el('small', { text: label })])
  $('users-stats').replaceChildren(
    stat(users.length, 'usuarios'),
    stat(active, 'activos en 7 días'),
    stat(fresh, 'nuevos en 7 días'),
    stat(words, 'palabras en total')
  )
  const list = users.filter((u) => !usersQuery || (u.name || '').toLowerCase().includes(usersQuery) || (u.email || '').toLowerCase().includes(usersQuery))
  $('users-list').replaceChildren(...list.map((u) => {
    const c = u.challenge || {}
    return el('li', { class: 'user-row' }, [
      miniAvatar(u),
      el('div', { class: 'user-main' }, [
        el('div', {}, [
          el('strong', { text: u.name || 'Sin nombre' }),
          u.email ? el('span', { class: 'muted small' }, [' · ', el('a', { href: 'mailto:' + encodeURIComponent(u.email), text: u.email })]) : null
        ]),
        el('div', { class: 'muted small', text:
          'Registro: ' + (u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('es') : '—') +
          ' · Última visita: ' + ago(u.lastSeen) +
          ' · ' + (typeof u.wordCount === 'number' ? u.wordCount + ' palabras' : 'palabras: —') +
          ' · ' + (c.ok || 0) + ' pts' })
      ])
    ])
  }))
  $('users-note').textContent = users.length && !list.length ? 'Nadie coincide con la búsqueda.' : (users.some((u) => !u.lastSeen) ? 'Algunos datos («—») aparecen cuando el usuario vuelve a abrir la app.' : '')
}

function renderInbox () {
  renderUsers()
  $('inbox').hidden = !isAdmin
  const fresh = inbox.filter((m) => m.status === 'new').length
  for (const badge of [$('help-badge'), $('inbox-count')]) {
    badge.hidden = !isAdmin || !fresh
    badge.textContent = fresh
  }
  if (!isAdmin) { $('inbox-list').replaceChildren(); return }
  const items = inbox.filter((m) => inboxFilter === 'all' || (inboxFilter === 'resolved' ? m.status === 'resolved' : m.status !== 'resolved'))
  $('inbox-empty').hidden = items.length > 0
  $('inbox-list').replaceChildren(...items.map((m) => el('li', { class: 'inbox-item status-' + m.status }, [
    el('div', { class: 'inbox-head' }, [
      el('strong', { text: TYPES[m.type] || m.type }),
      el('span', { class: 'inbox-status', text: STATUS[m.status] || m.status }),
      el('span', { class: 'muted small', text: new Date(m.createdAt).toLocaleString('es') })
    ]),
    el('p', { class: 'inbox-message', text: m.message }),
    el('div', { class: 'muted small' }, [
      (m.name || 'Sin sesión iniciada'),
      m.email ? el('span', {}, [' · ', el('a', { href: 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Palavras: tu mensaje'), text: m.email })]) : ' · sin correo',
      m.appVersion ? ' · v' + m.appVersion : ''
    ]),
    m.userAgent ? el('details', { class: 'inbox-tech' }, [el('summary', { text: 'Información técnica' }), el('code', { text: m.userAgent })]) : null,
    el('div', { class: 'inbox-actions' }, [
      m.status !== 'seen' && m.status !== 'resolved' ? el('button', { type: 'button', class: 'link', text: 'Marcar como visto', onclick: () => setFeedbackStatus(m, 'seen') }) : null,
      m.status !== 'resolved' ? el('button', { type: 'button', class: 'link', text: '✓ Resuelto', onclick: () => setFeedbackStatus(m, 'resolved') }) : el('button', { type: 'button', class: 'link', text: 'Reabrir', onclick: () => setFeedbackStatus(m, 'seen') }),
      el('button', { type: 'button', class: 'link danger', text: 'Borrar', onclick: () => deleteFeedback(m) })
    ])
  ])))
}
