import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth'
import { doc, getDocs, collection, updateDoc } from 'firebase/firestore'
import { auth, db } from './config'

const googleProvider = new GoogleAuthProvider()

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider)
  return cred.user
}

export async function logout() {
  await signOut(auth)
}

export async function getAllUsers(): Promise<import('../types/form').UserProfile[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map(d => d.data() as import('../types/form').UserProfile)
}

export async function setUserRole(uid: string, role: 'admin' | 'user') {
  await updateDoc(doc(db, 'users', uid), { role })
}
