/*
 * Página pública de perfil (perfil.html?u=<slug>). No necesita iniciar sesión:
 * lee public/{slug}, la copia que el usuario eligió publicar.
 */
const FIREBASE_VERSION = '10.12.2'
const $ = (id) => document.getElementById(id)
const LEVELS = { principiante: '🌱 Iniciante', intermedio: '🌿 Intermediário', avanzado: '🌳 Avançado', nativo: '🇧🇷 Nativo' }
const CAT = { sustantivo: 'Substantivo', adjetivo: 'Adjetivo', verbo: 'Verbo', adverbio: 'Advérbio', conector: 'Conectivo', expresion: 'Expressão' }

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

function show (id) {
  ['pp-loading', 'pp-missing', 'pp-profile', 'pp-cta'].forEach((x) => { $(x).hidden = !(x === id || (id === 'pp-profile' && x === 'pp-cta')) })
}

async function main () {
  const slug = new URLSearchParams(location.search).get('u')
  if (!slug || !/^[a-z0-9]{6,40}$/.test(slug) || !window.FIREBASE_CONFIG) { show('pp-missing'); return }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`
    const [{ initializeApp }, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js')])
    const db = fs.getFirestore(initializeApp(window.FIREBASE_CONFIG))
    const snap = await fs.getDoc(fs.doc(db, 'public', slug))
    if (!snap.exists()) { show('pp-missing'); return }
    render(snap.data())
    show('pp-profile')
  } catch (err) {
    console.error(err)
    if (err && err.code === 'permission-denied') {
      // Las reglas publicadas en Firestore todavía no permiten ver perfiles públicos.
      $('pp-missing').querySelector('h2').textContent = 'Perfil indisponível no momento'
      $('pp-missing').querySelector('p').textContent = 'O Palavras ainda está terminando de configurar os perfis públicos. Tente de novo mais tarde.'
    }
    show('pp-missing')
  }
}

function avatar (a, name) {
  const wrap = el('span', { class: 'mini-avatar', style: 'width:72px;height:72px;font-size:38px' })
  if (a && (a.type === 'photo' || a.type === 'url') && a.value) wrap.appendChild(el('img', { src: a.value, alt: '', referrerpolicy: 'no-referrer' }))
  else if (a && a.type === 'emoji') wrap.textContent = a.value
  else { wrap.classList.add('initial'); wrap.textContent = (name || '?').charAt(0).toUpperCase() }
  return wrap
}

function render (d) {
  const name = d.name || 'Usuário'
  document.title = name + ' · Palavras'
  const c = d.challenge || {}
  const total = (c.ok || 0) + (c.fail || 0)
  const body = $('pp-body')
  const parts = [
    el('div', { class: 'pv-head' }, [
      avatar(d.avatar, name),
      el('div', {}, [
        el('h2', { class: 'pv-name', text: name }),
        el('div', { class: 'pv-meta' }, [
          LEVELS[d.level] ? el('span', { class: 'pv-tag', text: LEVELS[d.level] }) : null,
          d.location ? el('span', { class: 'pv-tag', text: '📍 ' + d.location }) : null
        ])
      ])
    ]),
    d.bio ? el('p', { class: 'pv-bio', text: d.bio }) : null,
    el('div', { class: 'pv-stats' }, [
      el('div', { class: 'score' }, [el('span', { text: String(d.wordCount || 0) }), el('small', { text: 'palavras' })]),
      el('div', { class: 'score ok' }, [el('span', { text: String(c.ok || 0) }), el('small', { text: 'acertos no desafio' })]),
      el('div', { class: 'score' }, [el('span', { text: total ? Math.round(100 * (c.ok || 0) / total) + '%' : '–' }), el('small', { text: 'precisão' })]),
      el('div', { class: 'score' }, [el('span', { text: String(c.best || 0) }), el('small', { text: 'melhor sequência' })])
    ])
  ]

  if (d.showWords && Array.isArray(d.words) && d.words.length) {
    const words = d.words
    const counts = {}
    words.forEach((w) => { counts[w.c] = (counts[w.c] || 0) + 1 })
    let filter = 'todas'
    let query = ''
    const norm = (t) => (window.Classifier ? window.Classifier.normalize(t || '') : String(t || '').toLowerCase())
    const chips = el('div', { class: 'filters' })
    const list = el('ul', { class: 'pv-words' })
    const more = el('p', { class: 'muted small' })
    const search = el('input', { type: 'search', placeholder: 'Buscar palavras…', 'aria-label': 'Buscar palavras' })
    function draw () {
      chips.replaceChildren(...['todas'].concat(Object.keys(CAT)).filter((k) => k === 'todas' || counts[k]).map((k) => el('button', {
        type: 'button',
        class: 'chip' + (filter === k ? ' active' : '') + (k !== 'todas' ? ' cat-' + k : ''),
        onclick: () => { filter = k; draw() }
      }, [(k === 'todas' ? 'Todas' : CAT[k]) + ' ', el('span', { class: 'count', text: String(k === 'todas' ? words.length : counts[k]) })])))
      const items = words.filter((w) => (filter === 'todas' || w.c === filter) && (!query || norm(w.w + ' ' + (w.m || '')).includes(query)))
      list.replaceChildren(...items.slice(0, 300).map((w) => el('li', { class: 'pv-word' }, [
        el('div', { class: 'word-title' }, [
          el('span', { class: 'dot cat-' + w.c, 'aria-hidden': 'true' }),
          el('strong', { text: (w.a ? w.a + ' ' : '') + w.w }),
          w.m ? el('span', { class: 'meaning', lang: 'es', text: '— ' + w.m }) : null
        ]),
        w.e ? el('p', { class: 'example', text: w.e }) : null
      ])))
      more.textContent = items.length > 300 ? 'Mostrando 300 de ' + items.length + '. Use a busca para encontrar mais.' : (items.length ? '' : 'Nenhuma palavra encontrada.')
    }
    search.addEventListener('input', () => { query = norm(search.value); draw() })
    draw()
    parts.push(el('h3', { class: 'pv-words-title', text: 'Palavras de ' + name }), search, chips, list, more)
  } else if (d.showWords === false) {
    parts.push(el('p', { class: 'pv-hidden', text: '🔒 ' + name + ' preferiu não mostrar a lista de palavras.' }))
  }
  body.replaceChildren(...parts.filter(Boolean))
}

main()
