import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import { getEvents } from '../../firebase/events'
import { getResponses } from '../../firebase/responses'
import { getForms } from '../../firebase/forms'
import { getWorkspaceSettings } from '../../firebase/workspace'
import {
  addManualIncome,
  subscribeWorkspaceIncomes,
  subscribeExpenses,
  subscribeManualIncomes,
  addWorkspaceIncome,
  updateWorkspaceIncome,
  deleteWorkspaceIncome,
} from '../../firebase/accounting'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../components/ui/Toast'
import type { SolidandoEvent, Response, AccountingExpense, ManualIncome, WorkspaceIncome, Form, FiscalConfig } from '../../types/form'
import IncomeFormModal, { methodLabel, type IncomeFormData } from '../../components/accounting/IncomeFormModal'
import ReceiptsTab from '../../components/accounting/ReceiptsTab'

function fmtEur(n: number) {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

interface EventSummary {
  event: SolidandoEvent
  paymentIncome: number
  manualIncome: number
  totalIncome: number
  totalExpenses: number
  balance: number
  paidCount: number
}

type EditingWsIncome = { mode: 'new' } | { mode: 'edit'; income: WorkspaceIncome }

export default function AccountingPage() {
  const { profile, user } = useAuthStore()
  const workspaceId = profile?.workspaceIds?.[0] ?? user?.uid ?? ''

  const [events, setEvents] = useState<SolidandoEvent[]>([])
  const [allResponses, setAllResponses] = useState<Record<string, Response[]>>({})
  const [expenses, setExpenses] = useState<AccountingExpense[]>([])
  const [manualIncomes, setManualIncomes] = useState<ManualIncome[]>([])
  const [wsIncomes, setWsIncomes] = useState<WorkspaceIncome[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'accounting' | 'receipts'>('accounting')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [incomeModal, setIncomeModal] = useState<EditingWsIncome | 'event' | null>(null)
  const [confirmDeleteWs, setConfirmDeleteWs] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    let cancelled = false
    const eventListenerUnsubs: (() => void)[] = []

    Promise.all([
      getEvents(workspaceId),
      getForms(workspaceId),
      getWorkspaceSettings(workspaceId),
    ]).then(async ([evs, fms, ws]) => {
      if (cancelled) return
      setEvents(evs)
      setForms(fms)
      if (ws?.fiscal) setFiscal(ws.fiscal)

      const responseMap: Record<string, Response[]> = {}
      await Promise.all(
        evs.filter(e => e.formId).map(async e => {
          responseMap[e.id] = await getResponses(e.formId!)
        })
      )
      if (cancelled) return
      setAllResponses(responseMap)

      // Per ogni evento apri listener real-time su spese e entrate manuali
      const expMap: Record<string, AccountingExpense[]> = {}
      const incMap: Record<string, ManualIncome[]> = {}
      let pendingListeners = evs.length * 2
      function checkAllLoaded() {
        if (--pendingListeners <= 0) setLoading(false)
      }

      evs.forEach(ev => {
        const u1 = subscribeExpenses(ev.id, data => {
          expMap[ev.id] = data
          setExpenses(Object.values(expMap).flat())
          checkAllLoaded()
        })
        const u2 = subscribeManualIncomes(ev.id, data => {
          incMap[ev.id] = data
          setManualIncomes(Object.values(incMap).flat())
          checkAllLoaded()
        })
        eventListenerUnsubs.push(u1, u2)
      })

      if (evs.length === 0) setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })

    const unsubWs = subscribeWorkspaceIncomes(workspaceId, data => {
      if (!cancelled) setWsIncomes(data)
    })

    return () => {
      cancelled = true
      unsubWs()
      eventListenerUnsubs.forEach(u => u())
    }
  }, [workspaceId])

  const availableYears = useMemo(() => {
    const years = new Set<string>()
    events.forEach(e => { if (e.startDate) years.add(e.startDate.split('-')[0]) })
    return Array.from(years).sort().reverse()
  }, [events])

  const formsById = useMemo(() => {
    const map: Record<string, Form> = {}
    forms.forEach(f => { map[f.id] = f })
    return map
  }, [forms])

  const allResponsesFlat = useMemo(() =>
    Object.values(allResponses).flat(),
    [allResponses]
  )

  const summaries: EventSummary[] = useMemo(() => {
    return events
      .filter(e => yearFilter === 'all' || e.startDate?.startsWith(yearFilter))
      .map(event => {
        const responses = allResponses[event.id] ?? []
        const paymentIncome = responses
          .filter(r => r.paymentStatus === 'completed' && r.paymentAmount != null && r.paymentAmount > 0)
          .reduce((s, r) => s + (r.paymentAmount ?? 0), 0)
        const paidCount = responses.filter(r => r.paymentStatus === 'completed').length
        const manualIncome = manualIncomes
          .filter(i => i.eventId === event.id)
          .reduce((s, i) => s + i.amount, 0)
        const totalIncome = paymentIncome + manualIncome
        const totalExpenses = expenses
          .filter(ex => ex.eventId === event.id)
          .reduce((s, ex) => s + ex.amount, 0)
        const balance = totalIncome - totalExpenses
        return { event, paymentIncome, manualIncome, totalIncome, totalExpenses, balance, paidCount }
      })
  }, [events, allResponses, expenses, manualIncomes, yearFilter])

  const totalWsIncome = wsIncomes.reduce((s, i) => s + i.amount, 0)
  const grandEventIncome = summaries.reduce((s, e) => s + e.totalIncome, 0)
  const grandIncome = grandEventIncome + totalWsIncome
  const grandExpenses = summaries.reduce((s, e) => s + e.totalExpenses, 0)
  const grandBalance = grandIncome - grandExpenses

  // ── Handlers entrate generali ──────────────────────────────────────────────

  async function handleSaveWsIncome(data: IncomeFormData) {
    const { eventId, ...rest } = data
    const currentModal = incomeModal
    if (currentModal === 'event' && eventId) {
      await addManualIncome(eventId, rest)
      showToast("Entrata aggiunta all'evento", 'success')
    } else if (currentModal && typeof currentModal === 'object' && currentModal.mode === 'new') {
      await addWorkspaceIncome(workspaceId, rest)
      showToast('Fondo/entrata generale aggiunto', 'success')
    } else if (currentModal && typeof currentModal === 'object' && currentModal.mode === 'edit') {
      await updateWorkspaceIncome(currentModal.income.id, rest)
      showToast('Entrata aggiornata', 'success')
    }
  }

  async function handleDeleteWsIncome(id: string) {
    await deleteWorkspaceIncome(id)
    showToast('Entrata eliminata', 'success')
    setConfirmDeleteWs(null)
  }

  if (loading) {
    return (
      <AppLayout topBarTitle="Contabilità">
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout topBarTitle="Contabilità">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-[#002068]">Contabilità Generale</h1>
            <p className="text-sm text-[#747684] mt-1">Riepilogo entrate, uscite e ricevute fiscali</p>
          </div>
          {activeTab === 'accounting' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setIncomeModal({ mode: 'new' })}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#1a6b3a] text-white rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow"
              >
                <Icon name="savings" size={18} />
                Fondo / Entrata generale
              </button>
              <button
                onClick={() => setIncomeModal('event')}
                disabled={events.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow disabled:opacity-50"
              >
                <Icon name="add_card" size={18} />
                Entrata su evento
              </button>
              <div className="flex items-center gap-2">
                <Icon name="filter_list" size={18} className="text-[#747684]" />
                <select
                  value={yearFilter}
                  onChange={e => setYearFilter(e.target.value)}
                  className="bg-white border border-[#c4c5d5] rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                >
                  <option value="all">Tutti gli anni</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#e8e7f0] p-1 rounded-xl w-fit">
          {([
            { key: 'accounting', icon: 'account_balance_wallet', label: 'Contabilità' },
            { key: 'receipts', icon: 'receipt_long', label: 'Ricevute fiscali' },
          ] as const).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === key ? 'bg-white text-[#002068] shadow-sm' : 'text-[#444653] hover:text-[#002068]'
              }`}
            >
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'receipts' && (
          <ReceiptsTab
            responses={allResponsesFlat}
            formsById={formsById}
            fiscal={fiscal}
            workspaceId={workspaceId}
            onResponsesChange={updated => {
              // Ricostruisce allResponses dalla lista aggiornata
              const newMap: Record<string, Response[]> = {}
              events.forEach(e => {
                if (e.formId) {
                  newMap[e.id] = updated.filter(r => r.formId === e.formId)
                }
              })
              setAllResponses(newMap)
            }}
          />
        )}

        {activeTab === 'accounting' && (<>

        {/* KPI totali */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {totalWsIncome > 0 && (
            <div className="bg-[#dce1ff] border border-[#b3bef7] rounded-xl p-4">
              <p className="text-xs font-bold text-[#002068] uppercase tracking-widest mb-1">Fondo generale</p>
              <p className="text-2xl font-black text-[#002068]">{fmtEur(totalWsIncome)}</p>
              <p className="text-xs text-[#002068]/60 mt-1">{wsIncomes.length} voci</p>
            </div>
          )}
          <div className={`bg-[#e6f9ee] border border-[#86d8aa] rounded-xl p-4 ${totalWsIncome > 0 ? '' : 'col-span-1'}`}>
            <p className="text-xs font-bold text-[#1a6b3a] uppercase tracking-widest mb-1">Entrate eventi</p>
            <p className="text-2xl font-black text-[#1a6b3a]">{fmtEur(grandEventIncome)}</p>
            <p className="text-xs text-[#1a6b3a]/70 mt-1">{summaries.length} eventi</p>
          </div>
          <div className="bg-[#ffe8e8] border border-[#f5a5a5] rounded-xl p-4">
            <p className="text-xs font-bold text-[#8b0000] uppercase tracking-widest mb-1">Totale uscite</p>
            <p className="text-2xl font-black text-[#8b0000]">{fmtEur(grandExpenses)}</p>
          </div>
          <div className={`rounded-xl p-4 ${grandBalance >= 0 ? 'bg-[#002068] text-white' : 'bg-[#8b0000] text-white'}`}>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Saldo cassa</p>
            <p className="text-2xl font-black">{fmtEur(grandBalance)}</p>
            {totalWsIncome > 0 && (
              <p className="text-xs opacity-60 mt-1">incl. {fmtEur(totalWsIncome)} fondo</p>
            )}
          </div>
        </div>

        {/* Sezione fondo / entrate generali */}
        <div className="bg-white border border-[#c4c5d5] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 bg-[#f0f3ff] border-b border-[#c4c5d5] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="savings" size={18} className="text-[#002068]" />
              <h2 className="font-bold text-[#002068]">Fondo cassa &amp; entrate generali</h2>
              <span className="text-xs text-[#747684]">(non legate a un evento specifico)</span>
            </div>
            <button
              onClick={() => setIncomeModal({ mode: 'new' })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#002068] text-white rounded-lg text-xs font-bold hover:bg-[#003399] transition-all"
            >
              <Icon name="add" size={15} />
              Aggiungi
            </button>
          </div>

          {wsIncomes.length === 0 ? (
            <div className="py-10 text-center text-[#747684] text-sm">
              <Icon name="savings" size={32} className="mx-auto mb-2 text-[#c4c5d5]" />
              <p>Nessun fondo o entrata generale registrata.</p>
              <p className="text-xs mt-1">Usa questo spazio per fondo cassa iniziale, contributi, sponsorizzazioni, ecc.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#f0effe]">
                {wsIncomes.map(inc => (
                  <div key={inc.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                    <Icon name="savings" size={16} className="text-[#002068] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-[#1a1b22]">{inc.description}</span>
                      <span className="ml-2 text-xs text-[#747684]">{methodLabel(inc.method)}</span>
                      {inc.notes && <p className="text-xs text-[#747684] truncate mt-0.5">{inc.notes}</p>}
                    </div>
                    <span className="text-xs text-[#747684] shrink-0">{fmtDate(inc.date)}</span>
                    <span className="font-bold text-[#002068] shrink-0">{fmtEur(inc.amount)}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setIncomeModal({ mode: 'edit', income: inc })}
                        className="p-1.5 text-[#747684] hover:text-[#002068] rounded-lg hover:bg-[#f4f3fc] transition-all"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteWs(inc.id)}
                        className="p-1.5 text-[#747684] hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                      >
                        <Icon name="delete" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 bg-[#f0f3ff] border-t border-[#c4c5d5] flex justify-end">
                <span className="text-sm font-black text-[#002068]">Totale fondo: {fmtEur(totalWsIncome)}</span>
              </div>
            </>
          )}
        </div>

        {/* Tabella per evento */}
        <div className="bg-white border border-[#c4c5d5] rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#e8e7f0] flex items-center gap-2">
            <Icon name="list_alt" size={18} className="text-[#002068]" />
            <h2 className="font-bold text-[#002068]">Dettaglio per evento</h2>
          </div>

          {summaries.length === 0 ? (
            <div className="py-16 text-center text-[#747684]">
              <Icon name="event_busy" size={40} className="mx-auto mb-3 text-[#c4c5d5]" />
              <p className="font-semibold">Nessun evento nel periodo selezionato.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#eeedf6] border-b border-[#c4c5d5]">
                      <th className="px-5 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Evento</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Data</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider text-right">Pagamenti</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider text-right">Manuali</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#1a6b3a] uppercase tracking-wider text-right">Entrate</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#8b0000] uppercase tracking-wider text-right">Uscite</th>
                      <th className="px-5 py-3 text-xs font-bold text-[#002068] uppercase tracking-wider text-right">Saldo</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e7f0]">
                    {summaries.map(({ event, paymentIncome, manualIncome, totalIncome, totalExpenses, balance, paidCount }) => (
                      <tr key={event.id} className="hover:bg-[#faf8ff] transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-[#1a1b22] text-sm">{event.title}</p>
                          <p className="text-xs text-[#747684] mt-0.5">{paidCount} pagamenti confermati</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-[#747684]">{fmtDate(event.startDate)}</td>
                        <td className="px-5 py-4 text-sm text-right text-[#1a6b3a]">{fmtEur(paymentIncome)}</td>
                        <td className="px-5 py-4 text-sm text-right text-[#1a6b3a]">{fmtEur(manualIncome)}</td>
                        <td className="px-5 py-4 text-sm text-right font-bold text-[#1a6b3a]">{fmtEur(totalIncome)}</td>
                        <td className="px-5 py-4 text-sm text-right font-bold text-[#8b0000]">{fmtEur(totalExpenses)}</td>
                        <td className="px-5 py-4 text-right">
                          <span className={`font-black text-sm ${balance >= 0 ? 'text-[#002068]' : 'text-red-600'}`}>
                            {fmtEur(balance)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={`/events/${event.id}`}
                            state={{ tab: 'accounting' }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-all"
                          >
                            <Icon name="open_in_new" size={13} />
                            Dettaglio
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#eeedf6] border-t-2 border-[#c4c5d5] font-bold">
                      <td className="px-5 py-3 text-sm text-[#444653] font-black" colSpan={2}>TOTALE EVENTI</td>
                      <td className="px-5 py-3 text-sm text-right text-[#1a6b3a]">
                        {fmtEur(summaries.reduce((s, x) => s + x.paymentIncome, 0))}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-[#1a6b3a]">
                        {fmtEur(summaries.reduce((s, x) => s + x.manualIncome, 0))}
                      </td>
                      <td className="px-5 py-3 text-sm text-right font-black text-[#1a6b3a]">{fmtEur(grandEventIncome)}</td>
                      <td className="px-5 py-3 text-sm text-right font-black text-[#8b0000]">{fmtEur(grandExpenses)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-black text-sm ${(grandEventIncome - grandExpenses) >= 0 ? 'text-[#002068]' : 'text-red-600'}`}>
                          {fmtEur(grandEventIncome - grandExpenses)}
                        </span>
                      </td>
                      <td />
                    </tr>
                    {totalWsIncome > 0 && (
                      <tr className="bg-[#002068] text-white">
                        <td className="px-5 py-3 text-sm font-black" colSpan={4}>SALDO COMPLESSIVO (incl. fondo)</td>
                        <td className="px-5 py-3 text-sm text-right font-black">{fmtEur(grandIncome)}</td>
                        <td className="px-5 py-3 text-sm text-right font-black">{fmtEur(grandExpenses)}</td>
                        <td className="px-5 py-3 text-right font-black text-lg">{fmtEur(grandBalance)}</td>
                        <td />
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[#e8e7f0]">
                {summaries.map(({ event, totalIncome, totalExpenses, balance }) => (
                  <div key={event.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-[#1a1b22] text-sm">{event.title}</p>
                        <p className="text-xs text-[#747684]">{fmtDate(event.startDate)}</p>
                      </div>
                      <span className={`font-black text-lg ${balance >= 0 ? 'text-[#002068]' : 'text-red-600'}`}>
                        {fmtEur(balance)}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs mb-3">
                      <span className="flex-1 text-center py-1.5 bg-[#f4fff8] rounded-lg text-[#1a6b3a] font-semibold">
                        +{fmtEur(totalIncome)}
                      </span>
                      <span className="flex-1 text-center py-1.5 bg-[#fff5f5] rounded-lg text-[#8b0000] font-semibold">
                        −{fmtEur(totalExpenses)}
                      </span>
                    </div>
                    <Link
                      to={`/events/${event.id}`}
                      state={{ tab: 'accounting' }}
                      className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-all"
                    >
                      <Icon name="account_balance_wallet" size={14} />
                      Apri contabilità evento
                    </Link>
                  </div>
                ))}
                {/* Mobile saldo totale */}
                <div className={`mx-4 my-4 p-4 rounded-xl ${grandBalance >= 0 ? 'bg-[#002068]' : 'bg-[#8b0000]'} text-white flex justify-between items-center`}>
                  <span className="text-xs font-bold uppercase tracking-widest opacity-70">Saldo cassa totale</span>
                  <span className="font-black text-xl">{fmtEur(grandBalance)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Breakdown uscite per categoria */}
        {expenses.length > 0 && (
          <div className="bg-white border border-[#c4c5d5] rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-[#002068] flex items-center gap-2 mb-4">
              <Icon name="pie_chart" size={18} />
              Uscite per categoria
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(['venue', 'catering', 'marketing', 'staff', 'equipment', 'other'] as const).map(cat => {
                const relevantIds = new Set(summaries.map(s => s.event.id))
                const total = expenses
                  .filter(ex => ex.category === cat && relevantIds.has(ex.eventId))
                  .reduce((s, ex) => s + ex.amount, 0)
                if (total === 0) return null
                const catMap = {
                  venue: { label: 'Location', icon: 'location_city' },
                  catering: { label: 'Catering', icon: 'restaurant' },
                  marketing: { label: 'Marketing', icon: 'campaign' },
                  staff: { label: 'Staff', icon: 'badge' },
                  equipment: { label: 'Attrezzatura', icon: 'build' },
                  other: { label: 'Altro', icon: 'more_horiz' },
                } as const
                const { label, icon } = catMap[cat]
                return (
                  <div key={cat} className="flex items-center gap-3 p-3 bg-[#fafafa] border border-[#e8e7f0] rounded-xl">
                    <Icon name={icon} size={20} className="text-[#747684] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-[#747684]">{label}</p>
                      <p className="font-black text-[#8b0000] text-sm">{fmtEur(total)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        </>)}

      </div>

      {/* Modal entrata generale */}
      {incomeModal !== null && incomeModal !== 'event' && (
        <IncomeFormModal
          initial={incomeModal.mode === 'edit' ? {
            description: incomeModal.income.description,
            amount: incomeModal.income.amount,
            method: incomeModal.income.method,
            date: incomeModal.income.date,
            notes: incomeModal.income.notes,
          } : undefined}
          onSave={handleSaveWsIncome}
          onClose={() => setIncomeModal(null)}
        />
      )}

      {/* Modal entrata su evento specifico */}
      {incomeModal === 'event' && (
        <IncomeFormModal
          events={events}
          onSave={handleSaveWsIncome}
          onClose={() => setIncomeModal(null)}
        />
      )}

      {/* Confirm delete fondo generale */}
      {confirmDeleteWs && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <Icon name="warning" size={36} className="text-red-500 mx-auto mb-3" />
            <p className="font-bold text-[#1a1b22] mb-1">Conferma eliminazione</p>
            <p className="text-sm text-[#747684] mb-5">Questa operazione è irreversibile.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteWs(null)}
                className="flex-1 py-2.5 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-[#f4f3fc]"
              >
                Annulla
              </button>
              <button
                onClick={() => handleDeleteWsIncome(confirmDeleteWs)}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
