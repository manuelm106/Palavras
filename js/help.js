/*
 * Ayuda: preguntas frecuentes, formulario de contacto y bandeja de mensajes.
 *
 * Los mensajes se guardan en Firestore (colección `feedback`). Cualquiera puede
 * enviar uno, con o sin sesión. Solo pueden leerlos las cuentas administradoras:
 * las que tienen un documento en `admins/{uid}` (se crea a mano en la consola de
 * Firebase, ver README).
 */
const APP_VERSION = '2026.11.29'
// Versión actual de la app (el ?v= con que se cargó), para marcar quién usa una versión vieja.
const CURRENT_V = new URL(import.meta.url).searchParams.get('v') || ''
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
  sugerencia: '💡 Sugestão',
  problema: '🐞 Algo não funciona',
  pedido: '🙋 Pedido',
  otro: '💬 Outro'
}
const STATUS = { new: 'Nova', seen: 'Vista', resolved: 'Resolvida' }

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
  if (text.length < 5) { setStatus('Escreva um pouco mais (pelo menos 5 caracteres).', 'warn'); message.focus(); return }
  let last = 0
  try { last = Number(localStorage.getItem('palabras-pt:feedback-ultimo') || 0) } catch (err) {}
  if (Date.now() - last < COOLDOWN_MS) { setStatus('Você acabou de enviar uma mensagem. Espere um minuto para enviar outra.', 'warn'); return }
  if (!cloud) { setStatus('Não foi possível conectar. Confira sua conexão e tente de novo.', 'warn'); return }

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
    setStatus('Obrigado! Recebemos sua mensagem.' + (email ? ' Se for preciso, responderemos para ' + email + '.' : ''), 'ok')
    app.toast('Obrigado pela sua mensagem!', 'ok')
  } catch (err) {
    console.error(err)
    setStatus(err.code === 'permission-denied'
      ? 'Não foi possível enviar: falta atualizar as regras do Firestore.'
      : 'Não foi possível enviar (' + (err.code || 'sem conexão') + '). Tente de novo.', 'warn')
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
  setDiag(user, user ? 'Verificando…' : null)
  if (!user) return
  const { fs, db } = cloud
  try {
    const snap = await fs.getDocFromServer(fs.doc(db, 'admins', user.uid))
    isAdmin = snap.exists()
    setDiag(user, isAdmin
      ? '✔ Sua conta é administradora.'
      : 'Não encontrei o documento admins/' + user.uid + '. Crie-o no Firestore (coleção «admins», ID do documento = seu UID).')
  } catch (err) {
    isAdmin = false
    // permission-denied: las reglas publicadas no tienen la parte de administradores.
    setDiag(user, err.code === 'permission-denied'
      ? 'O Firebase não permite verificar: falta publicar as regras novas do Firestore.'
      : 'Não foi possível verificar (' + (err.code || 'sem conexão') + '). Confira sua conexão.')
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
  fs.updateDoc(fs.doc(db, 'feedback', item.id), { status }).catch((err) => app.toast('Não foi possível atualizar (' + (err.code || 'error') + ').', 'info'))
}
function deleteFeedback (item) {
  if (!confirm('Apagar esta mensagem?')) return
  const { fs, db } = cloud
  fs.deleteDoc(fs.doc(db, 'feedback', item.id)).catch((err) => app.toast('Não foi possível apagar (' + (err.code || 'error') + ').', 'info'))
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
  $('users-note').textContent = 'Carregando usuários…'
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
      ? 'Sem permissão: falta publicar as regras novas do Firestore.'
      : 'Não foi possível carregar os usuários (' + (err.code || 'error') + ').'
  }
  usersLoading = false
  renderUsers()
}

