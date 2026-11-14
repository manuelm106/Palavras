/*
 * Sincronización opcional con Firebase (inicio de sesión con Google + Firestore).
 *
 * Toda la lista de un usuario vive en UN documento: users/{uid}
 *   { words: { <id>: { word, category, meaning, examples, stats, ... } }, version: 2 }
 * Así, abrir la app cuesta 1 lectura (no una por palabra) y cada cambio, 1 escritura.
 * Los cambios seguidos se agrupan (espera breve) para escribir menos.
 *
 * Versiones anteriores guardaban cada palabra en users/{uid}/words/{id}: esos datos
 * se migran solos al documento nuevo la primera vez que se inicia sesión.
 *
 * Si no hay configuración (js/firebase-config.js), este módulo no hace nada.
 */
const FIREBASE_VERSION = '10.12.2'
// Versión de la app (el número ?v= con que se cargó este archivo), para el panel de administración.
const APP_VERSION = new URL(import.meta.url).searchParams.get('v') || '?'
const PUSH_DELAY_MS = 1500
const MAX_DOC_BYTES = 900 * 1024 // Firestore admite hasta 1 MiB por documento
const config = window.FIREBASE_CONFIG
const app = window.PalavrasApp

const $ = (sel) => document.querySelector(sel)
const normalize = (s) => window.Classifier.normalize(s)

// Copia apta para Firestore: sin `undefined` y sin datos que son de cada dispositivo.
function clean (w) {
  const c = JSON.parse(JSON.stringify(w))
  delete c.shown
  return c
}

if (config && app) init().catch((err) => {
  console.error(err)
  setStatus('Não foi possível carregar a sincronização.')
})

