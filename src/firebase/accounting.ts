import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import type { AccountingExpense, ManualIncome, WorkspaceIncome, ExpenseCategory, ManualIncomeMethod } from '../types/form'

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpenses(eventId: string): Promise<AccountingExpense[]> {
  const q = query(
    collection(db, 'event_expenses'),
    where('eventId', '==', eventId),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingExpense))
}

export async function addExpense(
  eventId: string,
  data: {
    description: string
    invoiceNumber?: string
    amount: number
    category: ExpenseCategory
    date: string
    notes?: string
  },
): Promise<string> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'event_expenses'), {
    eventId,
    ...clean,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateExpense(
  expenseId: string,
  data: Partial<Omit<AccountingExpense, 'id' | 'eventId' | 'createdAt'>>,
) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, 'event_expenses', expenseId), clean)
}

export async function deleteExpense(expenseId: string) {
  await deleteDoc(doc(db, 'event_expenses', expenseId))
}

// ─── Manual Incomes ───────────────────────────────────────────────────────────

export async function getManualIncomes(eventId: string): Promise<ManualIncome[]> {
  const q = query(
    collection(db, 'event_manual_incomes'),
    where('eventId', '==', eventId),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualIncome))
}

export async function addManualIncome(
  eventId: string,
  data: {
    description: string
    amount: number
    method: ManualIncomeMethod
    date: string
    notes?: string
  },
): Promise<string> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'event_manual_incomes'), {
    eventId,
    ...clean,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateManualIncome(
  incomeId: string,
  data: Partial<Omit<ManualIncome, 'id' | 'eventId' | 'createdAt'>>,
) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, 'event_manual_incomes', incomeId), clean)
}

export async function deleteManualIncome(incomeId: string) {
  await deleteDoc(doc(db, 'event_manual_incomes', incomeId))
}

// ─── Workspace-wide fetch (for AccountingPage) ────────────────────────────────

export async function getExpensesByWorkspace(eventIds: string[]): Promise<AccountingExpense[]> {
  if (eventIds.length === 0) return []
  // Firestore 'in' query max 30 items; chunk if needed
  const chunks: string[][] = []
  for (let i = 0; i < eventIds.length; i += 30) chunks.push(eventIds.slice(i, i + 30))
  const results: AccountingExpense[] = []
  for (const chunk of chunks) {
    const q = query(collection(db, 'event_expenses'), where('eventId', 'in', chunk))
    const snap = await getDocs(q)
    snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as AccountingExpense))
  }
  return results
}

export async function getManualIncomesByWorkspace(eventIds: string[]): Promise<ManualIncome[]> {
  if (eventIds.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < eventIds.length; i += 30) chunks.push(eventIds.slice(i, i + 30))
  const results: ManualIncome[] = []
  for (const chunk of chunks) {
    const q = query(collection(db, 'event_manual_incomes'), where('eventId', 'in', chunk))
    const snap = await getDocs(q)
    snap.docs.forEach(d => results.push({ id: d.id, ...d.data() } as ManualIncome))
  }
  return results
}

// ─── Workspace Incomes (non legate a eventi) ──────────────────────────────────

export async function getWorkspaceIncomes(workspaceId: string): Promise<WorkspaceIncome[]> {
  const q = query(
    collection(db, 'workspace_incomes'),
    where('workspaceId', '==', workspaceId),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkspaceIncome))
}

export async function addWorkspaceIncome(
  workspaceId: string,
  data: {
    description: string
    amount: number
    method: ManualIncomeMethod
    date: string
    notes?: string
  },
): Promise<string> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'workspace_incomes'), {
    workspaceId,
    ...clean,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateWorkspaceIncome(
  incomeId: string,
  data: Partial<Omit<WorkspaceIncome, 'id' | 'workspaceId' | 'createdAt'>>,
) {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  await updateDoc(doc(db, 'workspace_incomes', incomeId), clean)
}

export async function deleteWorkspaceIncome(incomeId: string) {
  await deleteDoc(doc(db, 'workspace_incomes', incomeId))
}

// ─── Real-time listeners ──────────────────────────────────────────────────────

export function subscribeExpenses(
  eventId: string,
  onData: (data: AccountingExpense[]) => void,
): () => void {
  const q = query(
    collection(db, 'event_expenses'),
    where('eventId', '==', eventId),
    orderBy('date', 'asc'),
  )
  return onSnapshot(q, snap =>
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingExpense))),
  )
}

export function subscribeManualIncomes(
  eventId: string,
  onData: (data: ManualIncome[]) => void,
): () => void {
  const q = query(
    collection(db, 'event_manual_incomes'),
    where('eventId', '==', eventId),
    orderBy('date', 'asc'),
  )
  return onSnapshot(q, snap =>
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as ManualIncome))),
  )
}

export function subscribeWorkspaceIncomes(
  workspaceId: string,
  onData: (data: WorkspaceIncome[]) => void,
): () => void {
  const q = query(
    collection(db, 'workspace_incomes'),
    where('workspaceId', '==', workspaceId),
    orderBy('date', 'asc'),
  )
  return onSnapshot(q, snap =>
    onData(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkspaceIncome))),
  )
}
