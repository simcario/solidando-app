import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { getForm } from '../../firebase/forms'
import { getResponses, deleteResponse, updateResponsePaymentStatus } from '../../firebase/responses'
import { getWorkspaceSettings } from '../../firebase/workspace'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../components/ui/Toast'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../firebase/config'
import ReceiptDocument from '../../components/receipts/ReceiptDocument'
import type { Form, Response, FiscalConfig } from '../../types/form'
import type { ReceiptData } from '../../components/receipts/ReceiptDocument'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']

function buildWeeklyChart(responses: Response[]): { day: string; count: number }[] {
  const today = new Date()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    return { date: d, key: d.toDateString(), day: DAY_LABELS[d.getDay()], count: 0 }
  })
  responses.forEach(r => {
    const ts = r.submittedAt?.toDate?.()
    if (!ts) return
    const key = ts.toDateString()
    const slot = days.find(d => d.key === key)
    if (slot) slot.count++
  })
  return days.map(({ day, count }) => ({ day, count }))
}

function extractSearchText(answers: Record<string, unknown>): string {
  return Object.values(answers ?? {}).map(v => String(v ?? '')).join(' ').toLowerCase()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Modale Ricevuta ─────────────────────────────────────────────────────────

interface ReceiptModalState {
  responseId: string
  recipientEmail: string
  receipt: ReceiptData
  fiscal: FiscalConfig
  sendReceipt: boolean
  mode: 'markPaid' | 'sendCopy' | 'generate'
}

export default function ResponsesPage() {
  const { formId } = useParams<{ formId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [form, setForm] = useState<Form | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [filterPayment, setFilterPayment] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null)

  // Modale ricevuta
  const [receiptModal, setReceiptModal] = useState<ReceiptModalState | null>(null)
  const [sendingReceipt, setSendingReceipt] = useState(false)

  useEffect(() => {
    if (!formId) return
    Promise.all([
      getForm(formId).catch(() => null),
      getResponses(formId).catch(() => [] as Response[]),
    ]).then(([f, r]) => {
      setForm(f)
      setResponses(r)
      setLoading(false)
    })
  }, [formId])

  useEffect(() => {
    if (!profile) return
    const workspaceId = profile.workspaceIds?.[0] || profile.uid
    getWorkspaceSettings(workspaceId).then(ws => {
      if (ws.fiscal) setFiscal({ ...ws.fiscal })
    }).catch(() => {})
  }, [profile])

  // ── Dati derivati ────────────────────────────────────────────────────────
  const weeklyChart = useMemo(() => buildWeeklyChart(responses), [responses])
  const chartMax = Math.max(...weeklyChart.map(d => d.count), 1)

  const completedCount = responses.filter(r => r.paymentStatus === 'completed').length
  const pendingCount = responses.filter(r => r.paymentStatus === 'pending').length
  const checkedInCount = responses.filter(r => r.checkInStatus === 'checked_in').length
  const hasPayment = form?.nodes?.some(n => n.type === 'payment') ?? false
  const completionRate = responses.length === 0
    ? 0
    : hasPayment
      ? Math.round((completedCount / responses.length) * 100)
      : 100

  const filtered = useMemo(() => {
    const text = filterText.toLowerCase()
    return responses.filter(r => {
      const textMatch = !text || extractSearchText(r.answers as Record<string, unknown>).includes(text)
      const paymentMatch = filterPayment === 'all' || r.paymentStatus === filterPayment
      return textMatch && paymentMatch
    })
  }, [responses, filterText, filterPayment])

  // ── Selezione ─────────────────────────────────────────────────────────────
  const filteredIds = useMemo(() => filtered.map(r => r.id), [filtered])
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id))

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(s => { const next = new Set(s); filteredIds.forEach(id => next.delete(id)); return next })
    } else {
      setSelected(s => new Set([...s, ...filteredIds]))
    }
  }

  function toggleSelect(id: string) {
    setSelected(s => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    if (responses.length === 0) return
    const allKeys = Array.from(new Set(responses.flatMap(r => Object.keys(r.answers as object ?? {}))))
    const headers = ['ID', 'Data', ...allKeys, 'Stato Pagamento']
    const rows = responses.map(r => [
      r.id,
      r.submittedAt?.toDate?.().toISOString() ?? '',
      ...allKeys.map(k => String((r.answers as Record<string, unknown>)?.[k] ?? '')),
      r.paymentStatus,
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `risposte-${formId}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questa risposta?')) return
    await deleteResponse(id)
    setResponses(r => r.filter(x => x.id !== id))
    setSelected(s => { const next = new Set(s); next.delete(id); return next })
  }

  function buildReceiptDataFromResponse(response: Response): ReceiptData {
    const nodes = form?.nodes ?? []
    let recipientName = ''
    let recipientEmail = ''
    for (const node of nodes) {
      const val = (response.answers as Record<string, unknown>)?.[node.id]
      if (!val) continue
      if (!recipientName && node.type === 'short_text' && typeof val === 'string') {
        recipientName = val.trim()
      }
      if (!recipientEmail && node.type === 'email' && typeof val === 'string') {
        recipientEmail = val.trim()
      }
    }
    if (!recipientName) recipientName = recipientEmail || 'N/D'

    // Numero ricevuta provvisorio (sarà definitivo dopo saveResponsePaymentStatus)
    const today = new Date()
    const year = today.getFullYear()
    const receiptNumber = response.receiptNumber ?? `????/${year}`

    return {
      receiptNumber,
      receiptDate: today.toISOString().split('T')[0],
      recipientName,
      recipientEmail,
      amount: response.paymentAmount ?? 0,
      currency: 'EUR',
      eventTitle: form?.title ?? 'Iscrizione',
      paymentMethod: response.paymentMethod === 'paypal' ? 'PayPal' : response.paymentMethod === 'in_person' ? 'Contanti / Persona' : 'N/D',
      paypalOrderId: response.paypalOrderId,
    }
  }

  function handleMarkPaid(response: Response) {
    if (!fiscal) {
      // Senza dati fiscali apri semplicemente il confirm classico
      openMarkPaidModal(response)
      return
    }
    openMarkPaidModal(response)
  }

  function openMarkPaidModal(response: Response) {
    const receiptData = buildReceiptDataFromResponse(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal: fiscal ?? { organizationName: '', fiscalCode: '', address: '', city: '', postalCode: '', province: '' },
      sendReceipt: !!fiscal?.organizationName,
      mode: 'markPaid',
    })
  }

  function handleSendCopy(response: Response) {
    if (!fiscal?.organizationName) {
      showToast('Configura prima i dati fiscali nelle Impostazioni', 'error')
      return
    }
    const receiptData = buildReceiptDataFromResponse(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal,
      sendReceipt: true,
      mode: 'sendCopy',
    })
  }

  function handleGenerate(response: Response) {
    if (!fiscal?.organizationName) {
      showToast('Configura prima i dati fiscali nelle Impostazioni', 'error')
      return
    }
    const receiptData = buildReceiptDataFromResponse(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal,
      sendReceipt: true,
      mode: 'generate',
    })
  }

  async function handleConfirmMarkPaid() {
    if (!receiptModal) return
    setSendingReceipt(true)
    try {
      await updateResponsePaymentStatus(receiptModal.responseId, 'completed', undefined, true)
      setResponses(r => r.map(x => x.id === receiptModal.responseId ? { ...x, paymentStatus: 'completed' as const } : x))
      if (receiptModal.sendReceipt && receiptModal.recipientEmail) {
        const functions = getFunctions(app, 'europe-west1')
        const sendReceiptFn = httpsCallable(functions, 'sendReceipt')
        await sendReceiptFn({ responseId: receiptModal.responseId, recipientEmail: receiptModal.recipientEmail })
        showToast('Pagamento segnato e ricevuta inviata', 'success')
      } else {
        showToast('Pagamento segnato come completato', 'success')
      }
      setReceiptModal(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore'
      showToast(msg, 'error')
    } finally {
      setSendingReceipt(false)
    }
  }

  async function handleConfirmSendCopy() {
    if (!receiptModal) return
    setSendingReceipt(true)
    try {
      const functions = getFunctions(app, 'europe-west1')
      const sendReceiptFn = httpsCallable(functions, 'sendReceipt')
      const result = await sendReceiptFn({
        responseId: receiptModal.responseId,
        recipientEmail: receiptModal.recipientEmail,
        sendEmail: receiptModal.sendReceipt,
      })
      const { receiptNumber } = result.data as { receiptNumber: string }
      if (receiptNumber) {
        setResponses(r => r.map(x => x.id === receiptModal.responseId ? { ...x, receiptNumber } : x))
      }
      const label = receiptModal.sendReceipt
        ? (receiptModal.mode === 'generate' ? 'Ricevuta generata e inviata' : `Ricevuta inviata a ${receiptModal.recipientEmail}`)
        : 'Ricevuta generata (email non inviata)'
      showToast(label, 'success')
      setReceiptModal(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore'
      showToast(msg, 'error')
    } finally {
      setSendingReceipt(false)
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Eliminare ${selected.size} rispost${selected.size === 1 ? 'a' : 'e'} selezionat${selected.size === 1 ? 'a' : 'e'}?`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => deleteResponse(id)))
      setResponses(r => r.filter(x => !selected.has(x.id)))
      setSelected(new Set())
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteAll() {
    if (responses.length === 0) return
    if (!confirm(`Eliminare TUTTE le ${responses.length} risposte? Questa azione non può essere annullata.`)) return
    setDeleting(true)
    try {
      await Promise.all(responses.map(r => deleteResponse(r.id)))
      setResponses([])
      setSelected(new Set())
    } finally {
      setDeleting(false)
    }
  }

  const paymentBadge = (status: Response['paymentStatus']) => {
    const map: Record<string, 'success' | 'warning' | 'error'> = {
      completed: 'success', pending: 'warning', failed: 'error',
    }
    const labels: Record<string, string> = { completed: 'Completato', pending: 'In attesa', failed: 'Fallito' }
    return <Badge variant={map[status]} dot>{labels[status]}</Badge>
  }

  const fieldLabels = useMemo(() => {
    const map: Record<string, string> = {}
    form?.nodes?.forEach(n => { map[n.id] = n.properties.label || n.id })
    return map
  }, [form])

  const answerKeys = useMemo(
    () => Array.from(new Set(responses.flatMap(r => Object.keys((r.answers as object) ?? {})))).slice(0, 4),
    [responses],
  )

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <p className="text-xs font-semibold text-[#747684] uppercase tracking-wider mb-1">
            {loading ? '…' : form?.title ?? formId}
          </p>
          <h1 className="text-4xl font-black text-[#002068]">Risposte</h1>
          <p className="text-[#444653] mt-1">
            {loading ? 'Caricamento…' : `${responses.length} rispost${responses.length === 1 ? 'a' : 'e'} ricevut${responses.length === 1 ? 'a' : 'e'}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {formId && (
            <button
              onClick={() => navigate(`/admin/checkin/${formId}`)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#fe9832] text-[#683700] rounded-lg font-bold text-sm hover:-translate-y-0.5 transition-all shadow-md"
            >
              <Icon name="qr_code_scanner" size={18} />
              Scanner Check-in
            </button>
          )}
          <button
            onClick={exportCSV}
            disabled={responses.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-lg font-bold text-sm hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-50"
          >
            <Icon name="download" size={18} />
            Esporta CSV
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={responses.length === 0 || deleting}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#ba1a1a] text-white rounded-lg font-bold text-sm hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-50"
          >
            <Icon name="delete_sweep" size={18} />
            Cancella tutto
          </button>
        </div>
      </div>

      {/* Bento Overview */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Chart settimanale */}
        <div className="col-span-12 lg:col-span-8 bg-white p-6 rounded-xl border border-[#c4c5d5] shadow-sm flex flex-col h-64">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-[#002068]">Andamento Ultimi 7 Giorni</h3>
            <div className="flex items-center gap-2 text-xs text-[#444653]">
              <span className="w-3 h-3 rounded-full bg-[#fe9832] inline-block" />
              Risposte giornaliere
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-end justify-between px-4 pb-2 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="w-full bg-[#e8e7f0] rounded-t-sm animate-pulse" style={{ height: `${30 + Math.random() * 50}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-end justify-between px-4 pb-2 gap-2">
              {weeklyChart.map(({ day, count }) => (
                <div key={day} className="w-full flex flex-col items-center group">
                  <span className="text-xs font-bold text-[#444653] mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>
                  <div
                    className="w-full bg-[#e8e7f0] rounded-t-sm group-hover:bg-[#fe9832] transition-colors min-h-[4px]"
                    style={{ height: `${(count / chartMax) * 100}%` }}
                  />
                  <span className="text-xs text-[#444653] mt-2">{day}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats KPI */}
        <div className="col-span-12 lg:col-span-4 grid grid-rows-3 gap-4">
          <div className="bg-[#002068] text-white p-5 rounded-xl flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">Totale Risposte</p>
              <h2 className="text-3xl font-black mt-1">
                {loading ? '…' : responses.length}
              </h2>
            </div>
            <div className="flex items-center text-xs text-[#ffb77a] mt-2">
              <Icon name="inbox" size={16} />
              <span className="ml-1">
                {loading ? '' : `${weeklyChart.reduce((s, d) => s + d.count, 0)} negli ultimi 7 giorni`}
              </span>
            </div>
          </div>
          <div className="bg-[#fe9832] text-[#683700] p-5 rounded-xl flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">
                {hasPayment ? 'Pagamenti Completati' : 'Tasso Completamento'}
              </p>
              <h2 className="text-3xl font-black mt-1">
                {loading ? '…' : hasPayment ? `${completedCount}` : `${completionRate}%`}
              </h2>
            </div>
            <div className="flex items-center text-xs mt-2">
              <Icon name="task_alt" size={16} />
              <span className="ml-1">
                {loading ? '' : hasPayment
                  ? `${pendingCount} in attesa`
                  : 'Tutte le risposte ricevute'}
              </span>
            </div>
          </div>
          <div className="bg-[#1a1b22] text-white p-5 rounded-xl flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest opacity-70">Check-in Effettuati</p>
              <h2 className="text-3xl font-black mt-1">
                {loading ? '…' : checkedInCount}
              </h2>
            </div>
            <div className="flex items-center text-xs text-[#8aa4ff] mt-2">
              <Icon name="qr_code_scanner" size={16} />
              <span className="ml-1">
                {loading ? '' : `${responses.length - checkedInCount} non ancora entrati`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#f4f3fc] p-4 rounded-xl border border-[#c4c5d5] flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444653]" />
            <input
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white rounded-lg border border-[#c4c5d5] text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              placeholder="Cerca nelle risposte..."
            />
          </div>
          {hasPayment && (
            <select
              value={filterPayment}
              onChange={e => setFilterPayment(e.target.value)}
              className="bg-white border border-[#c4c5d5] rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            >
              <option value="all">Stato: Tutti</option>
              <option value="completed">Completato</option>
              <option value="pending">In attesa</option>
              <option value="failed">Fallito</option>
            </select>
          )}
        </div>
        <span className="text-xs text-[#747684]">{filtered.length} result{filtered.length !== 1 ? 'i' : 'o'}</span>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-4 px-4 py-3 bg-[#fff3e0] border border-[#fe9832] rounded-xl flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-[#683700]">
            {selected.size} rispost{selected.size === 1 ? 'a' : 'e'} selezionat{selected.size === 1 ? 'a' : 'e'}
          </span>
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 bg-[#ba1a1a] text-white rounded-lg font-bold text-sm hover:-translate-y-0.5 transition-all disabled:opacity-50"
          >
            <Icon name="delete" size={16} />
            {deleting ? 'Eliminazione…' : 'Elimina selezionate'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#eeedf6] border-b border-[#c4c5d5]">
                <th className="px-4 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-[#002068] cursor-pointer"
                    title="Seleziona tutto"
                  />
                </th>
                <th className="px-6 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Data</th>
                {answerKeys.map(k => (
                  <th key={k} className="px-6 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">
                    {fieldLabels[k] ?? k}
                  </th>
                ))}
                {hasPayment && (
                  <th className="px-6 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Pagamento</th>
                )}
                <th className="px-6 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Check-in</th>
                <th className="px-6 py-4 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e7f0]">
              {loading ? (
                <tr><td colSpan={answerKeys.length + 4} className="px-6 py-8 text-center text-[#444653]">Caricamento...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={answerKeys.length + 4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Icon name="inbox" size={48} className="text-[#c4c5d5]" />
                      <p className="text-[#444653] font-medium">
                        {responses.length === 0 ? 'Nessuna risposta ricevuta ancora.' : 'Nessun risultato per i filtri applicati.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <ResponseRow
                    key={r.id}
                    response={r}
                    answerKeys={answerKeys}
                    hasPayment={hasPayment}
                    paymentBadge={paymentBadge}
                    onDelete={() => handleDelete(r.id)}
                    onMarkPaid={() => handleMarkPaid(r)}
                    onSendCopy={() => handleSendCopy(r)}
                    onGenerate={() => handleGenerate(r)}
                    selected={selected.has(r.id)}
                    onToggleSelect={() => toggleSelect(r.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-[#c4c5d5] bg-white">
          <p className="text-xs text-[#444653]">
            {filtered.length} rispost{filtered.length !== 1 ? 'e' : 'a'}
            {filtered.length !== responses.length ? ` (filtrate da ${responses.length} totali)` : ' totali'}
          </p>
        </div>
      </div>
      {/* ── Modale Ricevuta ── */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header modale */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e7f0] shrink-0">
              <div>
                <h2 className="text-lg font-black text-[#002068]">
                  {receiptModal.mode === 'markPaid' ? 'Segna come Pagato' : receiptModal.mode === 'generate' ? 'Genera Ricevuta' : 'Invia Copia Ricevuta'}
                </h2>
                <p className="text-xs text-[#747684] mt-0.5">
                  {receiptModal.mode === 'markPaid'
                    ? 'Verifica i dati prima di confermare il pagamento'
                    : receiptModal.mode === 'generate'
                      ? 'Genera e invia la ricevuta per questo pagamento già completato'
                      : 'Invia una copia della ricevuta al destinatario'}
                </p>
              </div>
              <button onClick={() => !sendingReceipt && setReceiptModal(null)} className="text-[#747684] hover:text-[#1a1b22] p-1 rounded transition-colors">
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Anteprima ricevuta */}
            <div className="flex-1 overflow-y-auto p-6">
              {receiptModal.fiscal.organizationName ? (
                <ReceiptDocument fiscal={receiptModal.fiscal} receipt={receiptModal.receipt} compact />
              ) : (
                <div className="flex items-center gap-3 p-4 bg-[#fff3e0] border border-[#fe9832] rounded-xl">
                  <Icon name="warning" size={20} className="text-[#fe9832] shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#683700]">Dati fiscali non configurati</p>
                    <p className="text-xs text-[#8f5a00] mt-0.5">
                      Vai in Impostazioni → Dati Fiscali per abilitare l'invio delle ricevute.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con controlli */}
            <div className="px-6 py-4 border-t border-[#e8e7f0] bg-[#f4f3fc] rounded-b-2xl shrink-0 space-y-4">
              {/* Email destinatario */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider block">
                  Email destinatario
                </label>
                <input
                  type="email"
                  value={receiptModal.recipientEmail}
                  onChange={e => setReceiptModal(m => m ? { ...m, recipientEmail: e.target.value } : m)}
                  placeholder="email@esempio.it"
                  className="w-full h-10 px-4 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                />
              </div>

              {/* Toggle invia email */}
              {receiptModal.fiscal.organizationName && (
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#c4c5d5]">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1b22]">Invia email</p>
                    <p className="text-xs text-[#747684]">Invia la ricevuta via email al destinatario</p>
                  </div>
                  <button
                    onClick={() => setReceiptModal(m => m ? { ...m, sendReceipt: !m.sendReceipt } : m)}
                    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${receiptModal.sendReceipt ? 'bg-[#002068]' : 'bg-[#c4c5d5]'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${receiptModal.sendReceipt ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {/* Bottoni azione */}
              <div className="flex gap-3">
                {receiptModal.mode === 'markPaid' ? (
                  <button
                    onClick={handleConfirmMarkPaid}
                    disabled={sendingReceipt}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-[#4caf50] text-white rounded-xl font-bold text-sm hover:bg-[#388e3c] transition-colors disabled:opacity-60 shadow-md"
                  >
                    {sendingReceipt ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="payments" size={16} />
                    )}
                    {sendingReceipt ? 'In corso…' : 'Pagato'}
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmSendCopy}
                    disabled={sendingReceipt || (receiptModal.sendReceipt && !receiptModal.recipientEmail)}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-colors disabled:opacity-60 shadow-md"
                  >
                    {sendingReceipt ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="receipt_long" size={16} />
                    )}
                    {sendingReceipt ? 'Generazione…' : receiptModal.sendReceipt
                      ? (receiptModal.mode === 'generate' ? 'Genera e invia' : 'Invia copia')
                      : 'Genera ricevuta'}
                  </button>
                )}
                <button
                  onClick={() => setReceiptModal(null)}
                  disabled={sendingReceipt}
                  className="px-5 py-2.5 border border-[#c4c5d5] text-[#444653] rounded-xl font-bold text-sm hover:bg-white transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

// ─── Response Row ─────────────────────────────────────────────────────────────

function ResponseRow({
  response,
  answerKeys,
  hasPayment,
  paymentBadge,
  onDelete,
  onMarkPaid,
  onSendCopy,
  onGenerate,
  selected,
  onToggleSelect,
}: {
  response: Response
  answerKeys: string[]
  hasPayment: boolean
  paymentBadge: (s: Response['paymentStatus']) => React.ReactNode
  onDelete: () => void
  onMarkPaid: () => void
  onSendCopy: () => void
  onGenerate: () => void
  selected: boolean
  onToggleSelect: () => void
}) {
  const answers = (response.answers ?? {}) as Record<string, unknown>
  const date = response.submittedAt?.toDate
    ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(response.submittedAt.toDate())
    : '—'

  const checkedIn = response.checkInStatus === 'checked_in'

  function formatValue(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—'
    if (Array.isArray(v)) return v.join(', ')
    if (typeof v === 'object') {
      if ('value' in (v as object)) {
        const r = v as { value: string; openTextValue?: string }
        return r.openTextValue ? `${r.value} (${r.openTextValue})` : r.value
      }
      if ('selected' in (v as object)) {
        const c = v as { selected: string[]; openTexts?: Record<string, string> }
        return c.selected.map(s => c.openTexts?.[s] ? `${s} (${c.openTexts[s]})` : s).join(', ')
      }
      return Object.entries(v as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(', ')
    }
    return String(v)
  }

  return (
    <tr className={`transition-colors group ${selected ? 'bg-[#f0f4ff]' : 'hover:bg-[#f4f3fc]'}`}>
      <td className="px-4 py-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded accent-[#002068] cursor-pointer"
        />
      </td>
      <td className="px-6 py-4 text-sm text-[#444653] whitespace-nowrap">{date}</td>
      {answerKeys.map(k => (
        <td key={k} className="px-6 py-4 text-sm text-[#1a1b22] max-w-[200px] truncate">
          {formatValue(answers[k])}
        </td>
      ))}
      {hasPayment && (
        <td className="px-6 py-4">{paymentBadge(response.paymentStatus)}</td>
      )}
      <td className="px-6 py-4">
        {checkedIn ? (
          <Badge variant="success" dot>Entrato</Badge>
        ) : (
          <Badge variant="warning" dot>In attesa</Badge>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasPayment && response.paymentStatus === 'pending' && (
            <button
              onClick={onMarkPaid}
              className="text-[#4caf50] hover:text-[#388e3c] transition-colors p-1 rounded"
              title="Segna come pagato"
            >
              <Icon name="payments" size={16} />
            </button>
          )}
          {hasPayment && response.paymentStatus === 'completed' && !response.receiptNumber && (
            <button
              onClick={onGenerate}
              className="text-[#fe9832] hover:text-[#c87a20] transition-colors p-1 rounded"
              title="Genera ricevuta"
            >
              <Icon name="receipt_long" size={16} />
            </button>
          )}
          {hasPayment && response.paymentStatus === 'completed' && response.receiptNumber && (
            <button
              onClick={onSendCopy}
              className="text-[#002068] hover:text-[#003399] transition-colors p-1 rounded"
              title={`Invia copia ricevuta ${response.receiptNumber}`}
            >
              <Icon name="receipt_long" size={16} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-[#444653] hover:text-[#ba1a1a] transition-colors p-1 rounded"
            title="Elimina risposta"
          >
            <Icon name="delete" size={16} />
          </button>
        </div>
      </td>
    </tr>
  )
}
