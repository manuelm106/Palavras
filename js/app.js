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
      lastWordId: null,
      shown: {} // id -> veces mostrada en notificaciones (solo en este dispositivo)
    }
  }

  function load () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultState()
      var s = JSON.parse(raw)
      var d = defaultState()
      var words = Array.isArray(s.words) ? s.words : []
      var shown = s.shown && typeof s.shown === 'object' ? s.shown : {}
      // Versiones anteriores guardaban el contador dentro de cada palabra.
      words.forEach(function (w) {
        if (w.shown) shown[w.id] = (shown[w.id] || 0) + w.shown
        delete w.shown
      })
      return {
        words: words,
        settings: Object.assign(d.settings, s.settings || {}),
        nextAt: s.nextAt || null,
        lastWordId: s.lastWordId || null,
        shown: shown
      }
    } catch (e) {
      return defaultState()
    }
  }

  function saveLocal () {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { /* modo privado */ }
  }

  // Guarda en este dispositivo y, si hay sesión iniciada, sincroniza con la nube.
  function save () {
    saveLocal()
    if (window.PalavrasSync) window.PalavrasSync.push(state.words)
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
  // En Safari (iPhone) las voces cargan tarde y speak() puede fallar en silencio
  // justo después de cancel(). Por eso se precargan las voces y hay un reintento.
  var currentUtterance = null // referencia para que no se libere a mitad de frase

  function ptVoice () {
    var voices = window.speechSynthesis.getVoices()
    return voices.filter(function (v) { return /^pt[-_]BR/i.test(v.lang) })[0] ||
      voices.filter(function (v) { return /^pt/i.test(v.lang) })[0] || null
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices()
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices() }
    }
  }

  function speak (text) {
    var synth = window.speechSynthesis
    if (!synth || !window.SpeechSynthesisUtterance) {
      toast('Seu navegador não permite reproduzir áudio de texto.', 'info')
      return
    }
    var u = new SpeechSynthesisUtterance(text)
    u.lang = 'pt-BR'
    u.rate = 0.9
    var voice = ptVoice()
    if (voice) u.voice = voice
    var started = false
    u.onstart = function () { started = true }
    u.onend = u.onerror = function () { if (currentUtterance === u) currentUtterance = null }
    currentUtterance = u

    // Safari exige llamar a speak() dentro del mismo toque (sin esperas previas).
    // Si quedó "trabado" (por ejemplo, al volver de segundo plano), se cancela y,
    // si la frase no arranca, se reintenta: el toque ya habilitó el audio.
    if (synth.paused) synth.resume()
    if (synth.speaking || synth.pending) synth.cancel()
    synth.speak(u)
    setTimeout(function () {
      if (started || currentUtterance !== u) return
      synth.cancel()
      if (synth.paused) synth.resume()
      synth.speak(u)
    }, 400)
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
    hint.appendChild(document.createTextNode(' ' + capitalize(r.reason) + ' · confiança ' + Math.round(r.confidence * 100) + '%'))
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
      toast('«' + existing.word + '» já está na sua lista.', 'info')
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
      createdAt: Date.now()
    }
    state.words.unshift(entry)
    save()
    form.reset()
    userTouchedCategory = false
    updateSuggestion()
    render()
    highlight(entry.id)
    toast('«' + entry.word + '» adicionada como ' + CATS[category].label.toLowerCase() + '.', 'ok')
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
    counts.genero = state.words.filter(function (w) { var c = genderCompare(w); return c && c.status === 'different' }).length
    counts.irregular = state.words.filter(function (w) { return !!verbInfo(w) }).length
    var keys = ['todas'].concat(Object.keys(CATS))
    if (counts.genero || filter === 'genero') keys.push('genero')
    if (counts.irregular || filter === 'irregular') keys.push('irregular')
    keys.forEach(function (k) {
      var label = k === 'todas' ? 'Todas' : k === 'genero' ? '⚠️ Gênero diferente' : k === 'irregular' ? '⚡ Irregulares' : CATS[k].label
      box.appendChild(el('button', {
        type: 'button',
        class: 'chip' + (filter === k ? ' active' : '') + (k !== 'todas' ? ' cat-' + k : ''),
        'aria-pressed': String(filter === k),
        onclick: function () { filter = k; render() }
      }, [label + ' ', el('span', { class: 'count', text: String(counts[k]) })]))
    })
  }

  function visibleWords () {
    return state.words.filter(function (w) {
      if (filter === 'genero') { var c = genderCompare(w); if (!c || c.status !== 'different') return false } else if (filter === 'irregular') { if (!verbInfo(w)) return false } else if (filter !== 'todas' && w.category !== filter) return false
      if (search && Classifier.normalize(w.word + ' ' + (w.meaning || '')).indexOf(search) === -1) return false
      return true
    })
  }

  function renderList () {
    var list = $('#word-list')
    list.innerHTML = ''
    var items = visibleWords()
    $('#empty').hidden = state.words.length !== 0
    $('#no-results').hidden = !(state.words.length && !items.length)
    items.forEach(function (w) { list.appendChild(renderItem(w)) })
  }

  // Muestra un ejemplo (propio, frase real de Tatoeba o escrito a mano) con su traducción.
  function exampleContent (w, item, loading) {
    if (!item) {
      return [el('p', { class: 'example-empty' }, [
        loading ? 'Buscando frases reais com «' + w.word + '»…' : 'Ainda não há um exemplo para «' + w.word + '».'
      ])]
    }
    var tag = item.source === 'tatoeba'
      ? el('a', { class: 'example-source', href: 'https://tatoeba.org/es/sentences/search?from=por&query=' + encodeURIComponent(w.word), target: '_blank', rel: 'noopener' }, ['Frase real · Tatoeba'])
      : item.source === 'wiktionary'
        ? el('a', { class: 'example-source', href: 'https://en.wiktionary.org/wiki/' + encodeURIComponent(w.word.replace(/ /g, '_')) + '#Portuguese', target: '_blank', rel: 'noopener' }, ['Frase real · Wiktionary'])
        : item.source === 'own'
        ? el('span', { class: 'example-source', text: 'Seu exemplo' })
        : item.source === 'template'
          ? el('span', { class: 'example-source', text: 'Frase modelo' })
          : null
    return [
      el('p', { class: 'example', lang: 'pt-BR', text: item.pt }),
      item.es ? el('p', { class: 'example-es', text: item.es }) : null,
      tag
    ]
  }

  // ---------- Género de los sustantivos ----------
  var GENDER_LABEL = { m: 'masculino', f: 'feminino', mf: 'masc. ou fem.' }

  // Lo que eligió el usuario manda; si no, se deduce de la palabra.
  function nounGender (w) {
    var info = Examples.genderInfo(w.word)
    if (w.gender && GENDER_LABEL[w.gender]) {
      return { g: w.gender, sure: true, manual: true, article: Examples.articleFor(w.gender, info.plural) }
    }
    return info
  }

  // Al tocar la etiqueta aparecen las tres opciones; la elegida queda guardada.
  function genderBadge (w) {
    var info = nounGender(w)
    var wrap = el('span', { class: 'gender-wrap' })
    var badge = el('button', {
      type: 'button',
      class: 'gender-badge g-' + info.g + (info.sure ? '' : ' unsure'),
      title: (info.sure ? '' : 'Não é certo: confira. ') + 'Toque para escolher o gênero.',
      'aria-label': 'Gênero: ' + GENDER_LABEL[info.g] + (info.sure ? '' : ', não confirmado') + '. Toque para escolher.',
      'aria-expanded': 'false',
      onclick: function () {
        var opts = el('span', { class: 'gender-options', role: 'group', 'aria-label': 'Escolher gênero' },
          ['m', 'f', 'mf'].map(function (g) {
            return el('button', {
              type: 'button',
              class: 'gender-badge g-' + g + (g === info.g ? ' current' : ''),
              onclick: function () {
                w.gender = g
                save()
                render()
                highlight(w.id)
                toast('«' + w.word + '»: ' + GENDER_LABEL[g] + ' (' + nounGender(w).article + ' ' + w.word + ').', 'ok')
              }
            }, [GENDER_LABEL[g]])
          }))
        wrap.replaceChildren(opts)
        opts.firstChild.focus()
      }
    }, [GENDER_LABEL[info.g] + (info.sure ? '' : ' ?')])
    wrap.appendChild(badge)
    return wrap
  }

  // ---------- Verbos irregulares ----------
  function verbInfo (w) {
    return w.category === 'verbo' && window.Verbs ? window.Verbs.info(w.word) : null
  }

  function verbBadge (w) {
    var inf = verbInfo(w)
    if (!inf) return null
    var label = window.Verbs.labels[inf.type]
    return el('span', { class: 'verb-badge v-' + inf.type, title: label.long + (inf.base ? ' (como «' + inf.base + '»)' : '') }, [label.short])
  }

  // Desplegable con las formas clave del verbo irregular.
  function verbForms (w) {
    var inf = verbInfo(w)
    if (!inf) return null
    var rows = []
    if (inf.p) rows.push(['Presente', 'eu ' + inf.p[0] + ' · ele/você ' + inf.p[1] + ' · eles/vocês ' + inf.p[2]])
    if (inf.pp) rows.push(['Pretérito', 'eu ' + inf.pp[0] + ' · ele/você ' + inf.pp[1]])
    if (inf.f) rows.push(['Futuro', 'eu ' + inf.f])
    if (inf.pt) rows.push(['Particípio', inf.pt])
    return el('details', { class: 'verb-forms' }, [
      el('summary', { text: 'Ver formas irregulares' + (inf.base ? ' (conjuga-se como «' + inf.base + '»)' : '') }),
      el('table', {}, [el('tbody', {}, rows.map(function (r) {
        return el('tr', {}, [el('th', { scope: 'row', text: r[0] }), el('td', { lang: 'pt-BR', text: r[1] })])
      }))])
    ])
  }

  // Compara el género con el español: { status: 'same' | 'different' | 'check' | 'unknown', pt, es }.
  function genderCompare (w) {
    if (w.category !== 'sustantivo' || !window.GenderES) return null
    var pt = nounGender(w)
    var r = window.GenderES.compare(w.word, pt.g, w.meaning)
    var status = r.status
    if (status === 'different' && !pt.sure) status = 'check' // el portugués no es seguro
    return { status: status, pt: pt, es: r.es }
  }

  function genderNote (w) {
    var c = genderCompare(w)
    if (!c) return null
    var esLabel = c.es ? GENDER_LABEL[c.es.g] : ''
    if (c.status === 'different') {
      return el('div', { class: 'gender-alert', role: 'note' }, [
        el('div', { class: 'gender-alert-title', text: '⚠️ ATENÇÃO! Gênero diferente do espanhol' }),
        el('div', { class: 'gender-alert-pair' }, [
          el('strong', { lang: 'pt-BR', text: c.pt.article + ' ' + w.word }),
          ' (' + GENDER_LABEL[c.pt.g] + ')  ≠  ',
          el('strong', { lang: 'es', text: c.es.article + ' ' + c.es.word }),
          ' (' + esLabel + ')'
        ])
      ])
    }
    if (c.status === 'check') {
      return el('p', { class: 'gender-check' }, ['Gênero diferente? Em espanhol é «' + c.es.article + ' ' + c.es.word + '» (' + esLabel + '). Confirme o gênero em português tocando na etiqueta.'])
    }
    if (c.status === 'same') {
      return el('p', { class: 'gender-same' }, ['✓ Mesmo gênero que em espanhol: ' + c.es.article + ' ' + c.es.word])
    }
    return el('p', { class: 'gender-check' }, [w.meaning
      ? 'Para comparar com o espanhol, escreva o significado com artigo (ex.: «la leche»).'
      : 'Adicione o significado para comparar o gênero com o espanhol.'])
  }

  function editMeaning (w) {
    var value = prompt('Significado de «' + w.word + '»' + (w.category === 'sustantivo' ? ' (com artigo, ex.: «la leche», para comparar o gênero)' : '') + ':', w.meaning || '')
    if (value === null) return
    w.meaning = value.trim()
    save()
    render()
    highlight(w.id)
  }

  var exhausted = {} // palabras sin más ejemplos en esta sesión

  function renderItem (w) {
    var current = Examples.randomItem(w)
    var loading = false
    var exampleBox = el('div', { class: 'example-box' })
    var note = el('span', { class: 'example-note muted small', 'aria-live': 'polite' })
    var otherBtn = el('button', { type: 'button', class: 'link', onclick: nextExample }, ['Outro exemplo'])
    var speakBtn = el('button', { type: 'button', class: 'link', onclick: function () { if (current) speak(current.pt) } }, ['Ouvir frase'])
    var writeBtn = el('button', { type: 'button', class: 'link', onclick: openOwnExample }, ['✎ Escrever meu exemplo'])
    function show (item) {
      current = item
      exampleBox.replaceChildren.apply(exampleBox, exampleContent(w, item, loading).filter(Boolean))
      // Se oculta si ya se buscó y no hay más (salvo que ahora haya otro disponible).
      otherBtn.hidden = !item || (exhausted[w.id] && Examples.forWord(w).length < 2)
      speakBtn.hidden = !item
      writeBtn.hidden = !!item || loading
    }
    // Pasa al siguiente ejemplo; si no quedan, busca más frases reales.
    function nextExample () {
      note.textContent = ''
      var next = Examples.randomItem(w, null, current && current.pt)
      if (next) { show(next); return }
      if (!window.Sentences) { noMore(); return }
      otherBtn.disabled = true
      note.textContent = 'Buscando mais frases…'
      window.Sentences.more(w.word).then(function (res) {
        otherBtn.disabled = false
        note.textContent = ''
        if (!exampleBox.isConnected) return
        var fresh = res.added ? Examples.randomItem(w, null, current && current.pt) : null
        if (fresh) show(fresh)
        else noMore(res.reached)
      }, function () { otherBtn.disabled = false; noMore(false) })
    }
    // Sin más frases: se avisa y el botón se oculta para esta palabra (hasta recargar).
    function noMore (reached) {
      exhausted[w.id] = true
      otherBtn.hidden = true
      var text = reached === false
        ? 'Não consegui me conectar agora aos serviços de frases. '
        : 'É o único exemplo que encontrei para «' + w.word + '». '
      note.replaceChildren(text, el('button', { type: 'button', class: 'link', onclick: openOwnExample }, ['Escreva um seu']))
    }
    function openOwnExample () {
      var card = document.getElementById('w-' + w.id)
      if (!card) return
      var d = card.querySelector('details')
      d.open = true
      d.querySelector('input').focus()
    }
    // Si nunca se buscaron frases reales para esta palabra, se buscan ahora.
    if (window.Sentences && window.Sentences.get(w.word) === null) {
      loading = true
      window.Sentences.fetch(w.word).then(function () {
        loading = false
        if (!exampleBox.isConnected) return
        if (!current || current.source === 'template') show(Examples.randomItem(w))
        else show(current)
      })
    }
    show(current)

    var select = el('select', {
      class: 'cat-select',
      'aria-label': 'Categoria de ' + w.word,
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
          type: 'button', class: 'link danger', title: 'Apagar este exemplo', 'aria-label': 'Apagar exemplo',
          onclick: function () { w.examples.splice(i, 1); save(); render(); highlight(w.id) }
        }, ['×'])
      ])
    }))

    var details = el('details', { class: 'more' }, [
      el('summary', { text: 'Meus exemplos (' + (w.examples || []).length + ')' }),
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
        el('input', { type: 'text', placeholder: 'Escreva sua própria frase com «' + w.word + '»', 'aria-label': 'Novo exemplo' }),
        el('button', { type: 'submit', class: 'btn small', text: 'Adicionar' })
      ])
    ])

    var cmp = genderCompare(w)
    return el('li', { class: 'word-card' + (cmp && cmp.status === 'different' ? ' gender-different' : ''), id: 'w-' + w.id }, [
      el('div', { class: 'card-head' }, [
        el('div', { class: 'word-title' }, [
          el('span', { class: 'dot cat-' + w.category, 'aria-hidden': 'true' }),
          w.category === 'sustantivo' ? el('span', { class: 'article', lang: 'pt-BR', text: nounGender(w).article }) : null,
          el('strong', { lang: 'pt-BR', text: w.word }),
          w.category === 'sustantivo' ? genderBadge(w) : null,
          verbBadge(w),
          el('button', {
            type: 'button',
            class: 'meaning meaning-btn' + (w.meaning ? '' : ' empty'),
            title: 'Editar significado',
            onclick: function () { editMeaning(w) }
          }, [w.meaning ? '— ' + w.meaning : '+ significado'])
        ]),
        el('div', { class: 'card-actions' }, [
          select,
          el('button', { type: 'button', class: 'icon-btn', title: 'Ouvir', 'aria-label': 'Ouvir ' + w.word, onclick: function () { speak(w.word) } }, ['🔊']),
          el('button', {
            type: 'button',
            class: 'icon-btn share-btn',
            title: 'Compartilhar com meus amigos',
            'aria-label': 'Compartilhar ' + w.word + ' com meus amigos',
            onclick: function () {
              if (window.PalavrasSocial) window.PalavrasSocial.shareWord(w, current ? current.pt : '')
              else toast('Entre com o Google para compartilhar com seus amigos.', 'info')
            }
          }, ['📤']),
          el('button', {
            type: 'button',
            class: 'icon-btn danger',
            title: 'Apagar',
            'aria-label': 'Apagar ' + w.word,
            onclick: function () {
              if (!confirm('Apagar «' + w.word + '» da lista?')) return
              state.words = state.words.filter(function (x) { return x.id !== w.id })
              save()
              render()
            }
          }, ['🗑'])
        ])
      ]),
      genderNote(w),
      verbForms(w),
      el('div', { class: 'example-row' }, [
        exampleBox,
        otherBtn,
        speakBtn,
        writeBtn,
        note
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
    var weights = pool.map(function (w) { return 1 / (1 + (state.shown[w.id] || 0)) })
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
    var item = Examples.randomItem(w)
    // Sin ejemplo, la notificación invita a armar una frase.
    var example = item ? item.pt : 'Como você usaria «' + w.word + '» numa frase?'
    var translation = item && item.es ? item.es : ''
    var gc = genderCompare(w)
    if (gc && gc.status === 'different') {
      translation = (translation ? translation + '\n' : '') + '⚠️ Atenção: ' + gc.pt.article + ' ' + w.word + ' (' + GENDER_LABEL[gc.pt.g] + ') ≠ ' + gc.es.article + ' ' + gc.es.word + ' (' + GENDER_LABEL[gc.es.g] + ')'
    }
    state.shown[w.id] = (state.shown[w.id] || 0) + 1
    state.lastWordId = w.id
    saveLocal() // el contador no se sincroniza: ahorra escrituras en la nube

    var title = w.word + ' · ' + CATS[w.category].label + (w.meaning ? ' (' + w.meaning + ')' : '')
    var visible = document.visibilityState === 'visible'
    var canNotify = notificationsSupported() && Notification.permission === 'granted'

    if (canNotify && !visible) {
      var opts = { body: example + (translation ? '\n' + translation : ''), icon: 'icon.svg', badge: 'icon.svg', tag: 'palabras-pt', renotify: true, lang: 'pt-BR', data: { id: w.id } }
      if (swReg && swReg.showNotification) {
        swReg.showNotification(title, opts)
      } else {
        try {
          var n = new Notification(title, opts)
          n.onclick = function () { window.focus(); highlight(w.id); n.close() }
        } catch (e) { /* algunos navegadores móviles exigen service worker */ }
      }
    }
    toast(null, 'note', { title: title, body: example, es: translation, speak: item ? item.pt : w.word, id: w.id })
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
    if (!state.words.length) { toast('Primeiro adicione alguma palavra à lista.', 'info'); return }
    if (notificationsSupported() && Notification.permission === 'default') Notification.requestPermission()
    fire()
  })

  function renderSettings () {
    enabledInput.checked = !!state.settings.enabled
    minInput.value = state.settings.minMinutes
    maxInput.value = state.settings.maxMinutes
    var status = $('#notif-permission')
    if (!notificationsSupported()) {
      status.textContent = 'Seu navegador não suporta notificações do sistema: os avisos aparecerão dentro da página.'
    } else if (Notification.permission === 'denied') {
      status.textContent = 'Você bloqueou as notificações para este site. Elas aparecerão só dentro da página (você pode ativá-las nas configurações do navegador).'
    } else if (Notification.permission === 'default') {
      status.textContent = 'Ao ativar, o navegador vai pedir permissão para mostrar notificações.'
    } else {
      status.textContent = 'Notificações do sistema ativadas ✔'
    }
    renderCountdown()
  }

  function renderCountdown () {
    var box = $('#notif-next')
    if (!state.settings.enabled) { box.textContent = 'Notificações desativadas.'; return }
    if (!state.words.length) { box.textContent = 'Adicione palavras para começar a receber exemplos.'; return }
    if (!state.nextAt) { box.textContent = ''; return }
    var s = Math.max(0, Math.round((state.nextAt - Date.now()) / 1000))
    var m = Math.floor(s / 60)
    box.textContent = 'Próximo exemplo em ' + (m ? m + ' min ' : '') + (s % 60) + ' s (aprox., é aleatório).'
  }

  // ---------- Toasts ----------
  function toast (text, kind, note) {
    var box = $('#toasts')
    var node
    if (note) {
      node = el('div', { class: 'toast note', role: 'status' }, [
        el('div', { class: 'toast-title', lang: 'pt-BR', text: '🇧🇷 ' + note.title }),
        el('div', { class: 'toast-body', lang: 'pt-BR', text: note.body }),
        note.es ? el('div', { class: 'toast-es', text: note.es }) : null,
        el('div', { class: 'toast-actions' }, [
          el('button', { type: 'button', class: 'link', onclick: function () { speak(note.speak || note.body) } }, ['🔊 Ouvir']),
          el('button', { type: 'button', class: 'link', onclick: function () { highlight(note.id); dismiss() } }, ['Ver na lista']),
          el('button', { type: 'button', class: 'link', onclick: dismiss }, ['Fechar'])
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

  // ---------- Exportar a PDF (vista de impresión) ----------
  // Elige siempre el mismo elemento para una palabra (así no se repite la misma frase en todas).
  function stablePick (arr, key) {
    if (!arr.length) return ''
    var h = 0
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
    return arr[h % arr.length]
  }

  function buildPrintView (words) {
    var view = $('#print-view')
    view.innerHTML = ''
    var filtered = filter !== 'todas' || search
    var date = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    view.appendChild(el('h1', { text: 'Palavras · meu vocabulário de português' }))
    view.appendChild(el('p', {
      class: 'print-meta',
      text: date + ' · ' + words.length + (words.length === 1 ? ' palavra' : ' palavras') + (filtered ? ' (lista filtrada)' : '')
    }))
    Object.keys(CATS).forEach(function (cat) {
      var group = words.filter(function (w) { return w.category === cat })
        .sort(function (a, b) { return a.word.localeCompare(b.word, 'pt') })
      if (!group.length) return
      var rows = group.map(function (w) {
        // Primero el ejemplo propio; si no hay, el primer ejemplo sugerido (estable, no aleatorio).
        var items = Examples.forWord(w)
        var own = items.filter(function (x) { return x.source === 'own' })
        var chosen = own[0] || stablePick(items, w.word) || null
        var example = chosen ? chosen.pt + (chosen.es ? ' — ' + chosen.es : '') : ''
        return el('tr', {}, [
          el('td', { class: 'p-word', lang: 'pt-BR' }, (function () {
            var gc = genderCompare(w)
            return [
              (w.category === 'sustantivo' ? nounGender(w).article + ' ' : '') + w.word,
              gc && gc.status === 'different' ? el('div', { class: 'p-diff', text: '⚠ ≠ ' + gc.es.article + ' ' + gc.es.word }) : null,
              verbInfo(w) ? el('div', { class: 'p-irreg', text: '⚡ ' + window.Verbs.summary(verbInfo(w)) }) : null
            ]
          })()),
          el('td', { text: w.meaning || '' }),
          el('td', { class: 'p-example', lang: 'pt-BR', text: example })
        ])
      })
      view.appendChild(el('section', { class: 'print-group' }, [
        el('h2', { text: CATS[cat].label + ' (' + group.length + ')' }),
        el('table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Palavra' }), el('th', { text: 'Significado' }), el('th', { text: 'Exemplo' })])]),
          el('tbody', {}, rows)
        ])
      ]))
    })
  }

  $('#export-pdf').addEventListener('click', function () {
    var words = visibleWords()
    if (!words.length) { toast('Não há palavras para exportar.', 'info'); return }
    buildPrintView(words)
    var oldTitle = document.title
    document.title = 'palavras-' + new Date().toISOString().slice(0, 10) // nombre sugerido del PDF
    window.print()
    setTimeout(function () { document.title = oldTitle }, 1000)
  })

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
            createdAt: w.createdAt || Date.now()
          })
          known[Classifier.normalize(w.word)] = true
          added++
        })
        save()
        render()
        toast(added + ' palavras novas importadas.', 'ok')
      } catch (err) {
        toast('Não foi possível ler o arquivo. Ele precisa ser um JSON exportado deste app.', 'info')
      }
      e.target.value = ''
    }
    reader.readAsText(file)
  })

  // ---------- Puente con la sincronización (js/sync.js) ----------
  window.PalavrasApp = {
    getWords: function () { return state.words },
    // Reemplaza la lista con la versión de la nube (sin volver a subirla).
    replaceWords: function (words) {
      words = words.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0) })
      if (JSON.stringify(words) === JSON.stringify(state.words)) return
      state.words = words
      saveLocal()
      render()
      if (state.settings.enabled && !state.nextAt) scheduleNext()
    },
    clearWords: function () {
      state.words = []
      saveLocal()
      render()
    },
    toast: toast,
    save: save,
    speak: speak,
    categories: CATS,
    highlight: highlight,
    nounGender: nounGender,
    genderCompare: genderCompare,
    verbInfo: verbInfo,
    genderLabel: GENDER_LABEL,
    // Agrega una palabra (por ejemplo, compartida por un amigo). Devuelve false si ya estaba.
    addWord: function (data) {
      var key = Classifier.normalize(data.word)
      if (!key) return false
      if (state.words.some(function (w) { return Classifier.normalize(w.word) === key })) return false
      var category = CATS[data.category] ? data.category : Classifier.classify(data.word).category
      var entry = {
        id: uid(),
        word: String(data.word).trim(),
        category: category,
        autoCategory: category,
        meaning: data.meaning ? String(data.meaning) : '',
        examples: (data.examples || []).filter(Boolean).map(String),
        createdAt: Date.now()
      }
      if (data.gender && GENDER_LABEL[data.gender]) entry.gender = data.gender
      state.words.unshift(entry)
      save()
      render()
      return entry
    }
  }

  // ---------- Inicio ----------
  var params = new URLSearchParams(location.search)
  render()
  if (state.settings.enabled && !state.nextAt) scheduleNext()
  if (params.get('word')) setTimeout(function () { highlight(params.get('word')) }, 50)
})()
