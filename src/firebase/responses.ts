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
  paymentMethod?: 'paypal' | 'in_person' | null,
  attendeeFieldIds?: string[] | null,
  skipSubmitterEmail?: boolean,
): Promise<string> {
  const uid = auth.currentUser?.uid ?? null
  const activeIds = (attendeeFieldIds && attendeeFieldIds.length > 0)
    ? attendeeFieldIds
    : attendeeFieldId ? [attendeeFieldId] : []
  const attendeeCount = activeIds.length > 0
    ? Math.max(1, activeIds.reduce((s, fid) => s + (Number(answers[fid] ?? 0) || 0), 0))
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
    ...(paymentMethod ? { paymentMethod } : {}),
    checkInStatus: 'not_checked_in',
    userId: uid,
    ...(eventId ? { eventId } : {}),
    attendeeCount,
    ...(skipSubmitterEmail ? { skipSubmitterEmail: true } : {}),
  })
  return ref.id
}

export async function updateResponsePaymentStatus(
  responseId: string,
  status: 'completed' | 'failed',
  paypalOrderId?: string,
  adminMarkPaid = false,
) {
  await updateDoc(doc(db, 'responses', responseId), {
    paymentStatus: status,
    ...(paypalOrderId ? { paypalOrderId } : {}),
    ...(adminMarkPaid ? { adminMarkPaid: true } : {}),
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

export async function resetCheckIn(responseId: string) {
  await updateDoc(doc(db, 'responses', responseId), {
    checkInStatus: 'not_checked_in',
    checkInAt: null,
  })
}

export async function resetPaymentStatus(responseId: string) {
  await updateDoc(doc(db, 'responses', responseId), {
    paymentStatus: 'pending',
  })
}

export async function clearReceiptNumber(responseId: string) {
  const { deleteField } = await import('firebase/firestore')
  await updateDoc(doc(db, 'responses', responseId), {
    receiptNumber: deleteField(),
  })
}

export async function updateResponseAnswers(
  responseId: string,
  answers: Record<string, unknown>,
  attendeeCount?: number,
  extra?: Record<string, unknown>,
) {
  await updateDoc(doc(db, 'responses', responseId), {
    answers,
    ...(attendeeCount != null ? { attendeeCount } : {}),
    ...(extra ?? {}),
  })
}
