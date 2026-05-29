import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import { getMessaging, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, 'europe-west1')

// Analytics loaded lazily to avoid being blocked by ad/privacy blockers
export async function initAnalytics() {
  try {
    const { getAnalytics, isSupported: analyticsSupported } = await import('firebase/analytics')
    if (await analyticsSupported()) return getAnalytics(app)
  } catch {
    // silently ignore — analytics blocked or unsupported
  }
  return null
}

// FCM — lazily initialized, not supported on iOS < 16.4 or in non-HTTPS contexts
export async function getMessagingInstance() {
  try {
    if (!(await isSupported())) return null
    return getMessaging(app)
  } catch {
    return null
  }
}
