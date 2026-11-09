/*
 * Frases reales en portugués (con traducción al español cuando existe) desde
 * Tatoeba (https://tatoeba.org), una base libre de frases escritas por personas.
 * Licencia de las frases: CC BY 2.0 FR.
 *
 * - Se guardan en caché en este navegador (también los "no encontrado", que se
 *   reintentan a la semana).
 * - Las consultas van de a una, con una pausa, para no saturar el servicio.
 */
(function (root) {
  'use strict'

  var CACHE_KEY = 'palabras-pt:frases-reales'
  var MAX_CACHE = 1500
  var RETRY_EMPTY_MS = 7 * 24 * 3600 * 1000
  var MAX_SENTENCES = 6
  var GAP_MS = 350
  var TIMEOUT_MS = 8000

  var cache = {}
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch (e) { cache = {} }

  function save () {
    try {
      var keys = Object.keys(cache)
      if (keys.length > MAX_CACHE) {
        keys.sort(function (a, b) { return (cache[a].t || 0) - (cache[b].t || 0) })
        keys.slice(0, keys.length - MAX_CACHE).forEach(function (k) { delete cache[k] })
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch (e) { /* sin espacio o modo privado */ }
  }

  function key (word) { return String(word || '').trim().toLowerCase().replace(/\s+/g, ' ') }
  function fold (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }

  /** Frases ya conocidas para la palabra (o null si nunca se buscó). */
  function get (word) {
    var c = cache[key(word)]
    return c ? c.s : null
  }

  // ---------- Lectura flexible de las respuestas de Tatoeba ----------
  function collectSpanish (translations, out) {
    if (!translations) return
    if (Array.isArray(translations)) { translations.forEach(function (t) { collectSpanish(t, out) }); return }
    if (typeof translations === 'object') {
      if (translations.lang === 'spa' && translations.text) out.push(String(translations.text))
      else if (translations.translations) collectSpanish(translations.translations, out)
    }
  }

  function parse (data, word) {
    var items = (data && (data.results || data.data || data.sentences)) || []
    if (!Array.isArray(items)) return []
    var w = fold(word)
    var root = w.split(' ')[0]
    root = root.length > 5 ? root.slice(0, root.length - 2) : root
    var out = []
    var seen = {}
    items.forEach(function (it) {
      var text = String((it && it.text) || '').trim()
      if (!text || text.length > 140) return
      if (it.lang && it.lang !== 'por') return
      // Debe usar la palabra (o una forma de la misma raíz).
      if (fold(text).indexOf(root) === -1) return
      var k = fold(text)
      if (seen[k]) return
      seen[k] = true
      var es = []
      collectSpanish(it.translations, es)
      out.push({ pt: text, es: es[0] || '' })
    })
    // Primero las que tienen traducción y son más cortas.
    out.sort(function (a, b) { return (b.es ? 1 : 0) - (a.es ? 1 : 0) || a.pt.length - b.pt.length })
    return out.slice(0, MAX_SENTENCES)
  }

  function fetchJSON (url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timer = setTimeout(function () { if (ctrl) ctrl.abort() }, TIMEOUT_MS)
    return fetch(url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        clearTimeout(timer)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      }, function (err) { clearTimeout(timer); throw err })
  }

  function endpoints (word) {
    var multi = word.indexOf(' ') !== -1
    var q = multi ? '"' + word + '"' : '=' + word
    return [
      // API oficial nueva
      'https://api.tatoeba.org/unstable/sentences?lang=por&q=' + encodeURIComponent(q) +
        '&trans:lang=spa&showtrans=spa&sort=relevance&limit=20',
      // API anterior
      'https://tatoeba.org/es/api_v0/search?from=por&to=spa&orphans=no&unapproved=no&sort=relevance&query=' + encodeURIComponent(q),
      // Sin exigir traducción (por si no hay ninguna en español)
      'https://tatoeba.org/es/api_v0/search?from=por&orphans=no&unapproved=no&sort=relevance&query=' + encodeURIComponent(q)
    ]
  }

  function search (word) {
    var urls = endpoints(word)
    var i = 0
    var anySuccess = false
    function next () {
      if (i >= urls.length) return anySuccess ? [] : Promise.reject(new Error('sin conexión con Tatoeba'))
      var url = urls[i++]
      return fetchJSON(url).then(function (data) {
        anySuccess = true
        var found = parse(data, word)
        return found.length ? found : next()
      }, function () { return next() })
    }
    return Promise.resolve().then(next)
  }

  // ---------- Cola de consultas ----------
  var queue = []
  var pending = {}
  var running = false

  function pump () {
    if (running || !queue.length) return
    running = true
    var job = queue.shift()
    search(job.word).then(function (list) {
      cache[job.key] = { t: Date.now(), s: list }
      save()
      job.resolve(list)
    }, function () {
      job.resolve(get(job.word) || []) // sin conexión: no se guarda, se reintenta otra vez
    }).then(function () {
      delete pending[job.key]
      setTimeout(function () { running = false; pump() }, GAP_MS)
    })
  }

  /** Busca frases para la palabra (usa la caché si es reciente). */
  function fetchFor (word) {
    var k = key(word)
    if (!k || typeof fetch === 'undefined') return Promise.resolve([])
    var c = cache[k]
    if (c && (c.s.length || Date.now() - c.t < RETRY_EMPTY_MS)) return Promise.resolve(c.s)
    if (pending[k]) return pending[k]
    pending[k] = new Promise(function (resolve) {
      queue.push({ word: k, key: k, resolve: resolve })
      pump()
    })
    return pending[k]
  }

  var api = { get: get, fetch: fetchFor, _parse: parse }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Sentences = api
})(this)
