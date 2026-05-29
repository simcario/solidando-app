import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from './config'
import type { Response } from '../types/form'

export async function getResponseCountsByUser(userId: string): Promise<Record<string, number>> {
  const q = query(collection(db, 'responses'), where('userId', '==', userId))
  const snap = await getDocs(q)
  const counts: Record<string, number> = {}
  snap.docs.forEach(d => {
    const formId = d.data().formId as string
    counts[formId] = (counts[formId] ?? 0) + 1
  })
  return counts
}

export async function getResponseCountsByForms(formIds: string[]): Promise<Record<string, number>> {
  if (formIds.length === 0) return {}
  const counts: Record<string, number> = {}
  await Promise.all(
    formIds.map(async formId => {
      const q = query(collection(db, 'responses'), where('formId', '==', formId))
      const snap = await getDocs(q)
      counts[formId] = snap.size
    })
  )
  return counts
}

export async function getRecentResponsesByForms(formIds: string[], limit = 5): Promise<Response[]> {
  if (formIds.length === 0) return []
  const results: Response[] = []
  await Promise.all(
    formIds.map(async formId => {
      const q = query(
        collection(db, 'responses'),
        where('formId', '==', formId),
        orderBy('submittedAt', 'desc'),
      )
      const snap = await getDocs(q)
      snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as Response))
    })
  )
  results.sort((a, b) => {
    const aT = a.submittedAt?.toDate?.()?.getTime() ?? 0
    const bT = b.submittedAt?.toDate?.()?.getTime() ?? 0
    return bT - aT
  })
  return results.slice(0, limit)
}

export async function submitResponse(
  formId: string,
  answers: Record<string, unknown>,
  paymentStatus: 'pending' | 'completed' | 'none' = 'pending',
  paymentAmount?: number | null,
  eventId?: string | null,
  attendeeFieldId?: string | null,
): Promise<string> {
  const uid = auth.currentUser?.uid ?? null
  const attendeeCount = attendeeFieldId
    ? Math.max(1, Number(answers[attendeeFieldId] ?? 1) || 1)
    : 1
  const ref = await addDoc(collection(db, 'responses'), {
    formId,
    answers,
    submittedAt: serverTimestamp(),
    duration: 0,
    device: navigator.userAgent,
    browser: navigator.appName,
    location: null,
    score: 0,
    paymentStatus,
    ...(paymentAmount != null ? { paymentAmount } : {}),
    checkInStatus: 'not_checked_in',
    userId: uid,
    ...(eventId ? { eventId } : {}),
    attendeeCount,
  })
  return ref.id
}

export async function updateResponsePaymentStatus(
  responseId: string,
  status: 'completed' | 'failed',
  paypalOrderId?: string,
) {
  await updateDoc(doc(db, 'responses', responseId), {
    paymentStatus: status,
    ...(paypalOrderId ? { paypalOrderId } : {}),
  })
}

export async function checkInResponse(responseId: string) {
  await updateDoc(doc(db, 'responses', responseId), {
    checkInStatus: 'checked_in',
    checkInAt: serverTimestamp(),
  })
}

export async function getMyResponses(userId: string): Promise<Response[]> {
  const q = query(
    collection(db, 'responses'),
    where('userId', '==', userId),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Response))
}

export async function getResponses(formId: string): Promise<Response[]> {
  const q = query(
    collection(db, 'responses'),
    where('formId', '==', formId),
    orderBy('submittedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Response))
}

export async function deleteResponse(responseId: string) {
  await deleteDoc(doc(db, 'responses', responseId))
}
