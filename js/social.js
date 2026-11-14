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
        loadProfile(from).then((p) => app.toast((p ? p.name : 'Alguém') + ' te enviou um pedido de amizade. Veja em 👥 Amigos.', 'ok'))
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
      const data = snap.exists() ? snap.data() : { name: 'Usuário', avatar: null }
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
          loadProfile(uid).then((pr) => app.toast((pr ? pr.name : 'Um amigo') + ' curtiu ❤️ ' + postTitle(p) + '.', 'ok'))
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
        loadProfile(p.lastCommentBy).then((pr) => app.toast('💬 ' + (pr ? pr.name : 'Um amigo') + ' comentou em ' + postTitle(p) + '.', 'ok'))
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
    app.toast('Não foi possível enviar o comentário (' + (err.code || 'error') + ').', 'info')
    return false
  }
}

function deleteComment (post, comment) {
  if (!confirm('Apagar este comentário?')) return
  const { fs, db } = cloud
  const batch = fs.writeBatch(db)
  batch.delete(fs.doc(db, 'posts', post.id, 'comments', comment.id))
  batch.update(fs.doc(db, 'posts', post.id), { commentCount: fs.increment(-1) })
  batch.commit().catch((err) => {
    showError(err)
    app.toast('Não foi possível apagar o comentário (' + (err.code || 'error') + ').', 'info')
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
  }, ['💬 ' + (count ? count + (count === 1 ? ' comentário' : ' comentários') : 'Comentar') + (isNew ? ' · novo' : '')])
}

