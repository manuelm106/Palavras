/*
 * Verbos irregulares del portugués (de Brasil) con sus formas clave.
 *
 * type:
 *   'irregular'   — muy irregulares (ser, ir, fazer, ter...)
 *   'alternancia' — cambian la vocal o la consonante de la raíz (dormir → durmo, pedir → peço)
 *   'participio'  — regulares salvo el participio (abrir → aberto)
 *   'leve'        — verbos en -uzir: la 3.ª persona pierde la -e (ele produz)
 *
 * forms: p = presente [eu, ele/você, eles/vocês], pp = pretérito perfeito [eu, ele],
 *        f = futuro (eu, solo si es irregular), pt = particípio
 * Los compuestos (compor, manter, prever, desfazer...) se derivan del verbo base.
 */
(function (root) {
  'use strict'

  var I = 'irregular'
  var A = 'alternancia'

  function v (type, p, pp, pt, f) { return { type: type, p: p, pp: pp, pt: pt, f: f || null } }

  var BASE = {
    ser: v(I, ['sou', 'é', 'são'], ['fui', 'foi'], 'sido'),
    estar: v(I, ['estou', 'está', 'estão'], ['estive', 'esteve'], 'estado'),
    ter: v(I, ['tenho', 'tem', 'têm'], ['tive', 'teve'], 'tido'),
    haver: v(I, ['hei', 'há', 'hão'], ['houve', 'houve'], 'havido'),
    ir: v(I, ['vou', 'vai', 'vão'], ['fui', 'foi'], 'ido'),
    vir: v(I, ['venho', 'vem', 'vêm'], ['vim', 'veio'], 'vindo'),
    fazer: v(I, ['faço', 'faz', 'fazem'], ['fiz', 'fez'], 'feito', 'farei'),
    dizer: v(I, ['digo', 'diz', 'dizem'], ['disse', 'disse'], 'dito', 'direi'),
    trazer: v(I, ['trago', 'traz', 'trazem'], ['trouxe', 'trouxe'], 'trazido', 'trarei'),
    poder: v(I, ['posso', 'pode', 'podem'], ['pude', 'pôde'], 'podido'),
    querer: v(I, ['quero', 'quer', 'querem'], ['quis', 'quis'], 'querido'),
    saber: v(I, ['sei', 'sabe', 'sabem'], ['soube', 'soube'], 'sabido'),
    caber: v(I, ['caibo', 'cabe', 'cabem'], ['coube', 'coube'], 'cabido'),
    dar: v(I, ['dou', 'dá', 'dão'], ['dei', 'deu'], 'dado'),
    ver: v(I, ['vejo', 'vê', 'veem'], ['vi', 'viu'], 'visto'),
    ler: v(I, ['leio', 'lê', 'leem'], ['li', 'leu'], 'lido'),
    crer: v(I, ['creio', 'crê', 'creem'], ['cri', 'creu'], 'crido'),
    pôr: v(I, ['ponho', 'põe', 'põem'], ['pus', 'pôs'], 'posto'),
    rir: v(I, ['rio', 'ri', 'riem'], ['ri', 'riu'], 'rido'),
    sorrir: v(I, ['sorrio', 'sorri', 'sorriem'], ['sorri', 'sorriu'], 'sorrido'),
    valer: v(I, ['valho', 'vale', 'valem'], ['vali', 'valeu'], 'valido'),
    perder: v(I, ['perco', 'perde', 'perdem'], ['perdi', 'perdeu'], 'perdido'),
    ouvir: v(I, ['ouço', 'ouve', 'ouvem'], ['ouvi', 'ouviu'], 'ouvido'),
    pedir: v(I, ['peço', 'pede', 'pedem'], ['pedi', 'pediu'], 'pedido'),
    medir: v(I, ['meço', 'mede', 'medem'], ['medi', 'mediu'], 'medido'),
    requerer: v(I, ['requeiro', 'requer', 'requerem'], ['requeri', 'requereu'], 'requerido'),
    prover: v(I, ['provejo', 'provê', 'proveem'], ['provi', 'proveu'], 'provido'),
    sair: v(I, ['saio', 'sai', 'saem'], ['saí', 'saiu'], 'saído'),
    cair: v(I, ['caio', 'cai', 'caem'], ['caí', 'caiu'], 'caído'),
    morrer: v('participio', null, null, 'morto (o morrido)'),
    // Cambian la vocal de la raíz
    dormir: v(A, ['durmo', 'dorme', 'dormem'], ['dormi', 'dormiu'], 'dormido'),
    tossir: v(A, ['tusso', 'tosse', 'tossem'], ['tossi', 'tossiu'], 'tossido'),
    cobrir: v(A, ['cubro', 'cobre', 'cobrem'], ['cobri', 'cobriu'], 'coberto'),
    subir: v(A, ['subo', 'sobe', 'sobem'], ['subi', 'subiu'], 'subido'),
    fugir: v(A, ['fujo', 'foge', 'fogem'], ['fugi', 'fugiu'], 'fugido'),
    sentir: v(A, ['sinto', 'sente', 'sentem'], ['senti', 'sentiu'], 'sentido'),
    mentir: v(A, ['minto', 'mente', 'mentem'], ['menti', 'mentiu'], 'mentido'),
    servir: v(A, ['sirvo', 'serve', 'servem'], ['servi', 'serviu'], 'servido'),
    seguir: v(A, ['sigo', 'segue', 'seguem'], ['segui', 'seguiu'], 'seguido'),
    vestir: v(A, ['visto', 'veste', 'vestem'], ['vesti', 'vestiu'], 'vestido'),
    repetir: v(A, ['repito', 'repete', 'repetem'], ['repeti', 'repetiu'], 'repetido'),
    competir: v(A, ['compito', 'compete', 'competem'], ['competi', 'competiu'], 'competido'),
    divertir: v(A, ['divirto', 'diverte', 'divertem'], ['diverti', 'divertiu'], 'divertido'),
    ferir: v(A, ['firo', 'fere', 'ferem'], ['feri', 'feriu'], 'ferido'),
    gerir: v(A, ['giro', 'gere', 'gerem'], ['geri', 'geriu'], 'gerido'),
    aderir: v(A, ['adiro', 'adere', 'aderem'], ['aderi', 'aderiu'], 'aderido'),
    odiar: v(A, ['odeio', 'odeia', 'odeiam'], ['odiei', 'odiou'], 'odiado'),
    construir: v(A, ['construo', 'constrói', 'constroem'], ['construí', 'construiu'], 'construído'),
    destruir: v(A, ['destruo', 'destrói', 'destroem'], ['destruí', 'destruiu'], 'destruído'),
    // Solo el participio es irregular
    abrir: v('participio', null, null, 'aberto'),
    escrever: v('participio', null, null, 'escrito'),
    ganhar: v('participio', null, null, 'ganho'),
    gastar: v('participio', null, null, 'gasto'),
    pagar: v('participio', null, null, 'pago'),
    aceitar: v('participio', null, null, 'aceito'),
    entregar: v('participio', null, null, 'entregue'),
    prender: v('participio', null, null, 'preso'),
    imprimir: v('participio', null, null, 'impresso'),
    eleger: v('participio', null, null, 'eleito'),
    acender: v('participio', null, null, 'aceso'),
    limpar: v('participio', null, null, 'limpo'),
    soltar: v('participio', null, null, 'solto'),
    salvar: v('participio', null, null, 'salvo'),
    suspender: v('participio', null, null, 'suspenso'),
    expressar: v('participio', null, null, 'expresso'),
    extinguir: v('participio', null, null, 'extinto'),
    matar: v('participio', null, null, 'morto (o matado)')
  }
  // Mismo patrón que «odiar» (los verbos «MARIO»): mediar → medeio, medeia, medeiam.
  ;['mediar', 'ansiar', 'remediar', 'incendiar', 'intermediar'].forEach(function (verb) {
    var stem = verb.slice(0, -3) // medi-ar → med
    var reg = verb.slice(0, -2) // medi
    BASE[verb] = v(A, [stem + 'eio', stem + 'eia', stem + 'eiam'], [reg + 'ei', reg + 'ou'], reg + 'ado')
  })
  // Compuestos de «escrever» que no la contienen entera (inscrever, descrever...).
  BASE._screver = v('participio', null, null, 'scrito')

  // Compuestos: sufijo base → prefijos válidos (para no confundir «meter» con «ter»).
  var FAMILIES = [
    { base: 'pôr', suffix: 'por', prefixes: ['com', 'dis', 'pro', 'su', 'im', 'ex', 're', 'o', 'de', 'pressu', 'trans', 'decom', 'recom', 'ante', 'contra', 'justa', 'sobre', 'entre', 'inter', 'sobre'] },
    { base: 'ter', suffix: 'ter', prefixes: ['man', 'ob', 'con', 'de', 're', 'entre', 'abs', 'a', 'sus'] },
    { base: 'vir', suffix: 'vir', prefixes: ['con', 'inter', 'pro', 'ad', 'sobre'] },
    { base: 'ver', suffix: 'ver', prefixes: ['pre', 're', 'ante'] },
    { base: 'fazer', suffix: 'fazer', prefixes: ['des', 're', 'satis', 'per', 'contra'] },
    { base: 'dizer', suffix: 'dizer', prefixes: ['contra', 'pre', 'ben', 'mal', 'des'] },
    { base: 'trazer', suffix: 'trazer', prefixes: ['re'] },
    { base: 'pedir', suffix: 'pedir', prefixes: ['des', 'im', 'ex'] },
    { base: 'seguir', suffix: 'seguir', prefixes: ['con', 'per', 'pros'] },
    { base: 'sentir', suffix: 'sentir', prefixes: ['con', 'pres', 'res', 'as', 'dis'] },
    { base: 'vestir', suffix: 'vestir', prefixes: ['re', 'in', 'tra', 'des'] },
    { base: 'ferir', suffix: 'ferir', prefixes: ['pre', 're', 'con', 'trans', 'in', 'inter', 'de', 'pro', 'su', 'di', 'a'] },
    { base: 'gerir', suffix: 'gerir', prefixes: ['su', 'di', 'in'] },
    { base: 'cobrir', suffix: 'cobrir', prefixes: ['des', 'en', 're'] },
    { base: '_screver', suffix: 'screver', prefixes: ['de', 'in', 'sub', 'pre', 'tran', 'circun', 'ree', 'pro'] },
    { base: 'abrir', suffix: 'abrir', prefixes: ['re', 'entre'] },
    { base: 'construir', suffix: 'construir', prefixes: ['re'] },
    { base: 'sair', suffix: 'sair', prefixes: ['re', 'sobres'] },
    { base: 'cair', suffix: 'cair', prefixes: ['re', 'de'] },
    { base: 'ler', suffix: 'ler', prefixes: ['re', 'tres'] }
  ]

  // Verbos en -uzir (produzir, traduzir...): solo la 3.ª persona pierde la -e (ele produz).
  // Verbos en -air (atrair, distrair...): conjugan como «sair».
  function special (w) {
    if (/uzir$/.test(w) && w.length > 5) {
      var r = w.slice(0, -2)
      return v('leve', [r + 'o', r, r + 'em'], [r + 'i', r + 'iu'], r + 'ido')
    }
    if (/[^aeiou]air$/.test(w) && w !== 'sair') {
      var s = w.slice(0, -1) // atrai-r → atrai
      return v(I, [s + 'o', s, w.slice(0, -2) + 'em'], [w.slice(0, -2) + 'í', w.slice(0, -2) + 'iu'], w.slice(0, -2) + 'ído')
    }
    return null
  }

  function prefixed (base, prefix) {
    function fix (form) {
      if (!form) return form
      var out = prefix + form
      // manter → mantém, convir → convém (acento en la 3.ª persona del singular)
      if ((base === 'ter' || base === 'vir') && /(tem|vem)$/.test(out) && !/(têm|vêm)$/.test(out)) out = out.replace(/em$/, 'ém')
      return out
    }
    var b = BASE[base]
    return {
      type: b.type,
      p: b.p ? b.p.map(fix) : null,
      pp: b.pp ? b.pp.map(fix) : null,
      pt: b.pt ? fix(b.pt.split(' ')[0]) : null,
      f: b.f ? fix(b.f) : null,
      base: base.charAt(0) === '_' ? 'escrever' : base
    }
  }

  function clean (word) {
    return String(word || '').trim().toLowerCase().replace(/-(se|me|te|nos|lo|la|los|las)$/, '')
  }

  /** Información del verbo irregular, o null si es regular (o no lo conocemos). */
  function info (word) {
    var w = clean(word)
    if (!w || w.indexOf(' ') !== -1) return null
    if (w === 'por') w = 'pôr' // muchos lo escriben sin tilde
    if (BASE[w] && w.charAt(0) !== '_') return Object.assign({ base: null }, BASE[w])
    for (var i = 0; i < FAMILIES.length; i++) {
      var f = FAMILIES[i]
      if (w.length > f.suffix.length && w.slice(-f.suffix.length) === f.suffix) {
        var prefix = w.slice(0, -f.suffix.length)
        if (f.prefixes.indexOf(prefix) !== -1) return prefixed(f.base, prefix)
      }
    }
    return special(w)
  }

  var LABELS = {
    irregular: { short: '⚡ irregular', long: 'Verbo irregular' },
    alternancia: { short: '⚡ cambia la vocal', long: 'Verbo irregular: cambia la raíz' },
    participio: { short: '⚡ participio irregular', long: 'Regular, salvo el participio' },
    leve: { short: '⚡ irregular leve', long: 'Irregularidad leve: la 3.ª persona pierde la -e (ele produz)' }
  }

  /** Resumen corto de las formas, para avisos: «eu faço, ele fez, feito». */
  function summary (inf) {
    if (!inf) return ''
    var parts = []
    if (inf.p) parts.push('eu ' + inf.p[0], 'ele ' + inf.p[1])
    if (inf.pp) parts.push('eu ' + inf.pp[0])
    if (inf.pt) parts.push('participio: ' + inf.pt)
    return parts.join(' · ')
  }

  var api = { info: info, labels: LABELS, summary: summary }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Verbs = api
})(this)
