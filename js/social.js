/*
 * Amigos y compartir (requiere iniciar sesión con Google).
 *
 * Colecciones de Firestore:
 *   emails/{correo}           → { uid }                 encontrar a alguien por su correo exacto
 *   profiles/{uid}            → { name, avatar }        nombre y foto que ven los demás
 *   friendships/{uidA_uidB}   → { members, requestedBy, status: 'pending' | 'accepted' }
 *   posts/{id}                → palabra o frase compartida, con `audience` (amigos que la ven)
 *                               y `likes` ({ uid: true })
 * Los ids de los posts empiezan con un número que decrece con el tiempo: así, ordenados
 * por id, los más nuevos quedan primero (sin necesidad de índices compuestos).
 */
const app = window.PalavrasApp
const $ = (id) => document.getElementById(id)

let cloud = window.PalavrasCloud || null
let user = null
let friendships = new Map() // id -> datos
let profiles = new Map() // uid -> perfil (o promesa)
let feed = []
let mine = []
let unsubFriends = null
let unsubFeed = null
let unsubMine = null
let knownIncoming = null
let prevLikes = null // postId -> Set de uids, para avisar de likes nuevos
let prevComments = null // postId -> lastCommentAt, para avisar de comentarios nuevos
// Comentarios: se cargan solo para las conversaciones abiertas.
const openThreads = new Set()
const threadData = new Map() // postId -> comentarios
const threadUnsub = new Map() // postId -> función para dejar de escuchar
const drafts = new Map() // postId -> texto que se está escribiendo
let likesSeenAt = 0 // hasta cuándo ya se vieron los likes (para el número de la pestaña)
let highlightSince = 0 // likes más nuevos que esto se marcan como «nuevo»
const likesKey = () => 'palabras-pt:likes-vistos:' + (user ? user.uid : '')
const likeTime = (v) => (typeof v === 'number' ? v : 0) // versiones anteriores guardaban `true`
let tab = null

const pairId = (a, b) => (a < b ? a + '_' + b : b + '_' + a)
const otherOf = (f) => f.members.find((m) => m !== user.uid)
const newPostId = (uid) => String(9e15 - Date.now()).padStart(16, '0') + '_' + uid.slice(0, 8) + Math.random().toString(36).slice(2, 6)

if (cloud) start()
else window.addEventListener('palavras-cloud', (e) => { cloud = e.detail; start() }, { once: true })

function start () {
  window.addEventListener('palavras-user', (e) => onUser(e.detail))
  window.addEventListener('palavras-tab', (e) => { tab = e.detail; syncFeedListeners() })
  window.addEventListener('palavras-profile', () => { if (user) profiles.delete(user.uid) })
  if (cloud.user !== undefined) onUser(cloud.user)
}

// ---------- Sesión ----------
function onUser (u) {
  if (unsubFriends) { unsubFriends(); unsubFriends = null }
  if (unsubMine) { unsubMine(); unsubMine = null }
  stopFeed()
  user = u
  friendships = new Map()
  feed = []
  mine = []
  knownIncoming = null
  prevLikes = null
  prevComments = null
  Array.from(openThreads).forEach(closeThread)
  $('tab-friends').hidden = !u
  if (!u) {
    if (!$('view-friends').hidden) window.PalavrasTabs.show('words')
    renderAll()
    return
  }
  const { fs, db } = cloud
  const q = fs.query(fs.collection(db, 'friendships'), fs.where('members', 'array-contains', u.uid))
  unsubFriends = fs.onSnapshot(q, (snap) => {
    friendships = new Map(snap.docs.map((d) => [d.id, d.data()]))
    window.dispatchEvent(new CustomEvent('palavras-friends'))
    notifyNewRequests()
    friendships.forEach((f) => loadProfile(otherOf(f)))
    renderAll()
  }, (err) => showError(err))

  // Lo que compartí: se escucha siempre (pocas lecturas) para avisar de likes nuevos.
  try { likesSeenAt = Number(localStorage.getItem(likesKey()) || 0) } catch (e) { likesSeenAt = 0 }
  highlightSince = likesSeenAt
  const mineQuery = fs.query(fs.collection(db, 'posts'), fs.where('owner', '==', u.uid), fs.limit(20))
  unsubMine = fs.onSnapshot(mineQuery, (snap) => {
    mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    mine.forEach((p) => Object.keys(p.likes || {}).forEach(loadProfile))
    notifyNewLikes()
    notifyNewComments()
    closeMissingThreads()
    if (tab === 'friends') markLikesSeen()
    renderPosts()
    renderBadge()
  }, (err) => showError(err))

  if (window.PalavrasTabs.saved === 'friends') {
    window.PalavrasTabs.saved = null
    window.PalavrasTabs.show('friends')
  }
  renderAll()
}