async function init () {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js')
  ])

  const fbApp = initializeApp(config)
  const a = auth.getAuth(fbApp)
  const db = fs.getFirestore(fbApp)

  // Para otros módulos (amigos y compartir: js/social.js).
  const cloud = window.PalavrasCloud = { fs, db, user: null, profile: null }
  window.dispatchEvent(new CustomEvent('palavras-cloud', { detail: cloud }))

  let uid = null
  let ref = null
  let ready = false // true cuando ya llegó la primera versión de la nube
  let synced = new Map() // id -> JSON de la versión que tiene la nube
  let unsubscribe = null
  let timer = null
  let sizeWarned = false

  $('#account').hidden = false

  $('#signin').addEventListener('click', async () => {
    const provider = new auth.GoogleAuthProvider()
    try {
      await auth.signInWithPopup(a, provider)
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        await auth.signInWithRedirect(a, provider)
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        console.error(err)
        app.toast('Não foi possível entrar: ' + (err.code || err.message), 'info')
      }
    }
  })

  $('#signout').addEventListener('click', async () => {
    if (!confirm('Sair? Sua lista continua salva na sua conta, mas será removida deste aparelho.')) return
    await flush()
    await auth.signOut(a)
    app.clearWords()
  })

  // ---------- Diferencias entre la lista local y la nube ----------
  function diff (words) {
    const sets = []
    const deletes = []
    const current = new Map()
    words.forEach((w) => {
      const json = JSON.stringify(clean(w))
      current.set(w.id, json)
      if (synced.get(w.id) !== json) sets.push(w)
    })
    synced.forEach((_, id) => { if (!current.has(id)) deletes.push(id) })
    return { sets, deletes, current }
  }

  function toMap (words) {
    const m = {}
    words.forEach((w) => { m[w.id] = clean(w) })
    return m
  }

  function checkSize (words) {
    const bytes = new Blob([JSON.stringify(toMap(words))]).size
    if (bytes > MAX_DOC_BYTES && !sizeWarned) {
      sizeWarned = true
      app.toast('Sua lista é grande demais para sincronizar inteira (máx. ~1 MB). Exporte uma cópia e apague palavras ou exemplos que não usa.', 'info')
    }
    return bytes <= MAX_DOC_BYTES * 1.1
  }

  // Escribe en la nube los cambios pendientes (una sola escritura).
  async function flush () {
    clearTimeout(timer)
    timer = null
    if (!uid || !ready) return
    const words = app.getWords()
    const { sets, deletes, current } = diff(words)
    if (!sets.length && !deletes.length) return
    if (!checkSize(words)) { setStatus('Lista grande demais para sincronizar.'); return }

    const previous = synced
    synced = current
    setStatus('Sincronizando…')
    const args = []
    sets.forEach((w) => args.push(new fs.FieldPath('words', w.id), clean(w)))
    deletes.forEach((id) => args.push(new fs.FieldPath('words', id), fs.deleteField()))
    try {
      try {
        await fs.updateDoc(ref, ...args)
      } catch (err) {
        if (err.code !== 'not-found') throw err
        await fs.setDoc(ref, { words: toMap(words), version: 2 })
      }
      setStatus('Sincronizado ✔')
      scheduleCount()
    } catch (err) {
      console.error(err)
      synced = previous // se reintenta en el próximo cambio
      setStatus(err.code === 'permission-denied'
        ? 'Sem permissão para salvar: atualize as regras do Firestore.'
        : 'Erro ao sincronizar (' + (err.code || 'desconhecido') + ').')
    }
  }

  window.PalavrasSync = {
    push () {
      if (!uid || !ready) return
      clearTimeout(timer)
      timer = setTimeout(flush, PUSH_DELAY_MS)
      setStatus('Alterações pendentes…')
    }
  }

  // Al salir o pasar a segundo plano, guardar lo pendiente enseguida.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) flush() })
  window.addEventListener('pagehide', () => { if (timer) flush() })

  // ---------- Migración desde el formato anterior ----------
  async function readLegacy (userId) {
    try {
      const snap = await fs.getDocs(fs.collection(db, 'users', userId, 'words'))
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    } catch (err) {
      console.warn('No se pudo leer el formato anterior:', err.code || err)
      return []
    }
  }

  async function deleteLegacy (userId, docs) {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = fs.writeBatch(db)
      docs.slice(i, i + 400).forEach((d) => batch.delete(fs.doc(db, 'users', userId, 'words', d.id)))
      await batch.commit()
    }
  }

  async function firstLoad (snap, userId) {
    const data = snap.exists() ? snap.data() : null
    setProfile(data && data.profile)
    let remote = data && data.words ? Object.values(data.words) : []
    let migrated = 0

    if (!data || !data.version) {
      const legacy = await readLegacy(userId)
      if (legacy.length) {
        const ids = new Set(remote.map((w) => w.id))
        legacy.forEach((d) => { if (!ids.has(d.data.id)) remote.push(d.data) })
        migrated = legacy.length
      }
      remote = remote.map(clean)
      // Crea (o completa) el documento nuevo con la lista migrada.
      await fs.setDoc(ref, { words: toMap(remote), version: 2 }, { merge: true })
      if (legacy.length) {
        deleteLegacy(userId, legacy).catch((err) => console.warn('No se pudo borrar el formato anterior:', err.code || err))
      }
    }
    if (uid !== userId) return // cerró sesión mientras tanto

    synced = new Map(remote.map((w) => [w.id, JSON.stringify(clean(w))]))
    ready = true

    // Suma a la nube las palabras de este dispositivo que no estén allí.
    const known = new Set(remote.map((w) => normalize(w.word)))
    const extra = app.getWords().filter((w) => !known.has(normalize(w.word)))
    app.replaceWords(remote.concat(extra))
    if (extra.length) {
      await flush()
      app.toast(`${extra.length} palavra(s) deste aparelho foram adicionadas à sua conta.`, 'ok')
    } else {
      setStatus('Sincronizado ✔')
    }
    publishProfile().then(publishActivity)
    if (migrated) console.info(`Migradas ${migrated} palabras al formato nuevo.`)
  }

  // ---------- Foto de perfil ----------
  // Se guarda en el mismo documento (campo `profile`), así se ve en todos los dispositivos.
  // Las fotos se achican en el dispositivo a 160×160 px (unos 15 KB).
  const EMOJIS = ['🦜', '🐆', '🐢', '🦋', '🌴', '🌞', '🏖️', '⚽', '☕', '🎸', '🍍', '🎭', '🥥', '🌺', '🐒', '📚']
  const emojiBox = $('#avatar-emojis')
  EMOJIS.forEach((e) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'avatar-emoji-option'
    b.textContent = e
    b.setAttribute('aria-label', 'Usar ' + e + ' como foto')
    b.addEventListener('click', () => saveProfile({ type: 'emoji', value: e }))
    emojiBox.appendChild(b)
  })

  function toggleMenu (open) {
    $('#avatar-menu').hidden = !open
    $('#avatar-btn').setAttribute('aria-expanded', String(open))
  }
  $('#avatar-btn').addEventListener('click', () => toggleMenu($('#avatar-menu').hidden))
  $('#avatar-close').addEventListener('click', () => toggleMenu(false))
  $('#avatar-google').addEventListener('click', () => saveProfile({ type: 'google' }))

  $('#avatar-file').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      setStatus('Processando a foto…')
      const dataUrl = await resizeImage(file, 160)
      await saveProfile({ type: 'photo', value: dataUrl })
    } catch (err) {
      console.error(err)
      app.toast('Não foi possível usar essa imagem. Tente outra foto (JPG ou PNG).', 'info')
      setStatus('')
    }
  })

  async function saveProfile (p) {
    if (!uid || !ready) { app.toast('Espere sua lista terminar de carregar.', 'info'); return }
    const previous = profile
    setProfile(p) // se muestra enseguida
    toggleMenu(false)
    try {
      await fs.updateDoc(ref, { profile: p })
      setStatus('Foto atualizada ✔')
    } catch (err) {
      console.error(err)
      setProfile(previous)
      app.toast('Não foi possível salvar a foto (' + (err.code || 'erro') + ').', 'info')
    }
  }

  // ---------- Perfil público (nombre y foto) para los amigos ----------
  // profiles/{uid}: lo que ven tus amigos. emails/{correo}: permite encontrarte por tu correo exacto.
  const PUBLIC_CACHE = 'palabras-pt:perfil-publico'
  async function publishProfile () {
    const user = currentUser
    if (!user || !ready || user.uid !== uid) return
    let avatar
    if (profile && (profile.type === 'photo' || profile.type === 'emoji') && profile.value) avatar = { type: profile.type, value: profile.value }
    else avatar = user.photoURL ? { type: 'url', value: user.photoURL } : null
    const joined = Date.parse((user.metadata && user.metadata.creationTime) || '') || null
    const payload = { name: user.displayName || (user.email || '').split('@')[0] || 'Usuário', avatar, joinedAt: joined, updatedAt: Date.now() }
    const email = (user.email || '').trim().toLowerCase()
    const key = JSON.stringify({ uid: user.uid, name: payload.name, avatar, email, joined })
    let cached = null
    try { cached = localStorage.getItem(PUBLIC_CACHE) } catch (e) {}
    if (cached === key) return // nada cambió: no gastar escrituras
    try {
      // merge: no borrar «sobre mí» ni los puntajes del desafío, que se guardan en el mismo perfil.
      await fs.setDoc(fs.doc(db, 'profiles', user.uid), payload, { merge: true })
      if (email) await fs.setDoc(fs.doc(db, 'emails', email), { uid: user.uid })
      try { localStorage.setItem(PUBLIC_CACHE, key) } catch (e) {}
    } catch (err) {
      console.warn('No se pudo publicar el perfil:', err.code || err)
    }
  }
  window.addEventListener('palavras-profile', () => { publishProfile() })

  // Última visita y cantidad de palabras: una escritura por día y dispositivo
  // (para la sección «Usuarios» del administrador).
  // Además, la cantidad de palabras se actualiza cuando cambia (agrupando los cambios seguidos).
  const COUNT_KEY = 'palabras-pt:palabras-publicadas'
  let countTimer = null

  function publishedCount (userId) {
    try {
      const c = JSON.parse(localStorage.getItem(COUNT_KEY) || 'null')
      return c && c.uid === userId ? c.n : null
    } catch (e) { return null }
  }

  async function publishActivity (force) {
    const user = currentUser
    if (!user || !ready || user.uid !== uid) return
    const key = 'palabras-pt:actividad'
    const today = user.uid + ':' + new Date().toISOString().slice(0, 10)
    const count = app.getWords().length
    const today2 = today + ':v' + APP_VERSION // con una versión nueva se vuelve a registrar
    let seenToday = false
    try { seenToday = localStorage.getItem(key) === today2 } catch (e) {}
    if (seenToday && !force && publishedCount(user.uid) === count) return
    try {
      await fs.setDoc(fs.doc(db, 'profiles', user.uid), { lastSeen: Date.now(), wordCount: count, appVersion: APP_VERSION }, { merge: true })
      try {
        localStorage.setItem(key, today2)
        localStorage.setItem(COUNT_KEY, JSON.stringify({ uid: user.uid, n: count }))
      } catch (e) {}
    } catch (err) {
      console.warn('No se pudo registrar la actividad:', err.code || err)
    }
  }

  function scheduleCount () {
    if (!currentUser || publishedCount(currentUser.uid) === app.getWords().length) return
    clearTimeout(countTimer)
    countTimer = setTimeout(() => { countTimer = null; publishActivity(true) }, 5000)
  }
  function flushCount () { if (countTimer) { clearTimeout(countTimer); countTimer = null; publishActivity(true) } }
  window.addEventListener('pagehide', flushCount)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCount() })

  // ---------- Sesión y escucha de cambios ----------
  auth.onAuthStateChanged(a, (user) => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    clearTimeout(timer)
    timer = null
    uid = user ? user.uid : null
    ref = user ? fs.doc(db, 'users', user.uid) : null
    ready = false
    synced = new Map()
    renderUser(user)
    cloud.user = user
    window.dispatchEvent(new CustomEvent('palavras-user', { detail: user }))
    if (!user) return

    setStatus('Carregando sua lista…')
    const userId = user.uid
    let loading = false
    unsubscribe = fs.onSnapshot(ref, (snap) => {
      if (!ready) {
        if (loading) return
        loading = true
        firstLoad(snap, userId).catch(onError).finally(() => { loading = false })
        return
      }
      const data = snap.exists() ? snap.data() : null
      const remote = data && data.words ? Object.values(data.words) : []
      setProfile(data && data.profile)

      // Si hay cambios locales sin subir, se aplican encima de la versión remota.
      let words = remote
      if (timer) {
        const { sets, deletes } = diff(app.getWords())
        const byId = new Map(remote.map((w) => [w.id, w]))
        sets.forEach((w) => byId.set(w.id, w))
        deletes.forEach((id) => byId.delete(id))
        words = Array.from(byId.values())
      }
      synced = new Map(remote.map((w) => [w.id, JSON.stringify(clean(w))]))
      app.replaceWords(words)
      if (timer) flush()
      else if (!snap.metadata.hasPendingWrites) setStatus('Sincronizado ✔')
    }, onError)
  })

  function onError (err) {
    console.error(err)
    setStatus(err.code === 'permission-denied'
      ? 'Sem permissão para ler a lista: atualize as regras do Firestore.'
      : 'Erro de conexão com a nuvem.')
  }
}

