import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDocFromServer } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { useAuthStore } from '../stores/authStore'
import type { UserProfile } from '../types/form'

async function fetchProfile(uid: string, maxAttempts = 8): Promise<UserProfile | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Always read from server to avoid stale cache (e.g. missing role field)
      const snap = await getDocFromServer(doc(db, 'users', uid))
      console.log('[auth] fetchProfile attempt', i, 'exists:', snap.exists(), 'data:', snap.exists() ? snap.data() : null)
      if (snap.exists()) return snap.data() as UserProfile
      // Document doesn't exist yet — wait and retry (write may be in-flight)
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)))
    } catch (e) {
      console.warn('[auth] fetchProfile attempt', i, 'error:', e)
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
  return null
}

export function useAuthListener() {
  const { resolveAuth, setUser } = useAuthStore()

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      console.log('[auth] onAuthStateChanged uid:', user?.uid ?? null)
      if (user) {
        setUser(user)
        const profile = await fetchProfile(user.uid)
        console.log('[auth] resolveAuth profile.role:', profile?.role ?? null)
        resolveAuth(user, profile)
      } else {
        resolveAuth(null, null)
      }
    })
    return unsub
  }, [resolveAuth, setUser])
}
