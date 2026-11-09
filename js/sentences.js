/*
 * Frases reales en portugués, de dos fuentes libres:
 *   - Tatoeba (https://tatoeba.org): frases escritas por personas, con traducción
 *     al español cuando existe. Licencia CC BY 2.0 FR.
 *   - Wiktionary en inglés (https://en.wiktionary.org): ejemplos de uso de las
 *     entradas en portugués (su API permite consultas desde cualquier página).
 *     Licencia CC BY-SA.
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
      out.push({ pt: text, es: es[0] || '', src: 'tatoeba' })
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

  function endpoints (word, sortRandom) {
    var multi = word.indexOf(' ') !== -1
    var q = encodeURIComponent(multi ? '"' + word + '"' : '=' + word)
    if (sortRandom) {
      return [
        'https://api.tatoeba.org/unstable/sentences?lang=por&q=' + q + '&showtrans=spa&sort=random&limit=30',
        'https://tatoeba.org/es/api_v0/search?from=por&orphans=no&unapproved=no&sort=random&query=' + q
      ]
    }
    return [
      // API oficial nueva
      'https://api.tatoeba.org/unstable/sentences?lang=por&q=' + q + '&trans:lang=spa&showtrans=spa&sort=relevance&limit=20',
      // API anterior
      'https://tatoeba.org/es/api_v0/search?from=por&to=spa&orphans=no&unapproved=no&sort=relevance&query=' + q,
      // Sin exigir traducción (por si no hay ninguna en español)
      'https://tatoeba.org/es/api_v0/search?from=por&orphans=no&unapproved=no&sort=relevance&query=' + q
    ]
  }

  // ---------- Wiktionary ----------
  function stripHtml (html) {
    var d = String(html || '').replace(/<[^>]+>/g, '')
    return d.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  }

  function parseWiktionary (data, word) {
    var entries = (data && data.pt) || []
    var w = fold(word)
    var root = w.split(' ')[0]
    root = root.length > 5 ? root.slice(0, root.length - 2) : root
    var out = []
    var seen = {}
    entries.forEach(function (entry) {
      ;(entry.definitions || []).forEach(function (def) {
        var list = (def.parsedExamples || []).map(function (e) { return e.example })
        if (!list.length) list = def.examples || []
        list.forEach(function (ex) {
          var text = stripHtml(ex)
          if (!text || text.length > 160 || fold(text).indexOf(root) === -1) return
          var k = fold(text)
          if (seen[k]) return
          seen[k] = true
          out.push({ pt: text, es: '', src: 'wiktionary' })
        })
      })
    })
    return out.slice(0, MAX_SENTENCES)
  }

  function fromWiktionary (word) {
    var url = 'https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(word.replace(/ /g, '_')) + '?redirect=true'
    return fetchJSON(url).then(function (data) { return parseWiktionary(data, word) }, function (err) {
      // 404 = la palabra no está en Wiktionary (el servicio sí responde).
      if (err && /HTTP 404/.test(err.message)) return []
      throw err
    })
  }

  // Qué servicios respondieron en esta sesión (para diagnosticar y avisar).
  var status = { tatoeba: 'unknown', wiktionary: 'unknown' }

  function tryUrls (urls, word) {
    var i = 0
    var reached = false
    function next () {
      if (i >= urls.length) return Promise.resolve({ list: [], reached: reached })
      return fetchJSON(urls[i++]).then(function (data) {
        reached = true
        var found = parse(data, word)
        return found.length ? { list: found, reached: true } : next()
      }, function () { return next() })
    }
    return next()
  }

  /** Busca en Tatoeba y, si no hay nada, en Wiktionary. Rechaza si ningún servicio responde. */
  function search (word, sortRandom) {
    var urls = endpoints(word, sortRandom)
    return tryUrls(urls, word).then(function (t) {
      status.tatoeba = t.reached ? 'ok' : 'fail'
      if (t.list.length) return t.list
      return fromWiktionary(word).then(function (list) {
        status.wiktionary = 'ok'
        return list
      }, function () {
        status.wiktionary = 'fail'
        if (!t.reached) {
          console.warn('Palavras: no se pudo conectar con Tatoeba ni con Wiktionary.')
          throw new Error('sin conexión')
        }
        return []
      })
    })
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

  // ---------- Más frases (al tocar «Otro ejemplo» cuando ya no quedan) ----------
  var MAX_STORED = 15
  var moreTries = {}

  /**
   * Pide frases al azar (con o sin traducción) y suma las nuevas a la caché.
   * Devuelve cuántas frases nuevas se agregaron.
   */
  function fetchMore (word) {
    var k = key(word)
    if (!k || typeof fetch === 'undefined') return Promise.resolve({ added: 0, reached: false })
    moreTries[k] = (moreTries[k] || 0) + 1
    var current = (cache[k] && cache[k].s) || []
    var known = {}
    current.forEach(function (x) { known[fold(x.pt)] = true })
    // Frases al azar de Tatoeba + los ejemplos de Wiktionary (si no estaban ya).
    var t = tryUrls(endpoints(k, true), k).then(function (r) { status.tatoeba = r.reached ? 'ok' : 'fail'; return r })
    var wk = fromWiktionary(k).then(function (list) { status.wiktionary = 'ok'; return { list: list, reached: true } },
      function () { status.wiktionary = 'fail'; return { list: [], reached: false } })
    return Promise.all([t, wk]).then(function (res) {
      var found = res[0].list.concat(res[1].list)
      var fresh = found.filter(function (x) { var f = fold(x.pt); if (known[f]) return false; known[f] = true; return true })
      if (fresh.length) {
        cache[k] = { t: Date.now(), s: current.concat(fresh).slice(0, MAX_STORED) }
        save()
      }
      return { added: fresh.length, reached: res[0].reached || res[1].reached }
    })
  }

  var api = {
    get: get,
    fetch: fetchFor,
    more: fetchMore,
    status: function () { return Object.assign({}, status) },
    _parse: parse,
    _parseWiktionary: parseWiktionary
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Sentences = api
})(this)