let currentUser = null
let profile = null // { type: 'photo' | 'emoji' | 'google', value }
const PROFILE_CACHE = 'palabras-pt:perfil'

function renderUser (user) {
  currentUser = user
  $('#signin').hidden = !!user
  $('#signed-in').hidden = !user
  $('#avatar-menu').hidden = true
  if (user) {
    $('#user-name').textContent = user.displayName || user.email || 'Sua conta'
    // Muestra la última foto conocida mientras llega la de la nube.
    let cached = null
    try { cached = JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null') } catch (e) {}
    profile = cached && cached.uid === user.uid ? cached.profile : null
    renderAvatar()
    showQuote() // una frase nueva en cada inicio de sesión (y cada vez que se abre la app)
  } else {
    profile = null
    setStatus('')
  }
}

function setProfile (p) {
  const changed = JSON.stringify(profile || null) !== JSON.stringify(p || null)
  profile = p || null
  if (window.PalavrasCloud) window.PalavrasCloud.profile = profile
  if (changed) window.dispatchEvent(new CustomEvent('palavras-profile', { detail: profile }))
  try {
    if (currentUser) localStorage.setItem(PROFILE_CACHE, JSON.stringify({ uid: currentUser.uid, profile }))
  } catch (e) { /* sin espacio */ }
  renderAvatar()
}

function renderAvatar () {
  const img = $('#avatar')
  const emoji = $('#avatar-emoji')
  const user = currentUser
  if (!user) return
  img.hidden = true
  emoji.hidden = true
  if (profile && profile.type === 'photo' && profile.value) {
    img.src = profile.value
    img.hidden = false
  } else if (profile && profile.type === 'emoji' && profile.value) {
    emoji.textContent = profile.value
    emoji.className = 'avatar-emoji'
    emoji.hidden = false
  } else if (user.photoURL) {
    img.src = user.photoURL
    img.hidden = false
  } else {
    // Sin foto: la inicial del nombre.
    emoji.textContent = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase()
    emoji.className = 'avatar-emoji initial'
    emoji.hidden = false
  }
}

// Recorta la imagen al centro (cuadrada) y la achica para guardarla liviana.
function resizeImage (file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const side = Math.min(image.naturalWidth, image.naturalHeight)
        const sx = (image.naturalWidth - side) / 2
        const sy = (image.naturalHeight - side) / 2
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, size, size)
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size)
        let quality = 0.85
        let data = canvas.toDataURL('image/jpeg', quality)
        while (data.length > 60000 && quality > 0.4) {
          quality -= 0.15
          data = canvas.toDataURL('image/jpeg', quality)
        }
        URL.revokeObjectURL(url)
        resolve(data)
      } catch (err) { URL.revokeObjectURL(url); reject(err) }
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen no válida')) }
    image.src = url
  })
}

// ---------- Frase del día (motivación, chiste, expresión o consejo) ----------
function showQuote () {
  if (!window.Phrases) return
  const q = window.Phrases.random()
  $('#quote-kind').textContent = q.icon + ' ' + q.label
  $('#quote-pt').textContent = q.pt
  $('#quote-es').textContent = q.es
  $('#user-quote').hidden = false
}

document.querySelector('#quote-next').addEventListener('click', showQuote)
document.querySelector('#quote-speak').addEventListener('click', () => {
  const text = $('#quote-pt').textContent.replace(/[—«»]/g, ' ')
  if (text.trim() && app && app.speak) app.speak(text)
})

function setStatus (text) {
  const el = document.querySelector('#sync-status')
  if (el) el.textContent = text
}
