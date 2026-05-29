import { create } from 'zustand'
import {
  collection, query, where, limit,
  onSnapshot, doc, updateDoc, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'

export interface AppNotification {
  id: string
  uid: string
  title: string
  body: string
  threadId?: string         // formId, eventId, or responseId
  threadType?: 'form' | 'event' | 'response'
  url?: string
  read: boolean
  createdAt: Timestamp | null
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  loading: boolean
  subscribe: (uid: string) => () => void
  markRead: (id: string) => Promise<void>
  markAllRead: (uid: string) => Promise<void>
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  subscribe(uid) {
    set({ loading: true })
    const q = query(
      collection(db, 'notifications'),
      where('uid', '==', uid),
      limit(50)
    )
    const unsub = onSnapshot(q, (snap) => {
      const notifications = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AppNotification))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        loading: false,
      })
    })
    return unsub
  },

  async markRead(id) {
    const n = get().notifications.find((n) => n.id === id)
    if (!n || n.read) return
    await updateDoc(doc(db, 'notifications', id), { read: true, readAt: serverTimestamp() })
  },

  async markAllRead(uid) {
    const unread = get().notifications.filter((n) => !n.read && n.uid === uid)
    if (unread.length === 0) return
    const batch = writeBatch(db)
    for (const n of unread) {
      batch.update(doc(db, 'notifications', n.id), { read: true, readAt: serverTimestamp() })
    }
    await batch.commit()
  },
}))