function notifyNewRequests () {
  const incoming = new Set(incomingRequests().map(([id]) => id))
  if (knownIncoming) {
    incoming.forEach((id) => {
      if (!knownIncoming.has(id)) {
        const from = friendships.get(id).requestedBy
        loadProfile(from).then((p) => app.toast((p ? p.name : 'Alguien') + ' te envió una solicitud de amistad. Mírala en 👥 Amigos.', 'ok'))
      }
    })
  }
  knownIncoming = incoming
}

// ---------- Listas ----------
function acceptedFriends () {
  return Array.from(friendships.values()).filter((f) => f.status === 'accepted').map(otherOf)
}
function incomingRequests () {
  return Array.from(friendships.entries()).filter(([, f]) => f.status === 'pending' && f.requestedBy !== user.uid)
}
function outgoingRequests () {
  return Array.from(friendships.entries()).filter(([, f]) => f.status === 'pending' && f.requestedBy === user.uid)
}

// ---------- Perfiles ----------
function loadProfile (uid) {
  if (!uid) return Promise.resolve(null)
  const cached = profiles.get(uid)
  if (cached) return cached instanceof Promise ? cached : Promise.resolve(cached)
  const { fs, db } = cloud
  const p = fs.getDoc(fs.doc(db, 'profiles', uid))
    .then((snap) => {
      const data = snap.exists() ? snap.data() : { name: 'Usuario', avatar: null }
      profiles.set(uid, data)
      renderAll()
      return data
    })
    .catch(() => { profiles.delete(uid); return null })
  profiles.set(uid, p)
  return p
}
function profileOf (uid) {
  const p = profiles.get(uid)
  return p && !(p instanceof Promise) ? p : null
}

// ---------- Novedades (solo con la pestaña abierta, para ahorrar lecturas) ----------
function syncFeedListeners () {
  if (user && tab === 'friends') startFeed()
  else stopFeed()
}
function startFeed () {
  if (unsubFeed) return
  const { fs, db } = cloud
  const col = fs.collection(db, 'posts')
  unsubFeed = fs.onSnapshot(fs.query(col, fs.where('audience', 'array-contains', user.uid), fs.limit(40)), (snap) => {
    feed = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    feed.forEach((p) => loadProfile(p.owner))
    closeMissingThreads()
    renderPosts()
  }, (err) => showError(err))
  // Al abrir la pestaña: se marcan los likes como vistos (pero se resaltan los nuevos).
  highlightSince = likesSeenAt
  markLikesSeen()
  renderMine()
  renderBadge()
}
function stopFeed () {
  if (unsubFeed) { unsubFeed(); unsubFeed = null }
}

// ---------- Likes recibidos ----------
function postTitle (p) {
  if (p.type === 'phrase') return '«' + String(p.pt || '').slice(0, 40) + (String(p.pt || '').length > 40 ? '…' : '') + '»'
  return '«' + p.word + '»'
}
function notifyNewLikes () {
  const current = new Map(mine.map((p) => [p.id, new Set(Object.keys(p.likes || {}))]))
  if (prevLikes) {
    mine.forEach((p) => {
      const before = prevLikes.get(p.id) || new Set()
      current.get(p.id).forEach((uid) => {
        if (!before.has(uid) && uid !== user.uid) {
          loadProfile(uid).then((pr) => app.toast((pr ? pr.name : 'Un amigo') + ' le dio ❤️ a ' + postTitle(p) + '.', 'ok'))
        }
      })
    })
  }
  prevLikes = current
}
function notifyNewComments () {
  const current = new Map(mine.map((p) => [p.id, p.lastCommentAt || 0]))
  if (prevComments) {
    mine.forEach((p) => {
      if ((p.lastCommentAt || 0) > (prevComments.get(p.id) || 0) && p.lastCommentBy && p.lastCommentBy !== user.uid) {
        loadProfile(p.lastCommentBy).then((pr) => app.toast('💬 ' + (pr ? pr.name : 'Un amigo') + ' comentó en ' + postTitle(p) + '.', 'ok'))
      }
    })
  }
  prevComments = current
}
// Cuenta likes nuevos y publicaciones propias con comentarios nuevos de otros.
function unseenLikes () {
  let n = 0
  mine.forEach((p) => {
    Object.entries(p.likes || {}).forEach(([uid, v]) => { if (uid !== user.uid && likeTime(v) > likesSeenAt) n++ })
    if ((p.lastCommentAt || 0) > likesSeenAt && p.lastCommentBy && p.lastCommentBy !== user.uid) n++
  })
  return n
}
function markLikesSeen () {
  let latest = likesSeenAt
  mine.forEach((p) => {
    Object.values(p.likes || {}).forEach((v) => { latest = Math.max(latest, likeTime(v)) })
    latest = Math.max(latest, p.lastCommentAt || 0)
  })
  if (latest === likesSeenAt) return
  likesSeenAt = latest
  try { localStorage.setItem(likesKey(), String(likesSeenAt)) } catch (e) {}
}
function renderBadge () {
  const n = (user ? incomingRequests().length : 0) + (user ? unseenLikes() : 0)
  const badge = $('friends-badge')
  badge.hidden = !n
  badge.textContent = n
}

