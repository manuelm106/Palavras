/* global Classifier, Examples */
(function () {
  'use strict'

  var STORAGE_KEY = 'palabras-pt:v1'
  var CATS = Classifier.CATEGORIES

  // ---------- Estado ----------
  var state = load()

  function defaultState () {
    return {
      words: [],
      settings: { enabled: false, minMinutes: 15, maxMinutes: 45 },
      nextAt: null,
      lastWordId: null
    }
  }

  function load () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultState()
      var s = JSON.parse(raw)
      var d = defaultState()
      return {
        words: Array.isArray(s.words) ? s.words : [],
        settings: Object.assign(d.settings, s.settings || {}),
        nextAt: s.nextAt || null,
        lastWordId: s.lastWordId || null
      }
    } catch (e) {
      return defaultState()
    }
  }

  function save () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { /* modo privado */ }
  }

  function uid () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  }

  // ---------- Utilidades DOM ----------
  var $ = function (sel) { return document.querySelector(sel) }

  function el (tag, attrs, children) {
    var node = document.createElement(tag)
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k]
      else if (k === 'text') node.textContent = attrs[k]
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k])
      else node.setAttribute(k, attrs[k])
    })
    ;(children || []).forEach(function (c) {
      if (c == null) return
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
    })
    return node
  }

  // ---------- Pronunciación ----------
  function speak (text) {
    if (!('speechSynthesis' in window)) return
    var u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    var voice = speechSynthesis.getVoices().filter(function (v) { return /^pt(-|_)BR/i.test(v.lang) })[0] ||
      speechSynthesis.getVoices().filter(function (v) { return /^pt/i.test(v.lang) })[0]
    if (voice) u.voice = voice
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  }

  // ---------- Formulario ----------
  var form = $('#word-form')
  var wordInput = $('#word')
  var hint = $('#suggestion')
  var catSelect = $('#category')
  var userTouchedCategory = false

  function updateSuggestion () {
    var value = wordInput.value
    if (!value.trim()) {
      hint.textContent = ''
      hint.hidden = true
      if (!userTouchedCategory) catSelect.value = 'auto'
      return
    }
    var r = Classifier.classify(value)
    hint.hidden = false
    hint.innerHTML = ''
    hint.appendChild(el('span', { class: 'badge cat-' + r.category, text: CATS[r.category].label }))
    hint.appendChild(document.createTextNode(' ' + capitalize(r.reason) + ' · confianza ' + Math.round(r.confidence * 100) + '%'))
  }

  function capitalize (s) { return s.charAt(0).toUpperCase() + s.slice(1) }

  wordInput.addEventListener('input', updateSuggestion)
  catSelect.addEventListener('change', function () { userTouchedCategory = catSelect.value !== 'auto' })

  form.addEventListener('submit', function (ev) {
    ev.preventDefault()
    var word = wordInput.value.trim().replace(/\s+/g, ' ')
    if (!word) return
    var key = Classifier.normalize(word)
    var existing = state.words.filter(function (w) { return Classifier.normalize(w.word) === key })[0]
    if (existing) {
      toast('«' + existing.word + '» ya está en tu lista.', 'info')
      highlight(existing.id)
      return
    }
    var guess = Classifier.classify(word)
    var category = catSelect.value === 'auto' ? guess.category : catSelect.value
    var example = $('#example').value.trim()
    var entry = {
      id: uid(),
      word: word,
      category: category,
      autoCategory: guess.category,
      meaning: $('#meaning').value.trim(),
      examples: example ? [example] : [],
      createdAt: Date.now(),
      shown: 0
    }
    state.words.unshift(entry)
    save()
    form.reset()
    userTouchedCategory = false
    updateSuggestion()
    render()
    highlight(entry.id)
    toast('Agregada «' + entry.word + '» como ' + CATS[category].label.toLowerCase() + '.', 'ok')
    wordInput.focus()
    if (state.settings.enabled && !state.nextAt) scheduleNext()
  })

  // ---------- Lista ----------
  var filter = 'todas'
  var search = ''

  $('#search').addEventListener('input', function (e) { search = Classifier.normalize(e.target.value); renderList() })

  function renderFilters () {
    var box = $('#filters')
    box.innerHTML = ''
    var counts = { todas: state.words.length }
    Object.keys(CATS).forEach(function (k) { counts[k] = 0 })
    state.words.forEach(function (w) { counts[w.category] = (counts[w.category] || 0) + 1 })
    ;['todas'].concat(Object.keys(CATS)).forEach(function (k) {
      var label = k === 'todas' ? 'Todas' : CATS[k].label
      box.appendChild(el('button', {
        type: 'button',
        class: 'chip' + (filter === k ? ' active' : '') + (k !== 'todas' ? ' cat-' + k : ''),
        'aria-pressed': String(filter === k),
        onclick: function () { filter = k; render() }
      }, [label + ' ', el('span', { class: 'count', text: String(counts[k]) })]))
    })
  }

  function renderList () {
    var list = $('#word-list')
    list.innerHTML = ''
    var items = state.words.filter(function (w) {
      if (filter !== 'todas' && w.category !== filter) return false
      if (search && Classifier.normalize(w.word + ' ' + (w.meaning || '')).indexOf(search) === -1) return false
      return true
    })
    $('#empty').hidden = state.words.length !== 0
    $('#no-results').hidden = !(state.words.length && !items.length)
    items.forEach(function (w) { list.appendChild(renderItem(w)) })
  }

  function renderItem (w) {
    var exampleBox = el('p', { class: 'example', text: Examples.randomExample(w) })

    var select = el('select', {
      class: 'cat-select',
      'aria-label': 'Categoría de ' + w.word,
      onchange: function (e) {
        w.category = e.target.value
        save()
        render()
        highlight(w.id)
      }
    }, Object.keys(CATS).map(function (k) {
      var o = el('option', { value: k, text: CATS[k].label })
      if (k === w.category) o.selected = true
      return o
    }))

    var ownExamples = el('ul', { class: 'own-examples' }, (w.examples || []).map(function (ex, i) {
      return el('li', {}, [
        ex,
        el('button', {
          type: 'button', class: 'link danger', title: 'Borrar este ejemplo', 'aria-label': 'Borrar ejemplo',
          onclick: function () { w.examples.splice(i, 1); save(); render(); highlight(w.id) }
        }, ['×'])
      ])
    }))

    var details = el('details', { class: 'more' }, [
      el('summary', { text: 'Mis ejemplos (' + (w.examples || []).length + ')' }),
      ownExamples,
      el('form', {
        class: 'add-example',
        onsubmit: function (e) {
          e.preventDefault()
          var input = e.target.querySelector('input')
          var v = input.value.trim()
          if (!v) return
          w.examples = (w.examples || []).concat(v)
          save()
          render()
          highlight(w.id, true)
        }
      }, [
        el('input', { type: 'text', placeholder: 'Escribe tu propia frase con «' + w.word + '»', 'aria-label': 'Nuevo ejemplo' }),
        el('button', { type: 'submit', class: 'btn small', text: 'Agregar' })
      ])
    ])

    return el('li', { class: 'word-card', id: 'w-' + w.id }, [
      el('div', { class: 'card-head' }, [
        el('div', { class: 'word-title' }, [
          el('span', { class: 'dot cat-' + w.category, 'aria-hidden': 'true' }),
          el('strong', { lang: 'pt-BR', text: w.word }),
          w.meaning ? el('span', { class: 'meaning', text: '— ' + w.meaning }) : null
        ]),
        el('div', { class: 'card-actions' }, [
          select,
          el('button', { type: 'button', class: 'icon-btn', title: 'Escuchar', 'aria-label': 'Escuchar ' + w.word, onclick: function () { speak(w.word) } }, ['🔊']),
          el('button', {
            type: 'button',
            class: 'icon-btn danger',
            title: 'Borrar',
            'aria-label': 'Borrar ' + w.word,
            onclick: function () {
              if (!confirm('¿Borrar «' + w.word + '» de la lista?')) return
              state.words = state.words.filter(function (x) { return x.id !== w.id })
              save()
              render()
            }
          }, ['🗑'])
        ])
      ]),
      el('div', { class: 'example-row' }, [
        exampleBox,
        el('button', { type: 'button', class: 'link', onclick: function () { exampleBox.textContent = Examples.randomExample(w) } }, ['Otro ejemplo']),
        el('button', { type: 'button', class: 'link', onclick: function () { speak(exampleBox.textContent) } }, ['Escuchar frase'])
      ]),
      details
    ])
  }

  function highlight (id, keepOpen) {
    var node = document.getElementById('w-' + id)
    if (!node) return
    if (keepOpen) node.querySelector('details').open = true
    node.classList.remove('flash')
    void node.offsetWidth
    node.classList.add('flash')
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  function render () {
    renderFilters()
    renderList()
    renderSettings()
  }

  // ---------- Notificaciones ----------
  var swReg = null
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r }).catch(function () {})
  }

  function notificationsSupported () { return 'Notification' in window }

  function randomDelayMs () {
    var min = Math.max(1, Number(state.settings.minMinutes) || 1)
    var max = Math.max(min, Number(state.settings.maxMinutes) || min)
    return Math.round((min + Math.random() * (max - min)) * 60 * 1000)
  }

  function scheduleNext () {
    state.nextAt = state.settings.enabled && state.words.length ? Date.now() + randomDelayMs() : null
    save()
    renderSettings()
  }

  function pickWord () {
    var words = state.words
    if (!words.length) return null
    if (words.length === 1) return words[0]
    // Prioriza palabras que se mostraron menos veces y evita repetir la última.
    var pool = words.filter(function (w) { return w.id !== state.lastWordId })
    var weights = pool.map(function (w) { return 1 / (1 + (w.shown || 0)) })
    var total = weights.reduce(function (a, b) { return a + b }, 0)
    var r = Math.random() * total
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return pool[i]
    }
    return pool[pool.length - 1]
  }

  function fire () {
    var w = pickWord()
    if (!w) return
    var example = Examples.randomExample(w)
    w.shown = (w.shown || 0) + 1
    state.lastWordId = w.id
    save()

    var title = w.word + ' · ' + CATS[w.category].label + (w.meaning ? ' (' + w.meaning + ')' : '')
    var visible = document.visibilityState === 'visible'
    var canNotify = notificationsSupported() && Notification.permission === 'granted'

    if (canNotify && !visible) {
      var opts = { body: example, icon: 'icon.svg', badge: 'icon.svg', tag: 'palabras-pt', renotify: true, lang: 'pt-BR', data: { id: w.id } }
      if (swReg && swReg.showNotification) {
        swReg.showNotification(title, opts)
      } else {
        try {
          var n = new Notification(title, opts)
          n.onclick = function () { window.focus(); highlight(w.id); n.close() }
        } catch (e) { /* algunos navegadores móviles exigen service worker */ }
      }
    }
    toast(null, 'note', { title: title, body: example, id: w.id })
  }

  function tick () {
    if (!state.settings.enabled || !state.nextAt) return
    if (Date.now() >= state.nextAt) {
      fire()
      scheduleNext()
    }
    renderCountdown()
  }
  setInterval(tick, 1000)

  // Mensajes desde el service worker (click en una notificación)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'focus-word') highlight(e.data.id)
    })
  }

  // ---------- Panel de configuración ----------
  var enabledInput = $('#notif-enabled')
  var minInput = $('#notif-min')
  var maxInput = $('#notif-max')

  enabledInput.addEventListener('change', function () {
    if (enabledInput.checked && notificationsSupported() && Notification.permission === 'default') {
      Notification.requestPermission().then(function () { renderSettings() })
    }
    state.settings.enabled = enabledInput.checked
    scheduleNext()
  })

  function onRangeChange () {
    var min = Math.max(1, parseInt(minInput.value, 10) || 1)
    var max = Math.max(min, parseInt(maxInput.value, 10) || min)
    state.settings.minMinutes = min
    state.settings.maxMinutes = max
    minInput.value = min
    maxInput.value = max
    scheduleNext()
  }
  minInput.addEventListener('change', onRangeChange)
  maxInput.addEventListener('change', onRangeChange)

  $('#notif-test').addEventListener('click', function () {
    if (!state.words.length) { toast('Primero agrega alguna palabra a la lista.', 'info'); return }
    if (notificationsSupported() && Notification.permission === 'default') Notification.requestPermission()
    fire()
  })

  function renderSettings () {
    enabledInput.checked = !!state.settings.enabled
    minInput.value = state.settings.minMinutes
    maxInput.value = state.settings.maxMinutes
    var status = $('#notif-permission')
    if (!notificationsSupported()) {
      status.textContent = 'Tu navegador no soporta notificaciones del sistema: los avisos se mostrarán dentro de la página.'
    } else if (Notification.permission === 'denied') {
      status.textContent = 'Bloqueaste las notificaciones para este sitio. Se mostrarán solo dentro de la página (puedes habilitarlas desde la configuración del navegador).'
    } else if (Notification.permission === 'default') {
      status.textContent = 'Al activar, el navegador te pedirá permiso para mostrar notificaciones.'
    } else {
      status.textContent = 'Notificaciones del sistema habilitadas ✔'
    }
    renderCountdown()
  }

  function renderCountdown () {
    var box = $('#notif-next')
    if (!state.settings.enabled) { box.textContent = 'Notificaciones desactivadas.'; return }
    if (!state.words.length) { box.textContent = 'Agrega palabras para empezar a recibir ejemplos.'; return }
    if (!state.nextAt) { box.textContent = ''; return }
    var s = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000))
    var m = Math.floor(s / 60)
    box.textContent = 'Próximo ejemplo en ' + (m ? m + ' min ' : '') + (s % 60) + ' s (aprox., es aleatorio).'
  }

  // ---------- Toasts ----------
  function toast (text, kind, note) {
    var box = $('#toasts')
    var node
    if (note) {
      node = el('div', { class: 'toast note', role: 'status' }, [
        el('div', { class: 'toast-title', lang: 'pt-BR', text: '🇧🇷 ' + note.title }),
        el('div', { class: 'toast-body', lang: 'pt-BR', text: note.body }),
        el('div', { class: 'toast-actions' }, [
          el('button', { type: 'button', class: 'link', onclick: function () { speak(note.body) } }, ['🔊 Escuchar']),
          el('button', { type: 'button', class: 'link', onclick: function () { highlight(note.id); dismiss() } }, ['Ver en la lista']),
          el('button', { type: 'button', class: 'link', onclick: dismiss }, ['Cerrar'])
        ])
      ])
    } else {
      node = el('div', { class: 'toast ' + (kind || ''), role: 'status', text: text })
    }
    function dismiss () { if (node.parentNode) node.parentNode.removeChild(node) }
    box.appendChild(node)
    while (box.children.length > 3) box.removeChild(box.firstChild)
    setTimeout(dismiss, note ? 20000 : 3500)
  }

  // ---------- Exportar / importar ----------
  $('#export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state.words, null, 2)], { type: 'application/json' })
    var a = el('a', { href: URL.createObjectURL(blob), download: 'palabras-pt.json' })
    document.body.appendChild(a)
    a.click()
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove() }, 0)
  })

  $('#import').addEventListener('change', function (e) {
    var file = e.target.files[0]
    if (!file) return
    var reader = new FileReader()
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result)
        if (!Array.isArray(data)) throw new Error('formato')
        var known = {}
        state.words.forEach(function (w) { known[Classifier.normalize(w.word)] = true })
        var added = 0
        data.forEach(function (w) {
          if (!w || !w.word || known[Classifier.normalize(w.word)]) return
          var category = CATS[w.category] ? w.category : Classifier.classify(w.word).category
          state.words.push({
            id: uid(), word: String(w.word), category: category, autoCategory: category,
            meaning: w.meaning ? String(w.meaning) : '', examples: Array.isArray(w.examples) ? w.examples.map(String) : [],
            createdAt: w.createdAt || Date.now(), shown: 0
          })
          known[Classifier.normalize(w.word)] = true
          added++
        })
        save()
        render()
        toast('Importadas ' + added + ' palabras nuevas.', 'ok')
      } catch (err) {
        toast('No se pudo leer el archivo. Debe ser un JSON exportado desde esta app.', 'info')
      }
      e.target.value = ''
    }
    reader.readAsText(file)
  })

  // ---------- Inicio ----------
  var params = new URLSearchParams(location.search)
  render()
  if (state.settings.enabled && !state.nextAt) scheduleNext()
  if (params.get('word')) setTimeout(function () { highlight(params.get('word')) }, 50)
})()
