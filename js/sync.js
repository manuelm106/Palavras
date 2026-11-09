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
  setStatus('No se pudo cargar la sincronización.')
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
        app.toast('No se pudo iniciar sesión: ' + (err.code || err.message), 'info')
      }
    }
  })

  $('#signout').addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión? Tu lista sigue guardada en tu cuenta, pero se quitará de este dispositivo.')) return
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
      app.toast('Tu lista es muy grande para sincronizarse completa (máx. ~1 MB). Exporta una copia y borra palabras o ejemplos que no uses.', 'info')
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
    if (!checkSize(words)) { setStatus('Lista demasiado grande para sincronizar.'); return }

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
    } catch (err) {
      console.error(err)
      synced = previous // se reintenta en el próximo cambio
      setStatus(err.code === 'permission-denied'
        ? 'Sin permiso para guardar: actualiza las reglas de Firestore.'
        : 'Error al sincronizar (' + (err.code || 'desconocido') + ').')
    }
  }

  window.PalavrasSync = {
    push () {
      if (!uid || !ready) return
      clearTimeout(timer)
      timer = setTimeout(flush, PUSH_DELAY_MS)
      setStatus('Cambios pendientes…')
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
      app.toast(`Se agregaron ${extra.length} palabra(s) de este dispositivo a tu cuenta.`, 'ok')
    } else {
      setStatus('Sincronizado ✔')
    }
    if (migrated) console.info(`Migradas ${migrated} palabras al formato nuevo.`)
  }

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
    if (!user) return

    setStatus('Cargando tu lista…')
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
      ? 'Sin permiso para leer la lista: actualiza las reglas de Firestore.'
      : 'Error de conexión con la nube.')
  }
}

function renderUser (user) {
  $('#signin').hidden = !!user
  $('#signed-in').hidden = !user
  if (user) {
    $('#user-name').textContent = user.displayName || user.email || 'Tu cuenta'
    const img = $('#avatar')
    if (user.photoURL) { img.src = user.photoURL; img.hidden = false } else img.hidden = true
    showQuote() // una frase nueva en cada inicio de sesión (y cada vez que se abre la app)
  } else {
    setStatus('')
  }
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
