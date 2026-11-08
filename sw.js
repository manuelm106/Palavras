/* Service worker mínimo: permite mostrar notificaciones del sistema
   (necesario en Chrome para Android) y enfocar la app al tocarlas. */
self.addEventListener('install', function () { self.skipWaiting() })
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()) })

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var id = event.notification.data && event.notification.data.id
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {
          list[i].postMessage({ type: 'focus-word', id: id })
          return list[i].focus()
        }
      }
      return self.clients.openWindow('./?word=' + encodeURIComponent(id || ''))
    })
  )
})