function ago (ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 864e5)
  if (days <= 0) return 'hoje ' + time
  if (days === 1) return 'ontem ' + time
  if (days < 30) return 'há ' + days + ' dias'
  return new Date(ms).toLocaleDateString('pt-BR')
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
    stat(users.length, 'usuários'),
    stat(active, 'ativos em 7 dias'),
    stat(fresh, 'novos em 7 dias'),
    stat(words, 'palavras no total')
  )
  const list = users.filter((u) => !usersQuery || (u.name || '').toLowerCase().includes(usersQuery) || (u.email || '').toLowerCase().includes(usersQuery))
  $('users-list').replaceChildren(...list.map((u) => {
    const c = u.challenge || {}
    return el('li', { class: 'user-row' }, [
      miniAvatar(u),
      el('div', { class: 'user-main' }, [
        el('div', {}, [
          el('strong', { text: u.name || 'Sem nome' }),
          u.email ? el('span', { class: 'muted small' }, [' · ', el('a', { href: 'mailto:' + encodeURIComponent(u.email), text: u.email })]) : null
        ]),
        el('div', { class: 'muted small', text:
          'Cadastro: ' + (u.joinedAt ? new Date(u.joinedAt).toLocaleDateString('pt-BR') : '—') +
          ' · Última visita: ' + ago(u.lastSeen) +
          ' · ' + (typeof u.wordCount === 'number' ? u.wordCount + ' palavras' : 'palavras: —') +
          ' · ' + (c.ok || 0) + ' pts' +
          ' · versão ' + (u.appVersion ? u.appVersion + (u.appVersion === CURRENT_V ? ' ✓' : ' (antiga)') : 'antiga') })
      ])
    ])
  }))
  $('users-note').textContent = users.length && !list.length ? 'Ninguém corresponde à busca.' : (users.some((u) => u.appVersion !== CURRENT_V) ? 'Quem aparece com «versão antiga» ainda não abriu a versão atual: os dados dessa pessoa (por exemplo, a quantidade de palavras) são atualizados quando ela abrir.' : '')
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
      el('span', { class: 'muted small', text: new Date(m.createdAt).toLocaleString('pt-BR') })
    ]),
    el('p', { class: 'inbox-message', text: m.message }),
    el('div', { class: 'muted small' }, [
      (m.name || 'Sem login'),
      m.email ? el('span', {}, [' · ', el('a', { href: 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Palavras: sua mensagem'), text: m.email })]) : ' · sem e-mail',
      m.appVersion ? ' · v' + m.appVersion : ''
    ]),
    m.userAgent ? el('details', { class: 'inbox-tech' }, [el('summary', { text: 'Informações técnicas' }), el('code', { text: m.userAgent })]) : null,
    el('div', { class: 'inbox-actions' }, [
      m.status !== 'seen' && m.status !== 'resolved' ? el('button', { type: 'button', class: 'link', text: 'Marcar como vista', onclick: () => setFeedbackStatus(m, 'seen') }) : null,
      m.status !== 'resolved' ? el('button', { type: 'button', class: 'link', text: '✓ Resolvida', onclick: () => setFeedbackStatus(m, 'resolved') }) : el('button', { type: 'button', class: 'link', text: 'Reabrir', onclick: () => setFeedbackStatus(m, 'seen') }),
      el('button', { type: 'button', class: 'link danger', text: 'Apagar', onclick: () => deleteFeedback(m) })
    ])
  ])))
}


// ---------- Diagnóstico de la cuenta (UID y estado de administrador) ----------
function setDiag (user, text) {
  const box = $('diag')
  if (!box) return
  box.hidden = !user
  if (!user) return
  $('diag-uid').textContent = user.uid
  $('diag-admin').textContent = text || ''
}
$('diag-copy').addEventListener('click', async () => {
  const uid = $('diag-uid').textContent
  try { await navigator.clipboard.writeText(uid); app.toast('UID copiado.', 'ok') } catch (e) {
    const r = document.createRange(); r.selectNodeContents($('diag-uid'))
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
    app.toast('Selecione e copie o UID.', 'info')
  }
})
