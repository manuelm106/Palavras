/*
 * Clasificador heurístico de palabras en portugués.
 * No usa diccionarios externos: combina listas de palabras frecuentes
 * con reglas morfológicas (sufijos). El resultado es una *sugerencia*;
 * el usuario siempre puede corregir la categoría.
 */
(function (root) {
  'use strict'

  var CATEGORIES = {
    sustantivo: { label: 'Substantivo', pt: 'substantivo' },
    adjetivo: { label: 'Adjetivo', pt: 'adjetivo' },
    verbo: { label: 'Verbo', pt: 'verbo' },
    adverbio: { label: 'Advérbio', pt: 'advérbio' },
    conector: { label: 'Conectivo', pt: 'conectivo' },
    expresion: { label: 'Expressão', pt: 'expressão' }
  }

  // Conectores (simples y compuestos) más frecuentes.
  var CONNECTORS = [
    'e', 'mas', 'porém', 'contudo', 'todavia', 'entretanto', 'no entanto', 'só que',
    'portanto', 'logo', 'pois', 'porque', 'por isso', 'então', 'assim', 'por conseguinte',
    'embora', 'apesar de', 'apesar disso', 'mesmo que', 'ainda que', 'se bem que',
    'quando', 'enquanto', 'assim que', 'logo que', 'depois que', 'antes que', 'até que',
    'se', 'caso', 'desde que', 'contanto que', 'a menos que',
    'ou', 'nem', 'ou seja', 'isto é', 'por exemplo', 'aliás', 'além disso', 'inclusive',
    'já que', 'visto que', 'uma vez que', 'como', 'conforme', 'segundo',
    'para que', 'a fim de', 'a fim de que', 'de modo que', 'de forma que', 'de maneira que',
    'por outro lado', 'em vez de', 'ao invés de', 'em primeiro lugar', 'finalmente',
    'enfim', 'afinal', 'ou melhor', 'quer dizer', 'à medida que', 'à proporção que',
    'que', 'mas também', 'não só', 'tanto que', 'senão', 'do contrário'
  ]

  var ADVERBS = [
    'muito', 'pouco', 'bem', 'mal', 'sempre', 'nunca', 'jamais', 'já', 'ainda',
    'aqui', 'ali', 'lá', 'cá', 'aí', 'hoje', 'ontem', 'amanhã', 'cedo', 'tarde',
    'depois', 'antes', 'agora', 'talvez', 'sim', 'não', 'também', 'quase', 'bastante',
    'demais', 'devagar', 'depressa', 'longe', 'perto', 'dentro', 'fora', 'acima',
    'abaixo', 'só', 'apenas', 'tão', 'tanto', 'mais', 'menos', 'melhor', 'pior',
    'atrás', 'adiante', 'embaixo', 'onde', 'aonde', 'logo', 'breve', 'outrora',
    'raramente', 'frequentemente', 'provavelmente', 'certamente', 'realmente',
    'principalmente', 'rapidamente', 'facilmente', 'normalmente', 'geralmente',
    'assim', 'quiçá', 'deveras', 'bem-vindo'
  ]

  // Sustantivos frecuentes que "parecen" verbos (-ar, -er, -ir, -or).
  var NOUN_EXCEPTIONS = [
    'lugar', 'mar', 'bar', 'altar', 'colar', 'par', 'ar', 'lar', 'luar', 'olhar',
    'jantar', 'almoçar', 'mulher', 'colher', 'prazer', 'poder', 'dever', 'talher',
    'chofer', 'qualquer', 'elixir', 'faquir', 'nadir', 'sir', 'zíper', 'hambúrguer',
    'computador', 'professor', 'amor', 'calor', 'flor', 'cor', 'dor', 'valor', 'favor',
    'motor', 'senhor', 'autor', 'ator', 'doutor', 'sabor', 'humor', 'interior',
    'exterior', 'cantor', 'escritor', 'leitor', 'diretor', 'elevador', 'tambor',
    'açúcar', 'polegar', 'radar', 'familiar', 'militar', 'celular', 'dólar', 'bem-estar',
    // -ante / -ente que son sustantivos
    'estudante', 'presidente', 'cliente', 'gente', 'dente', 'parente', 'restaurante',
    'elefante', 'diamante', 'mente', 'pente', 'continente', 'acidente', 'ambiente',
    'paciente', 'gerente', 'tenente', 'semente', 'corrente', 'presente', 'instante',
    'música', 'física', 'química', 'técnica', 'política', 'república', 'fábrica', 'clínica'
  ]

  var ADJECTIVES = [
    'bom', 'boa', 'mau', 'má', 'grande', 'pequeno', 'pequena', 'novo', 'nova', 'velho',
    'velha', 'bonito', 'bonita', 'feio', 'feia', 'feliz', 'triste', 'fácil', 'difícil',
    'alto', 'alta', 'baixo', 'baixa', 'rápido', 'rápida', 'lento', 'lenta', 'forte',
    'fraco', 'fraca', 'jovem', 'legal', 'chato', 'chata', 'lindo', 'linda', 'caro',
    'cara', 'barato', 'barata', 'quente', 'frio', 'fria', 'cheio', 'cheia', 'vazio',
    'vazia', 'limpo', 'limpa', 'sujo', 'suja', 'certo', 'certa', 'errado', 'errada',
    'simples', 'gentil', 'esperto', 'esperta', 'gostoso', 'gostosa', 'preguiçoso',
    'cansado', 'cansada', 'animado', 'animada', 'bravo', 'brava', 'doce', 'amargo',
    'azul', 'verde', 'vermelho', 'vermelha', 'amarelo', 'amarela', 'branco', 'branca',
    'preto', 'preta', 'cinza', 'rosa', 'roxo', 'roxa', 'marrom', 'importante', 'inteligente',
    'diferente', 'igual', 'melhor', 'pior', 'último', 'última', 'próximo', 'próxima',
    'livre', 'pobre', 'rico', 'rica', 'sério', 'séria', 'calmo', 'calma', 'magro', 'magra',
    'gordo', 'gorda', 'curto', 'curta', 'longo', 'longa', 'largo', 'larga', 'estreito'
  ]

  // Reglas de sufijos: [sufijo, categoría, confianza, explicación]
  var SUFFIX_RULES = [
    ['mente', 'adverbio', 0.95, 'termina em "-mente" (como "-mente" em espanhol)'],
    ['ção', 'sustantivo', 0.9, 'termina em "-ção" (≈ "-ción")'],
    ['ções', 'sustantivo', 0.9, 'termina em "-ções" (≈ "-ciones")'],
    ['são', 'sustantivo', 0.8, 'termina em "-são" (≈ "-sión")'],
    ['dade', 'sustantivo', 0.9, 'termina em "-dade" (≈ "-dad")'],
    ['tude', 'sustantivo', 0.85, 'termina em "-tude" (≈ "-tud")'],
    ['mento', 'sustantivo', 0.85, 'termina em "-mento" (≈ "-miento")'],
    ['agem', 'sustantivo', 0.85, 'termina em "-agem" (≈ "-aje")'],
    ['ismo', 'sustantivo', 0.85, 'termina em "-ismo"'],
    ['ência', 'sustantivo', 0.85, 'termina em "-ência" (≈ "-encia")'],
    ['ância', 'sustantivo', 0.85, 'termina em "-ância" (≈ "-ancia")'],
    ['eza', 'sustantivo', 0.8, 'termina em "-eza"'],
    ['ura', 'sustantivo', 0.6, 'termina em "-ura"'],
    ['eiro', 'sustantivo', 0.6, 'termina em "-eiro" (≈ "-ero")'],
    ['eira', 'sustantivo', 0.6, 'termina em "-eira" (≈ "-era")'],
    ['ista', 'sustantivo', 0.6, 'termina em "-ista"'],
    ['oso', 'adjetivo', 0.85, 'termina em "-oso"'],
    ['osa', 'adjetivo', 0.8, 'termina em "-osa"'],
    ['vel', 'adjetivo', 0.85, 'termina em "-vel" (≈ "-ble")'],
    ['ivo', 'adjetivo', 0.75, 'termina em "-ivo"'],
    ['iva', 'adjetivo', 0.7, 'termina em "-iva"'],
    ['ento', 'adjetivo', 0.6, 'termina em "-ento" (ex.: barulhento)'],
    ['ado', 'adjetivo', 0.6, 'termina em "-ado" (particípio usado como adjetivo)'],
    ['ido', 'adjetivo', 0.55, 'termina em "-ido" (particípio usado como adjetivo)'],
    ['ante', 'adjetivo', 0.5, 'termina em "-ante"'],
    ['ente', 'adjetivo', 0.5, 'termina em "-ente"'],
    ['ico', 'adjetivo', 0.5, 'termina em "-ico"'],
    ['ês', 'adjetivo', 0.5, 'termina em "-ês" (gentílicos: português, inglês)'],
    ['ar', 'verbo', 0.75, 'termina em "-ar" (infinitivo da 1ª conjugação)'],
    ['er', 'verbo', 0.7, 'termina em "-er" (infinitivo da 2ª conjugação)'],
    ['ir', 'verbo', 0.7, 'termina em "-ir" (infinitivo da 3ª conjugação)'],
    ['por', 'verbo', 0.6, 'derivado de "pôr" (compor, dispor...)'],
    ['ão', 'sustantivo', 0.6, 'termina em "-ão"'],
    ['ões', 'sustantivo', 0.6, 'termina em "-ões"']
  ]

  function normalize (text) {
    return String(text || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^[¡¿"'«“]+|[.!?,;:"'»”]+$/g, '')
      .toLowerCase()
  }

  function inList (list, word) {
    return list.indexOf(word) !== -1
  }

  function result (category, confidence, reason) {
    return { category: category, confidence: confidence, reason: reason }
  }

  function classify (input) {
    var w = normalize(input)
    if (!w) return result(null, 0, 'Palavra vazia')

    if (inList(CONNECTORS, w)) return result('conector', 0.95, 'é um conectivo frequente')

    if (w.indexOf(' ') !== -1) {
      return result('expresion', 0.85, 'tem várias palavras: parece uma expressão')
    }

    // Verbos reflexivos / con pronombre enclítico: lembrar-se, chamar-se, dá-lo...
    if (/^[a-zà-ú]+(ar|er|ir|or)-(se|me|te|nos|lo|la|los|las)$/.test(w)) {
      return result('verbo', 0.9, 'é um verbo com pronome (reflexivo)')
    }
    if (w.indexOf('-') !== -1) {
      return result('expresion', 0.6, 'é uma palavra composta com hífen')
    }

    if (inList(ADVERBS, w)) return result('adverbio', 0.9, 'é um advérbio frequente')
    var sing = /s$/.test(w) ? w.slice(0, -1) : w
    if (inList(ADJECTIVES, w) || inList(ADJECTIVES, sing)) return result('adjetivo', 0.9, 'é um adjetivo frequente')
    if (inList(NOUN_EXCEPTIONS, w) || inList(NOUN_EXCEPTIONS, sing)) return result('sustantivo', 0.85, 'é um substantivo frequente')
    if (w === 'pôr') return result('verbo', 0.95, 'é o verbo "pôr"')

    // -or que no sea "-por" suele ser sustantivo (professor, ator).
    if (/or$/.test(w) && !/por$/.test(w)) {
      return result('sustantivo', 0.65, 'termina em "-or" (como "professor", "ator")')
    }

    for (var i = 0; i < SUFFIX_RULES.length; i++) {
      var rule = SUFFIX_RULES[i]
      var suf = rule[0]
      if (w.length > suf.length + 1 && w.slice(-suf.length) === suf) {
        return result(rule[1], rule[2], rule[3])
      }
    }

    return result('sustantivo', 0.3, 'sem pistas claras; por padrão, substantivo')
  }

  var api = {
    CATEGORIES: CATEGORIES,
    CONNECTORS: CONNECTORS,
    classify: classify,
    normalize: normalize
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Classifier = api
})(this)
