import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import { showToast } from '../ui/Toast'
import {
  subscribeExpenses, subscribeManualIncomes,
  addExpense, updateExpense, deleteExpense,
  addManualIncome, updateManualIncome, deleteManualIncome,
} from '../../firebase/accounting'
import type { AccountingExpense, ManualIncome, ExpenseCategory, Response, Form } from '../../types/form'
import IncomeFormModal, { methodLabel, type IncomeFormData } from './IncomeFormModal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; icon: string }[] = [
  { value: 'venue', label: 'Location / Spazio', icon: 'location_city' },
  { value: 'catering', label: 'Catering / Ristorazione', icon: 'restaurant' },
  { value: 'marketing', label: 'Marketing / Comunicazione', icon: 'campaign' },
  { value: 'staff', label: 'Personale / Staff', icon: 'badge' },
  { value: 'equipment', label: 'Attrezzatura / Materiali', icon: 'build' },
  { value: 'other', label: 'Altro', icon: 'more_horiz' },
]

function catLabel(cat: ExpenseCategory) {
  return EXPENSE_CATEGORIES.find(c => c.value === cat)?.label ?? cat
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtEur(n: number) {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// ─── Expense Form Modal ───────────────────────────────────────────────────────

interface ExpenseFormProps {
  initial?: Partial<AccountingExpense>
  onSave: (data: Omit<AccountingExpense, 'id' | 'eventId' | 'createdAt'>) => Promise<void>
  onClose: () => void
}

function ExpenseFormModal({ initial, onSave, onClose }: ExpenseFormProps) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber ?? '')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? 'other')
  const [date, setDate] = useState(initial?.date ?? today())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const inp = 'w-full px-3 py-2 border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none bg-white'
  const lbl = 'block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || !amount || isNaN(parseFloat(amount))) return
    setSaving(true)
    try {
      await onSave({
        description: description.trim(),
        invoiceNumber: invoiceNumber.trim() || undefined,
        amount: parseFloat(amount),
        category,
        date,
        notes: notes.trim() || undefined,
      })
      onClose()
    } catch {
      showToast('Errore nel salvataggio', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[#e8e7f0] flex items-center justify-between">
          <h3 className="font-bold text-[#002068] flex items-center gap-2">
            <Icon name="receipt_long" size={18} />
            {initial ? 'Modifica uscita' : 'Nuova uscita'}
          </h3>
          <button onClick={onClose} className="text-[#747684] hover:text-[#002068]">
            <Icon name="close" size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={lbl}>Descrizione *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className={inp} placeholder="es. Affitto sala conferenze" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Importo (€) *</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={inp} placeholder="0,00" required />
            </div>
            <div>
              <label className={lbl}>Data *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} required />
            </div>
          </div>
          <div>
            <label className={lbl}>Categoria</label>
            <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className={inp}>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>N° Fattura / Ricevuta</label>
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className={inp} placeholder="es. FT-2026-0042" />
          </div>
          <div>
            <label className={lbl}>Note</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Note aggiuntive…" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-[#f4f3fc] transition-all">
              Annulla
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#002068] text-white rounded-xl text-sm font-bold hover:bg-[#003399] transition-all disabled:opacity-50">
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main AccountingTab ───────────────────────────────────────────────────────

interface AccountingTabProps {
  eventId: string
  responses: Response[]
  forms?: Form[]
  formId?: string
}

type ActiveTab = 'entrate' | 'uscite'

type ActiveModal =
  | { type: 'new_expense' }
  | { type: 'edit_expense'; expense: AccountingExpense }
  | { type: 'new_income' }
  | { type: 'edit_income'; income: ManualIncome }
  | null

function getResponseName(response: Response, forms: Form[], formId?: string): string | null {
  const form = forms.find(f => f.id === (formId ?? response.formId))
  if (!form) return null
  const answers = (response.answers ?? {}) as Record<string, unknown>
  for (const node of (form.nodes ?? [])) {
    const val = answers[node.id]
    if (!val) continue
    if (node.type === 'short_text' && typeof val === 'string') return val.trim()
    if (node.type === 'email' && typeof val === 'string') return val.trim()
  }
  return null
}

export default function AccountingTab({ eventId, responses, forms = [], formId }: AccountingTabProps) {
  const [expenses, setExpenses] = useState<AccountingExpense[]>([])
  const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>('entrate')
  const [modal, setModal] = useState<ActiveModal>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'expense' | 'income'; id: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    let expLoaded = false
    let incLoaded = false
    function checkDone() {
      if (expLoaded && incLoaded) setLoading(false)
    }
    const unsubExp = subscribeExpenses(eventId, data => {
      setExpenses(data)
      expLoaded = true
      checkDone()
    })
    const unsubInc = subscribeManualIncomes(eventId, data => {
      setManualIncomes(data)
      incLoaded = true
      checkDone()
    })
    return () => { unsubExp(); unsubInc() }
  }, [eventId])

  const paymentIncomes = responses.filter(r => r.paymentStatus === 'completed' && r.paymentAmount != null && r.paymentAmount > 0)
  const totalPaymentIncome = paymentIncomes.reduce((s, r) => s + (r.paymentAmount ?? 0), 0)
  const inPersonPending = responses.filter(r => r.paymentMethod === 'in_person' && r.paymentStatus === 'pending' && r.paymentAmount != null && r.paymentAmount > 0)

  const totalManualIncome = manualIncomes.reduce((s, i) => s + i.amount, 0)
  const totalIncome = totalPaymentIncome + totalManualIncome
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const balance = totalIncome - totalExpenses

  async function handleAddExpense(data: Omit<AccountingExpense, 'id' | 'eventId' | 'createdAt'>) {
    await addExpense(eventId, data)
    showToast('Uscita aggiunta', 'success')
  }

  async function handleEditExpense(expenseId: string, data: Omit<AccountingExpense, 'id' | 'eventId' | 'createdAt'>) {
    await updateExpense(expenseId, data)
    showToast('Uscita aggiornata', 'success')
  }

  async function handleDeleteExpense(expenseId: string) {
    await deleteExpense(expenseId)
    showToast('Uscita eliminata', 'success')
    setConfirmDelete(null)
  }

  async function handleAddIncome(data: IncomeFormData) {
    const { eventId: _eid, ...rest } = data
    await addManualIncome(eventId, rest)
    showToast('Entrata aggiunta', 'success')
  }

  async function handleEditIncome(incomeId: string, data: IncomeFormData) {
    const { eventId: _eid, ...rest } = data
    await updateManualIncome(incomeId, rest)
    showToast('Entrata aggiornata', 'success')
  }

  async function handleDeleteIncome(incomeId: string) {
    await deleteManualIncome(incomeId)
    showToast('Entrata eliminata', 'success')
    setConfirmDelete(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── KPI ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveTab('entrate')}
          className={`text-left bg-[#e6f9ee] border rounded-xl p-4 transition-all ${activeTab === 'entrate' ? 'border-[#1a6b3a] ring-2 ring-[#1a6b3a]/30' : 'border-[#86d8aa]'}`}
        >
          <p className="text-xs font-bold text-[#1a6b3a] uppercase tracking-widest mb-1">Totale entrate</p>
          <p className="text-3xl font-black text-[#1a6b3a]">{fmtEur(totalIncome)}</p>
          <p className="text-xs text-[#1a6b3a]/70 mt-1">
            {fmtEur(totalPaymentIncome)} pagamenti · {fmtEur(totalManualIncome)} manuali
          </p>
        </button>
        <button
          onClick={() => setActiveTab('uscite')}
          className={`text-left bg-[#ffe8e8] border rounded-xl p-4 transition-all ${activeTab === 'uscite' ? 'border-[#8b0000] ring-2 ring-[#8b0000]/30' : 'border-[#f5a5a5]'}`}
        >
          <p className="text-xs font-bold text-[#8b0000] uppercase tracking-widest mb-1">Totale uscite</p>
          <p className="text-3xl font-black text-[#8b0000]">{fmtEur(totalExpenses)}</p>
          <p className="text-xs text-[#8b0000]/70 mt-1">{expenses.length} voci registrate</p>
        </button>
        <div className={`${balance >= 0 ? 'bg-[#002068]' : 'bg-[#8b0000]'} text-white rounded-xl p-4`}>
          <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Saldo cassa</p>
          <p className="text-3xl font-black">{fmtEur(balance)}</p>
          <p className="text-xs opacity-60 mt-1">{balance >= 0 ? 'In positivo' : 'In negativo'}</p>
        </div>
      </div>

      {inPersonPending.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-[#fff4e0] border border-[#ffc87d] rounded-xl text-sm text-[#8f4e00]">
          <Icon name="info" size={18} className="shrink-0 mt-0.5" />
          <span>
            <strong>{inPersonPending.length}</strong> iscritti con pagamento "in persona" ancora in attesa di conferma. Segna come pagati dalla tab Partecipanti per includerli nelle entrate.
          </span>
        </div>
      )}

      {/* ── Tab container ────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#c4c5d5] rounded-xl overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-[#c4c5d5]">
          <button
            onClick={() => setActiveTab('entrate')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold transition-all ${
              activeTab === 'entrate'
                ? 'text-[#1a6b3a] bg-[#f4fff8] border-b-2 border-[#1a6b3a]'
                : 'text-[#747684] hover:bg-[#fafafa]'
            }`}
          >
            <Icon name="trending_up" size={17} />
            Entrate
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'entrate' ? 'bg-[#1a6b3a] text-white' : 'bg-[#e8e7f0] text-[#444653]'
            }`}>
              {paymentIncomes.length + manualIncomes.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('uscite')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold transition-all ${
              activeTab === 'uscite'
                ? 'text-[#8b0000] bg-[#fff5f5] border-b-2 border-[#8b0000]'
                : 'text-[#747684] hover:bg-[#fafafa]'
            }`}
          >
            <Icon name="trending_down" size={17} />
            Uscite
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'uscite' ? 'bg-[#8b0000] text-white' : 'bg-[#e8e7f0] text-[#444653]'
            }`}>
              {expenses.length}
            </span>
          </button>
        </div>

        {/* ── Pannello Entrate ─────────────────────────────────────────────── */}
        {activeTab === 'entrate' && (
          <div>
            <div className="px-5 py-3 bg-[#fafafa] border-b border-[#e8e7f0] flex justify-end">
              <button
                onClick={() => setModal({ type: 'new_income' })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a6b3a] text-white rounded-lg text-xs font-bold hover:bg-[#145530] transition-all"
              >
                <Icon name="add" size={15} />
                Entrata manuale
              </button>
            </div>

            {paymentIncomes.length > 0 && (
              <div className="border-b border-[#e8e7f0]">
                <p className="px-5 py-2.5 text-xs font-bold text-[#747684] uppercase tracking-wider bg-[#fafafa]">
                  Pagamenti online / in persona (confermati)
                </p>
                <div className="divide-y divide-[#f0effe]">
                  {paymentIncomes.map(r => {
                    const personName = getResponseName(r, forms, formId)
                    return (
                      <div key={r.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                        <span title={r.paymentMethod === 'paypal' ? 'PayPal' : 'Contanti / In persona'}>
                          <Icon
                            name={r.paymentMethod === 'paypal' ? 'credit_card' : 'payments'}
                            size={16}
                            className="text-[#747684] shrink-0"
                          />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {personName && (
                              <span className="text-xs font-semibold text-[#002068] bg-[#dce1ff] px-2 py-0.5 rounded-full">{personName}</span>
                            )}
                            {r.receiptNumber && (
                              <span className="text-xs text-[#747684]">#{r.receiptNumber}</span>
                            )}
                          </div>
                          {r.paypalOrderId && (
                            <span className="text-xs text-[#c4c5d5] font-mono hidden sm:inline">{r.paypalOrderId.slice(0, 12)}…</span>
                          )}
                        </div>
                        <span className="text-xs text-[#747684] shrink-0">{r.submittedAt?.toDate ? fmtDate(r.submittedAt.toDate().toISOString().split('T')[0]) : '—'}</span>
                        <span className="font-bold text-[#1a6b3a] shrink-0">{fmtEur(r.paymentAmount ?? 0)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {manualIncomes.length > 0 && (
              <div>
                <p className="px-5 py-2.5 text-xs font-bold text-[#747684] uppercase tracking-wider bg-[#fafafa]">
                  Entrate manuali (contanti, bonifico, altro)
                </p>
                <div className="divide-y divide-[#f0effe]">
                  {manualIncomes.map(inc => (
                    <div key={inc.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                      <Icon name="savings" size={16} className="text-[#747684] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-[#1a1b22]">{inc.description}</span>
                        <span className="ml-2 text-xs text-[#747684]">{methodLabel(inc.method)}</span>
                        {inc.notes && <p className="text-xs text-[#747684] truncate mt-0.5">{inc.notes}</p>}
                      </div>
                      <span className="text-xs text-[#747684] shrink-0">{fmtDate(inc.date)}</span>
                      <span className="font-bold text-[#1a6b3a] shrink-0">{fmtEur(inc.amount)}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setModal({ type: 'edit_income', income: inc })}
                          className="p-1.5 text-[#747684] hover:text-[#002068] rounded-lg hover:bg-[#f4f3fc] transition-all"
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'income', id: inc.id })}
                          className="p-1.5 text-[#747684] hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                        >
                          <Icon name="delete" size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paymentIncomes.length === 0 && manualIncomes.length === 0 && (
              <div className="py-10 text-center text-[#747684] text-sm">
                <Icon name="trending_up" size={32} className="mx-auto mb-2 text-[#c4c5d5]" />
                <p>Nessuna entrata registrata.</p>
                <p className="text-xs mt-1">Aggiungi un'entrata manuale o attendi pagamenti confermati.</p>
              </div>
            )}

            <div className="px-5 py-3 bg-[#f4fff8] border-t border-[#c4c5d5] flex justify-end">
              <span className="text-sm font-black text-[#1a6b3a]">Totale entrate: {fmtEur(totalIncome)}</span>
            </div>
          </div>
        )}

        {/* ── Pannello Uscite ──────────────────────────────────────────────── */}
        {activeTab === 'uscite' && (
          <div>
            <div className="px-5 py-3 bg-[#fafafa] border-b border-[#e8e7f0] flex justify-end">
              <button
                onClick={() => setModal({ type: 'new_expense' })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8b0000] text-white rounded-lg text-xs font-bold hover:bg-[#6b0000] transition-all"
              >
                <Icon name="add" size={15} />
                Nuova uscita
              </button>
            </div>

            {expenses.length > 0 ? (
              <>
                <div className="divide-y divide-[#f0effe]">
                  {expenses.map(exp => (
                    <div key={exp.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                      <Icon name="receipt_long" size={16} className="text-[#747684] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-[#1a1b22]">{exp.description}</span>
                          <span className="text-xs px-2 py-0.5 bg-[#e8e7f0] text-[#444653] rounded-full">{catLabel(exp.category)}</span>
                          {exp.invoiceNumber && (
                            <span className="text-xs text-[#747684] font-mono">{exp.invoiceNumber}</span>
                          )}
                        </div>
                        {exp.notes && <p className="text-xs text-[#747684] truncate mt-0.5">{exp.notes}</p>}
                      </div>
                      <span className="text-xs text-[#747684] shrink-0">{fmtDate(exp.date)}</span>
                      <span className="font-bold text-[#8b0000] shrink-0">{fmtEur(exp.amount)}</span>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setModal({ type: 'edit_expense', expense: exp })}
                          className="p-1.5 text-[#747684] hover:text-[#002068] rounded-lg hover:bg-[#f4f3fc] transition-all"
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete({ type: 'expense', id: exp.id })}
                          className="p-1.5 text-[#747684] hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                        >
                          <Icon name="delete" size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-[#fafafa] border-t border-[#e8e7f0]">
                  <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-2">Per categoria</p>
                  <div className="flex flex-wrap gap-2">
                    {EXPENSE_CATEGORIES.map(cat => {
                      const total = expenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount, 0)
                      if (total === 0) return null
                      return (
                        <div key={cat.value} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8e7f0] rounded-lg text-xs">
                          <Icon name={cat.icon} size={13} className="text-[#747684]" />
                          <span className="text-[#444653]">{cat.label}</span>
                          <span className="font-bold text-[#8b0000] ml-1">{fmtEur(total)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-[#747684] text-sm">
                <Icon name="receipt_long" size={32} className="mx-auto mb-2 text-[#c4c5d5]" />
                <p>Nessuna uscita registrata.</p>
              </div>
            )}

            <div className="px-5 py-3 bg-[#fff5f5] border-t border-[#c4c5d5] flex justify-end">
              <span className="text-sm font-black text-[#8b0000]">Totale uscite: {fmtEur(totalExpenses)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Saldo finale ─────────────────────────────────────────────────── */}
      <div className={`rounded-xl p-5 flex items-center justify-between ${balance >= 0 ? 'bg-[#002068] text-white' : 'bg-[#8b0000] text-white'}`}>
        <div className="flex items-center gap-3">
          <Icon name={balance >= 0 ? 'account_balance_wallet' : 'money_off'} size={28} />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Saldo cassa evento</p>
            <p className="text-xs opacity-60 mt-0.5">Entrate {fmtEur(totalIncome)} − Uscite {fmtEur(totalExpenses)}</p>
          </div>
        </div>
        <p className="text-4xl font-black">{fmtEur(balance)}</p>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {modal?.type === 'new_expense' && (
        <ExpenseFormModal
          onSave={async data => { await handleAddExpense(data) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit_expense' && (
        <ExpenseFormModal
          initial={modal.expense}
          onSave={async data => { await handleEditExpense(modal.expense.id, data) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'new_income' && (
        <IncomeFormModal
          defaultEventId={eventId}
          onSave={async data => { await handleAddIncome(data) }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'edit_income' && (
        <IncomeFormModal
          initial={modal.income}
          defaultEventId={eventId}
          onSave={async data => { await handleEditIncome(modal.income.id, data) }}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Confirm delete ───────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Icon name="warning" size={36} className="text-red-500 mx-auto mb-3" />
            <p className="font-bold text-[#1a1b22] mb-1">Conferma eliminazione</p>
            <p className="text-sm text-[#747684] mb-5">
              Questa operazione è irreversibile.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-[#f4f3fc]"
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'expense') handleDeleteExpense(confirmDelete.id)
                  else handleDeleteIncome(confirmDelete.id)
                }}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
