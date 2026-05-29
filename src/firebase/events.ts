import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import type { SolidandoEvent, TicketType, Response } from '../types/form'
import { nanoid } from 'nanoid'

export async function createEvent(workspaceId: string, userId: string): Promise<string> {
  const defaultTicket: TicketType = {
    id: nanoid(6),
    label: 'Standard',
    price: 0,
    currency: 'EUR',
    capacity: null,
  }
  const ref = await addDoc(collection(db, 'events'), {
    title: 'Nuovo Evento',
    description: '',
    location: '',
    startDate: '',
    startTime: '',
    status: 'draft',
    totalCapacity: null,
    ticketTypes: [defaultTicket],
    workspaceId,
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getEvents(workspaceId: string, allEvents = false): Promise<SolidandoEvent[]> {
  const q = allEvents
    ? query(collection(db, 'events'), orderBy('createdAt', 'desc'))
    : query(collection(db, 'events'), where('workspaceId', '==', workspaceId), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SolidandoEvent))
}

export async function getEvent(eventId: string): Promise<SolidandoEvent | null> {
  const snap = await getDoc(doc(db, 'events', eventId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as SolidandoEvent
}

export async function updateEvent(eventId: string, data: Partial<SolidandoEvent> | Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, 'events', eventId), { ...clean, updatedAt: serverTimestamp() })
}

export async function deleteEvent(eventId: string) {
  await deleteDoc(doc(db, 'events', eventId))
}

export async function getEventByFormId(formId: string): Promise<SolidandoEvent | null> {
  const q = query(collection(db, 'events'), where('formId', '==', formId))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as SolidandoEvent
}

export async function getEventBookedCount(formId: string, attendeeFieldId?: string): Promise<number> {
  const q = query(collection(db, 'responses'), where('formId', '==', formId))
  const snap = await getDocs(q)
  if (!attendeeFieldId) return snap.size
  return snap.docs.reduce((sum, d) => {
    const val = Number((d.data().answers as Record<string, unknown>)?.[attendeeFieldId] ?? 1)
    return sum + (isNaN(val) || val < 1 ? 1 : val)
  }, 0)
}

export function countAttendees(responses: Response[], attendeeFieldId?: string): number {
  if (!attendeeFieldId) return responses.length
  return responses.reduce((sum, r) => {
    const val = Number((r.answers as Record<string, unknown>)?.[attendeeFieldId] ?? 1)
    return sum + (isNaN(val) || val < 1 ? 1 : val)
  }, 0)
}

export async function getPublishedEvents(): Promise<SolidandoEvent[]> {
  const q = query(
    collection(db, 'events'),
    where('status', '==', 'published'),
    orderBy('startDate', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SolidandoEvent))
}