function commentThread (p) {
  if (!openThreads.has(p.id)) return null
  const list = threadData.get(p.id)
  const items = !list
    ? [el('li', { class: 'muted small', text: 'Carregando comentários…' })]
    : !list.length
        ? [el('li', { class: 'muted small', text: 'Ainda não há comentários. Escreva o primeiro!' })]
        : list.map((c) => el('li', { class: 'comment' }, [
          avatarEl(c.author, 26),
          el('div', { class: 'comment-main' }, [
            el('div', { class: 'comment-head' }, [
              el('strong', { text: c.author === user.uid ? 'Você' : nameOf(c.author) }),
              el('span', { class: 'muted small', text: timeAgo(c.createdAt) }),
              c.author === user.uid || p.owner === user.uid
                ? el('button', { type: 'button', class: 'link danger small-link', text: 'Apagar', onclick: () => deleteComment(p, c) })
                : null
            ]),
            el('p', { class: 'comment-text', text: c.text })
          ])
        ]))
  const input = el('input', {
    type: 'text',
    maxlength: '500',
    placeholder: 'Escreva um comentário…',
    'aria-label': 'Escreva um comentário',
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
  if (email === (user.email || '').toLowerCase()) { setMsg('Esse é o seu próprio e-mail 🙂'); return }
  const { fs, db } = cloud
  setMsg('Procurando…')
  try {
    const found = await fs.getDoc(fs.doc(db, 'emails', email))
    if (!found.exists()) {
      setMsg('Não encontramos ninguém com esse e-mail. Peça para a pessoa abrir o Palavras e entrar com o Google pelo menos uma vez.')
      return
    }
    const fid = found.data().uid
    const id = pairId(user.uid, fid)
    const existing = friendships.get(id)
    const p = await loadProfile(fid)
    const name = p ? p.name : email
    if (existing && existing.status === 'accepted') { setMsg('Vocês já são amigos: ' + name + '.'); return }
    if (existing && existing.requestedBy === user.uid) { setMsg('Você já enviou um pedido para ' + name + '. Falta a pessoa aceitar.'); return }
    if (existing) { await accept(id); setMsg(name + ' já tinha enviado um pedido para você: agora vocês são amigos. 🎉'); input.value = ''; return }
    await fs.setDoc(fs.doc(db, 'friendships', id), {
      members: [user.uid, fid].sort(),
      requestedBy: user.uid,
      status: 'pending',
      createdAt: Date.now()
    })
    input.value = ''
    setMsg('Pedido enviado para ' + name + '. Quando aceitar, vocês verão o que compartilham.')
  } catch (err) {
    showError(err)
    setMsg('Não foi possível enviar o pedido (' + (err.code || 'error') + ').')
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
  if (!user) { app.toast('Entre com o Google para compartilhar com seus amigos.', 'info'); return }
  const friends = acceptedFriends()
  if (!friends.length) {
    app.toast('Você ainda não tem amigos. Adicione-os pelo e-mail na aba 👥 Amigos.', 'info')
    return
  }
  const { fs, db } = cloud
  const me = profileOf(user.uid)
  const post = Object.assign({
    owner: user.uid,
    ownerName: (me && me.name) || user.displayName || 'Usuário',
    createdAt: Date.now(),
    audience: friends,
    likes: {}
  }, data)
  try {
    await fs.setDoc(fs.doc(db, 'posts', newPostId(user.uid)), JSON.parse(JSON.stringify(post)))
    app.toast('Você compartilhou ' + what + ' com ' + friends.length + (friends.length === 1 ? ' amigo.' : ' amigos.'), 'ok')
  } catch (err) {
    showError(err)
    app.toast('Não foi possível compartilhar (' + (err.code || 'error') + ').', 'info')
  }
}

function toggleLike (post) {
  const { fs, db } = cloud
  const liked = !!(post.likes && post.likes[user.uid])
  // Se guarda la hora del like: así el autor sabe cuáles son nuevos.
  fs.updateDoc(fs.doc(db, 'posts', post.id), new fs.FieldPath('likes', user.uid), liked ? fs.deleteField() : Date.now()).catch(showError)
}

async function deletePost (post) {
  if (!confirm('Deixar de compartilhar? Seus amigos não vão ver mais isto (nem os comentários).')) return
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
    app.toast('Não foi possível deixar de compartilhar (' + (err.code || 'error') + ').', 'info')
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
    createPost({ type: 'phrase', kind: q.label, icon: q.icon, pt: q.pt, es: q.es }, 'a frase')
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
    setMsg('Sem permissão: é preciso atualizar as regras do Firestore para usar amigos.')
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
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  if (m < 60) return 'há ' + m + ' min'
  const h = Math.round(m / 60)
  if (h < 24) return 'há ' + h + ' h'
  const d = Math.round(h / 24)
  if (d < 30) return 'há ' + d + (d === 1 ? ' dia' : ' dias')
  return new Date(ms).toLocaleDateString('pt-BR')
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
      el('button', { type: 'button', class: 'btn small primary-inline', text: 'Aceitar', onclick: () => accept(id) }),
      el('button', { type: 'button', class: 'link danger', text: 'Recusar', onclick: () => removeFriendship(id) })
    ])
  ])))

  $('req-out-box').hidden = !outgoing.length
  $('req-out').replaceChildren(...outgoing.map(([id, f]) => el('li', { class: 'person' }, [
    avatarEl(otherOf(f), 32),
    el('span', { class: 'person-name', text: nameOf(otherOf(f)) }),
    el('span', { class: 'person-actions' }, [
      el('span', { class: 'muted small', text: 'Pendente' }),
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
        el('button', { type: 'button', class: 'link danger', text: 'Remover', onclick: () => removeFriendship(id, 'Remover ' + nameOf(fid) + ' dos seus amigos?') })
      ])
    ])
  }))
}

