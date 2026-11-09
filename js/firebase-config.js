/*
 * Configuración de Firebase para sincronizar la lista entre dispositivos.
 *
 * Mientras esto quede en `null`, la app funciona solo en este dispositivo
 * (sin botón de inicio de sesión).
 *
 * Para activarla, reemplaza `null` por el objeto `firebaseConfig` que te da
 * Firebase (Configuración del proyecto → Tus apps → App web). Estos datos no
 * son secretos: la seguridad la dan las reglas de Firestore (ver README).
 */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB4FYb9-NMMYoaQPbb_8J2gQed3Q14l_UU',
  authDomain: 'palavras-f148a.firebaseapp.com',
  projectId: 'palavras-f148a',
  storageBucket: 'palavras-f148a.firebasestorage.app',
  messagingSenderId: '866582242193',
  appId: '1:866582242193:web:9a17c9e8e580f896453030'
}
