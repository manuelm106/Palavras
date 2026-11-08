/*
 * Generador de ejemplos de uso en portugués (de Brasil).
 * - Conectores, adverbios y expresiones frecuentes tienen ejemplos curados.
 * - El resto usa plantillas por categoría que respetan género y número
 *   (o/a/os/as, no/na, do/da...).
 */
(function (root) {
  'use strict'

  var CURATED = {
    // Conectores
    'e': ['Comprei pão e leite no mercado.', 'Ela estuda de manhã e trabalha à tarde.'],
    'mas': ['Eu queria ir à praia, mas começou a chover.', 'O filme é longo, mas vale a pena.'],
    'porém': ['O restaurante é caro; porém, a comida é excelente.', 'Estudei bastante, porém não passei na prova.'],
    'contudo': ['O plano parecia bom; contudo, não funcionou.', 'Ele é jovem; contudo, tem muita experiência.'],
    'todavia': ['A viagem foi cansativa; todavia, valeu cada minuto.'],
    'entretanto': ['Ela prometeu vir; entretanto, não apareceu.'],
    'no entanto': ['O apartamento é pequeno. No entanto, é muito bem localizado.'],
    'só que': ['Eu ia te ligar, só que fiquei sem bateria.'],
    'portanto': ['Está chovendo muito; portanto, vamos ficar em casa.', 'Ele treinou todos os dias, portanto ganhou a corrida.'],
    'logo': ['Penso, logo existo.', 'Não estudou, logo não sabia as respostas.'],
    'pois': ['Leve um casaco, pois vai esfriar à noite.', 'Não fui à festa, pois estava doente.'],
    'porque': ['Cheguei atrasado porque perdi o ônibus.', 'Estou feliz porque consegui o emprego.'],
    'por isso': ['Acordei tarde, por isso perdi o trem.', 'Ela adora música; por isso, aprendeu a tocar violão.'],
    'então': ['Já está tarde, então vou dormir.', 'Então, o que você achou da aula?'],
    'assim': ['Economizei durante o ano; assim, pude viajar nas férias.'],
    'embora': ['Embora estivesse cansado, ele foi à festa.', 'Embora chova, vamos sair.'],
    'apesar de': ['Apesar de ser tarde, a loja ainda estava aberta.', 'Apesar do frio, fomos à praia.'],
    'mesmo que': ['Mesmo que chova, o show vai acontecer.'],
    'ainda que': ['Ainda que seja difícil, não vou desistir.'],
    'se bem que': ['Vou comprar o celular, se bem que está um pouco caro.'],
    'quando': ['Quando eu chegar em casa, te ligo.', 'Eu morava no Rio quando era criança.'],
    'enquanto': ['Enquanto ele cozinhava, eu arrumava a mesa.'],
    'assim que': ['Assim que terminar o trabalho, vou para a academia.'],
    'logo que': ['Logo que cheguei, percebi que algo estava errado.'],
    'depois que': ['Depois que você sair, feche a porta.'],
    'antes que': ['Vamos embora antes que comece a chover.'],
    'até que': ['Esperei até que todos chegassem.'],
    'se': ['Se fizer sol amanhã, vamos à praia.', 'Se você quiser, posso te ajudar.'],
    'caso': ['Caso precise de algo, é só me chamar.', 'Leve o guarda-chuva caso chova.'],
    'desde que': ['Pode usar meu carro, desde que devolva até as oito.'],
    'contanto que': ['Eu vou, contanto que você vá comigo.'],
    'a menos que': ['Vamos sair às sete, a menos que você prefira mais tarde.'],
    'ou': ['Você quer café ou chá?'],
    'nem': ['Não comi nem bebi nada hoje.'],
    'ou seja': ['Ele é poliglota, ou seja, fala várias línguas.'],
    'isto é': ['Volto em uma quinzena, isto é, em quinze dias.'],
    'por exemplo': ['Gosto de esportes radicais, por exemplo, surfe e escalada.'],
    'aliás': ['A festa foi ótima. Aliás, obrigado pelo convite!'],
    'além disso': ['O hotel é barato; além disso, fica perto da praia.'],
    'inclusive': ['Todos vieram, inclusive os primos de São Paulo.'],
    'já que': ['Já que você está aqui, me ajuda com isso?'],
    'visto que': ['O evento foi cancelado, visto que poucos se inscreveram.'],
    'uma vez que': ['Uma vez que todos concordam, vamos começar.'],
    'como': ['Como estava cansado, fui dormir cedo.'],
    'conforme': ['Fiz o bolo conforme a receita da minha avó.'],
    'para que': ['Falei devagar para que todos entendessem.'],
    'a fim de': ['Ela estudou muito a fim de passar no vestibular.'],
    'de modo que': ['Choveu a noite toda, de modo que as ruas alagaram.'],
    'por outro lado': ['O trabalho é cansativo. Por outro lado, o salário é ótimo.'],
    'em vez de': ['Em vez de reclamar, vamos procurar uma solução.'],
    'finalmente': ['Finalmente chegamos ao hotel depois de dez horas de viagem.'],
    'enfim': ['Enfim, foi um dia longo, mas produtivo.'],
    'afinal': ['Afinal, você vem ou não vem?'],
    'quer dizer': ['Chego às nove, quer dizer, talvez um pouco depois.'],
    'à medida que': ['À medida que o tempo passa, fico mais confiante.'],
    // Adverbios
    'muito': ['Gostei muito do show.', 'Este bolo está muito gostoso.'],
    'pouco': ['Dormi pouco ontem à noite.'],
    'bem': ['Ela canta muito bem.', 'Tudo bem com você?'],
    'mal': ['Dormi mal por causa do barulho.'],
    'sempre': ['Eu sempre tomo café antes de sair.'],
    'nunca': ['Nunca estive em Salvador.'],
    'já': ['Você já almoçou?', 'Já vou! Me espera um minuto.'],
    'ainda': ['Ainda não terminei o livro.'],
    'aqui': ['Pode deixar a mochila aqui.'],
    'ali': ['O banheiro fica ali, à direita.'],
    'lá': ['Vou para lá amanhã de manhã.'],
    'hoje': ['Hoje está um dia lindo.'],
    'ontem': ['Ontem fui ao cinema com meus amigos.'],
    'amanhã': ['Amanhã tenho uma reunião importante.'],
    'cedo': ['Preciso acordar cedo amanhã.'],
    'tarde': ['Cheguei tarde ao trabalho.'],
    'depois': ['A gente conversa depois.'],
    'antes': ['Lave as mãos antes de comer.'],
    'agora': ['Agora não posso falar, estou dirigindo.'],
    'talvez': ['Talvez eu viaje no fim do ano.'],
    'também': ['Eu também adoro feijoada!'],
    'quase': ['Quase perdi o voo.'],
    'bastante': ['Estudei bastante para a prova.'],
    'demais': ['Esse filme é bom demais!'],
    'devagar': ['Fala mais devagar, por favor.'],
    'depressa': ['Vem depressa, o ônibus já está chegando!'],
    'longe': ['A praia fica longe do centro.'],
    'perto': ['Moro perto da estação de metrô.'],
    'só': ['Só quero um copo de água.'],
    'apenas': ['Faltam apenas dois dias para as férias.'],
    'mais': ['Quero mais um pedaço de bolo.'],
    'menos': ['Hoje está menos quente que ontem.'],
    // Expresiones
    'tanto faz': ['— Pizza ou hambúrguer? — Tanto faz, escolhe você.'],
    'valer a pena': ['Vale a pena visitar Ouro Preto.'],
    'dar certo': ['Fica tranquilo, vai dar tudo certo.'],
    'dar um jeito': ['Não sei como, mas vou dar um jeito de chegar a tempo.'],
    'pegar leve': ['Pega leve com ele, é o primeiro dia de trabalho.'],
    'fazer questão': ['Faço questão de pagar o jantar.'],
    'ficar de olho': ['Fica de olho na minha mala, já volto.'],
    'cair a ficha': ['Só depois de uns dias caiu a ficha de que eu tinha passado.'],
    'pisar na bola': ['Pisei na bola: esqueci o aniversário dela.'],
    'quebrar o galho': ['Você pode me quebrar um galho e me emprestar dez reais?'],
    'custar os olhos da cara': ['Esse tênis custou os olhos da cara.'],
    'chover no molhado': ['Falar que precisamos estudar é chover no molhado.'],
    'de repente': ['De repente, a luz acabou.', 'De repente a gente podia ir ao cinema, né?'],
    'com certeza': ['— Você vem amanhã? — Com certeza!'],
    'à toa': ['Passei a tarde à toa, sem fazer nada.'],
    'ter a ver': ['Isso não tem nada a ver com o que eu disse.'],
    'estar com saudade': ['Estou com saudade da minha família.'],
    'matar a saudade': ['Fui a Recife para matar a saudade dos amigos.'],
    'puxa vida': ['Puxa vida, esqueci a carteira em casa!'],
    'nossa': ['Nossa, que calor!'],
    'beleza': ['— Te vejo às oito? — Beleza!'],
    'fazer falta': ['Você fez muita falta na festa.'],
    'dar bola': ['Ele nem deu bola para o que eu falei.'],
    'encher o saco': ['Para de encher o saco, estou tentando estudar!'],
    'ficar sem graça': ['Fiquei sem graça quando todo mundo olhou para mim.'],
    'na real': ['Na real, eu não gostei muito do filme.'],
    'falando nisso': ['Falando nisso, você viu a Ana hoje?'],
    'de jeito nenhum': ['Não vou sair com essa chuva de jeito nenhum.']
  }

  // ---------- Género y número (heurístico) ----------
  var MASC_IN_A = ['dia', 'mapa', 'sofá', 'clima', 'planeta', 'idioma', 'tema', 'sistema',
    'problema', 'programa', 'telefonema', 'poema', 'cinema', 'drama', 'esquema']
  // Femeninos que no terminan en -a (y algunos en -o)
  var FEM_EXTRA = ['foto', 'moto', 'tribo', 'mente', 'gente', 'ponte', 'noite', 'parte',
    'morte', 'sorte', 'arte', 'tarde', 'fome', 'nuvem', 'ordem', 'mulher', 'flor', 'cor',
    'dor', 'luz', 'voz', 'paz', 'vez', 'rede', 'sede', 'chave', 'febre', 'carne', 'fonte',
    'frente', 'lente', 'pele', 'neve', 'mãe', 'mão', 'lei', 'cruz', 'raiz', 'semente',
    'corrente', 'gripe', 'classe', 'base', 'frase', 'fase', 'tese', 'crise', 'análise']

  var INVARIABLE_S = /(ês|ás|ís|ós|ús|lápis|ônibus|vírus|tênis|óculos|simples)$/

  function isPlural (w) {
    return w.length > 3 && /(as|os|es|ães|ões|ãos)$/.test(w) && !INVARIABLE_S.test(w)
  }

  function singularOf (w) {
    if (/ões$/.test(w)) return w.slice(0, -3) + 'ão'
    if (/ães$/.test(w)) return w.slice(0, -3) + 'ão'
    if (/ãos$/.test(w)) return w.slice(0, -1)
    if (/(r|z|s)es$/.test(w)) return w.slice(0, -2)
    return w.slice(0, -1)
  }

  function genderOf (w) {
    var s = isPlural(w) ? singularOf(w) : w
    if (MASC_IN_A.indexOf(s) !== -1) return 'm'
    if (FEM_EXTRA.indexOf(s) !== -1) return 'f'
    if (/(a|ção|são|dade|tude|gem|ez|eza|ice|ie)$/.test(s)) return 'f'
    return 'm'
  }

  function articles (g, plural) {
    var k = g + (plural ? 'p' : 's')
    return {
      ms: { o: 'o', um: 'um', no: 'no', do: 'do', esse: 'esse', meu: 'meu' },
      fs: { o: 'a', um: 'uma', no: 'na', do: 'da', esse: 'essa', meu: 'minha' },
      mp: { o: 'os', um: 'uns', no: 'nos', do: 'dos', esse: 'esses', meu: 'meus' },
      fp: { o: 'as', um: 'umas', no: 'nas', do: 'das', esse: 'essas', meu: 'minhas' }
    }[k]
  }

  function cap (s) { return s.charAt(0).toUpperCase() + s.slice(1) }

  function pick (arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)] }

  // ---------- Plantillas por categoría ----------
  var NOUN_TEMPLATES = [
    function (w, a) { return 'Ontem falamos sobre ' + a.o + ' ' + w + ' na aula.' },
    function (w, a) { return 'Estou pensando ' + a.no + ' ' + w + ' desde ontem.' },
    function (w, a) { return 'O que você acha ' + a.do + ' ' + w + '?' },
    function (w, a, p) { return cap(a.esse) + ' ' + w + (p ? ' são muito especiais' : ' é muito especial') + ' para mim.' },
    function (w, a) { return 'Nunca tinha prestado atenção ' + a.no + ' ' + w + ' até hoje.' }
  ]

  var ADJ_SUBJECTS = {
    ms: ['o João', 'o filme', 'o Pedro', 'o dia', 'o lugar'],
    fs: ['a Maria', 'a cidade', 'a Ana', 'a viagem', 'a ideia'],
    mp: ['os meninos', 'os filmes', 'os vizinhos', 'os dias', 'os lugares'],
    fp: ['as meninas', 'as cidades', 'as vizinhas', 'as viagens', 'as ideias']
  }

  function adjForm (w) {
    var plural = w.length > 4 && /(os|as|es)$/.test(w) && !INVARIABLE_S.test(w)
    var base = plural ? w.replace(/s$/, '') : w
    var g = /a$/.test(base) ? 'f' : (/o$/.test(base) ? 'm' : (Math.random() < 0.5 ? 'm' : 'f'))
    return { g: g, p: plural }
  }

  var ADJ_TEMPLATES = [
    function (w, s, p) { return 'Achei ' + s + ' muito ' + w + '.' },
    function (w, s, p) { return cap(s) + (p ? ' são' : ' é') + ' ' + w + ', não acha?' },
    function (w, s, p) { return 'Hoje ' + s + (p ? ' estão' : ' está') + ' ' + w + '.' },
    function (w, s, p) { return 'Nunca imaginei que ' + s + (p ? ' fossem' : ' fosse') + ' tão ' + w + '.' },
    function (w, s, p) { return cap(s) + (p ? ' parecem' : ' parece') + ' ' + w + ' hoje.' }
  ]

  var VERB_TEMPLATES = [
    function (w) { return 'Amanhã eu vou ' + w + ' com meus amigos.' },
    function (w) { return 'Você gosta de ' + w + '?' },
    function (w) { return 'É importante ' + w + ' todos os dias.' },
    function (w) { return 'Preciso ' + w + ' antes do fim de semana.' },
    function (w) { return 'Ela começou a ' + w + ' no ano passado.' },
    function (w) { return 'Não é fácil ' + w + ' quando estamos cansados.' },
    function (w) { return 'Quero aprender a ' + w + ' melhor.' }
  ]

  var ADV_TEMPLATES = [
    function (w) { return 'Ela resolveu o problema ' + w + '.' },
    function (w) { return cap(w) + ', tudo deu certo no final.' },
    function (w) { return 'Desafio: descreva como foi o seu dia usando «' + w + '».' }
  ]

  var CONNECTOR_TEMPLATES = [
    function (w) { return 'Combine duas ideias com «' + w + '»: «Eu queria sair… ' + w + ' …»' },
    function (w) { return 'Desafio: escreva uma frase sobre o seu dia usando «' + w + '».' }
  ]

  var EXPR_TEMPLATES = [
    function (w) { return 'Ontem ouvi alguém dizer «' + w + '» no ônibus.' },
    function (w) { return 'Quando algo assim acontece, a gente diz: «' + w + '».' },
    function (w) { return 'Meu amigo brasileiro sempre fala «' + w + '».' },
    function (w) { return 'Desafio: use «' + w + '» numa conversa hoje.' }
  ]

  function curated (word) {
    var key = String(word || '').trim().toLowerCase()
    return CURATED[key] ? CURATED[key].slice() : []
  }

  /** Devuelve todas las frases posibles (curadas primero) para una palabra. */
  function allExamples (word, category) {
    var w = String(word || '').trim()
    var lw = w.toLowerCase()
    var out = curated(lw)
    var a, p
    switch (category) {
      case 'sustantivo':
        p = isPlural(lw)
        a = articles(genderOf(lw), p)
        NOUN_TEMPLATES.forEach(function (t) { out.push(t(w, a, p)) })
        break
      case 'adjetivo':
        var f = adjForm(lw)
        var subjects = ADJ_SUBJECTS[f.g + (f.p ? 'p' : 's')]
        ADJ_TEMPLATES.forEach(function (t, i) { out.push(t(w, subjects[i % subjects.length], f.p)) })
        break
      case 'verbo':
        VERB_TEMPLATES.forEach(function (t) { out.push(t(w)) })
        break
      case 'adverbio':
        if (!out.length) ADV_TEMPLATES.forEach(function (t) { out.push(t(w)) })
        break
      case 'conector':
        if (!out.length) CONNECTOR_TEMPLATES.forEach(function (t) { out.push(t(w)) })
        break
      case 'expresion':
        if (!out.length) EXPR_TEMPLATES.forEach(function (t) { out.push(t(w)) })
        break
    }
    return out
  }

  /**
   * Ejemplo aleatorio. Si la palabra tiene ejemplos propios del usuario,
   * se priorizan (60% de las veces).
   */
  function randomExample (entry, rnd) {
    rnd = rnd || Math.random
    var own = (entry.examples || []).filter(Boolean)
    if (own.length && rnd() < 0.6) return pick(own, rnd)
    var gen = allExamples(entry.word, entry.category)
    if (!gen.length) return own.length ? pick(own, rnd) : entry.word
    return pick(gen, rnd)
  }

  var api = {
    allExamples: allExamples,
    randomExample: randomExample,
    genderOf: genderOf,
    isPlural: isPlural
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.Examples = api
})(this)
