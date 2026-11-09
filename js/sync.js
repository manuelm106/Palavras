/*
 * Sincronización opcional con Firebase (inicio de sesión con Google + Firestore).
 * Cada palabra se guarda como un documento en users/{uid}/words/{id}.
 * Si no hay configuración (js/firebase-config.js), este módulo no hace nada.
 */
const FIREBASE_VERSION = '10.12.2'
const config = window.FIREBASE_CONFIG
const app = window.PalavrasApp

const $ = (sel) => document.querySelector(sel)
const normalize = (s) => window.Classifier.normalize(s)
const clean = (w) => JSON.parse(JSON.stringify(w)) // Firestore no acepta `undefined`

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
  let ready = false // true cuando ya llegó la primera versión de la nube
  let synced = new Map() // id -> JSON de la última versión conocida en la nube
  let unsubscribe = null

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
    await auth.signOut(a)
    app.clearWords()
  })

  window.PalavrasSync = {
    push (words) {
      if (!uid || !ready) return
      const ops = []
      const current = new Map()
      words.forEach((w) => {
        const json = JSON.stringify(clean(w))
        current.set(w.id, json)
        if (synced.get(w.id) !== json) ops.push(['set', w])
      })
      synced.forEach((_, id) => { if (!current.has(id)) ops.push(['delete', { id }]) })
      if (!ops.length) return
      synced = current
      setStatus('Sincronizando…')
      // Firestore admite hasta 500 operaciones por lote.
      const chunks = []
      for (let i = 0; i < ops.length; i += 450) chunks.push(ops.slice(i, i + 450))
      Promise.all(chunks.map((chunk) => {
        const batch = fs.writeBatch(db)
        chunk.forEach(([op, w]) => {
          const ref = fs.doc(db, 'users', uid, 'words', w.id)
          if (op === 'set') batch.set(ref, clean(w))
          else batch.delete(ref)
        })
        return batch.commit()
      }))
        .then(() => setStatus('Sincronizado ✔'))
        .catch((err) => {
          console.error(err)
          setStatus('Error al sincronizar (' + (err.code || 'desconocido') + ').')
        })
    }
  }

  auth.onAuthStateChanged(a, (user) => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null }
    uid = user ? user.uid : null
    ready = false
    synced = new Map()
    renderUser(user)
    if (!user) return

    setStatus('Cargando tu lista…')
    const col = fs.collection(db, 'users', user.uid, 'words')
    unsubscribe = fs.onSnapshot(col, (snap) => {
      const remote = snap.docs.map((d) => d.data())
      synced = new Map(remote.map((w) => [w.id, JSON.stringify(clean(w))]))

      if (!ready) {
        // Primera carga: suma a la nube las palabras de este dispositivo que no estén allí.
        ready = true
        const known = new Set(remote.map((w) => normalize(w.word)))
        const extra = app.getWords().filter((w) => !known.has(normalize(w.word)))
        app.replaceWords(remote.concat(extra))
        if (extra.length) {
          window.PalavrasSync.push(app.getWords())
          app.toast(`Se agregaron ${extra.length} palabra(s) de este dispositivo a tu cuenta.`, 'ok')
        } else {
          setStatus('Sincronizado ✔')
        }
        return
      }
      app.replaceWords(remote)
      if (!snap.metadata.hasPendingWrites) setStatus('Sincronizado ✔')
    }, (err) => {
      console.error(err)
      setStatus(err.code === 'permission-denied'
        ? 'Sin permiso para leer la lista: revisa las reglas de Firestore.'
        : 'Error de conexión con la nube.')
    })
  })
}

function renderUser (user) {
  $('#signin').hidden = !!user
  $('#signed-in').hidden = !user
  if (user) {
    $('#user-name').textContent = user.displayName || user.email || 'Tu cuenta'
    const img = $('#avatar')
    if (user.photoURL) { img.src = user.photoURL; img.hidden = false } else img.hidden = true
  } else {
    setStatus('')
  }
}

function setStatus (text) {
  const el = document.querySelector('#sync-status')
  if (el) el.textContent = text
}