// ---------- Comentarios ----------
function openThread (postId) {
  if (openThreads.has(postId)) return
  openThreads.add(postId)
  const { fs, db } = cloud
  const q = fs.query(fs.collection(db, 'posts', postId, 'comments'), fs.orderBy('createdAt'), fs.limit(100))
  threadUnsub.set(postId, fs.onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    list.forEach((c) => loadProfile(c.author))
    threadData.set(postId, list)
    renderPosts()
  }, (err) => { showError(err); closeThread(postId); renderPosts() }))
  renderPosts()
}
function closeThread (postId) {
  openThreads.delete(postId)
  const unsub = threadUnsub.get(postId)
  if (unsub) unsub()
  threadUnsub.delete(postId)
  threadData.delete(postId)
}
function closeMissingThreads () {
  const ids = new Set(feed.concat(mine).map((p) => p.id))
  Array.from(openThreads).forEach((id) => { if (!ids.has(id)) closeThread(id) })
}

async function sendComment (post, text) {
  text = String(text || '').trim().slice(0, 500)
  if (!text) return false
  const { fs, db } = cloud
  const batch = fs.writeBatch(db)
  const now = Date.now()
  batch.set(fs.doc(fs.collection(db, 'posts', post.id, 'comments')), { author: user.uid, text, createdAt: now })
  batch.update(fs.doc(db, 'posts', post.id), { commentCount: fs.increment(1), lastCommentAt: now, lastCommentBy: user.uid })
  try {
    await batch.commit()
    return true
  } catch (err) {
    showError(err)
    app.toast('No se pudo enviar el comentario (' + (err.code || 'error') + ').', 'info')
    return false
  }
}

function deleteComment (post, comment) {
  if (!confirm('¿Borrar este comentario?')) return
  const { fs, db } = cloud
  const batch = fs.writeBatch(db)
  batch.delete(fs.doc(db, 'posts', post.id, 'comments', comment.id))
  batch.update(fs.doc(db, 'posts', post.id), { commentCount: fs.increment(-1) })
  batch.commit().catch((err) => {
    showError(err)
    app.toast('No se pudo borrar el comentario (' + (err.code || 'error') + ').', 'info')
  })
}

function commentToggle (p) {
  const count = Math.max(0, p.commentCount || 0)
  const open = openThreads.has(p.id)
  const isNew = p.owner === user.uid && (p.lastCommentAt || 0) > highlightSince && p.lastCommentBy !== user.uid
  return el('button', {
    type: 'button',
    class: 'link comment-toggle' + (isNew ? ' has-new' : ''),
    'aria-expanded': String(open),
    onclick: () => (open ? (closeThread(p.id), renderPosts()) : openThread(p.id))
  }, ['💬 ' + (count ? count + (count === 1 ? ' comentario' : ' comentarios') : 'Comentar') + (isNew ? ' · nuevo' : '')])
}

function commentThread (p) {
  if (!openThreads.has(p.id)) return null
  const list = threadData.get(p.id)
  const items = !list
    ? [el('li', { class: 'muted small', text: 'Cargando comentarios…' })]
    : !list.length
        ? [el('li', { class: 'muted small', text: 'Todavía no hay comentarios. ¡Escribe el primero!' })]
        : list.map((c) => el('li', { class: 'comment' }, [
          avatarEl(c.author, 26),
          el('div', { class: 'comment-main' }, [
            el('div', { class: 'comment-head' }, [
              el('strong', { text: c.author === user.uid ? 'Tú' : nameOf(c.author) }),
              el('span', { class: 'muted small', text: timeAgo(c.createdAt) }),
              c.author === user.uid || p.owner === user.uid
                ? el('button', { type: 'button', class: 'link danger small-link', text: 'Borrar', onclick: () => deleteComment(p, c) })
                : null
            ]),
            el('p', { class: 'comment-text', text: c.text })
          ])
        ]))
  const input = el('input', {
    type: 'text',
    maxlength: '500',
    placeholder: 'Escribe un comentario…',
    'aria-label': 'Escribe un comentario',
    'data-comment-for': p.id
  })
  input.value = drafts.get(p.id) || ''
  input.addEventListener('input', () => drafts.set(p.id, input.value))
  const form = el('form', {
    class: 'comment-form',
    onsubmit: async (e) => {
      e.preventDefault()
      const text = input.value
      if (!text.trim()) return
      // Se limpia antes de enviar: la pantalla puede redibujarse mientras se guarda.
      drafts.delete(p.id)
      input.value = ''
      const ok = await sendComment(p, text)
      const current = document.querySelector('[data-comment-for="' + CSS.escape(p.id) + '"]') || input
      if (!ok) { drafts.set(p.id, text); current.value = text }
      current.focus()
    }
  }, [input, el('button', { type: 'submit', class: 'btn small', text: 'Enviar' })])
  return el('div', { class: 'comments' }, [el('ul', { class: 'comment-list' }, items), form])
}

