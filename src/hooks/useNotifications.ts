import { useEffect } from 'react'
import { useNotificationStore } from '../stores/notificationStore'
import { registerFCMToken, onForegroundMessage } from '../firebase/messagingService'
import { showToast } from '../components/ui/Toast'

export function useNotifications(uid: string | null) {
  const { subscribe } = useNotificationStore()

  useEffect(() => {
    if (!uid) return
    const unsub = subscribe(uid)
    return unsub
  }, [uid, subscribe])

  useEffect(() => {
    if (!uid) return

    let unsubFCM: (() => void) | null = null

    // Register FCM token (no-op on iOS < 16.4 or non-HTTPS)
    registerFCMToken(uid).catch(() => {})

    // Show foreground push as toast
    onForegroundMessage((payload) => {
      showToast(`${payload.title}: ${payload.body}`, 'info', 5000)
    }).then((unsub) => {
      unsubFCM = unsub
    })

    return () => {
      unsubFCM?.()
    }
  }, [uid])
}
