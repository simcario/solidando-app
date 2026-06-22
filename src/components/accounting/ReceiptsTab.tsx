import { useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../firebase/config'
import Icon from '../ui/Icon'
import { showToast } from '../ui/Toast'
import ReceiptDocument from '../receipts/ReceiptDocument'
import type { Response, Form, FiscalConfig } from '../../types/form'
import type { ReceiptData } from '../receipts/ReceiptDocument'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function methodLabel(method: string | null | undefined) {
  if (method === 'paypal') return 'PayPal'
  if (method === 'in_person') return 'In persona'
  return '—'
}

function extractName(response: Response, form: Form | null): string {
  if (!form) return '—'
  const answers = (response.answers ?? {}) as Record<string, unknown>
  for (const node of form.nodes ?? []) {
    const val = answers[node.id]
    if (!val) continue
    if ((node.type === 'short_text' || node.type === 'long_text') && typeof val === 'string' && val.trim()) {
      return val.trim()
    }
    if (node.type === 'email' && typeof val === 'string' && val.trim()) {
      return val.trim()
    }
  }
  return '—'
}

function extractEmail(response: Response, form: Form | null): string {
  if (!form) return ''
  const answers = (response.answers ?? {}) as Record<string, unknown>
  for (const node of form.nodes ?? []) {
    const val = answers[node.id]
    if (node.type === 'email' && typeof val === 'string' && val.trim()) {
      return val.trim()
    }
  }
  return ''
}

function buildReceiptData(response: Response, form: Form | null): ReceiptData {
  const today = new Date()
  return {
    receiptNumber: response.receiptNumber ?? `????/${today.getFullYear()}`,
    receiptDate: today.toISOString().split('T')[0],
    recipientName: extractName(response, form),
    recipientEmail: extractEmail(response, form),
    amount: response.paymentAmount ?? 0,
    currency: 'EUR',
    eventTitle: form?.title ?? 'Iscrizione',
    paymentMethod: response.paymentMethod === 'paypal' ? 'PayPal' : response.paymentMethod === 'in_person' ? 'Contanti / Persona' : 'N/D',
    paypalOrderId: response.paypalOrderId,
  }
}

// ─── Modal azione ricevuta ────────────────────────────────────────────────────

type ModalMode = 'preview' | 'resend' | 'void'

interface ReceiptActionModalProps {
  response: Response
  form: Form | null
  fiscal: FiscalConfig | null
  onClose: () => void
  onVoided: (responseId: string) => void
  onDeleted: (responseId: string) => void
  onResent: () => void
}

function ReceiptActionModal({ response, form, fiscal, onClose, onVoided, onDeleted, onResent }: ReceiptActionModalProps) {
  const [mode, setMode] = useState<ModalMode>('preview')
  const [resendEmail, setResendEmail] = useState(extractEmail(response, form))
  const [sendVoidNotice, setSendVoidNotice] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [loading, setLoading] = useState(false)

  const receipt = buildReceiptData(response, form)
  const fns = getFunctions(app, 'europe-west1')
  const isVoided = !!response.receiptVoided

  async function handleVoid() {
    setLoading(true)
    try {
      await httpsCallable(fns, 'voidReceipt')({ responseId: response.id, sendVoidNotice })
      showToast(`Ricevuta ${response.receiptNumber} annullata`, 'success')
      onVoided(response.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore annullamento', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      await httpsCallable(fns, 'deleteReceipt')({ responseId: response.id })
      showToast(`Ricevuta ${response.receiptNumber ?? response.receiptVoidedNumber} eliminata — numero riciclato`, 'success')
      onDeleted(response.id)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore eliminazione', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!resendEmail) return
    setLoading(true)
    try {
      await httpsCallable(fns, 'updateReceiptMeta')({ responseId: response.id, recipientEmail: resendEmail, resend: true })
      showToast(`Ricevuta reinviata a ${resendEmail}`, 'success')
      onResent()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore reinvio', 'error')
    } finally {
      setLoading(false)
    }
  }

  const receiptNum = response.receiptNumber ?? response.receiptVoidedNumber ?? '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e7f0] shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-[#002068]">Ricevuta</h2>
              <span className="font-mono text-sm text-[#fe9832] font-bold">{receiptNum}</span>
              {isVoided && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">ANNULLATA</span>
              )}
            </div>
            <p className="text-xs text-[#747684] mt-0.5">{extractName(response, form)}</p>
          </div>
          <button onClick={onClose} className="text-[#747684] hover:text-[#1a1b22] p-1 rounded">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Tab bar (solo per ricevute non annullate) */}
        {!isVoided && (
          <div className="flex border-b border-[#e8e7f0] shrink-0">
            {(['preview', 'resend', 'void'] as ModalMode[]).map(m => {
              const cfg: Record<ModalMode, { label: string; icon: string }> = {
                preview: { label: 'Anteprima', icon: 'receipt_long' },
                resend: { label: 'Reinvia', icon: 'send' },
                void: { label: 'Annulla', icon: 'block' },
              }
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex items-center gap-1.5 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    mode === m
                      ? m === 'void' ? 'border-amber-500 text-amber-700' : 'border-[#002068] text-[#002068]'
                      : 'border-transparent text-[#747684] hover:text-[#1a1b22]'
                  }`}
                >
                  <Icon name={cfg[m].icon} size={15} />
                  {cfg[m].label}
                </button>
              )
            })}
          </div>
        )}

        {/* Contenuto */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Anteprima */}
          {(mode === 'preview' || isVoided) && (
            fiscal?.organizationName
              ? <ReceiptDocument fiscal={fiscal} receipt={receipt} compact />
              : (
                <div className="flex items-center gap-3 p-4 bg-[#fff3e0] border border-[#fe9832] rounded-xl">
                  <Icon name="warning" size={20} className="text-[#fe9832] shrink-0" />
                  <p className="text-sm text-[#683700]">Dati fiscali non configurati — anteprima non disponibile.</p>
                </div>
              )
          )}

          {/* Reinvia */}
          {mode === 'resend' && !isVoided && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-[#f0f3ff] border border-[#b3bef7] rounded-xl">
                <Icon name="info" size={18} className="text-[#002068] shrink-0 mt-0.5" />
                <p className="text-sm text-[#002068]">
                  Reinvia la ricevuta <strong>{response.receiptNumber}</strong>. Puoi cambiare l'indirizzo email.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Email destinatario</label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="email@esempio.it"
                  className="w-full h-10 px-4 border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                />
              </div>
              <div className="p-4 bg-[#fafafa] border border-[#e8e7f0] rounded-xl space-y-1">
                <p className="text-xs font-bold text-[#747684] uppercase tracking-wider mb-1">Riepilogo</p>
                <p className="text-sm text-[#1a1b22]">N°: <span className="font-mono font-bold">{response.receiptNumber}</span></p>
                <p className="text-sm text-[#1a1b22]">Importo: <span className="font-bold text-[#1a6b3a]">{fmtEur(response.paymentAmount ?? 0)}</span></p>
                <p className="text-sm text-[#1a1b22] flex items-center gap-1.5">Metodo: <span title={methodLabel(response.paymentMethod)}><Icon name={response.paymentMethod === 'paypal' ? 'credit_card' : 'payments'} size={16} className="text-[#747684]" /></span></p>
              </div>
            </div>
          )}

          {/* Annulla */}
          {mode === 'void' && !isVoided && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <Icon name="block" size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Annullamento ricevuta</p>
                  <p className="text-sm text-amber-700 mt-1">
                    La ricevuta <strong>{response.receiptNumber}</strong> verrà marcata come annullata. Il numero
                    viene conservato nel registro ma non riutilizzato. Per liberare il numero usa invece "Elimina".
                  </p>
                </div>
              </div>
              <div className="p-4 bg-[#fafafa] border border-[#e8e7f0] rounded-xl space-y-1">
                <p className="text-xs font-bold text-[#747684] uppercase tracking-wider mb-1">Ricevuta da annullare</p>
                <p className="text-sm text-[#1a1b22]">N°: <span className="font-mono font-bold">{response.receiptNumber}</span></p>
                <p className="text-sm text-[#1a1b22]">Intestatario: <span className="font-bold">{extractName(response, form)}</span></p>
                <p className="text-sm text-[#1a1b22]">Importo: <span className="font-bold text-[#8b0000]">{fmtEur(response.paymentAmount ?? 0)}</span></p>
              </div>
              <div className="flex items-center justify-between p-3 bg-white border border-[#c4c5d5] rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-[#1a1b22]">Notifica il destinatario</p>
                  <p className="text-xs text-[#747684]">Invia email di avviso annullamento</p>
                </div>
                <button
                  onClick={() => setSendVoidNotice(v => !v)}
                  className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${sendVoidNotice ? 'bg-[#002068]' : 'bg-[#c4c5d5]'}`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${sendVoidNotice ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e8e7f0] bg-[#f4f3fc] rounded-b-2xl shrink-0">

          {/* Pulsante Elimina sempre visibile in fondo (elimina + ricicla numero) */}
          {!confirmDelete && (
            <div className={`flex gap-3 ${mode === 'preview' ? 'justify-between' : 'justify-end'} items-center`}>
              {/* Azioni specifiche del tab */}
              {mode === 'resend' && !isVoided && (
                <div className="flex gap-3 flex-1">
                  <button onClick={onClose} className="flex-1 py-2 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-white transition-all">
                    Annulla
                  </button>
                  <button
                    onClick={handleResend}
                    disabled={loading || !resendEmail}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-[#002068] text-white rounded-xl text-sm font-bold hover:bg-[#003399] disabled:opacity-50 transition-all"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="send" size={15} />}
                    {loading ? 'Invio…' : 'Reinvia'}
                  </button>
                </div>
              )}
              {mode === 'void' && !isVoided && (
                <div className="flex gap-3 flex-1">
                  <button onClick={() => setMode('preview')} className="flex-1 py-2 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-white transition-all">
                    Indietro
                  </button>
                  <button
                    onClick={handleVoid}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-all"
                  >
                    {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="block" size={15} />}
                    {loading ? 'Annullamento…' : 'Conferma annullamento'}
                  </button>
                </div>
              )}
              {/* Elimina sempre disponibile */}
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 transition-all shrink-0"
              >
                <Icon name="delete_forever" size={15} />
                Elimina
              </button>
            </div>
          )}

          {/* Confirm delete */}
          {confirmDelete && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                <Icon name="warning" size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-700">Eliminare la ricevuta {receiptNum}?</p>
                  <p className="text-xs text-red-600 mt-0.5">Il numero verrà riciclato e assegnato alla prossima ricevuta generata.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-white transition-all"
                >
                  Annulla
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
                >
                  {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="delete_forever" size={15} />}
                  {loading ? 'Eliminazione…' : 'Elimina e ricicla numero'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ReceiptsTab ─────────────────────────────────────────────────────────

interface ReceiptsTabProps {
  /** Tutte le risposte del workspace (da tutti gli eventi/form) */
  responses: Response[]
  /** Mappa formId → Form per risolvere nomi e email */
  formsById: Record<string, Form>
  fiscal: FiscalConfig | null
  workspaceId: string
  onResponsesChange: (updated: Response[]) => void
}

export default function ReceiptsTab({ responses, formsById, fiscal, workspaceId, onResponsesChange }: ReceiptsTabProps) {
  const [selectedResponse, setSelectedResponse] = useState<Response | null>(null)
  const [filter, setFilter] = useState<'active' | 'voided' | 'all'>('active')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [resettingCounter, setResettingCounter] = useState(false)

  // Solo risposte con una ricevuta (emessa o annullata)
  const withReceipt = responses.filter(r => r.receiptNumber || r.receiptVoidedNumber)

  // KPI: solo ricevute attive (non annullate e non eliminate)
  const activeReceipts = withReceipt.filter(r => !!r.receiptNumber && !r.receiptVoided)
  const voidedReceipts = withReceipt.filter(r => !!r.receiptVoided)
  const totalActive = activeReceipts.reduce((s, r) => s + (r.paymentAmount ?? 0), 0)

  const filtered = withReceipt.filter(r => {
    if (filter === 'active') return !!r.receiptNumber && !r.receiptVoided
    if (filter === 'voided') return !!r.receiptVoided
    return true
  })

  // Ordina per numero ricevuta decrescente
  const sorted = [...filtered].sort((a, b) => {
    const na = parseInt((a.receiptNumber ?? a.receiptVoidedNumber ?? '0').split('/')[0]) || 0
    const nb = parseInt((b.receiptNumber ?? b.receiptVoidedNumber ?? '0').split('/')[0]) || 0
    return nb - na
  })

  function patchResponse(responseId: string, patch: Partial<Response>) {
    onResponsesChange(responses.map(r => r.id === responseId ? { ...r, ...patch } : r))
  }

  function handleVoided(responseId: string) {
    const r = responses.find(x => x.id === responseId)
    patchResponse(responseId, {
      receiptVoided: true,
      receiptVoidedNumber: r?.receiptNumber,
      receiptNumber: undefined,
    })
    setSelectedResponse(null)
  }

  function handleDeleted(responseId: string) {
    // Rimuove completamente la ricevuta dalla risposta in-memory
    patchResponse(responseId, {
      receiptNumber: undefined,
      receiptVoided: undefined,
      receiptVoidedNumber: undefined,
    })
    setSelectedResponse(null)
  }

  async function handleDeleteDirect(responseId: string) {
    setDeleting(true)
    try {
      const fns = getFunctions(app, 'europe-west1')
      await httpsCallable(fns, 'deleteReceipt')({ responseId })
      patchResponse(responseId, {
        receiptNumber: undefined,
        receiptVoided: undefined,
        receiptVoidedNumber: undefined,
      })
      showToast('Ricevuta eliminata', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore eliminazione', 'error')
    } finally {
      setDeleting(false)
      setConfirmDeleteId(null)
    }
  }

  async function handleResetCounter() {
    if (!workspaceId) return
    setResettingCounter(true)
    try {
      const fns = getFunctions(app, 'europe-west1')
      const result = await httpsCallable<{ workspaceId: string }, { ok: boolean; counter: number }>(fns, 'resetReceiptCounter')({ workspaceId })
      const newCounter = result.data.counter
      showToast(`Counter ripristinato a ${newCounter} — la prossima ricevuta sarà ${String(newCounter + 1).padStart(4, '0')}/${new Date().getFullYear()}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore reset counter', 'error')
    } finally {
      setResettingCounter(false)
    }
  }

  if (withReceipt.length === 0) {
    return (
      <div className="py-20 text-center text-[#747684]">
        <Icon name="receipt_long" size={48} className="mx-auto mb-3 text-[#c4c5d5]" />
        <p className="font-semibold text-[#444653] text-lg">Nessuna ricevuta emessa</p>
        <p className="text-sm mt-1 max-w-sm mx-auto">Le ricevute vengono generate quando un pagamento viene confermato con dati fiscali configurati nelle Impostazioni.</p>
        <button
          onClick={handleResetCounter}
          disabled={resettingCounter}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 border border-[#c4c5d5] text-[#444653] rounded-xl text-sm font-semibold hover:bg-[#f4f3fc] disabled:opacity-50 transition-all"
        >
          <Icon name="restart_alt" size={16} />
          {resettingCounter ? 'Ripristino…' : 'Ripristina numerazione (da 1)'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* KPI — solo ricevute attive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-[#e6f9ee] border border-[#86d8aa] rounded-xl p-4">
          <p className="text-xs font-bold text-[#1a6b3a] uppercase tracking-widest mb-1">Ricevute attive</p>
          <p className="text-3xl font-black text-[#1a6b3a]">{activeReceipts.length}</p>
          <p className="text-xs text-[#1a6b3a]/70 mt-1">{fmtEur(totalActive)}</p>
        </div>
        <div className="bg-[#fff8e8] border border-[#fcd470] rounded-xl p-4">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-1">Annullate</p>
          <p className="text-3xl font-black text-amber-700">{voidedReceipts.length}</p>
          <p className="text-xs text-amber-600/70 mt-1">numero conservato</p>
        </div>
        <div className="bg-[#f4f3fc] border border-[#c4c5d5] rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-xs font-bold text-[#444653] uppercase tracking-widest mb-1">Totale emesse</p>
          <p className="text-3xl font-black text-[#002068]">{withReceipt.length}</p>
          <p className="text-xs text-[#747684] mt-1">storico completo</p>
        </div>
      </div>

      {/* Avviso dati fiscali */}
      {!fiscal?.organizationName && (
        <div className="flex items-start gap-3 p-4 bg-[#fff3e0] border border-[#fe9832] rounded-xl">
          <Icon name="warning" size={18} className="text-[#fe9832] shrink-0 mt-0.5" />
          <p className="text-sm text-[#683700]">
            <strong>Dati fiscali non configurati.</strong> Vai in Impostazioni → Dati Fiscali per abilitare il reinvio delle ricevute.
          </p>
        </div>
      )}

      {/* Filtri */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'active', label: `Attive (${activeReceipts.length})` },
          { key: 'voided', label: `Annullate (${voidedReceipts.length})` },
          { key: 'all', label: `Tutte (${withReceipt.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              filter === key
                ? key === 'voided' ? 'bg-amber-600 text-white' : 'bg-[#002068] text-white'
                : 'bg-white border border-[#c4c5d5] text-[#444653] hover:bg-[#f4f3fc]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tabella */}
      <div className="bg-white border border-[#c4c5d5] rounded-xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-[#747684] text-sm">
            <Icon name="receipt_long" size={32} className="mx-auto mb-2 text-[#c4c5d5]" />
            <p>Nessuna ricevuta in questa categoria.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#eeedf6] border-b border-[#c4c5d5]">
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">N°</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Intestatario</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Form / Evento</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Metodo</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider text-right">Importo</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Stato</th>
                    <th className="px-4 py-3 text-xs font-bold text-[#444653] uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e7f0]">
                  {sorted.map(r => {
                    const isVoided = !!r.receiptVoided
                    const num = r.receiptNumber ?? r.receiptVoidedNumber ?? '—'
                    const form = formsById[r.formId] ?? null
                    const submDate = r.submittedAt?.toDate?.()?.toISOString().split('T')[0] ?? ''
                    return (
                      <tr key={r.id} className={`hover:bg-[#faf8ff] transition-colors ${isVoided ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-[#fe9832] text-sm">{num}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-[#1a1b22]">{extractName(r, form)}</p>
                          <p className="text-xs text-[#747684]">{extractEmail(r, form)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-[#444653] truncate max-w-[160px]">{form?.title ?? r.formId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span title={methodLabel(r.paymentMethod)}>
                            <Icon name={r.paymentMethod === 'paypal' ? 'credit_card' : 'payments'} size={16} className="text-[#747684]" />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold text-sm ${isVoided ? 'line-through text-[#747684]' : 'text-[#1a6b3a]'}`}>
                            {fmtEur(r.paymentAmount ?? 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isVoided ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">
                              <Icon name="block" size={11} /> Annullata
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                              <Icon name="check_circle" size={11} /> Valida
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#747684]">{fmtDate(submDate)}</td>
                        <td className="px-4 py-3 text-right">
                          {confirmDeleteId === r.id ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-xs text-red-600 font-semibold">Sicuro?</span>
                              <button
                                onClick={() => handleDeleteDirect(r.id)}
                                disabled={deleting}
                                className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
                              >
                                {deleting ? '…' : 'Sì'}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1 border border-[#c4c5d5] text-[#444653] rounded-lg text-xs font-semibold hover:bg-[#f4f3fc] transition-all"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setSelectedResponse(r)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-all"
                              >
                                <Icon name="visibility" size={13} />
                                Apri
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(r.id)}
                                className="p-1.5 text-[#747684] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Elimina ricevuta"
                              >
                                <Icon name="delete" size={15} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#eeedf6] border-t-2 border-[#c4c5d5]">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-black text-[#444653] uppercase tracking-wider">
                      Totale attive ({activeReceipts.length})
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-sm text-[#1a6b3a]">
                      {fmtEur(totalActive)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-[#e8e7f0]">
              {sorted.map(r => {
                const isVoided = !!r.receiptVoided
                const num = r.receiptNumber ?? r.receiptVoidedNumber ?? '—'
                const form = formsById[r.formId] ?? null
                return (
                  <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${isVoided ? 'opacity-60' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-[#fe9832] text-sm">{num}</span>
                        {isVoided
                          ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">Annullata</span>
                          : <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">Valida</span>
                        }
                      </div>
                      <p className="text-sm font-medium text-[#1a1b22] mt-0.5 truncate">{extractName(r, form)}</p>
                      <p className="text-xs text-[#747684] truncate">{form?.title ?? ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${isVoided ? 'line-through text-[#747684]' : 'text-[#1a6b3a]'}`}>
                        {fmtEur(r.paymentAmount ?? 0)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 justify-end">
                        <button
                          onClick={() => setSelectedResponse(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-all"
                        >
                          <Icon name="visibility" size={12} />
                          Apri
                        </button>
                        {confirmDeleteId === r.id ? (
                          <>
                            <button
                              onClick={() => handleDeleteDirect(r.id)}
                              disabled={deleting}
                              className="px-2 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-all"
                            >
                              {deleting ? '…' : 'Sì'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 border border-[#c4c5d5] text-[#444653] rounded-lg text-xs hover:bg-[#f4f3fc] transition-all"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(r.id)}
                            className="p-1.5 text-[#747684] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Elimina"
                          >
                            <Icon name="delete" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {selectedResponse && (
        <ReceiptActionModal
          response={selectedResponse}
          form={formsById[selectedResponse.formId] ?? null}
          fiscal={fiscal}
          onClose={() => setSelectedResponse(null)}
          onVoided={handleVoided}
          onDeleted={handleDeleted}
          onResent={() => setSelectedResponse(null)}
        />
      )}
    </div>
  )
}
