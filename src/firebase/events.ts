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

function sumAttendeeFields(answers: Record<string, unknown>, fieldIds: string[]): number {
  return fieldIds.reduce((sum, fid) => {
    const val = Number(answers[fid] ?? 0)
    return sum + (isNaN(val) || val < 1 ? 0 : val)
  }, 0)
}

export async function getEventBookedCount(
  formId: string,
  attendeeFieldId?: string,
  attendeeFieldIds?: string[],
): Promise<number> {
  const q = query(collection(db, 'responses'), where('formId', '==', formId))
  const snap = await getDocs(q)
  const fieldIds = attendeeFieldIds && attendeeFieldIds.length > 0
    ? attendeeFieldIds
    : attendeeFieldId ? [attendeeFieldId] : []
  if (fieldIds.length === 0) return snap.size
  return snap.docs.reduce((sum, d) => {
    const answers = (d.data().answers ?? {}) as Record<string, unknown>
    const val = sumAttendeeFields(answers, fieldIds)
    return sum + (val < 1 ? 1 : val)
  }, 0)
}

export function countAttendees(
  responses: Response[],
  attendeeFieldId?: string,
  attendeeFieldIds?: string[],
): number {
  const fieldIds = attendeeFieldIds && attendeeFieldIds.length > 0
    ? attendeeFieldIds
    : attendeeFieldId ? [attendeeFieldId] : []
  if (fieldIds.length === 0) return responses.length
  return responses.reduce((sum, r) => {
    const answers = (r.answers ?? {}) as Record<string, unknown>
    const val = sumAttendeeFields(answers, fieldIds)
    return sum + (val < 1 ? 1 : val)
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