// Nombres de las categorías en portugués (la pestaña de amigos está en portugués).
const CAT_PT = { sustantivo: 'Substantivo', adjetivo: 'Adjetivo', verbo: 'Verbo', adverbio: 'Advérbio', conector: 'Conectivo', expresion: 'Expressão' }
function catPt (k) { return CAT_PT[k] || k }

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
      el('span', { class: 'badge cat-' + p.category, text: catPt(p.category) }),
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
    ? 'Seus amigos ainda não compartilharam nada. Compartilhe você primeiro com o botão 📤 de qualquer palavra!'
    : 'Adicione amigos pelo e-mail para ver aqui as palavras e frases que eles compartilham.'
  list.replaceChildren(...feed.map((p) => {
    const likes = Object.keys(p.likes || {})
    const liked = likes.includes(user.uid)
    const speakText = p.type === 'phrase' ? (p.pt || '') : [p.word, p.example].filter(Boolean).join('. ')
    return el('li', { class: 'post' }, [
      el('div', { class: 'post-head' }, [
        avatarEl(p.owner, 32),
        el('div', {}, [
          el('button', { type: 'button', class: 'link-name', title: 'Ver perfil', onclick: () => openProfile(p.owner) }, [nameOf(p.owner, p.ownerName)]),
          el('div', { class: 'muted small', text: (p.type === 'phrase' ? 'compartilhou uma frase · ' : 'compartilhou uma palavra · ') + timeAgo(p.createdAt) })
        ])
      ]),
      postBody(p),
      el('div', { class: 'post-actions' }, [
        el('button', {
          type: 'button',
          class: 'like-btn' + (liked ? ' liked' : ''),
          'aria-pressed': String(liked),
          'aria-label': liked ? 'Descurtir' : 'Curtir',
          onclick: () => toggleLike(p)
        }, [(liked ? '❤️' : '🤍') + ' ' + likes.length]),
        likes.length ? el('span', { class: 'likers-inline', text: likersText(likes) }) : null,
        el('button', { type: 'button', class: 'link', text: '🔊 Ouvir', onclick: () => app.speak(speakText.replace(/[—«»]/g, ' ')) }),
        p.type === 'word'
          ? el('button', {
            type: 'button',
            class: 'link',
            text: '➕ Na minha lista',
            onclick: () => {
              const added = app.addWord({ word: p.word, category: p.category, meaning: p.meaning, gender: p.gender, examples: p.example ? [p.example] : [] })
              app.toast(added ? 'Você adicionou «' + p.word + '» à sua lista.' : '«' + p.word + '» já está na sua lista.', added ? 'ok' : 'info')
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
  const names = uids.map((uid) => (uid === user.uid ? 'Você' : nameOf(uid)))
  if (names.length <= 2) return names.join(' e ')
  return names.slice(0, 2).join(', ') + ' e mais ' + (names.length - 2)
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
        el('span', { class: 'likers-title', text: '❤️ ' + likes.length + ' · Curtido por:' }),
        ...likes.map(([uid, v]) => el('span', { class: 'liker' + (likeTime(v) > highlightSince ? ' new' : '') }, [
          avatarEl(uid, 22),
          el('span', { text: nameOf(uid) }),
          likeTime(v) > highlightSince ? el('span', { class: 'new-tag', text: 'novo' }) : null
        ]))
      ])
      : el('div', { class: 'likers muted small', text: 'Ainda sem ❤️' })
    return el('li', { class: 'post compact' }, [
      postBody(p),
      likers,
      el('div', { class: 'post-actions' }, [
        commentToggle(p),
        el('span', { class: 'muted small', text: 'Compartilhado ' + timeAgo(p.createdAt) }),
        el('button', { type: 'button', class: 'link danger', text: 'Deixar de compartilhar', onclick: () => deletePost(p) })
      ]),
      commentThread(p)
    ])
  }))
}


// ---------- Mi perfil (sobre mí, nivel, privacidad) ----------
const LEVELS = { principiante: '🌱 Iniciante', intermedio: '🌿 Intermediário', avanzado: '🌳 Avançado', nativo: '🇧🇷 Nativo' }

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
    publicCfg = Object.assign({ enabled: false, slug: null, showWords: true }, (us.exists() && us.data().publicProfile) || {})
    $('pf-public').checked = !!publicCfg.enabled
    $('pf-public-words').checked = publicCfg.showWords !== false
    renderPublicLink()
    checkPublic()
  } catch (err) { showError(err) }
}

// Comprueba que el perfil público exista de verdad (si no, intenta publicarlo y avisa si falla).
async function checkPublic () {
  if (!user || !publicCfg.enabled || !publicCfg.slug) return
  const { fs, db } = cloud
  try {
    const snap = await fs.getDocFromServer(fs.doc(db, 'public', publicCfg.slug))
    if (snap.exists()) { setPublicWarning(''); return }
    await publishPublic()
    setPublicWarning('')
  } catch (err) {
    setPublicWarning(err.code === 'permission-denied'
      ? '⚠️ O perfil público não está publicado: falta publicar as regras novas do Firestore. Depois disso, toque em «Salvar perfil».'
      : '⚠️ Não foi possível verificar o perfil público (' + (err.code || 'sem conexão') + ').')
  }
}

function setPublicWarning (text) {
  let el2 = document.getElementById('pf-public-warning')
  if (!el2) {
    el2 = el('p', { id: 'pf-public-warning', class: 'small fb-status warn' })
    $('pf-public-link').appendChild(el2)
  }
  el2.textContent = text
  el2.hidden = !text
}
window.addEventListener('palavras-user', (e) => { if (e.detail) setTimeout(loadMyProfileForm, 0) })
if (cloud && cloud.user) setTimeout(loadMyProfileForm, 0)

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!user) return
  const { fs, db } = cloud
  const status = $('pf-status')
  status.textContent = 'Salvando…'
  status.className = 'small'
  try {
    await fs.setDoc(fs.doc(db, 'profiles', user.uid), {
      bio: $('pf-bio').value.trim().slice(0, 300),
      level: $('pf-level').value,
      location: $('pf-location').value.trim().slice(0, 60)
    }, { merge: true })
    await fs.updateDoc(fs.doc(db, 'users', user.uid), { shareWords: $('pf-share').checked })
    profiles.delete(user.uid)
    await savePublicSettings()
    status.textContent = 'Perfil salvo ✔'
    status.className = 'small fb-status ok'
  } catch (err) {
    showError(err)
    status.textContent = err.code === 'permission-denied'
      ? 'Não foi possível salvar: falta atualizar as regras do Firestore.'
      : 'Não foi possível salvar (' + (err.code || 'erro') + ').'
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
  body.replaceChildren(el('p', { class: 'muted', text: 'Carregando perfil…' }))
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
  const name = prof.name || 'Usuário'
  const c = prof.challenge || {}
  const week = window.PalavrasChallenge && window.PalavrasChallenge.weekId ? (c.weeks || {})[window.PalavrasChallenge.weekId()] : null
  const total = (c.ok || 0) + (c.fail || 0)
  const cats = app.categories

  const head = el('div', { class: 'pv-head' }, [
    avatarEl(uid, 64),
    el('div', {}, [
      el('h3', { id: 'pv-name', class: 'pv-name', text: name + (isMe ? ' (você)' : '') }),
      el('div', { class: 'pv-meta' }, [
        LEVELS[prof.level] ? el('span', { class: 'pv-tag', text: LEVELS[prof.level] }) : null,
        prof.location ? el('span', { class: 'pv-tag', text: '📍 ' + prof.location }) : null
      ])
    ])
  ])
  const bio = prof.bio
    ? el('p', { class: 'pv-bio', text: prof.bio })
    : el('p', { class: 'pv-bio muted', text: isMe ? 'Você ainda não escreveu nada sobre você. Complete em «✏️ Meu perfil».' : name + ' ainda não escreveu nada sobre si.' })

  const statsBox = el('div', { class: 'pv-stats' }, [
    el('div', { class: 'score' }, [el('span', { text: words ? String(words.length) : '—' }), el('small', { text: 'palavras' })]),
    el('div', { class: 'score ok' }, [el('span', { text: String(c.ok || 0) }), el('small', { text: 'acertos no desafio' })]),
    el('div', { class: 'score' }, [el('span', { text: total ? Math.round(100 * (c.ok || 0) / total) + '%' : '–' }), el('small', { text: 'precisão' })]),
    el('div', { class: 'score' }, [el('span', { text: String((week && week.ok) || 0) }), el('small', { text: 'acertos nesta semana' + (c.best ? ' · sequência ' + c.best : '') })])
  ])

  const section = [head, bio, statsBox]

  if (hidden) {
    section.push(el('p', { class: 'pv-hidden', text: '🔒 ' + name + ' não compartilha a lista de palavras.' }))
  } else if (words) {
    const counts = {}
    words.forEach((w) => { counts[w.category] = (counts[w.category] || 0) + 1 })
    let filter = 'todas'
    let query = ''
    const list = el('ul', { class: 'pv-words' })
    const chips = el('div', { class: 'filters' })
    const search = el('input', { type: 'search', placeholder: 'Buscar nas palavras…', 'aria-label': 'Buscar palavras' })
    const more = el('p', { class: 'muted small' })
    const norm = (t) => window.Classifier.normalize(t || '')
    function draw () {
      chips.replaceChildren(...['todas'].concat(Object.keys(cats)).filter((k) => k === 'todas' || counts[k]).map((k) => el('button', {
        type: 'button',
        class: 'chip' + (filter === k ? ' active' : '') + (k !== 'todas' ? ' cat-' + k : ''),
        onclick: () => { filter = k; draw() }
      }, [(k === 'todas' ? 'Todas' : catPt(k)) + ' ', el('span', { class: 'count', text: String(k === 'todas' ? words.length : counts[k]) })])))
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
            text: '➕ Na minha lista',
            onclick: (e) => {
              const added = app.addWord({ word: w.word, category: w.category, meaning: w.meaning, gender: w.gender, examples: example ? [example] : [] })
              app.toast(added ? 'Você adicionou «' + w.word + '» à sua lista.' : '«' + w.word + '» já está na sua lista.', added ? 'ok' : 'info')
              if (added) { e.target.textContent = '✓ Adicionada'; e.target.disabled = true }
            }
          })
        ])
      }))
      more.textContent = items.length > 200 ? 'Mostrando 200 de ' + items.length + '. Use a busca para encontrar mais.' : (items.length ? '' : 'Nenhuma palavra encontrada.')
    }
    search.addEventListener('input', () => { query = norm(search.value); draw() })
    draw()
    section.push(el('h3', { class: 'pv-words-title', text: isMe ? 'Suas palavras' : 'Palavras de ' + name }))
    if (words.length) section.push(search, chips, list, more)
    else section.push(el('p', { class: 'muted', text: 'Ainda não tem palavras.' }))
  }
  if (isMe) section.push(el('p', { class: 'muted small', text: 'É assim que seus amigos veem seu perfil. Suas palavras ' + ($('pf-share').checked ? 'estão visíveis para eles.' : 'não estão visíveis (mude isso em «✏️ Meu perfil»).') }))
  body.replaceChildren(...section)
}


