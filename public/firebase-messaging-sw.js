// Firebase Messaging Service Worker — handles background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyAY9WG0WtuGPYQk-Y2Cp2hT6rYGkdA9Cs0',
  authDomain: 'solidando-app-ba5a0.firebaseapp.com',
  projectId: 'solidando-app-ba5a0',
  storageBucket: 'solidando-app-ba5a0.firebasestorage.app',
  messagingSenderId: '802291026940',
  appId: '1:802291026940:web:b3505ece1ba18518da8079',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification ?? {}
  self.registration.showNotification(title ?? 'Solidando', {
    body: body ?? '',
    icon: icon ?? '/s_logo.png',
    badge: '/s_logo.png',
    data: payload.data ?? {},
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
