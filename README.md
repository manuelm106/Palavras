# Palavras · vocabulario de portugués

Una app web pequeña (HTML + CSS + JavaScript, sin dependencias) para armar tu propia lista de vocabulario en portugués.

**Abrir la app:** https://manuelm106.github.io/palavras/

## Qué hace

- **Cargar palabras con un formulario**: la palabra o expresión, y, si quieres, su significado y una frase tuya de ejemplo.
- **Clasificación automática** en *sustantivo, adjetivo, verbo, adverbio, conector* o *expresión*. Mientras escribes, te muestra la sugerencia, el motivo (por ejemplo: termina en "-mente") y qué tan segura está. Puedes elegir otra categoría al cargarla o cambiarla después desde la lista.
- **Lista** con filtros por categoría, buscador, pronunciación (🔊, usa la voz pt-BR del navegador) y ejemplos de uso.
- **Notificaciones al azar**: actívalas y elige un rango (por ejemplo, cada 15 a 45 minutos). La app elige una palabra al azar (prefiere las que viste menos veces) y te manda un ejemplo de uso.
- **Exportar/importar** la lista en JSON. Todo se guarda en el `localStorage` del navegador.

## Cómo usarla

La forma más simple es abrir la versión publicada (enlace de arriba). Para usarla en tu computadora, las notificaciones del sistema necesitan que la página se abra por `http://localhost` o `https://` (no con `file://`):

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Si la abres con doble clic (`file://`), funciona todo igual, pero los avisos solo aparecen dentro de la página.

## Limitaciones

- La clasificación usa **reglas heurísticas** (listas de palabras frecuentes y sufijos), no un diccionario completo. Funciona bien con infinitivos (`-ar/-er/-ir`), adverbios en `-mente`, sufijos típicos (`-ção`, `-dade`, `-vel`, `-oso`…) y los conectores y expresiones más comunes. En los casos dudosos la confianza aparece baja, y conviene revisar la categoría.
- Los conectores, adverbios y expresiones frecuentes tienen **ejemplos escritos a mano**. Para el resto se usan plantillas que respetan el género y el número (o/a, no/na, do/da…), así que algunas frases pueden quedar raras. Lo mejor es agregar tus propios ejemplos, que tienen prioridad.
- Las notificaciones llegan **mientras la pestaña esté abierta**, aunque esté en segundo plano. Para recibirlas con el navegador cerrado haría falta un servidor de *push*.

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos (incluye modo oscuro y diseño para celular) |
| `js/classifier.js` | Clasificador heurístico |
| `js/examples.js` | Generador de ejemplos de uso |
| `js/app.js` | Estado, formulario, lista, notificaciones |
| `sw.js` | Service worker para las notificaciones del sistema |
