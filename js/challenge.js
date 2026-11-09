/* global Examples */
/*
 * Modo desafío: una palabra al azar → elegir su categoría → escribir una frase.
 * Los puntajes se guardan en cada palabra (w.stats), así se sincronizan entre
 * dispositivos junto con la lista. La racha se guarda solo en este dispositivo.
 */
(function () {
  'use strict'

  var app = window.PalavrasApp
  if (!app) return
  // Respaldo por si el navegador cargó una versión vieja de app.js desde la caché.
  var CATS = app.categories || window.Classifier.CATEGORIES
  if (!app.save) app.save = function () {}
  if (!app.speak) {
    app.speak = function (text) {
      if (!window.speechSynthesis) return
      var u = new SpeechSynthesisUtterance(text)
      u.lang = 'pt-BR'
      window.speechSynthesis.speak(u)
    }
  }
  var LOCAL_KEY = 'palabras-pt:desafio'
  var TAB_KEY = 'palabras-pt:pestana'

  var $ = function (id) { return document.getElementById(id) }

  // ---------- Pestañas ----------
  var TABS = ['words', 'challenge', 'friends']
  function showTab (name) {
    if (TABS.indexOf(name) === -1 || !$('tab-' + name) || $('tab-' + name).hidden) name = 'words'
    TABS.forEach(function (t) {
      if (!$('tab-' + t)) return
      $('view-' + t).hidden = t !== name
      $('tab-' + t).setAttribute('aria-selected', String(t === name))
    })
    try { localStorage.setItem(TAB_KEY, name) } catch (e) {}
    window.dispatchEvent(new CustomEvent('palavras-tab', { detail: name }))
    if (name === 'challenge') {
      renderScores()
      if (!current || !findWord(current.id)) nextRound()
    }
  }
  TABS.forEach(function (t) {
    if ($('tab-' + t)) $('tab-' + t).addEventListener('click', function () { showTab(t) })
  })
  window.PalavrasTabs = { show: showTab }

  // ---------- Estado local (racha) ----------
  var local = { streak: 0, best: 0, lastId: null }
  try { Object.assign(local, JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}')) } catch (e) {}
  function saveLocal () { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)) } catch (e) {} }

  function stats (w) {
    var s = w.stats || {}
    return { catOk: s.catOk || 0, catFail: s.catFail || 0, exOk: s.exOk || 0, exFail: s.exFail || 0 }
  }

  function findWord (id) {
    return app.getWords().filter(function (w) { return w.id === id })[0] || null
  }

  // ---------- Comprobación de la frase ----------
  function fold (s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  }

  // Formas irregulares frecuentes (sin tildes) para aceptar frases conjugadas.
  var IRREGULAR = {
    ser: ['sou', 'e', 'es', 'somos', 'sao', 'era', 'eram', 'eramos', 'foi', 'fui', 'fomos', 'foram', 'seja', 'sejam', 'sera', 'serao', 'seria', 'sido', 'sendo'],
    ir: ['vou', 'vai', 'vais', 'vamos', 'vao', 'fui', 'foi', 'fomos', 'foram', 'ia', 'iam', 'iremos', 'irei', 'ira', 'va', 'indo', 'ido'],
    ter: ['tenho', 'tem', 'tens', 'temos', 'teem', 'tinha', 'tinham', 'tive', 'teve', 'tivemos', 'tiveram', 'terei', 'tera', 'tenha', 'tido', 'tendo'],
    estar: ['estou', 'esta', 'estamos', 'estao', 'estava', 'estive', 'esteve', 'estiveram', 'esteja'],
    ver: ['vejo', 've', 'vemos', 'veem', 'vi', 'viu', 'vimos', 'viram', 'via', 'visto', 'vendo', 'veja'],
    dar: ['dou', 'da', 'damos', 'dao', 'dei', 'deu', 'demos', 'deram', 'dava', 'de', 'dado', 'dando'],
    fazer: ['faco', 'faz', 'fazemos', 'fazem', 'fiz', 'fez', 'fizemos', 'fizeram', 'farei', 'fara', 'faca', 'feito', 'fazendo'],
    dizer: ['digo', 'diz', 'dizemos', 'dizem', 'disse', 'dissemos', 'disseram', 'direi', 'dira', 'diga', 'dito', 'dizendo'],
    poder: ['posso', 'pode', 'podemos', 'podem', 'pude', 'pode', 'puderam', 'podia', 'possa', 'podendo'],
    querer: ['quero', 'quer', 'queremos', 'querem', 'quis', 'quiseram', 'queria', 'queira'],
    saber: ['sei', 'sabe', 'sabemos', 'sabem', 'soube', 'souberam', 'sabia', 'saiba'],
    vir: ['venho', 'vem', 'vimos', 'veem', 'vim', 'veio', 'vieram', 'vinha', 'venha', 'vindo'],
    por: ['ponho', 'poe', 'pomos', 'poem', 'pus', 'pos', 'puseram', 'punha', 'ponha', 'posto'],
    trazer: ['trago', 'traz', 'trouxe', 'trouxeram', 'trarei', 'traga'],
    ouvir: ['ouco', 'ouve', 'ouvi', 'ouviu', 'ouca'],
    pedir: ['peco', 'pede', 'pedi', 'pediu', 'peca'],
    sair: ['saio', 'sai', 'saimos', 'saem', 'saiu', 'saia'],
    cair: ['caio', 'cai', 'caiu', 'caia']
  }

  function tokens (s) { return fold(s).split(/[^a-z0-9-]+/).filter(Boolean) }

  // ¿La frase usa este término (o una forma derivada/conjugada)?
  function usesTerm (sentenceTokens, term, isVerb) {
    term = fold(term).replace(/-(se|me|te|nos|lo|la|los|las)$/, '')
    if (sentenceTokens.some(function (t) { return t === term || t.split('-')[0] === term })) return true
    if (isVerb && IRREGULAR[term] && sentenceTokens.some(function (t) { return IRREGULAR[term].indexOf(t) !== -1 })) return true
    var stem
    if (isVerb) stem = term.replace(/(ar|er|ir|or)$/, '')
    else stem = term.length > 4 ? term.slice(0, -2) : term.length > 3 ? term.slice(0, -1) : term
    if (stem.length < 2 || (isVerb && stem.length < 3 && !IRREGULAR[term])) stem = term
    // La forma debe ser más larga que la raíz (evita que "com" cuente como "comer").
    return sentenceTokens.some(function (t) { return t.indexOf(stem) === 0 && t.length > stem.length })
  }

  function checkSentence (w, sentence) {
    var st = tokens(sentence)
    // Problemas de formato: no cuentan como intento, se puede corregir la frase.
    if (fold(sentence).trim() === fold(w.word).trim()) return { ok: false, retry: true, reason: 'Escribe una frase completa, no solo la palabra.' }
    if (st.length < 3) return { ok: false, retry: true, reason: 'La frase es muy corta: usa al menos 3 palabras. Corrígela y vuelve a comprobar.' }
    var parts = tokens(w.word)
    var ok
    if (parts.length === 1) {
      ok = usesTerm(st, parts[0], w.category === 'verbo')
    } else {
      // Expresiones: deben aparecer todas las palabras importantes; la primera
      // puede estar conjugada (dar um jeito → dei um jeito) o, si es un verbo, cambiar por completo.
      var important = parts.filter(function (p) { return p.length >= 3 })
      if (!important.length) important = parts
      var first = important[0]
      var rest = important.slice(1)
      var firstIsVerb = /(ar|er|ir|or)$/.test(first) || !!IRREGULAR[first]
      ok = rest.every(function (p) { return usesTerm(st, p, false) }) &&
        (usesTerm(st, first, firstIsVerb) || (firstIsVerb && rest.length > 0))
    }
    return ok ? { ok: true } : { ok: false, reason: 'Tu frase no usa «' + w.word + '» (ni una forma conjugada o derivada).' }
  }

  // ---------- Rondas ----------
  var current = null // { id, catAnswered, exAnswered, catOk, exOk }

  function pickWord () {
    var words = app.getWords()
    if (words.length < 2) return null
    var pool = words.filter(function (w) { return w.id !== local.lastId })
    // Más probabilidad para las palabras con más fallos y menos intentos.
    var weights = pool.map(function (w) {
      var s = stats(w)
      var fails = s.catFail + s.exFail
      var oks = s.catOk + s.exOk
      return (1 + 2 * fails) / (1 + 0.5 * oks)
    })
    var total = weights.reduce(function (a, b) { return a + b }, 0)
    var r = Math.random() * total
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i]
      if (r <= 0) return pool[i]
    }
    return pool[pool.length - 1]
  }

  function nextRound () {
    var w = pickWord()
    $('ch-empty').hidden = !!w
    $('ch-round').hidden = !w
    if (!w) { current = null; return }
    current = { id: w.id, catAnswered: false, exAnswered: false, catOk: false, exOk: false }
    local.lastId = w.id
    saveLocal()

    $('ch-word').textContent = w.word
    $('ch-meaning').textContent = w.meaning ? w.meaning : '(sin significado guardado)'
    $('ch-meaning').hidden = true
    $('ch-hint-btn').hidden = false
    $('ch-cat-result').hidden = true
    $('ch-step2').hidden = true
    $('ch-ex-result').hidden = true
    $('ch-sentence').value = ''
    $('ch-sentence').disabled = false
    $('ch-form').querySelector('button').disabled = false
    $('ch-next').hidden = true
    $('ch-skip').hidden = false
    $('ch-skip').textContent = 'Saltar (no cuenta)'

    var box = $('ch-cats')
    box.innerHTML = ''
    Object.keys(CATS).forEach(function (k) {
      var b = document.createElement('button')
      b.type = 'button'
      b.className = 'ch-cat cat-' + k
      b.dataset.cat = k
      b.textContent = CATS[k].label
      b.addEventListener('click', function () { answerCategory(k) })
      box.appendChild(b)
    })
  }

  function record (field) {
    var w = findWord(current.id)
    if (!w) return
    var s = stats(w)
    s[field]++
    s.lastAt = Date.now()
    w.stats = s
    app.save()
  }

  function answerCategory (cat) {
    if (!current || current.catAnswered) return
    var w = findWord(current.id)
    if (!w) { nextRound(); return }
    current.catAnswered = true
    current.catOk = cat === w.category
    record(current.catOk ? 'catOk' : 'catFail')

    Array.prototype.forEach.call($('ch-cats').children, function (b) {
      b.disabled = true
      if (b.dataset.cat === w.category) b.classList.add('correct')
      else if (b.dataset.cat === cat) b.classList.add('wrong')
    })
    var res = $('ch-cat-result')
    res.hidden = false
    res.className = 'ch-result ' + (current.catOk ? 'ok' : 'fail')
    res.textContent = current.catOk
      ? '✔ ¡Correcto! Es un ' + CATS[w.category].label.toLowerCase() + '.'
      : '✘ No. «' + w.word + '» es ' + articleFor(w.category) + ' ' + CATS[w.category].label.toLowerCase() + '.'
    $('ch-step2').hidden = false
    $('ch-skip').textContent = 'Saltar la frase (cuenta como fallo)'
    $('ch-sentence').focus()
    renderScores()
  }

  function articleFor (cat) { return cat === 'expresion' ? 'una' : 'un' }

  $('ch-form').addEventListener('submit', function (e) {
    e.preventDefault()
    if (!current || current.exAnswered) return
    var w = findWord(current.id)
    if (!w) { nextRound(); return }
    var sentence = $('ch-sentence').value.trim().replace(/\s+/g, ' ')
    if (!sentence) { $('ch-sentence').focus(); return }

    var result = checkSentence(w, sentence)
    if (result.retry) {
      var hint = $('ch-ex-result')
      hint.hidden = false
      hint.className = 'ch-result warn'
      hint.textContent = '✎ ' + result.reason
      $('ch-sentence').focus()
      return
    }
    current.exAnswered = true
    current.exOk = result.ok
    record(result.ok ? 'exOk' : 'exFail')

    if (result.ok && $('ch-save').checked) {
      var own = w.examples || []
      if (own.map(fold).indexOf(fold(sentence)) === -1) {
        w.examples = own.concat(sentence)
        app.save()
      }
    }

    // Racha: rondas con categoría y frase correctas.
    if (current.catOk && current.exOk) {
      local.streak++
      local.best = Math.max(local.best, local.streak)
    } else {
      local.streak = 0
    }
    saveLocal()

    var model = (w.examples || []).filter(function (x) { return fold(x) !== fold(sentence) })[0] ||
      Examples.randomExample({ word: w.word, category: w.category, examples: [] })
    var box = $('ch-ex-result')
    box.hidden = false
    box.className = 'ch-result ' + (result.ok ? 'ok' : 'fail')
    box.innerHTML = ''
    box.appendChild(document.createTextNode(result.ok
      ? '✔ ¡Bien! Tu frase usa «' + w.word + '».' + ($('ch-save').checked ? ' La guardé en tu lista.' : '')
      : '✘ ' + result.reason))
    var ex = document.createElement('div')
    ex.className = 'ch-model'
    ex.setAttribute('lang', 'pt-BR')
    ex.textContent = 'Un ejemplo: ' + model
    box.appendChild(ex)

    $('ch-sentence').disabled = true
    $('ch-form').querySelector('button').disabled = true
    $('ch-skip').hidden = true
    $('ch-next').hidden = false
    $('ch-next').focus()
    renderScores()
  })

  $('ch-next').addEventListener('click', nextRound)
  $('ch-skip').addEventListener('click', function () {
    // Saltar no cuenta si todavía no respondió nada; después de la categoría, la frase cuenta como fallo.
    if (current && current.catAnswered && !current.exAnswered) {
      record('exFail')
      local.streak = 0
      saveLocal()
      renderScores()
    }
    nextRound()
  })
  $('ch-hint-btn').addEventListener('click', function () {
    $('ch-meaning').hidden = false
    $('ch-hint-btn').hidden = true
  })
  $('ch-speak').addEventListener('click', function () {
    var w = current && findWord(current.id)
    if (w) app.speak(w.word)
  })

  // ---------- Puntajes ----------
  function renderScores () {
    var t = { catOk: 0, catFail: 0, exOk: 0, exFail: 0 }
    var hard = []
    app.getWords().forEach(function (w) {
      var s = stats(w)
      Object.keys(t).forEach(function (k) { t[k] += s[k] })
      var fails = s.catFail + s.exFail
      if (fails) hard.push({ word: w.word, fails: fails, oks: s.catOk + s.exOk })
    })
    var ok = t.catOk + t.exOk
    var fail = t.catFail + t.exFail
    $('sc-ok').textContent = ok
    $('sc-fail').textContent = fail
    $('sc-acc').textContent = ok + fail ? Math.round(100 * ok / (ok + fail)) + '%' : '–'
    $('sc-streak').textContent = local.streak
    $('sc-best').textContent = local.best
    $('sc-cat-ok').textContent = t.catOk
    $('sc-cat-fail').textContent = t.catFail
    $('sc-ex-ok').textContent = t.exOk
    $('sc-ex-fail').textContent = t.exFail

    hard.sort(function (a, b) { return (b.fails - b.oks / 2) - (a.fails - a.oks / 2) })
    var list = $('sc-hard')
    list.innerHTML = ''
    hard.slice(0, 5).forEach(function (h) {
      var li = document.createElement('li')
      var strong = document.createElement('strong')
      strong.setAttribute('lang', 'pt-BR')
      strong.textContent = h.word
      li.appendChild(strong)
      li.appendChild(document.createTextNode(' · ' + h.fails + ' ✘ / ' + h.oks + ' ✔'))
      list.appendChild(li)
    })
    $('sc-hard-empty').hidden = hard.length > 0
  }

  $('sc-reset').addEventListener('click', function () {
    if (!confirm('¿Reiniciar todos los puntajes del desafío? Esto no borra tus palabras.')) return
    app.getWords().forEach(function (w) { delete w.stats })
    app.save()
    local.streak = 0
    local.best = 0
    saveLocal()
    renderScores()
  })

  // Si la lista cambia (por ejemplo, desde otro dispositivo), refrescar puntajes.
  var originalReplace = app.replaceWords
  app.replaceWords = function (words) {
    originalReplace(words)
    if (!$('view-challenge').hidden) {
      renderScores()
      if (!current || !findWord(current.id)) nextRound()
    }
  }

  // Exponer la comprobación para pruebas.
  window.PalavrasChallenge = { checkSentence: checkSentence }

  var saved = null
  try { saved = localStorage.getItem(TAB_KEY) } catch (e) {}
  // La pestaña de amigos aparece recién al iniciar sesión; se abre después desde social.js.
  window.PalavrasTabs.saved = saved
  showTab(saved === 'challenge' ? 'challenge' : 'words')
})()