// Vuelve a dibujar las publicaciones sin perder el foco ni lo que se está escribiendo.
function renderPosts () {
  const active = document.activeElement
  const pid = active && active.dataset ? active.dataset.commentFor : null
  const pos = pid ? active.selectionStart : null
  renderFeed()
  renderMine()
  if (pid) {
    const again = document.querySelector('[data-comment-for="' + CSS.escape(pid) + '"]')
    if (again) { again.focus(); try { again.setSelectionRange(pos, pos) } catch (e) {} }
  }
}

// ---------- Acciones ----------
$('friend-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!user) return
  const input = $('friend-email')
  const email = input.value.trim().toLowerCase()
  if (!email) return
  if (email === (user.email || '').toLowerCase()) { setMsg('Ese es tu propio correo 🙂'); return }
  const { fs, db } = cloud
  setMsg('Buscando…')
  try {
    const found = await fs.getDoc(fs.doc(db, 'emails', email))
    if (!found.exists()) {
      setMsg('No encontramos a nadie con ese correo. Pídele que abra Palavras e inicie sesión con Google al menos una vez.')
      return
    }
    const fid = found.data().uid
    const id = pairId(user.uid, fid)
    const existing = friendships.get(id)
    const p = await loadProfile(fid)
    const name = p ? p.name : email
    if (existing && existing.status === 'accepted') { setMsg('Ya eres amigo de ' + name + '.'); return }
    if (existing && existing.requestedBy === user.uid) { setMsg('Ya le enviaste una solicitud a ' + name + '. Falta que la acepte.'); return }
    if (existing) { await accept(id); setMsg(name + ' ya te había enviado una solicitud: ahora son amigos. 🎉'); input.value = ''; return }
    await fs.setDoc(fs.doc(db, 'friendships', id), {
      members: [user.uid, fid].sort(),
      requestedBy: user.uid,
      status: 'pending',
      createdAt: Date.now()
    })
    input.value = ''
    setMsg('Solicitud enviada a ' + name + '. Cuando la acepte, verán lo que comparten.')
  } catch (err) {
    showError(err)
    setMsg('No se pudo enviar la solicitud (' + (err.code || 'error') + ').')
  }
})

function accept (id) {
  const { fs, db } = cloud
  return fs.updateDoc(fs.doc(db, 'friendships', id), { status: 'accepted', acceptedAt: Date.now() }).catch(showError)
}
function removeFriendship (id, question) {
  if (question && !confirm(question)) return
  const { fs, db } = cloud
  fs.deleteDoc(fs.doc(db, 'friendships', id)).catch(showError)
}

async function createPost (data, what) {
  if (!user) { app.toast('Inicia sesión con Google para compartir con tus amigos.', 'info'); return }
  const friends = acceptedFriends()
  if (!friends.length) {
    app.toast('Todavía no tienes amigos. Agrégalos por correo en la pestaña 👥 Amigos.', 'info')
    return
  }
  const { fs, db } = cloud
  const me = profileOf(user.uid)
  const post = Object.assign({
    owner: user.uid,
    ownerName: (me && me.name) || user.displayName || 'Usuario',
    createdAt: Date.now(),
    audience: friends,
    likes: {}
  }, data)
  try {
    await fs.setDoc(fs.doc(db, 'posts', newPostId(user.uid)), JSON.parse(JSON.stringify(post)))
    app.toast('Compartiste ' + what + ' con ' + friends.length + (friends.length === 1 ? ' amigo.' : ' amigos.'), 'ok')
  } catch (err) {
    showError(err)
    app.toast('No se pudo compartir (' + (err.code || 'error') + ').', 'info')
  }
}

function toggleLike (post) {
  const { fs, db } = cloud
  const liked = !!(post.likes && post.likes[user.uid])
  // Se guarda la hora del like: así el autor sabe cuáles son nuevos.
  fs.updateDoc(fs.doc(db, 'posts', post.id), new fs.FieldPath('likes', user.uid), liked ? fs.deleteField() : Date.now()).catch(showError)
}

