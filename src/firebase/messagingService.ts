import { getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getMessagingInstance } from './config'
import { db } from './config'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

// Request permission and register FCM token for the user.
// Returns the token or null if push is not supported/denied.
export async function registerFCMToken(uid: string): Promise<string | null> {
  const messaging = await getMessagingInstance()
  if (!messaging) return null

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await getMessagingSW(),
    })

    if (token) {
      // updateDoc (not setDoc) so it never creates a bare document missing role/profile fields
      await updateDoc(
        doc(db, `users/${uid}`),
        { [`fcmTokens.${token}`]: true, fcmUpdatedAt: serverTimestamp() }
      ).catch(() => {})
    }

    return token ?? null
  } catch {
    return null
  }
}

// Listen to foreground messages and call the callback.
export async function onForegroundMessage(
  callback: (payload: { title: string; body: string; data?: Record<string, string> }) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}

  const unsub = onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title ?? 'Solidando',
      body: payload.notification?.body ?? '',
      data: payload.data as Record<string, string> | undefined,
    })
  })

  return unsub
}

async function getMessagingSW(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  } catch {
    return undefined
  }
}
