/*
 * Género de los sustantivos en español, para compararlo con el portugués.
 *
 * - Si el significado trae artículo («la leche», «el viaje»), se usa ese artículo
 *   (con cuidado: «el agua» es femenino).
 * - Si no, se deduce por la terminación y una lista de excepciones frecuentes.
 * - Para las diferencias más típicas entre portugués y español hay una lista
 *   de pares conocidos, que se usa aunque la palabra no tenga significado.
 */
(function (root) {
  'use strict'

  // Pares conocidos con género distinto: palabra en portugués → palabra en español.
  var KNOWN_PAIRS = {
    viagem: 'el viaje', mensagem: 'el mensaje', paisagem: 'el paisaje', garagem: 'el garaje',
    coragem: 'el coraje', margem: 'el margen', origem: 'el origen', vertigem: 'el vértigo',
    homenagem: 'el homenaje', linguagem: 'el lenguaje', massagem: 'el masaje',
    leite: 'la leche', sangue: 'la sangre', mel: 'la miel', sal: 'la sal', fel: 'la hiel',
    dor: 'el dolor', cor: 'el color', nariz: 'la nariz', ponte: 'el puente', árvore: 'el árbol',
    costume: 'la costumbre', legume: 'la legumbre', cume: 'la cumbre', sorriso: 'la sonrisa',
    riso: 'la risa', protesto: 'la protesta', análise: 'el análisis', equipe: 'el equipo',
    estreia: 'el estreno', desordem: 'el desorden', pétala: 'el pétalo', fraude: 'el fraude',
    creme: 'la crema', joelho: 'la rodilla', computador: 'la computadora', samba: 'la samba',
    alarme: 'la alarma', cárie: 'la caries', tosse: 'la tos', ordem: 'el orden', labor: 'la labor',
    sinal: 'la señal', valor: 'el valor', mar: 'el mar', cheque: 'el cheque', leque: 'el abanico',
    hospital: 'el hospital', sangria: 'la sangría', dente: 'el diente', nome: 'el nombre',
    lápis: 'el lápiz', flor: 'la flor', mão: 'la mano', foto: 'la foto', tribo: 'la tribu',
    cútis: 'el cutis', grama: 'el césped', pânico: 'el pánico', calor: 'el calor',
    planeta: 'el planeta', dia: 'el día', mapa: 'el mapa', problema: 'el problema'
  }

  // Femeninos en español que empiezan con «a» tónica: llevan «el» en singular.
  var A_TONICA = ['agua', 'águila', 'alma', 'arma', 'hambre', 'hacha', 'área', 'aula', 'ala', 'ancla',
    'hada', 'haba', 'habla', 'hampa', 'asma', 'aya', 'alga', 'alba', 'ama', 'arca', 'arpa', 'aspa']

  var ES_M = ['día', 'mapa', 'problema', 'tema', 'sistema', 'idioma', 'planeta', 'clima', 'programa',
    'poema', 'drama', 'esquema', 'sofá', 'cometa', 'fantasma', 'telegrama', 'dilema', 'enigma', 'pijama',
    'tranvía', 'diente', 'puente', 'nombre', 'hombre', 'coche', 'café', 'té', 'pie', 'cine', 'aceite',
    'aire', 'baile', 'bosque', 'parque', 'postre', 'traje', 'valle', 'pez', 'lápiz', 'árbol', 'sol', 'papel',
    'hotel', 'animal', 'hospital', 'metal', 'mar', 'lugar', 'dolor', 'color', 'amor', 'calor', 'olor',
    'sabor', 'valor', 'mes', 'país', 'autobús', 'análisis', 'tenis', 'jabón', 'avión', 'corazón', 'camión',
    'ratón', 'limón', 'melón', 'pantalón', 'balón', 'botón', 'champú', 'menú', 'examen', 'origen', 'margen',
    'desorden', 'orden', 'abdomen', 'volumen', 'crimen', 'ajedrez', 'arroz', 'disfraz', 'maíz', 'tomate',
    'chocolate', 'aguacate', 'nombre', 'peine', 'cheque', 'golpe', 'equipo', 'estreno', 'pétalo', 'fraude',
    'vértigo', 'césped', 'abanico', 'pánico', 'cutis', 'tipo', 'reloj', 'hielo', 'cielo', 'norte', 'sur',
    'este', 'oeste', 'viaje', 'mensaje', 'paisaje', 'garaje', 'coraje', 'personaje', 'homenaje', 'lenguaje',
    'masaje', 'jardín', 'fin', 'pan', 'tren', 'bien', 'mal', 'gol', 'salón']
  var ES_F = ['mano', 'foto', 'moto', 'radio', 'libido', 'leche', 'sangre', 'noche', 'calle', 'nube',
    'carne', 'gente', 'mente', 'fuente', 'frente', 'llave', 'nieve', 'fiebre', 'suerte', 'muerte', 'parte',
    'tarde', 'clase', 'base', 'frase', 'fase', 'tesis', 'crisis', 'red', 'sed', 'pared', 'luz', 'voz', 'paz',
    'vez', 'nariz', 'cruz', 'raíz', 'sal', 'miel', 'piel', 'cárcel', 'imagen', 'mujer', 'flor', 'labor', 'ley',
    'tos', 'hambre', 'razón', 'sazón', 'costumbre', 'legumbre', 'cumbre', 'hiel', 'caries', 'señal',
    'tribu', 'computadora', 'rodilla', 'sonrisa', 'risa', 'protesta', 'crema', 'alarma', 'samba', 'lástima',
    'catedral', 'capital', 'vocal', 'col', 'sartén', 'ave', 'serie', 'especie', 'nave', 'llave',
    'torre', 'ciudad', 'leche']
  // Comunes de dos géneros (el/la estudiante).
  var ES_MF = ['estudiante', 'cliente', 'paciente', 'presidente', 'joven', 'colega', 'gerente', 'agente',
    'adolescente', 'intérprete', 'atleta', 'testigo', 'bebé', 'modelo', 'cónyuge', 'representante']

  function clean (meaning) {
    var m = String(meaning || '').toLowerCase().trim()
    m = m.split(/[,;/(]| o /)[0].trim() // solo la primera traducción
    m = m.replace(/[.!?¡¿"«»“”]/g, '').trim()
    return m
  }

  function singular (w) {
    if (/ces$/.test(w)) return w.slice(0, -3) + 'z'
    if (/(ión|ad|or|al|el|ar|er|ón|án|én)es$/.test(w)) return w.slice(0, -2)
    if (/[aeiou]s$/.test(w)) return w.slice(0, -1)
    return w
  }

  function byRules (w) {
    if (ES_MF.indexOf(w) !== -1 || /ista$/.test(w)) return { g: 'mf', sure: true }
    if (ES_M.indexOf(w) !== -1) return { g: 'm', sure: true }
    if (ES_F.indexOf(w) !== -1 || A_TONICA.indexOf(w) !== -1) return { g: 'f', sure: true }
    if (/(ción|sión|dad|tad|tud|umbre|itis|eza)$/.test(w)) return { g: 'f', sure: true }
    if (/(aje|or|ón|o)$/.test(w)) return { g: 'm', sure: true }
    if (/(ma|ta)$/.test(w)) return { g: 'f', sure: false }
    if (/a$/.test(w)) return { g: 'f', sure: true }
    return { g: 'm', sure: false }
  }

  /**
   * Género en español a partir del significado: { word, g, sure, article } o null.
   */
  function fromMeaning (meaning) {
    var m = clean(meaning)
    if (!m) return null
    var parts = m.split(/\s+/)
    var art = parts[0]
    var articles = { el: 'm', la: 'f', los: 'm', las: 'f', un: 'm', una: 'f', unos: 'm', unas: 'f' }
    if (articles[art] && parts.length > 1) {
      var word = parts.slice(1).join(' ')
      var head = singular(parts[1])
      var plural = /^(los|las|unos|unas)$/.test(art)
      var g = articles[art]
      // «el agua», «un alma»: femeninos con artículo masculino.
      if (g === 'm' && !plural && A_TONICA.indexOf(head) !== -1) g = 'f'
      if (ES_MF.indexOf(head) !== -1 || /ista$/.test(head)) g = 'mf'
      return { word: word, g: g, sure: true, article: articleFor(g, plural, head) }
    }
    var first = parts[0]
    var plural2 = first !== singular(first)
    var info = byRules(singular(first))
    return { word: m, g: info.g, sure: info.sure, article: articleFor(info.g, plural2, singular(first)) }
  }

  function articleFor (g, plural, head) {
    if (g === 'mf') return plural ? 'los/las' : 'el/la'
    if (g === 'f') return plural ? 'las' : (A_TONICA.indexOf(head) !== -1 ? 'el' : 'la')
    return plural ? 'los' : 'el'
  }

  /** Para una palabra en portugués: el equivalente conocido (si lo hay). */
  function knownPair (ptWord) {
    var k = String(ptWord || '').trim().toLowerCase()
    return KNOWN_PAIRS[k] ? fromMeaning(KNOWN_PAIRS[k]) : null
  }

  /**
   * Compara el género portugués (ptG: 'm' | 'f' | 'mf') con el español.
   * Devuelve { status: 'same' | 'different' | 'unknown', es } .
   */
  function compare (ptWord, ptG, meaning) {
    var es = fromMeaning(meaning)
    var pair = knownPair(ptWord)
    // Si el significado coincide con el par conocido (o no hay significado), manda el par.
    if (pair && (!es || es.word === pair.word || !es.sure)) es = pair
    if (!es || !es.sure) return { status: 'unknown', es: es }
    if (ptG === 'mf' || es.g === 'mf' || ptG === es.g) return { status: 'same', es: es }
    return { status: 'different', es: es }
  }

  var api = { fromMeaning: fromMeaning, compare: compare, knownPair: knownPair }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.GenderES = api
})(this)
