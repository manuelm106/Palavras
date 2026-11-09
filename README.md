# Palavras · vocabulario de portugués

Una app web pequeña (HTML + CSS + JavaScript, sin dependencias) para armar tu propia lista de vocabulario en portugués.

**Abrir la app:** https://manuelm106.github.io/palavras/

## Qué hace

- **Cargar palabras con un formulario**: la palabra o expresión, y, si quieres, su significado y una frase tuya de ejemplo.
- **Sugerencia de significado**: al escribir la palabra, aparecen posibles traducciones al español (servicio gratuito [MyMemory](https://mymemory.translated.net/); si no responde o se agotó su límite diario, se usa [Apertium](https://apertium.org/) como respaldo). Se toca una para usarla como significado; nunca se completa sola. Las consultas se guardan en caché en el navegador.
- **Clasificación automática** en *sustantivo, adjetivo, verbo, adverbio, conector* o *expresión*. Mientras escribes, te muestra la sugerencia, el motivo (por ejemplo: termina en "-mente") y qué tan segura está. Puedes elegir otra categoría al cargarla o cambiarla después desde la lista.
- **Lista** con filtros por categoría, buscador, pronunciación (🔊, usa la voz pt-BR del navegador) y ejemplos de uso.
- **Notificaciones al azar**: actívalas y elige un rango (por ejemplo, cada 15 a 45 minutos). La app elige una palabra al azar (prefiere las que viste menos veces) y te manda un ejemplo de uso.
- **Desafío** (pestaña 🎯): la app elige una palabra al azar (prefiere las que más te cuestan); eliges su categoría y escribes una frase con ella. Cuenta aciertos y fallos (por categoría y por frase), precisión, racha y muestra las palabras que más te cuestan. La frase se acepta si usa la palabra o una forma conjugada/derivada (falar → falei, ir → vou, cidade → cidades); la gramática no se corrige, pero se muestra un ejemplo para comparar. Los puntajes se guardan en cada palabra, así que se sincronizan entre dispositivos (la racha es de cada dispositivo).
- **Exportar a PDF**: arma una versión para imprimir, agrupada por categoría (palabra, significado y un ejemplo), y abre el diálogo de impresión, donde se elige "Guardar como PDF". Exporta lo que se ve en la lista: si hay un filtro o búsqueda activos, solo esas palabras.
- **Exportar/importar** la lista en JSON. Todo se guarda en el `localStorage` del navegador.
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
4. **Firestore Database → Crear base de datos** (modo producción, ID `(default)`) y, en **Reglas**, pegar:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
       // Formato anterior (una palabra por documento): solo para la migración automática.
       match /users/{uid}/words/{wordId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. **Configuración del proyecto → Tus apps → Web (`</>`)** → registrar la app y copiar el objeto `firebaseConfig` en `js/firebase-config.js`:

   ```js
   window.FIREBASE_CONFIG = { apiKey: '…', authDomain: '…', projectId: '…', storageBucket: '…', messagingSenderId: '…', appId: '…' }
   ```

Estos datos de configuración no son secretos; lo que protege la lista son las reglas del paso 4: cada usuario solo puede leer y escribir su propio documento (`users/{uid}`).

**Cómo se guarda:** toda la lista de cada usuario está en un solo documento, `users/{uid}`, con el campo `words` (un mapa `id → palabra`). Así, abrir la app cuesta 1 lectura y cada cambio 1 escritura; los cambios seguidos (por ejemplo, las dos respuestas de una ronda del desafío) se agrupan en una sola escritura. El contador de notificaciones no se sincroniza (es de cada dispositivo). Un documento admite hasta 1 MiB: alcanza para unas 3.000 palabras con ejemplos; si se supera, la app lo avisa. Las listas guardadas con la versión anterior (`users/{uid}/words/{id}`) se migran solas al iniciar sesión.

Con el plan gratuito de Firebase (unas 50.000 lecturas y 20.000 escrituras por día), esto alcanza para cientos de personas usándola a diario.

Al iniciar sesión por primera vez en un dispositivo, las palabras que ya tenía se suman a la cuenta. Al cerrar sesión, la lista se quita de ese dispositivo (sigue guardada en la cuenta).

## Limitaciones

- La clasificación usa **reglas heurísticas** (listas de palabras frecuentes y sufijos), no un diccionario completo. Funciona bien con infinitivos (`-ar/-er/-ir`), adverbios en `-mente`, sufijos típicos (`-ção`, `-dade`, `-vel`, `-oso`…) y los conectores y expresiones más comunes. En los casos dudosos la confianza aparece baja, y conviene revisar la categoría.
- Los conectores, adverbios y expresiones frecuentes tienen **ejemplos escritos a mano**. Para el resto se usan plantillas que respetan el género y el número (o/a, no/na, do/da…), así que algunas frases pueden quedar raras. Lo mejor es agregar tus propios ejemplos, que tienen prioridad.
- Las sugerencias de significado son traducciones automáticas: conviene revisarlas. MyMemory permite un número limitado de consultas gratis por día y por conexión (en datos móviles esa conexión puede ser compartida con otras personas). Si se agota, la app usa Apertium durante unas horas; si ninguno responde, lo avisa y se puede escribir el significado a mano.
- Las notificaciones llegan **mientras la pestaña esté abierta**, aunque esté en segundo plano. Para recibirlas con el navegador cerrado haría falta un servidor de *push*.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (incluye modo oscuro y diseño para celular) |
| `js/classifier.js` | Clasificador heurístico |
| `js/examples.js` | Generador de ejemplos de uso |
| `js/app.js` | Estado, formulario, lista, notificaciones |
| `js/challenge.js` | Modo desafío y puntajes |
| `js/translate.js` | Sugerencias de significado (MyMemory, con Apertium de respaldo) |
| `js/firebase-config.js` | Configuración de Firebase (opcional) |
| `js/sync.js` | Inicio de sesión con Google y sincronización con Firestore |
| `sw.js` | Service worker para las notificaciones del sistema |
