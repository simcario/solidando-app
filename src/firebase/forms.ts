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
import type { Form, FormNode, FormEdge } from '../types/form'
import { nanoid } from 'nanoid'

export async function createForm(workspaceId: string, userId: string, title = 'Untitled Form'): Promise<string> {
  const ref = await addDoc(collection(db, 'forms'), {
    title,
    description: '',
    createdBy: userId,
    workspaceId,
    published: false,
    slug: nanoid(10),
    theme: { primaryColor: '#002068', font: 'Plus Jakarta Sans' },
    settings: { mode: 'classic', requireAuth: false },
    nodes: [],
    edges: [],
    version: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getForms(workspaceId: string, userId?: string, allForms = false): Promise<Form[]> {
  let q
  if (allForms) {
    q = query(collection(db, 'forms'), orderBy('updatedAt', 'desc'))
  } else if (userId) {
    q = query(collection(db, 'forms'), where('createdBy', '==', userId))
  } else {
    q = query(collection(db, 'forms'), where('workspaceId', '==', workspaceId), orderBy('updatedAt', 'desc'))
  }
  const snap = await getDocs(q)
  const forms = snap.docs.map(d => ({ id: d.id, ...d.data() } as Form))
  if (userId) {
    forms.sort((a, b) => {
      const aTime = a.updatedAt?.toDate?.()?.getTime() ?? 0
      const bTime = b.updatedAt?.toDate?.()?.getTime() ?? 0
      return bTime - aTime
    })
  }
  return forms
}

export async function getForm(formId: string): Promise<Form | null> {
  const snap = await getDoc(doc(db, 'forms', formId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Form
}

export async function updateForm(formId: string, data: Partial<Form> | Record<string, unknown>) {
  await updateDoc(doc(db, 'forms', formId), { ...data, updatedAt: serverTimestamp() })
}

export async function updateFormNodes(formId: string, nodes: FormNode[], edges: FormEdge[]) {
  await updateDoc(doc(db, 'forms', formId), { nodes, edges, updatedAt: serverTimestamp() })
}

export async function publishForm(formId: string, published: boolean) {
  await updateDoc(doc(db, 'forms', formId), { published, updatedAt: serverTimestamp() })
}

export async function deleteForm(formId: string) {
  await deleteDoc(doc(db, 'forms', formId))
}

export async function duplicateForm(formId: string, userId: string): Promise<string> {
  const original = await getForm(formId)
  if (!original) throw new Error('Form not found')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, _responseCount: _rc, ...rest } = original as Form & { _responseCount?: number }
  const ref = await addDoc(collection(db, 'forms'), {
    ...rest,
    title: `${original.title} (copia)`,
    published: false,
    slug: nanoid(10),
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
  })
  return ref.id
}
