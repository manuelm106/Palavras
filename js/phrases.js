/*
 * Frases que se muestran debajo del nombre del usuario al iniciar sesión:
 * motivación, chistes, expresiones y consejos. Cada una en portugués (pt)
 * con su traducción o explicación en español (es).
 */
(function (root) {
  'use strict'

  var KINDS = {
    motivacao: { icon: '💪', label: 'Motivación' },
    piada: { icon: '😄', label: 'Chiste' },
    expressao: { icon: '🗣️', label: 'Expresión' },
    dica: { icon: '💡', label: 'Consejo' }
  }

  var LIST = [
    // Motivación
    { kind: 'motivacao', pt: 'Devagar se vai ao longe.', es: 'Despacio se llega lejos.' },
    { kind: 'motivacao', pt: 'Água mole em pedra dura, tanto bate até que fura.', es: 'Gota a gota se horada la piedra: la constancia lo logra todo.' },
    { kind: 'motivacao', pt: 'De grão em grão, a galinha enche o papo.', es: 'Grano a grano, la gallina llena el buche: poco a poco se llega.' },
    { kind: 'motivacao', pt: 'Quem não arrisca não petisca.', es: 'El que no arriesga no gana.' },
    { kind: 'motivacao', pt: 'Cada palavra nova é um passo a mais.', es: 'Cada palabra nueva es un paso más.' },
    { kind: 'motivacao', pt: 'Errar faz parte do aprendizado.', es: 'Equivocarse es parte del aprendizaje.' },
    { kind: 'motivacao', pt: 'Um pouco todo dia vale mais que muito de vez em quando.', es: 'Un poco cada día vale más que mucho de vez en cuando.' },
    { kind: 'motivacao', pt: 'Hoje você sabe mais português do que ontem.', es: 'Hoy sabes más portugués que ayer.' },
    { kind: 'motivacao', pt: 'O importante é não parar.', es: 'Lo importante es no detenerse.' },
    { kind: 'motivacao', pt: 'Quem tem boca vai a Roma.', es: 'Preguntando se llega a Roma: no tengas miedo de hablar.' },

    // Chistes (juegos de palabras)
    { kind: 'piada', pt: '— O que o pato disse para a pata? — Vem quá!', es: 'Juego entre «vem cá» (ven acá) y «quá», el sonido del pato.' },
    { kind: 'piada', pt: '— Por que o livro de matemática estava triste? — Porque tinha muitos problemas.', es: '¿Por qué estaba triste el libro de matemáticas? Porque tenía muchos problemas.' },
    { kind: 'piada', pt: '— Qual é o café mais perigoso do mundo? — O ex-presso.', es: 'Juego entre «expresso» (café expreso) y «ex-preso» (ex presidiario).' },
    { kind: 'piada', pt: '— Por que a plantinha não foi atendida no hospital? — Porque só tinha médico de plantão.', es: 'Juego entre «plantão» (guardia médica) y «planta».' },
    { kind: 'piada', pt: '— O que o tomate foi fazer no banco? — Tirar extrato.', es: 'Juego con «extrato»: extracto bancario y extracto de tomate.' },
    { kind: 'piada', pt: '— Qual é o rei dos queijos? — O reiqueijão.', es: '«Requeijão» (queso crema) suena como «rei queijão» (rey quesote).' },
    { kind: 'piada', pt: '— Por que o jacaré tirou o filho da escola? — Porque ele réptil de ano.', es: '«Réptil» suena como «repetiu» (repitió de año).' },

    // Expresiones
    { kind: 'expressao', pt: 'Tirar de letra: fazer algo com muita facilidade. «Você vai tirar essa prova de letra!»', es: 'Hacer algo con mucha facilidad. «¡Vas a pasar ese examen sin problemas!»' },
    { kind: 'expressao', pt: 'Pagar o pato: levar a culpa por algo que não fez.', es: 'Pagar los platos rotos.' },
    { kind: 'expressao', pt: 'Chutar o balde: desistir de tudo, perder a paciência.', es: 'Mandar todo al diablo.' },
    { kind: 'expressao', pt: 'Fazer uma vaquinha: juntar dinheiro entre amigos.', es: 'Hacer una colecta entre amigos (una «vaca»).' },
    { kind: 'expressao', pt: 'Ficar de molho: ficar em repouso, geralmente doente.', es: 'Quedarse en reposo, normalmente por estar enfermo.' },
    { kind: 'expressao', pt: 'Cair a ficha: finalmente entender algo.', es: 'Caer en la cuenta.' },
    { kind: 'expressao', pt: 'Estar com a corda toda: estar cheio de energia.', es: 'Estar lleno de energía.' },
    { kind: 'expressao', pt: 'Dar uma mãozinha: ajudar alguém.', es: 'Dar una mano.' },
    { kind: 'expressao', pt: 'Engolir sapo: aguentar algo desagradável sem reclamar.', es: 'Tragarse un sapo: aguantar algo desagradable sin quejarse.' },
    { kind: 'expressao', pt: 'Pisar em ovos: agir com muito cuidado.', es: 'Andar con pies de plomo.' },
    { kind: 'expressao', pt: 'Ser um pão-duro: ser muito econômico, mesquinho.', es: 'Ser un tacaño, un «codo».' },
    { kind: 'expressao', pt: 'Matar dois coelhos com uma cajadada só.', es: 'Matar dos pájaros de un tiro.' },

    // Consejos
    { kind: 'dica', pt: 'Falso amigo: «esquisito» quer dizer estranho, e não delicioso.', es: '«Esquisito» significa raro, no exquisito.' },
    { kind: 'dica', pt: 'Falso amigo: «borracha» é a goma de apagar.', es: '«Borracha» es la goma de borrar, no una persona ebria.' },
    { kind: 'dica', pt: 'Falso amigo: «polvo» é um animal do mar; o que fica nos móveis é «pó».', es: '«Polvo» es pulpo; el polvo de los muebles se dice «pó».' },
    { kind: 'dica', pt: 'Falso amigo: «embaraçada» quer dizer envergonhada; quem espera um bebê está «grávida».', es: '«Embaraçada» significa avergonzada, no embarazada.' },
    { kind: 'dica', pt: 'Falso amigo: «apelido» é o nome carinhoso; o de família é «sobrenome».', es: '«Apelido» es apodo; el apellido se dice «sobrenome».' },
    { kind: 'dica', pt: 'Falso amigo: «rato» é um animal; para «un rato» diga «um pouco» ou «um tempinho».', es: '«Rato» es ratón; «un rato» se dice «um pouco» o «um tempinho».' },
    { kind: 'dica', pt: 'O «nh» soa como o «ñ»: ninho, banho, amanhã.', es: 'La «nh» suena como la «ñ»: ninho (nido), banho (baño), amanhã (mañana).' },
    { kind: 'dica', pt: 'O «lh» soa parecido com um «ll» suave: filho, olho, trabalho.', es: 'La «lh» suena parecida a una «ll» suave: filho (hijo), olho (ojo), trabalho (trabajo).' },
    { kind: 'dica', pt: 'No Brasil, «você» é muito mais comum que «tu» na maior parte do país.', es: 'En Brasil, «você» es mucho más común que «tu» en la mayor parte del país.' },
    { kind: 'dica', pt: '«Ficar» é um verbo coringa: ficar feliz, ficar em casa, ficar pronto.', es: '«Ficar» es un verbo comodín: ponerse feliz, quedarse en casa, estar listo.' },
    { kind: 'dica', pt: 'Leia suas frases em voz alta: isso ajuda a fixar a pronúncia.', es: 'Lee tus frases en voz alta: ayuda a fijar la pronunciación.' },
    { kind: 'dica', pt: 'Cinco minutos de desafio por dia já fazem diferença.', es: 'Cinco minutos de desafío por día ya marcan la diferencia.' },
    { kind: 'dica', pt: 'Escreva exemplos sobre a sua vida: assim as palavras grudam na memória.', es: 'Escribe ejemplos sobre tu vida: así las palabras se quedan en la memoria.' }
  ]

  var RECENT_KEY = 'palabras-pt:frases-recientes'

  // Elige una frase al azar evitando las últimas mostradas en este dispositivo.
  function random () {
    var recent = []
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch (e) {}
    var pool = LIST.map(function (_, i) { return i }).filter(function (i) { return recent.indexOf(i) === -1 })
    if (!pool.length) pool = LIST.map(function (_, i) { return i })
    var index = pool[Math.floor(Math.random() * pool.length)]
    recent.push(index)
    recent = recent.slice(-Math.min(15, LIST.length - 1))
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch (e) {}
    var p = LIST[index]
    return { kind: p.kind, icon: KINDS[p.kind].icon, label: KINDS[p.kind].label, pt: p.pt, es: p.es }
  }

  root.Phrases = { list: LIST, kinds: KINDS, random: random }
})(this)
