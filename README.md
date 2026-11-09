# Palavras · vocabulario de portugués

Una app web pequeña (HTML + CSS + JavaScript, sin dependencias) para armar tu propia lista de vocabulario en portugués.

**Abrir la app:** https://manuelm106.github.io/palavras/

## Qué hace

- **Cargar palabras con un formulario**: la palabra o expresión, y, si quieres, su significado y una frase tuya de ejemplo.
- **Sugerencia de significado**: al escribir la palabra, aparecen posibles traducciones al español (servicio gratuito [MyMemory](https://mymemory.translated.net/); si no responde o se agotó su límite diario, se usa [Apertium](https://apertium.org/) como respaldo). Se toca una para usarla como significado; nunca se completa sola. Las consultas se guardan en caché en el navegador.
- **Clasificación automática** en *sustantivo, adjetivo, verbo, adverbio, conector* o *expresión*. Mientras escribes, te muestra la sugerencia, el motivo (por ejemplo: termina en "-mente") y qué tan segura está. Puedes elegir otra categoría al cargarla o cambiarla después desde la lista.
- **Lista** con filtros por categoría, buscador, pronunciación (🔊, usa la voz pt-BR del navegador) y ejemplos de uso.
- **Género de los sustantivos**: se muestra el artículo delante de la palabra (*a casa*, *o livro*, *os amigos*, *o/a estudante*) y una etiqueta masculino / femenino / masc. o fem. Se deduce por la terminación y por una lista de excepciones frecuentes; si no es seguro, la etiqueta lleva «?». Tocándola se elige el género correcto, que se guarda y se sincroniza. También aparece en el PDF y en lo que se comparte.
- **Comparación con el español**: si el sustantivo tiene distinto género que en español, la tarjeta se destaca en naranja con el aviso **«⚠️ ¡OJO! Género distinto al español»** (por ejemplo, *a viagem* ≠ *el viaje*); si es igual, aparece «✓ Mismo género que en español». El género en español se toma del significado (si lleva artículo, se usa ese) o se deduce; para unas 60 diferencias típicas (*leite/leche*, *ponte/puente*, *nariz*, *árvore/árbol*, *cor/color*…) se reconoce aunque no haya significado. Hay un filtro «⚠️ Género distinto», el aviso también aparece en el desafío, las notificaciones y el PDF, y el significado se puede editar tocándolo.
- **Ejemplos de uso reales**: para cada palabra se buscan frases escritas por personas en [Tatoeba](https://tatoeba.org) (licencia CC BY 2.0 FR), con su traducción al español cuando existe. Orden de prioridad: tus propios ejemplos, frases de Tatoeba, ejemplos escritos a mano para conectores, adverbios y expresiones frecuentes y, solo para sustantivos sin nada mejor, dos frases modelo neutras. Para verbos, adjetivos y adverbios no se inventan frases: si no hay ninguna, la app te invita a escribir la tuya.
- **Notificaciones al azar**: actívalas y elige un rango (por ejemplo, cada 15 a 45 minutos). La app elige una palabra al azar (prefiere las que viste menos veces) y te manda un ejemplo de uso.
- **Desafío** (pestaña 🎯): la app elige una palabra al azar (prefiere las que más te cuestan); eliges su categoría y escribes una frase con ella. Cuenta aciertos y fallos (por categoría y por frase), precisión, racha y muestra las palabras que más te cuestan. La frase se acepta si usa la palabra o una forma conjugada/derivada (falar → falei, ir → vou, cidade → cidades); la gramática no se corrige, pero se muestra un ejemplo para comparar. Los puntajes se guardan en cada palabra, así que se sincronizan entre dispositivos (la racha es de cada dispositivo).
- **Exportar a PDF**: arma una versión para imprimir, agrupada por categoría (palabra, significado y un ejemplo), y abre el diálogo de impresión, donde se elige "Guardar como PDF". Exporta lo que se ve en la lista: si hay un filtro o búsqueda activos, solo esas palabras.
- **Exportar/importar** la lista en JSON. Todo se guarda en el `localStorage` del navegador.
- **Foto de perfil**: tocando la foto junto al nombre se puede subir una foto propia, elegir un emoji o volver a la foto de la cuenta de Google. La foto se recorta y achica en el dispositivo (160×160 px, unos 5–15 KB) y se guarda junto con la lista, así que se ve en todos los dispositivos (no hace falta Firebase Storage).
- **Frase al iniciar sesión**: debajo del nombre del usuario aparece una frase al azar en portugués, con su traducción: motivación, chiste, expresión, consejo (falsos amigos, pronunciación, cómo estudiar) o curiosidad de Brasil. Cambia cada vez que se abre la app, no repite las últimas y se puede escuchar o pedir otra.
- **Amigos** (pestaña 👥, con la sesión iniciada): se agrega a otra persona escribiendo su correo exacto; le llega una solicitud que puede aceptar o rechazar. Con el botón 📤 se comparte una palabra (con significado, categoría y el ejemplo que se ve) o la frase del día. Los amigos la ven en **Novedades**, pueden darle ❤️ y agregar la palabra a su propia lista. En «Lo que compartí» se ve la foto y el nombre de quién dio like (los nuevos, marcados); al recibir un like con la app abierta aparece un aviso, y la pestaña muestra un número con los likes nuevos y las solicitudes pendientes. Cada publicación tiene **comentarios** (💬): los ven y escriben el autor y los amigos con quienes se compartió; cada uno puede borrar los suyos y el autor puede borrar cualquiera en lo suyo. Al recibir un comentario aparece un aviso y suma al número de la pestaña. También se puede dejar de compartir (se borran también los comentarios). Solo los amigos ven lo compartido; la lista completa sigue siendo privada.
- **Sincronización opcional** entre dispositivos: inicias sesión con Google y ves la misma lista en el celular y en la computadora (usa Firebase; ver abajo). La configuración de notificaciones sigue siendo de cada dispositivo.

## Cómo usarla

La forma más simple es abrir la versión publicada (enlace de arriba). Para usarla en tu computadora, las notificaciones del sistema necesitan que la página se abra por `http://localhost` o `https://` (no con `file://`):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Si la abres con doble clic (`file://`), funciona todo igual, pero los avisos solo aparecen dentro de la página.

## Sincronización con Firebase

Mientras `js/firebase-config.js` tenga `window.FIREBASE_CONFIG = null`, la app funciona solo en el dispositivo. Para activar la sincronización:

1. Crear un proyecto en https://console.firebase.google.com (Google Analytics no hace falta).
2. **Authentication → Comenzar → Método de acceso → Google** → habilitar y guardar.
3. **Authentication → Configuración → Dominios autorizados** → agregar `manuelm106.github.io`.
4. **Firestore Database → Crear base de datos** (modo producción, ID `(default)`) y, en **Reglas**, pegar el contenido de [`firestore.rules`](firestore.rules) y publicar. (En el celular, el editor de reglas solo aparece pidiendo la versión de escritorio del sitio.)

5. **Configuración del proyecto → Tus apps → Web (`</>`)** → registrar la app y copiar el objeto `firebaseConfig` en `js/firebase-config.js`:

   ```js
   window.FIREBASE_CONFIG = { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…' }
   ```

Estos datos de configuración no son secretos; lo que protege los datos son las reglas del paso 4:

- `users/{uid}`: la lista de cada usuario; solo la lee y escribe su dueño.
- `profiles/{uid}`: nombre y foto públicos; cualquiera con sesión puede leer uno, pero no listarlos.
- `emails/{correo}`: correo → uid, para agregar amigos; solo se consulta con el correo exacto y cada uno solo registra el suyo.
- `friendships/{uidA_uidB}`: solicitudes y amistades; solo las ven los dos miembros y solo quien recibe la solicitud puede aceptarla.
- `posts/{id}`: lo compartido; lo ven el autor y los amigos de `audience`; los amigos solo pueden poner o quitar su propio like, y el contador de comentarios solo sube o baja de a uno.
- `posts/{id}/comments/{id}`: comentarios (hasta 500 caracteres); los leen y escriben el autor y la audiencia; nadie puede escribir a nombre de otro.

Las reglas están probadas con el emulador de Firestore (62 casos de acceso permitido y denegado).

**Cómo se guarda:** toda la lista de cada usuario está en un solo documento, `users/{uid}`, con el campo `words` (un mapa `id → palabra`) y el campo `profile` (la foto de perfil). Así, abrir la app cuesta 1 lectura y cada cambio 1 escritura; los cambios seguidos (por ejemplo, las dos respuestas de una ronda del desafío) se agrupan en una sola escritura. El contador de notificaciones no se sincroniza (es de cada dispositivo). Un documento admite hasta 1 MiB: alcanza para unas 3.000 palabras con ejemplos; si se supera, la app lo avisa. Las listas guardadas con la versión anterior (`users/{uid}/words/{id}`) se migran solas al iniciar sesión.

Con el plan gratuito de Firebase (unas 50.000 lecturas y 20.000 escrituras por día), esto alcanza para cientos de personas usándola a diario.

Al iniciar sesión por primera vez en un dispositivo, las palabras que ya tenía se suman a la cuenta. Al cerrar sesión, la lista se quita de ese dispositivo (sigue guardada en la cuenta).

## Limitaciones

- La clasificación usa **reglas heurísticas** (listas de palabras frecuentes y sufijos), no un diccionario completo. Funciona bien con infinitivos (`-ar/-er/-ir`), adverbios en `-mente`, sufijos típicos (`-ção`, `-dade`, `-vel`, `-oso`…) y los conectores y expresiones más comunes. En los casos dudosos la confianza aparece baja, y conviene revisar la categoría.
- Las frases de Tatoeba las escriben voluntarios: casi siempre son correctas, pero algunas pueden ser de Portugal y no de Brasil, o no tener traducción al español. Si una palabra no aparece en Tatoeba (o el servicio no responde), no se muestra ejemplo; lo mejor es agregar el tuyo, que siempre tiene prioridad.
- Las sugerencias de significado son traducciones automáticas: conviene revisarlas. MyMemory permite un número limitado de consultas gratis por día y por conexión (en datos móviles esa conexión puede ser compartida con otras personas). Si se agota, la app usa Apertium durante unas horas; si ninguno responde, lo avisa y se puede escribir el significado a mano.
- Las notificaciones llegan **mientras la pestaña esté abierta**, aunque esté en segundo plano. Para recibirlas con el navegador cerrado haría falta un servidor de *push*.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (incluye modo oscuro y diseño para celular) |
| `js/classifier.js` | Clasificador heurístico |
| `js/sentences.js` | Frases reales desde Tatoeba (con caché) |
| `js/gender-es.js` | Género en español y comparación con el portugués |
| `js/examples.js` | Ejemplos de uso: propios, Tatoeba, escritos a mano |
| `js/app.js` | Estado, formulario, lista, notificaciones |
| `js/phrases.js` | Frases de motivación, chistes, expresiones, consejos y curiosidades de Brasil |
| `js/social.js` | Amigos, publicaciones compartidas y likes |
| `firestore.rules` | Reglas de seguridad de Firestore |
| `js/challenge.js` | Modo desafío y puntajes |
| `js/translate.js` | Sugerencias de significado (MyMemory, con Apertium de respaldo) |
| `js/firebase-config.js` | Configuración de Firebase (opcional) |
| `js/sync.js` | Inicio de sesión con Google y sincronización con Firestore |
| `sw.js` | Service worker para las notificaciones del sistema |
