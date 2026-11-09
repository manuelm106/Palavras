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

function renderInbox () {
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