// ---------- Perfil público (link para compartir) ----------
// public/{slug}: copia de lo que el usuario elige mostrar; la puede leer cualquiera con el link.
// El slug es al azar (no revela el correo ni el uid) y se puede cambiar para invalidar el link.
const MAX_PUBLIC_WORDS = 1000
let publicCfg = { enabled: false, slug: null, showWords: true }
let publicTimer = null

function newSlug () {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function publicUrl () {
  return publicCfg.slug ? new URL('perfil.html?u=' + publicCfg.slug, location.href).href : ''
}

function renderPublicLink () {
  const on = $('pf-public').checked
  $('pf-public-words-row').hidden = !on
  const show = on && publicCfg.enabled && !!publicCfg.slug
  $('pf-public-link').hidden = !show
  if (show) {
    $('pf-public-url').value = publicUrl()
    $('pf-open').href = publicUrl()
  }
}
$('pf-public').addEventListener('change', renderPublicLink)

async function savePublicSettings () {
  const { fs, db } = cloud
  const wantOn = $('pf-public').checked
  const showWords = $('pf-public-words').checked
  if (wantOn) {
    if (!publicCfg.slug) publicCfg.slug = newSlug()
    publicCfg.enabled = true
    publicCfg.showWords = showWords
    await fs.updateDoc(fs.doc(db, 'users', user.uid), { publicProfile: publicCfg })
    renderPublicLink()
    try {
      await publishPublic()
      setPublicWarning('')
    } catch (err) {
      setPublicWarning(err.code === 'permission-denied'
        ? '⚠️ O link foi criado, mas o perfil ainda não pôde ser publicado: falta publicar as regras novas do Firestore. Depois disso, toque em «Salvar perfil».'
        : '⚠️ Não foi possível publicar o perfil (' + (err.code || 'sem conexão') + '). Tente salvar de novo.')
      throw err
    }
  } else if (publicCfg.enabled) {
    publicCfg.enabled = false
    await fs.updateDoc(fs.doc(db, 'users', user.uid), { publicProfile: publicCfg })
    if (publicCfg.slug) await fs.deleteDoc(fs.doc(db, 'public', publicCfg.slug)).catch(() => {})
  }
  renderPublicLink()
}

// Arma y guarda la copia pública con los datos actuales.
async function publishPublic () {
  if (!user || !publicCfg.enabled || !publicCfg.slug) return
  const { fs, db } = cloud
  const snap = await fs.getDoc(fs.doc(db, 'profiles', user.uid))
  const prof = snap.exists() ? snap.data() : {}
  const words = app.getWords()
  const counts = {}
  words.forEach((w) => { counts[w.category] = (counts[w.category] || 0) + 1 })
  const c = prof.challenge || {}
  const data = {
    uid: user.uid,
    name: prof.name || user.displayName || 'Usuário',
    avatar: prof.avatar || null,
    bio: prof.bio || '',
    level: prof.level || '',
    location: prof.location || '',
    wordCount: words.length,
    counts,
    challenge: { ok: c.ok || 0, fail: c.fail || 0, best: c.best || 0 },
    showWords: !!publicCfg.showWords,
    updatedAt: Date.now()
  }
  if (publicCfg.showWords) {
    data.words = words.slice(0, MAX_PUBLIC_WORDS).map((w) => {
      const item = { w: w.word, c: w.category }
      if (w.meaning) item.m = String(w.meaning).slice(0, 120)
      if (w.category === 'sustantivo' && app.nounGender) item.a = app.nounGender(w).article
      const ex = (w.examples || []).filter(Boolean)[0]
      if (ex) item.e = String(ex).slice(0, 200)
      return item
    })
  }
  await fs.setDoc(fs.doc(db, 'public', publicCfg.slug), JSON.parse(JSON.stringify(data)))
}

function schedulePublic () {
  if (!user || !publicCfg.enabled) return
  clearTimeout(publicTimer)
  publicTimer = setTimeout(() => publishPublic().catch((err) => console.warn('Perfil público:', err.code || err)), 8000)
}
window.addEventListener('palavras-words-saved', schedulePublic)
window.addEventListener('palavras-profile', schedulePublic)
window.addEventListener('palavras-challenge-updated', schedulePublic)
window.addEventListener('palavras-user', () => { publicCfg = { enabled: false, slug: null, showWords: true }; clearTimeout(publicTimer) })

$('pf-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(publicUrl()); app.toast('Link copiado.', 'ok') } catch (e) {
    $('pf-public-url').select(); app.toast('Selecione e copie o link.', 'info')
  }
})
$('pf-sharelink').addEventListener('click', async () => {
  const url = publicUrl()
  if (navigator.share) {
    try { await navigator.share({ title: 'Meu perfil no Palavras', text: 'Veja meu vocabulário de português no Palavras:', url }) } catch (e) { /* cancelado */ }
  } else {
    try { await navigator.clipboard.writeText(url); app.toast('Link copiado.', 'ok') } catch (e) { $('pf-public-url').select() }
  }
})
$('pf-regen').addEventListener('click', async () => {
  if (!confirm('Gerar um novo link? O link atual vai parar de funcionar.')) return
  const { fs, db } = cloud
  const old = publicCfg.slug
  try {
    publicCfg.slug = newSlug()
    await fs.updateDoc(fs.doc(db, 'users', user.uid), { publicProfile: publicCfg })
    await publishPublic()
    if (old) await fs.deleteDoc(fs.doc(db, 'public', old)).catch(() => {})
    renderPublicLink()
    app.toast('Novo link criado. O anterior não funciona mais.', 'ok')
  } catch (err) {
    showError(err)
    app.toast('Não foi possível gerar o link (' + (err.code || 'erro') + ').', 'info')
  }
})
