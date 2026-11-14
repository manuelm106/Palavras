/*
 * Ranking del desafío entre el usuario y sus amigos.
 * Lee profiles/{uid}.challenge de cada uno: { ok, fail, best, weeks: { '2026-W46': { ok, fail } } }.
 * Se actualiza al abrir la pestaña del desafío y después de cada ronda.
 */
const $ = (id) => document.getElementById(id)
const MODE_KEY = 'palabras-pt:ranking-modo'
const MIN_REFRESH_MS = 30 * 1000

let cloud = window.PalavrasCloud || null
let user = null
let tab = null
let mode = 'week'
let rows = []
let lastLoad = 0
let loading = false

try { mode = localStorage.getItem(MODE_KEY) === 'total' ? 'total' : 'week' } catch (e) {}

if (cloud) start()
else window.addEventListener('palavras-cloud', (e) => { cloud = e.detail; start() }, { once: true })
render()

function start () {
  user = cloud.user
  window.addEventListener('palavras-user', (e) => { user = e.detail; rows = []; lastLoad = 0; render(); maybeLoad() })
  window.addEventListener('palavras-tab', (e) => { tab = e.detail; maybeLoad() })
  window.addEventListener('palavras-friends', () => { lastLoad = 0; maybeLoad() })
  window.addEventListener('palavras-challenge-updated', () => { lastLoad = 0; maybeLoad() })
  maybeLoad()
}

document.querySelectorAll('.lb-modes .chip').forEach((b) => {
  b.addEventListener('click', () => {
    mode = b.dataset.mode
    try { localStorage.setItem(MODE_KEY, mode) } catch (e) {}
    render()
  })
})

function weekId () {
  return window.PalavrasChallenge && window.PalavrasChallenge.weekId ? window.PalavrasChallenge.weekId() : ''
}

function maybeLoad () {
  const visible = tab === 'challenge' || ($('view-challenge') && !$('view-challenge').hidden)
  if (!cloud || !user || !visible || loading) return
  if (Date.now() - lastLoad < MIN_REFRESH_MS) return
  load()
}

async function load () {
  loading = true
  const { fs, db } = cloud
  const friends = (window.PalavrasSocial && window.PalavrasSocial.friendIds()) || []
  const ids = [user.uid].concat(friends)
  const results = await Promise.all(ids.map((uid) => fs.getDocFromServer(fs.doc(db, 'profiles', uid)).catch(() => fs.getDoc(fs.doc(db, 'profiles', uid))).then(
    (snap) => ({ uid, data: snap.exists() ? snap.data() : {} }),
    () => ({ uid, data: {} })
  )))
  rows = results
  lastLoad = Date.now()
  loading = false
  render()
}

function scoreOf (data) {
  const c = data.challenge || {}
  if (mode === 'week') {
    const w = (c.weeks && c.weeks[weekId()]) || {}
    return { ok: w.ok || 0, fail: w.fail || 0, best: c.best || 0 }
  }
  return { ok: c.ok || 0, fail: c.fail || 0, best: c.best || 0 }
}

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

function avatar (data) {
  const a = data.avatar
  const wrap = el('span', { class: 'mini-avatar', style: 'width:30px;height:30px;font-size:16px' })
  if (a && (a.type === 'photo' || a.type === 'url') && a.value) wrap.appendChild(el('img', { src: a.value, alt: '', referrerpolicy: 'no-referrer' }))
  else if (a && a.type === 'emoji') wrap.textContent = a.value
  else { wrap.classList.add('initial'); wrap.textContent = ((data.name || '?').charAt(0) || '?').toUpperCase() }
  return wrap
}

function render () {
  document.querySelectorAll('.lb-modes .chip').forEach((b) => {
    const on = b.dataset.mode === mode
    b.classList.toggle('active', on)
    b.setAttribute('aria-pressed', String(on))
  })
  const list = $('lb-list')
  const note = $('lb-note')
  if (!cloud || !user) {
    note.textContent = 'Entre com o Google e adicione amigos em 👥 Amigos para competir no ranking.'
    list.replaceChildren()
    return
  }
  if (!rows.length) { note.textContent = loading ? 'Carregando ranking…' : ''; list.replaceChildren(); return }

  const scored = rows.map((r) => {
    const s = scoreOf(r.data)
    const total = s.ok + s.fail
    return { uid: r.uid, data: r.data, ok: s.ok, total, acc: total ? Math.round(100 * s.ok / total) : null, best: s.best }
  }).sort((a, b) => b.ok - a.ok || (b.acc || 0) - (a.acc || 0) || (a.uid === user.uid ? -1 : 1))

  note.textContent = rows.length === 1
    ? 'Você ainda não tem amigos: adicione-os em 👥 Amigos para competir.'
    : (mode === 'week' && scored.every((r) => !r.total) ? 'Ninguém jogou nesta semana ainda. Comece você!' : '')

  const medals = ['🥇', '🥈', '🥉']
  let place = 0
  let prev = null
  list.replaceChildren(...scored.map((r, i) => {
    if (!prev || r.ok !== prev.ok || r.acc !== prev.acc) place = i + 1
    prev = r
    const me = r.uid === user.uid
    const isFriend = !me && window.PalavrasSocial
    return el('li', { class: 'lb-row' + (me ? ' me' : '') }, [
      el('span', { class: 'lb-place', text: r.ok && place <= 3 ? medals[place - 1] : String(place) }),
      avatar(r.data),
      el('span', { class: 'lb-name' }, [
        isFriend
          ? el('button', { type: 'button', class: 'link lb-link', text: r.data.name || 'Amigo', onclick: () => window.PalavrasSocial.openProfile(r.uid) })
          : el('strong', { text: me ? 'Você' : (r.data.name || '…') }),
        el('span', { class: 'muted small lb-detail', text: (r.acc === null ? 'sem jogar' : r.acc + '% de acertos') + (r.best ? ' · sequência ' + r.best : '') })
      ]),
      el('span', { class: 'lb-points', text: r.ok + (r.ok === 1 ? ' pt' : ' pts') })
    ])
  }))
}
