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
  stopFeed()
  user = u
  friendships = new Map()
  feed = []
  mine = []
  knownIncoming = null
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
    notifyNewRequests()
    friendships.forEach((f) => loadProfile(otherOf(f)))
    renderAll()
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
    renderFeed()
  }, (err) => showError(err))
  unsubMine = fs.onSnapshot(fs.query(col, fs.where('owner', '==', user.uid), fs.limit(40)), (snap) => {
    mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    mine.forEach((p) => Object.keys(p.likes || {}).forEach(loadProfile))
    renderMine()
  }, (err) => showError(err))
}
function stopFeed () {
  if (unsubFeed) { unsubFeed(); unsubFeed = null }
  if (unsubMine) { unsubMine(); unsubMine = null }
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
  fs.updateDoc(fs.doc(db, 'posts', post.id), new fs.FieldPath('likes', user.uid), liked ? fs.deleteField() : true).catch(showError)
}

function deletePost (post) {
  if (!confirm('¿Dejar de compartir esto? Tus amigos ya no lo verán.')) return
  const { fs, db } = cloud
  fs.deleteDoc(fs.doc(db, 'posts', post.id)).catch(showError)
}

// API para el resto de la app (botón 📤 de cada palabra y de la frase del día).
window.PalavrasSocial = {
  shareWord (w, example) {
    createPost({
      type: 'word',
      word: w.word,
      category: w.category,
      meaning: w.meaning || '',
      example: example || (w.examples || [])[0] || ''
    }, '«' + w.word + '»')
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
  renderFeed()
  renderMine()
}

function renderFriends () {
  const incoming = user ? incomingRequests() : []
  const outgoing = user ? outgoingRequests() : []
  const friends = user ? Array.from(friendships.entries()).filter(([, f]) => f.status === 'accepted') : []

  const badge = $('friends-badge')
  badge.hidden = !incoming.length
  badge.textContent = incoming.length

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
      el('span', { class: 'person-name', text: nameOf(fid) }),
      el('span', { class: 'person-actions' }, [
        el('button', { type: 'button', class: 'link danger', text: 'Eliminar', onclick: () => removeFriendship(id, '¿Eliminar a ' + nameOf(fid) + ' de tus amigos?') })
      ])
    ])
  }))
}

function postBody (p) {
  if (p.type === 'phrase') {
    return el('div', { class: 'post-body' }, [
      el('div', { class: 'quote-kind', text: (p.icon || '') + ' ' + (p.kind || 'Frase') }),
      el('div', { class: 'quote-pt', lang: 'pt-BR', text: p.pt || '' }),
      el('div', { class: 'quote-es', text: p.es || '' })
    ])
  }
  const cats = app.categories
  return el('div', { class: 'post-body' }, [
    el('div', { class: 'word-title' }, [
      el('span', { class: 'dot cat-' + p.category, 'aria-hidden': 'true' }),
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
          el('strong', { text: nameOf(p.owner, p.ownerName) }),
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
        el('button', { type: 'button', class: 'link', text: '🔊 Escuchar', onclick: () => app.speak(speakText.replace(/[—«»]/g, ' ')) }),
        p.type === 'word'
          ? el('button', {
            type: 'button',
            class: 'link',
            text: '➕ A mi lista',
            onclick: () => {
              const added = app.addWord({ word: p.word, category: p.category, meaning: p.meaning, examples: p.example ? [p.example] : [] })
              app.toast(added ? 'Agregaste «' + p.word + '» a tu lista.' : '«' + p.word + '» ya está en tu lista.', added ? 'ok' : 'info')
            }
          })
          : null
      ])
    ])
  }))
}

function renderMine () {
  const list = $('my-posts')
  if (!user) { list.replaceChildren(); return }
  $('my-posts-empty').hidden = mine.length > 0
  list.replaceChildren(...mine.map((p) => {
    const likes = Object.keys(p.likes || {})
    const who = likes.map((uid) => nameOf(uid)).join(', ')
    return el('li', { class: 'post compact' }, [
      postBody(p),
      el('div', { class: 'post-actions' }, [
        el('span', { class: 'like-count', title: who, text: '❤️ ' + likes.length + (likes.length ? ' · ' + who : '') }),
        el('span', { class: 'muted small', text: timeAgo(p.createdAt) }),
        el('button', { type: 'button', class: 'link danger', text: 'Dejar de compartir', onclick: () => deletePost(p) })
      ])
    ])
  }))
}