async function deletePost (post) {
  if (!confirm('¿Dejar de compartir esto? Tus amigos ya no lo verán (ni sus comentarios).')) return
  const { fs, db } = cloud
  try {
    closeThread(post.id)
    // Firestore no borra solas las subcolecciones: primero los comentarios.
    const comments = await fs.getDocs(fs.collection(db, 'posts', post.id, 'comments'))
    for (let i = 0; i < comments.docs.length; i += 400) {
      const batch = fs.writeBatch(db)
      comments.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    await fs.deleteDoc(fs.doc(db, 'posts', post.id))
  } catch (err) {
    showError(err)
    app.toast('No se pudo dejar de compartir (' + (err.code || 'error') + ').', 'info')
  }
}

// API para el resto de la app (botón 📤 de cada palabra y de la frase del día).
window.PalavrasSocial = {
  friendIds () { return user ? acceptedFriends() : [] },
  openProfile (uid) { openProfile(uid) },
  shareWord (w, example) {
    const data = {
      type: 'word',
      word: w.word,
      category: w.category,
      meaning: w.meaning || '',
      example: example || (w.examples || [])[0] || ''
    }
    if (w.category === 'sustantivo' && app.nounGender) {
      const g = app.nounGender(w)
      data.gender = g.g
      data.article = g.article
    }
    createPost(data, '«' + w.word + '»')
  },
  sharePhrase (q) {
    createPost({ type: 'phrase', kind: q.label, icon: q.icon, pt: q.pt, es: q.es }, 'la frase')
  }
}

$('quote-share').addEventListener('click', () => {
  const pt = $('quote-pt').textContent
  if (!pt) return
  const kindText = $('quote-kind').textContent
  const icon = kindText.split(' ')[0]
  window.PalavrasSocial.sharePhrase({ icon, label: kindText.slice(icon.length).trim(), pt, es: $('quote-es').textContent })
})

// ---------- Interfaz ----------
function setMsg (text) { $('friend-msg').textContent = text }

function showError (err) {
  console.error(err)
  if (err && err.code === 'permission-denied') {
    setMsg('Sin permiso: hay que actualizar las reglas de Firestore para usar amigos.')
  }
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

function avatarEl (uid, size) {
  const p = profileOf(uid)
  const a = p && p.avatar
  const wrap = el('span', { class: 'mini-avatar', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px` })
  if (a && (a.type === 'photo' || a.type === 'url') && a.value) {
    wrap.appendChild(el('img', { src: a.value, alt: '', referrerpolicy: 'no-referrer' }))
  } else if (a && a.type === 'emoji') {
    wrap.textContent = a.value
  } else {
    wrap.classList.add('initial')
    wrap.textContent = ((p && p.name) || '?').charAt(0).toUpperCase()
  }
  return wrap
}

function nameOf (uid, fallback) {
  const p = profileOf(uid)
  return (p && p.name) || fallback || '…'
}

function timeAgo (ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'recién'
  const m = Math.round(s / 60)
  if (m < 60) return 'hace ' + m + ' min'
  const h = Math.round(m / 60)
  if (h < 24) return 'hace ' + h + ' h'
  const d = Math.round(h / 24)
  if (d < 30) return 'hace ' + d + (d === 1 ? ' día' : ' días')
  return new Date(ms).toLocaleDateString('es')
}

function renderAll () {
  renderFriends()
  renderPosts()
}

function renderFriends () {
  const incoming = user ? incomingRequests() : []
  const outgoing = user ? outgoingRequests() : []
  const friends = user ? Array.from(friendships.entries()).filter(([, f]) => f.status === 'accepted') : []

  renderBadge()

  $('req-in-box').hidden = !incoming.length
  $('req-in').replaceChildren(...incoming.map(([id, f]) => el('li', { class: 'person' }, [
    avatarEl(f.requestedBy, 32),
    el('span', { class: 'person-name', text: nameOf(f.requestedBy) }),
    el('span', { class: 'person-actions' }, [
      el('button', { type: 'button', class: 'btn small primary-inline', text: 'Aceptar', onclick: () => accept(id) }),
      el('button', { type: 'button', class: 'link danger', text: 'Rechazar', onclick: () => removeFriendship(id) })
    ])
  ])))

  $('req-out-box').hidden = !outgoing.length
  $('req-out').replaceChildren(...outgoing.map(([id, f]) => el('li', { class: 'person' }, [
    avatarEl(otherOf(f), 32),
    el('span', { class: 'person-name', text: nameOf(otherOf(f)) }),
    el('span', { class: 'person-actions' }, [
      el('span', { class: 'muted small', text: 'Pendiente' }),
      el('button', { type: 'button', class: 'link danger', text: 'Cancelar', onclick: () => removeFriendship(id) })
    ])
  ])))

  $('friends-count').textContent = friends.length
  $('friends-empty').hidden = friends.length > 0
  $('friends-list').replaceChildren(...friends.map(([id, f]) => {
    const fid = otherOf(f)
    return el('li', { class: 'person' }, [
      avatarEl(fid, 32),
      el('button', { type: 'button', class: 'person-name link-name', title: 'Ver perfil', onclick: () => openProfile(fid) }, [nameOf(fid)]),
      el('span', { class: 'person-actions' }, [
        el('button', { type: 'button', class: 'link danger', text: 'Eliminar', onclick: () => removeFriendship(id, '¿Eliminar a ' + nameOf(fid) + ' de tus amigos?') })
      ])
    ])
  }))
}

// Lo compartido antes de esta versión guardó el título en español.
const KIND_PT = { 'Motivación': 'Motivação', 'Chiste': 'Piada', 'Expresión': 'Expressão', 'Consejo': 'Dica', 'Curiosidad de Brasil': 'Curiosidade do Brasil' }
function kindPt (kind) { return KIND_PT[kind] || kind || 'Frase' }

function postBody (p) {
  if (p.type === 'phrase') {
    return el('div', { class: 'post-body' }, [
      el('div', { class: 'quote-kind', text: (p.icon || '') + ' ' + kindPt(p.kind) }),
      el('div', { class: 'quote-pt', lang: 'pt-BR', text: p.pt || '' }),
      el('div', { class: 'quote-es', text: p.es || '' })
    ])
  }
  const cats = app.categories
  return el('div', { class: 'post-body' }, [
    el('div', { class: 'word-title' }, [
      el('span', { class: 'dot cat-' + p.category, 'aria-hidden': 'true' }),
      p.article ? el('span', { class: 'article', lang: 'pt-BR', text: p.article }) : null,
      el('strong', { lang: 'pt-BR', text: p.word }),
      el('span', { class: 'badge cat-' + p.category, text: cats[p.category] ? cats[p.category].label : '' }),
      p.meaning ? el('span', { class: 'meaning', text: '— ' + p.meaning }) : null
    ]),
    p.example ? el('p', { class: 'example', lang: 'pt-BR', text: p.example }) : null
  ])
}

function renderFeed () {
  const list = $('feed')
  const signedOut = !user
  $('friends-signin').hidden = !signedOut
  $('friends-main').hidden = signedOut
  if (signedOut) { list.replaceChildren(); return }
  $('feed-empty').hidden = feed.length > 0
  $('feed-empty').textContent = acceptedFriends().length
    ? 'Tus amigos todavía no compartieron nada. ¡Comparte tú primero con el botón 📤 de cualquier palabra!'
    : 'Agrega amigos por correo para ver aquí las palabras y frases que comparten.'
  list.replaceChildren(...feed.map((p) => {
    const likes = Object.keys(p.likes || {})
    const liked = likes.includes(user.uid)
    const speakText = p.type === 'phrase' ? (p.pt || '') : [p.word, p.example].filter(Boolean).join('. ')
    return el('li', { class: 'post' }, [
      el('div', { class: 'post-head' }, [
        avatarEl(p.owner, 32),
        el('div', {}, [
          el('button', { type: 'button', class: 'link-name', title: 'Ver perfil', onclick: () => openProfile(p.owner) }, [nameOf(p.owner, p.ownerName)]),
          el('div', { class: 'muted small', text: (p.type === 'phrase' ? 'compartió una frase · ' : 'compartió una palabra · ') + timeAgo(p.createdAt) })
        ])
      ]),
      postBody(p),
      el('div', { class: 'post-actions' }, [
        el('button', {
          type: 'button',
          class: 'like-btn' + (liked ? ' liked' : ''),
          'aria-pressed': String(liked),
          'aria-label': liked ? 'Quitar me gusta' : 'Me gusta',
          onclick: () => toggleLike(p)
        }, [(liked ? '❤️' : '🤍') + ' ' + likes.length]),
        likes.length ? el('span', { class: 'likers-inline', text: likersText(likes) }) : null,
        el('button', { type: 'button', class: 'link', text: '🔊 Escuchar', onclick: () => app.speak(speakText.replace(/[—«»]/g, ' ')) }),
        p.type === 'word'
          ? el('button', {
            type: 'button',
            class: 'link',
            text: '➕ A mi lista',
            onclick: () => {
              const added = app.addWord({ word: p.word, category: p.category, meaning: p.meaning, gender: p.gender, examples: p.example ? [p.example] : [] })
              app.toast(added ? 'Agregaste «' + p.word + '» a tu lista.' : '«' + p.word + '» ya está en tu lista.', added ? 'ok' : 'info')
            }
          })
          : null,
        commentToggle(p)
      ]),
      commentThread(p)
    ])
  }))
}

function likersText (uids) {
  const names = uids.map((uid) => (uid === user.uid ? 'Tú' : nameOf(uid)))
  if (names.length <= 2) return names.join(' y ')
  return names.slice(0, 2).join(', ') + ' y ' + (names.length - 2) + ' más'
}

function renderMine () {
  const list = $('my-posts')
  if (!user) { list.replaceChildren(); return }
  $('my-posts-empty').hidden = mine.length > 0
  const total = mine.reduce((n, p) => n + Object.keys(p.likes || {}).length, 0)
  $('my-likes-total').textContent = total ? '❤️ ' + total : ''
  list.replaceChildren(...mine.map((p) => {
    const likes = Object.entries(p.likes || {}).sort((a, b) => likeTime(b[1]) - likeTime(a[1]))
    const likers = likes.length
      ? el('div', { class: 'likers' }, [
        el('span', { class: 'likers-title', text: '❤️ ' + likes.length + ' · Le gusta a:' }),
        ...likes.map(([uid, v]) => el('span', { class: 'liker' + (likeTime(v) > highlightSince ? ' new' : '') }, [
          avatarEl(uid, 22),
          el('span', { text: nameOf(uid) }),
          likeTime(v) > highlightSince ? el('span', { class: 'new-tag', text: 'nuevo' }) : null
        ]))
      ])
      : el('div', { class: 'likers muted small', text: 'Todavía sin ❤️' })
    return el('li', { class: 'post compact' }, [
      postBody(p),
      likers,
      el('div', { class: 'post-actions' }, [
        commentToggle(p),
        el('span', { class: 'muted small', text: 'Compartido ' + timeAgo(p.createdAt) }),
        el('button', { type: 'button', class: 'link danger', text: 'Dejar de compartir', onclick: () => deletePost(p) })
      ]),
      commentThread(p)
    ])
  }))
}


// ---------- Mi perfil (sobre mí, nivel, privacidad) ----------
const LEVELS = { principiante: '🌱 Principiante', intermedio: '🌿 Intermedio', avanzado: '🌳 Avanzado', nativo: '🇧🇷 Nativo' }

$('pf-bio').addEventListener('input', () => { $('pf-bio-count').textContent = $('pf-bio').value.length + ' / 300' })

async function loadMyProfileForm () {
  if (!user) return
  const { fs, db } = cloud
  try {
    const [pr, us] = await Promise.all([
      fs.getDoc(fs.doc(db, 'profiles', user.uid)),
      fs.getDoc(fs.doc(db, 'users', user.uid))
    ])
    const d = pr.exists() ? pr.data() : {}
    $('pf-bio').value = d.bio || ''
    $('pf-bio-count').textContent = $('pf-bio').value.length + ' / 300'
    $('pf-level').value = LEVELS[d.level] ? d.level : ''
    $('pf-location').value = d.location || ''
    $('pf-share').checked = !(us.exists() && us.data().shareWords === false)
  } catch (err) { showError(err) }
}
window.addEventListener('palavras-user', (e) => { if (e.detail) setTimeout(loadMyProfileForm, 0) })
if (cloud && cloud.user) setTimeout(loadMyProfileForm, 0)

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!user) return
  const { fs, db } = cloud
  const status = $('pf-status')
  status.textContent = 'Guardando…'
  status.className = 'small'
  try {
    await fs.setDoc(fs.doc(db, 'profiles', user.uid), {
      bio: $('pf-bio').value.trim().slice(0, 300),
      level: $('pf-level').value,
      location: $('pf-location').value.trim().slice(0, 60)
    }, { merge: true })
    await fs.updateDoc(fs.doc(db, 'users', user.uid), { shareWords: $('pf-share').checked })
    profiles.delete(user.uid)
    status.textContent = 'Perfil guardado ✔'
    status.className = 'small fb-status ok'
  } catch (err) {
    showError(err)
    status.textContent = err.code === 'permission-denied'
      ? 'No se pudo guardar: falta actualizar las reglas de Firestore.'
      : 'No se pudo guardar (' + (err.code || 'error') + ').'
    status.className = 'small fb-status warn'
  }
})
$('pf-preview').addEventListener('click', () => { if (user) openProfile(user.uid) })

// ---------- Ver un perfil (amigo o propio) ----------
const pvDialog = $('profile-dialog')
$('pv-close').addEventListener('click', () => pvDialog.close())
pvDialog.addEventListener('click', (e) => { if (e.target === pvDialog) pvDialog.close() })

async function openProfile (uid) {
  if (!user || !uid) return
  const body = $('pv-body')
  body.replaceChildren(el('p', { class: 'muted', text: 'Cargando perfil…' }))
  if (typeof pvDialog.showModal === 'function') { if (!pvDialog.open) pvDialog.showModal() } else pvDialog.setAttribute('open', '')
  const { fs, db } = cloud
  const isMe = uid === user.uid
  let prof = {}
  let words = null
  let hidden = false
  try {
    const snap = await fs.getDocFromServer(fs.doc(db, 'profiles', uid)).catch(() => fs.getDoc(fs.doc(db, 'profiles', uid)))
    prof = snap.exists() ? snap.data() : {}
    profiles.set(uid, prof)
  } catch (err) { showError(err) }
  if (isMe) {
    words = app.getWords().slice()
  } else {
    try {
      // Siempre del servidor: si el amigo ocultó sus palabras, no mostrar una copia guardada.
      const us = await fs.getDocFromServer(fs.doc(db, 'users', uid))
      words = us.exists() && us.data().words ? Object.values(us.data().words) : []
      words.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    } catch (err) {
      if (err.code === 'permission-denied') hidden = true
      else if (err.code === 'unavailable') words = null // sin conexión
      else showError(err)
    }
  }
  renderProfile(uid, prof, words, hidden)
}

function renderProfile (uid, prof, words, hidden) {
  const body = $('pv-body')
  const isMe = uid === user.uid
  const name = prof.name || 'Usuario'
  const c = prof.challenge || {}
  const week = window.PalavrasChallenge && window.PalavrasChallenge.weekId ? (c.weeks || {})[window.PalavrasChallenge.weekId()] : null
  const total = (c.ok || 0) + (c.fail || 0)
  const cats = app.categories

  const head = el('div', { class: 'pv-head' }, [
    avatarEl(uid, 64),
    el('div', {}, [
      el('h3', { id: 'pv-name', class: 'pv-name', text: name + (isMe ? ' (tú)' : '') }),
      el('div', { class: 'pv-meta' }, [
        LEVELS[prof.level] ? el('span', { class: 'pv-tag', text: LEVELS[prof.level] }) : null,
        prof.location ? el('span', { class: 'pv-tag', text: '📍 ' + prof.location }) : null
      ])
    ])
  ])
  const bio = prof.bio
    ? el('p', { class: 'pv-bio', text: prof.bio })
    : el('p', { class: 'pv-bio muted', text: isMe ? 'Todavía no escribiste nada sobre ti. Complétalo en «✏️ Mi perfil».' : name + ' todavía no escribió nada sobre sí.' })

  const statsBox = el('div', { class: 'pv-stats' }, [
    el('div', { class: 'score' }, [el('span', { text: words ? String(words.length) : '—' }), el('small', { text: 'palabras' })]),
    el('div', { class: 'score ok' }, [el('span', { text: String(c.ok || 0) }), el('small', { text: 'aciertos en el desafío' })]),
    el('div', { class: 'score' }, [el('span', { text: total ? Math.round(100 * (c.ok || 0) / total) + '%' : '–' }), el('small', { text: 'precisión' })]),
    el('div', { class: 'score' }, [el('span', { text: String((week && week.ok) || 0) }), el('small', { text: 'aciertos esta semana' + (c.best ? ' · racha ' + c.best : '') })])
  ])

  const section = [head, bio, statsBox]

  if (hidden) {
    section.push(el('p', { class: 'pv-hidden', text: '🔒 ' + name + ' no comparte su lista de palabras.' }))
  } else if (words) {
    const counts = {}
    words.forEach((w) => { counts[w.category] = (counts[w.category] || 0) + 1 })
    let filter = 'todas'
    let query = ''
    const list = el('ul', { class: 'pv-words' })
    const chips = el('div', { class: 'filters' })
    const search = el('input', { type: 'search', placeholder: 'Buscar en sus palabras…', 'aria-label': 'Buscar palabras' })
    const more = el('p', { class: 'muted small' })
    const norm = (t) => window.Classifier.normalize(t || '')
    function draw () {
      chips.replaceChildren(...['todas'].concat(Object.keys(cats)).filter((k) => k === 'todas' || counts[k]).map((k) => el('button', {
        type: 'button',
        class: 'chip' + (filter === k ? ' active' : '') + (k !== 'todas' ? ' cat-' + k : ''),
        onclick: () => { filter = k; draw() }
      }, [(k === 'todas' ? 'Todas' : cats[k].label) + ' ', el('span', { class: 'count', text: String(k === 'todas' ? words.length : counts[k]) })])))
      const items = words.filter((w) => (filter === 'todas' || w.category === filter) && (!query || norm(w.word + ' ' + (w.meaning || '')).includes(query)))
      list.replaceChildren(...items.slice(0, 200).map((w) => {
        const article = w.category === 'sustantivo' && app.nounGender ? app.nounGender(w).article + ' ' : ''
        const example = (w.examples || []).filter(Boolean)[0]
        return el('li', { class: 'pv-word' }, [
          el('div', { class: 'word-title' }, [
            el('span', { class: 'dot cat-' + w.category, 'aria-hidden': 'true' }),
            el('strong', { lang: 'pt-BR', text: article + w.word }),
            w.meaning ? el('span', { class: 'meaning', text: '— ' + w.meaning }) : null
          ]),
          example ? el('p', { class: 'example', lang: 'pt-BR', text: example }) : null,
          isMe ? null : el('button', {
            type: 'button',
            class: 'link',
            text: '➕ A mi lista',
            onclick: (e) => {
              const added = app.addWord({ word: w.word, category: w.category, meaning: w.meaning, gender: w.gender, examples: example ? [example] : [] })
              app.toast(added ? 'Agregaste «' + w.word + '» a tu lista.' : '«' + w.word + '» ya está en tu lista.', added ? 'ok' : 'info')
              if (added) { e.target.textContent = '✓ Agregada'; e.target.disabled = true }
            }
          })
        ])
      }))
      more.textContent = items.length > 200 ? 'Se muestran 200 de ' + items.length + '. Usa el buscador para encontrar más.' : (items.length ? '' : 'No hay palabras que coincidan.')
    }
    search.addEventListener('input', () => { query = norm(search.value); draw() })
    draw()
    section.push(el('h3', { class: 'pv-words-title', text: isMe ? 'Tus palabras' : 'Palabras de ' + name }))
    if (words.length) section.push(search, chips, list, more)
    else section.push(el('p', { class: 'muted', text: 'Todavía no tiene palabras.' }))
  }
  if (isMe) section.push(el('p', { class: 'muted small', text: 'Así ven tu perfil tus amigos. Tus palabras ' + ($('pf-share').checked ? 'son visibles para ellos.' : 'no son visibles (lo cambias en «✏️ Mi perfil»).') }))
  body.replaceChildren(...section)
}
