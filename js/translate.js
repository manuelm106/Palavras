/*
 * Sugerencias de significado (portugués → español) mientras se escribe.
 * Usa la API gratuita de MyMemory (sin clave). Las respuestas se guardan
 * en caché en este navegador para no repetir consultas.
 * Nunca sobrescribe lo que el usuario escribió: solo muestra opciones.
 */
(function () {
  'use strict'

  var API = 'https://api.mymemory.translated.net/get'
  var CACHE_KEY = 'palabras-pt:traducciones'
  var DEBOUNCE_MS = 600
  var MAX_SUGGESTIONS = 4

  var wordInput = document.getElementById('word')
  var meaningInput = document.getElementById('meaning')
  var box = document.getElementById('meaning-suggestions')
  if (!wordInput || !meaningInput || !box || !window.fetch) return

  var cache = {}
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch (e) { cache = {} }

  function saveCache () {
    try {
      var keys = Object.keys(cache)
      if (keys.length > 500) keys.slice(0, keys.length - 500).forEach(function (k) { delete cache[k] })
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch (e) { /* sin espacio o modo privado */ }
  }

  function norm (s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?¡¿,;:"'«»“”]+/g, '')
  }

  // Extrae traducciones únicas y razonables de la respuesta de MyMemory.
  function parse (data, query) {
    var out = []
    var seen = {}
    function add (t) {
      var clean = String(t || '').trim().replace(/^[\s"'«“]+|[\s"'»”.]+$/g, '')
      var key = norm(clean)
      if (!key || seen[key] || key === norm(query)) return
      if (/MYMEMORY|QUERY LENGTH|INVALID/i.test(clean) || clean.length > 60) return
      seen[key] = true
      out.push(lowerFirst(clean))
    }
    if (data && data.responseData) add(data.responseData.translatedText)
    ;(data && data.matches || [])
      .filter(function (m) { return norm(m.segment) === norm(query) })
      .sort(function (a, b) { return (Number(b.quality) || 0) - (Number(a.quality) || 0) })
      .forEach(function (m) { add(m.translation) })
    return out.slice(0, MAX_SUGGESTIONS)
  }

  // "Nostalgia" → "nostalgia" (salvo siglas en mayúsculas).
  function lowerFirst (text) {
    return text === text.toUpperCase() ? text : text.charAt(0).toLowerCase() + text.slice(1)
  }

  var timer = null
  var lastQuery = ''

  function render (query, items, status) {
    box.innerHTML = ''
    if (!query) { box.hidden = true; return }
    box.hidden = false
    if (status) {
      box.appendChild(document.createTextNode(status))
      return
    }
    if (!items.length) {
      box.appendChild(document.createTextNode('Sin sugerencias de significado.'))
      return
    }
    box.appendChild(document.createTextNode('¿Significa…? '))
    items.forEach(function (t) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip suggestion-chip'
      b.textContent = t
      b.title = 'Usar como significado'
      b.addEventListener('click', function () {
        meaningInput.value = t
        meaningInput.focus()
      })
      box.appendChild(b)
    })
    // Si el campo está vacío, la primera sugerencia aparece como pista.
    meaningInput.placeholder = items[0] ? 'Sugerido: ' + items[0] : 'ej.: nostalgia, extrañar'
  }

  function lookup (query) {
    if (cache[query]) { render(query, cache[query]); return }
    render(query, [], 'Buscando significado…')
    var url = API + '?q=' + encodeURIComponent(query) + '&langpair=' + encodeURIComponent('pt-BR|es')
    fetch(url)
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (query !== lastQuery) return // llegó tarde: el usuario ya escribió otra cosa
        if (data && Number(data.responseStatus) !== 200) {
          render(query, [], 'No se pudo obtener el significado ahora (límite diario del traductor).')
          return
        }
        var items = parse(data, query)
        cache[query] = items
        saveCache()
        render(query, items)
      })
      .catch(function () {
        if (query === lastQuery) render(query, [], 'Sin conexión: no se puede sugerir el significado.')
      })
  }

  wordInput.addEventListener('input', function () {
    clearTimeout(timer)
    var query = norm(wordInput.value)
    lastQuery = query
    meaningInput.placeholder = 'ej.: nostalgia, extrañar'
    if (query.length < 2) { render('', []); return }
    timer = setTimeout(function () { lookup(query) }, DEBOUNCE_MS)
  })

  // Al enviar el formulario (que se limpia), se ocultan las sugerencias.
  document.getElementById('word-form').addEventListener('submit', function () {
    setTimeout(function () {
      if (!wordInput.value.trim()) { lastQuery = ''; render('', []); meaningInput.placeholder = 'ej.: nostalgia, extrañar' }
    }, 0)
  })
})()
