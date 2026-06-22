import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { getEvent, updateEvent, countAttendees } from '../../firebase/events'
import { getResponses, checkInResponse, updateResponsePaymentStatus, deleteResponse, resetCheckIn, resetPaymentStatus, updateResponseAnswers } from '../../firebase/responses'
import { getForms, createForm } from '../../firebase/forms'
import { getWorkspaceSettings } from '../../firebase/workspace'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../components/ui/Toast'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { updateDoc, doc as fsDoc } from 'firebase/firestore'
import { app, db } from '../../firebase/config'
import ReceiptDocument from '../../components/receipts/ReceiptDocument'
import type { SolidandoEvent, Response, Form, EventStatus, TicketType, FiscalConfig, FormNode, FormVariable, PaymentFormulaConfig, PaymentFormulaTerm } from '../../types/form'
import AccountingTab from '../../components/accounting/AccountingTab'
import CassaTab from '../../components/cassa/CassaTab'
import type { ReceiptData } from '../../components/receipts/ReceiptDocument'
import { nanoid } from 'nanoid'

// ─── Payment formula resolver (mirrors FormPreviewPage / AdminNewRegistrationPage) ───

function applyOp(a: number, op: '*' | '+' | '-' | '/', b: number): number {
  switch (op) {
    case '*': return a * b
    case '+': return a + b
    case '-': return a - b
    case '/': return b !== 0 ? a / b : 0
    default: return 0
  }
}

function resolvePaymentAmount(
  node: FormNode,
  variables: FormVariable[],
  _nodes: FormNode[],
  answers: Record<string, unknown>,
): number | null {
  const formula = node.properties.paymentFormula
  if (!formula) return node.properties.amount ?? null
  if ('terms' in formula) {
    const pf = formula as PaymentFormulaConfig
    if (!pf.terms || pf.terms.length === 0) return node.properties.amount ?? null
    const termResults = pf.terms.map((term: PaymentFormulaTerm) => {
      if (!term.fieldId || !term.variableId) return null
      const variable = variables.find(v => v.id === term.variableId)
      if (!variable) return null
      const rawAnswer = answers[term.fieldId]
      const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
      return applyOp(fieldVal, term.op, variable.value)
    })
    if (termResults.some(r => r === null)) return node.properties.amount ?? null
    return (termResults as number[]).reduce((acc, val) => applyOp(acc, pf.combineOp, val), 0)
  }
  // legacy single-term
  const legacy = formula as { fieldId: string; op: '*' | '+' | '-' | '/'; variableId: string }
  if (!legacy.fieldId || !legacy.variableId) return node.properties.amount ?? null
  const variable = variables.find(v => v.id === legacy.variableId)
  if (!variable) return node.properties.amount ?? null
  const rawAnswer = answers[legacy.fieldId]
  const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
  return applyOp(fieldVal, legacy.op, variable.value)
}

// ─── Ticket helpers ───────────────────────────────────────────────────────────

function buildTicketCanvas(
  qrSrc: string,
  formTitle: string,
  responseId: string,
  lines: { label: string; value: string }[],
): Promise<string> {
  return new Promise(resolve => {
    const W = 440
    const infoH = lines.length > 0 ? 20 + lines.length * 26 + 12 : 0
    const H = 80 + 180 + infoH + 36
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = '#002068'
    ctx.fillRect(0, 0, W, 80)
    ctx.fillStyle = '#8aa4ff'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('SOLIDANDO · BIGLIETTO', 20, 24)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${formTitle.length > 32 ? 16 : 20}px sans-serif`
    const titleTrunc = formTitle.length > 42 ? formTitle.slice(0, 42) + '…' : formTitle
    ctx.fillText(titleTrunc, 20, 60)

    const qrImg = new Image()
    qrImg.src = qrSrc
    qrImg.onload = () => {
      const qrSize = 160
      ctx.drawImage(qrImg, (W - qrSize) / 2, 90, qrSize, qrSize)

      if (infoH > 0) {
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#e8e7f0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(20, 262); ctx.lineTo(W - 20, 262)
        ctx.stroke()
        ctx.setLineDash([])

        lines.forEach((line, i) => {
          const y = 282 + i * 26
          ctx.fillStyle = '#747684'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'left'
          ctx.fillText(line.label, 20, y)
          ctx.fillStyle = '#1a1b22'
          ctx.font = 'bold 13px sans-serif'
          ctx.textAlign = 'right'
          ctx.fillText(line.value, W - 20, y)
        })
      }

      ctx.fillStyle = '#c4c5d5'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(responseId, W / 2, H - 12)

      resolve(canvas.toDataURL('image/png'))
    }
  })
}

// ─── Helper: calcola partecipanti per una singola risposta ────────────────────

function computeAttendeeCount(
  answers: Record<string, unknown>,
  event?: Pick<SolidandoEvent, 'attendeeFieldId' | 'attendeeFieldIds'> | null,
  fallback = 1,
): number {
  const fieldIds = (event?.attendeeFieldIds && event.attendeeFieldIds.length > 0)
    ? event.attendeeFieldIds
    : event?.attendeeFieldId ? [event.attendeeFieldId] : []
  if (fieldIds.length === 0) return fallback
  const sum = fieldIds.reduce((s, fid) => {
    const v = Number(answers[fid] ?? 0)
    return s + (isNaN(v) || v < 1 ? 0 : v)
  }, 0)
  return sum < 1 ? 1 : sum
}

// ─── Ticket Modal ─────────────────────────────────────────────────────────────

function TicketModal({ response, formTitle, fieldLabels, attendeeFieldId: _attendeeFieldId, event, onClose }: {
  response: Response
  formTitle: string
  fieldLabels: Record<string, string>
  attendeeFieldId?: string
  event?: SolidandoEvent
  onClose: () => void
}) {
  const checkinUrl = `${window.location.origin}/admin/checkin/${response.formId}?scan=${response.id}`
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(checkinUrl, { width: 200, margin: 1 }).then(setQrSrc)
    })
  }, [checkinUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Costruisce le righe info per il canvas e per il riepilogo visivo
  const answers = (response.answers ?? {}) as Record<string, unknown>
  const ticketLines: { label: string; value: string }[] = []

  // Nome: primo campo con un'etichetta leggibile
  const firstKey = Object.keys(fieldLabels)[0]
  if (firstKey && answers[firstKey]) {
    ticketLines.push({ label: fieldLabels[firstKey] || 'Nome', value: String(answers[firstKey]) })
  }

  // Partecipanti
  const hasAttendeeConfig = (event?.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event?.attendeeFieldId
  const attendeeCount = hasAttendeeConfig
    ? computeAttendeeCount(answers, event)
    : (response.attendeeCount ?? 1)
  if (attendeeCount > 1) {
    ticketLines.push({ label: 'Partecipanti', value: String(attendeeCount) })
  }

  // Importo
  if (response.paymentAmount != null && response.paymentAmount > 0) {
    const label = response.paymentStatus === 'completed' ? 'Pagato' : 'Importo'
    ticketLines.push({ label, value: `€ ${response.paymentAmount.toFixed(2)}` })
  }

  async function handleDownload() {
    if (!qrSrc) return
    const dataUrl = await buildTicketCanvas(qrSrc, formTitle, response.id, ticketLines)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `biglietto-${response.id.slice(0, 8)}.png`
    a.click()
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Biglietto: ${formTitle}`, url: checkinUrl })
      } catch { /* annullato */ }
    } else {
      await navigator.clipboard.writeText(checkinUrl)
      alert('Link biglietto copiato negli appunti!')
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className="bg-[#002068] px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#8aa4ff] uppercase tracking-wider">Solidando · Biglietto</p>
            <h3 className="text-xl font-bold text-white mt-1">{formTitle}</h3>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white mt-0.5">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="relative h-0">
          <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-[#faf8ff] border-2 border-[#c4c5d5]" />
          <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[#faf8ff] border-2 border-[#c4c5d5]" />
        </div>

        <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
          {response.paymentStatus === 'pending' && (
            <div className="w-full flex items-center gap-2 px-3 py-2 bg-[#fff4e0] rounded-xl text-[#8f4e00] text-sm font-semibold">
              <Icon name="hourglass_empty" size={16} />
              Pagamento in attesa di conferma
            </div>
          )}
          {response.checkInStatus === 'checked_in' && (
            <div className="w-full flex items-center gap-2 px-3 py-2 bg-[#e6f9ee] rounded-xl text-[#1a6b3a] text-sm font-semibold">
              <Icon name="how_to_reg" size={16} />
              Check-in già effettuato
            </div>
          )}
          {qrSrc ? (
            <>
              <img src={qrSrc} alt="QR code biglietto" width={160} height={160} className="rounded-xl border border-[#e8e7f0]" />
              <p className="text-xs text-[#747684]">Mostra questo QR code all'ingresso</p>
              <p className="text-[10px] font-mono text-[#c4c5d5] select-all">{response.id}</p>
            </>
          ) : (
            <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin my-6" />
          )}
        </div>

        {ticketLines.length > 0 && (
          <>
            <div className="mx-6 border-t border-dashed border-[#e8e7f0]" />
            <div className="px-6 py-3 space-y-2">
              {ticketLines.map(line => (
                <div key={line.label} className="flex items-center justify-between text-sm">
                  <span className="text-[#747684]">{line.label}</span>
                  <span className="font-bold text-[#1a1b22]">{line.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {event?.location && (
          <>
            <div className="mx-6 border-t border-dashed border-[#e8e7f0]" />
            <div className="px-6 py-3">
              <a
                href={event.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#f4f3fc] border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#002068] hover:bg-[#dce1ff] transition-colors"
              >
                <Icon name="location_on" size={16} className="shrink-0" />
                <span className="flex-1 truncate">{event.location}</span>
                <Icon name="open_in_new" size={14} className="shrink-0 opacity-60" />
              </a>
            </div>
          </>
        )}

        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button
            onClick={handleDownload}
            disabled={!qrSrc}
            className="w-full py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="download" size={18} />
            Scarica biglietto (PNG)
          </button>
          <button
            onClick={handleShare}
            className="w-full py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold hover:brightness-105 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="share" size={18} />
            Condividi link
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-semibold hover:bg-[#f4f3fc] transition-all text-sm"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function statusBadge(status: EventStatus) {
  const map: Record<EventStatus, { variant: 'success' | 'warning' | 'error' | 'neutral'; label: string }> = {
    published: { variant: 'success', label: 'Pubblicato' },
    draft: { variant: 'neutral', label: 'Bozza' },
    closed: { variant: 'warning', label: 'Chiuso' },
    cancelled: { variant: 'error', label: 'Annullato' },
  }
  const { variant, label } = map[status]
  return <Badge variant={variant} dot>{label}</Badge>
}

// ─── Modale Ricevuta (shared with ResponsesPage) ─────────────────────────────

interface ReceiptModalState {
  responseId: string
  recipientEmail: string
  receipt: ReceiptData
  fiscal: FiscalConfig
  sendReceipt: boolean
  mode: 'markPaid' | 'sendCopy' | 'generate'
  attendeeCount: number
  pricePerPerson: number | null
}

interface EditRegistrationState {
  response: Response
  answers: Record<string, unknown>
}

type Tab = 'participants' | 'accounting' | 'settings'

// Colonne selezionabili nella tabella partecipanti
type ColKey = 'date' | 'name' | 'answers' | 'attendees' | 'payment' | 'checkin'
const ALL_COLS: ColKey[] = ['date', 'name', 'answers', 'attendees', 'payment', 'checkin']
const COL_LABELS: Record<ColKey, string> = {
  date: 'Data',
  name: 'Nome',
  answers: 'Campi form',
  attendees: 'Persone',
  payment: 'Pagamento',
  checkin: 'Check-in',
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  event,
  forms,
  responses,
  onSave,
}: {
  event: SolidandoEvent
  forms: Form[]
  responses: Response[]
  onSave: (data: Partial<SolidandoEvent>) => Promise<void>
}) {
  const [title, setTitle] = useState(event.title)
  const [description, setDescription] = useState(event.description)
  const [location, setLocation] = useState(event.location)
  const [locationUrl, setLocationUrl] = useState(event.locationUrl ?? '')
  const [startDate, setStartDate] = useState(event.startDate)
  const [startTime, setStartTime] = useState(event.startTime)
  const [endDate, setEndDate] = useState(event.endDate ?? '')
  const [endTime, setEndTime] = useState(event.endTime ?? '')
  const [totalCapacity, setTotalCapacity] = useState(event.totalCapacity?.toString() ?? '')
  const [status, setStatus] = useState<EventStatus>(event.status)
  const [formId, setFormId] = useState(event.formId ?? '')
  const [attendeeFieldId, setAttendeeFieldId] = useState(event.attendeeFieldId ?? '')
  const [attendeeFieldIds, setAttendeeFieldIds] = useState<string[]>(event.attendeeFieldIds ?? [])
  const [ctaLabel, setCtaLabel] = useState(event.ctaLabel ?? '')
  const [receiptDescription, setReceiptDescription] = useState(event.receiptDescription ?? '')
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(event.ticketTypes ?? [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [creatingForm, setCreatingForm] = useState(false)
  const [showFormPicker, setShowFormPicker] = useState(false)
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const workspaceId = profile?.workspaceIds?.[0] || profile?.uid || null

  async function handleCreateForm() {
    if (!workspaceId || !user) return
    setCreatingForm(true)
    try {
      const id = await createForm(workspaceId, user.uid)
      setFormId(id)
      setAttendeeFieldId('')
      setAttendeeFieldIds([])
      navigate(`/builder/${id}`)
    } finally {
      setCreatingForm(false)
    }
  }

  function addTicket() {
    setTicketTypes(prev => [...prev, { id: nanoid(6), label: '', price: 0, currency: 'EUR', capacity: null }])
  }

  function removeTicket(id: string) {
    setTicketTypes(prev => prev.filter(t => t.id !== id))
  }

  function updateTicket(id: string, field: keyof TicketType, value: unknown) {
    setTicketTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  async function handleSave() {
    setSaving(true)
    await onSave({
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      locationUrl: locationUrl.trim() || undefined,
      startDate,
      startTime,
      endDate: endDate || undefined,
      endTime: endTime || undefined,
      totalCapacity: totalCapacity ? parseInt(totalCapacity) : null,
      status,
      formId: formId || undefined,
      attendeeFieldId: attendeeFieldId || undefined,
      attendeeFieldIds: attendeeFieldIds.length > 0 ? attendeeFieldIds : undefined,
      ctaLabel: ctaLabel.trim() || undefined,
      receiptDescription: receiptDescription.trim() || undefined,
      ticketTypes,
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputCls = 'w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm bg-white'

  return (
    <div className="space-y-6">
      {/* Info base */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] p-6 space-y-4">
        <h3 className="font-bold text-[#002068] flex items-center gap-2">
          <Icon name="info" size={18} />
          Informazioni evento
        </h3>
        <div>
          <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Titolo</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Descrizione</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Luogo</label>
          <input value={location} onChange={e => setLocation(e.target.value)} className={inputCls} placeholder="es. Milano, Palazzo Reale / Online (Zoom)" />
          {location && (
            <a
              href={locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-xl text-xs font-semibold text-[#002068] hover:bg-[#dce1ff] transition-colors"
            >
              <Icon name="map" size={15} />
              Apri in Maps
            </a>
          )}
          <div className="mt-2">
            <input
              value={locationUrl}
              onChange={e => setLocationUrl(e.target.value)}
              className="w-full px-4 py-2 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-xs text-[#888] bg-white"
              placeholder="Link Google Maps personalizzato (opzionale)"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Data inizio</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Orario inizio</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Data fine</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Orario fine</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Stato e posti */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] p-6 space-y-4">
        <h3 className="font-bold text-[#002068] flex items-center gap-2">
          <Icon name="tune" size={18} />
          Stato e capienza
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Stato</label>
            <select value={status} onChange={e => setStatus(e.target.value as EventStatus)} className={inputCls}>
              <option value="draft">Bozza</option>
              <option value="published">Pubblicato</option>
              <option value="closed">Chiuso</option>
              <option value="cancelled">Annullato</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Posti totali</label>
            <input
              type="number"
              min={1}
              value={totalCapacity}
              onChange={e => setTotalCapacity(e.target.value)}
              placeholder="Illimitato"
              className={inputCls}
            />
          </div>
        </div>
        {totalCapacity && !attendeeFieldId && event.formId && responses.length > 0 && (() => {
          const linkedForm = forms.find(f => f.id === (formId || event.formId))
          const hasNumberNode = (linkedForm?.nodes ?? []).some(n => n.type === 'number')
          if (!hasNumberNode) return null
          return (
            <div className="flex items-start gap-2 p-3 bg-[#fff3cd] border border-[#ffc107] rounded-xl text-sm text-[#664d03]">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[#ffc107]" />
              <p>Il conteggio posti usa attualmente <strong>1 posto per iscrizione</strong> ({responses.length} iscrizioni = {responses.length} posti). Se ogni iscrizione può includere più persone, seleziona il campo "numero persone" qui sotto e salva.</p>
            </div>
          )
        })()}
      </div>

      {/* Ticket types */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#002068] flex items-center gap-2">
            <Icon name="confirmation_number" size={18} />
            Tipologie biglietto
          </h3>
          <button
            onClick={addTicket}
            className="flex items-center gap-1 text-xs font-bold text-[#002068] hover:text-[#fe9832] transition-colors"
          >
            <Icon name="add_circle" size={16} />
            Aggiungi
          </button>
        </div>
        <div className="space-y-2">
          {ticketTypes.map(t => (
            <div key={t.id} className="flex items-center gap-2 p-3 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
              <input
                value={t.label}
                onChange={e => updateTicket(t.id, 'label', e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                placeholder="es. Adulto"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-[#444653]">€</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={t.price}
                  onChange={e => updateTicket(t.id, 'price', parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-center gap-1">
                <Icon name="chair" size={14} className="text-[#747684]" />
                <input
                  type="number"
                  min={1}
                  value={t.capacity ?? ''}
                  onChange={e => updateTicket(t.id, 'capacity', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-20 px-3 py-1.5 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                  placeholder="∞"
                />
              </div>
              {ticketTypes.length > 1 && (
                <button onClick={() => removeTicket(t.id)} className="text-[#747684] hover:text-[#ba1a1a] transition-colors p-1">
                  <Icon name="delete" size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Form collegato */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] p-6 space-y-4">
        <h3 className="font-bold text-[#002068] flex items-center gap-2">
          <Icon name="link" size={18} />
          Form iscrizione collegato
        </h3>
        {!formId ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateForm}
                disabled={creatingForm}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#002068] text-white text-sm font-bold rounded-xl hover:bg-[#001550] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <Icon name="add" size={16} />
                {creatingForm ? '...' : 'Crea nuovo'}
              </button>
              <button
                type="button"
                onClick={() => setShowFormPicker(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#c4c5d5] text-[#002068] text-sm font-bold rounded-xl hover:bg-[#f4f3fc] transition-colors whitespace-nowrap"
              >
                <Icon name="search" size={16} />
                Collega esistente
              </button>
            </div>
            {showFormPicker && (
              <div className="border border-[#c4c5d5] rounded-xl overflow-hidden">
                {forms.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-[#747684]">Nessun form disponibile</p>
                ) : (
                  <ul className="divide-y divide-[#e8e7f0] max-h-48 overflow-y-auto">
                    {forms.map(f => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => { setFormId(f.id); setAttendeeFieldId(''); setAttendeeFieldIds([]); setShowFormPicker(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#f4f3fc] transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="font-medium text-[#1a1b22] line-clamp-1">{f.title || 'Untitled Form'}</span>
                          <span className="text-xs text-[#747684] shrink-0">{f.nodes?.length ?? 0} campi</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-[#f4f3fc] rounded-xl border border-[#dde0e7]">
            <Icon name="dynamic_form" size={20} className="text-[#002068] shrink-0" />
            <span className="font-semibold text-[#1a1b22] flex-1 line-clamp-1">
              {forms.find(f => f.id === formId)?.title || formId}
            </span>
            <Link
              to={`/forms?manage=${formId}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs font-bold text-[#fe9832] hover:text-[#d4760a] px-2 py-1 rounded-lg transition-colors shrink-0"
              title="Gestisci form"
            >
              <Icon name="settings" size={14} />
              Gestisci
            </Link>
            <button
              type="button"
              onClick={() => { setFormId(''); setAttendeeFieldId(''); setAttendeeFieldIds([]) }}
              className="flex items-center gap-1 text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6] px-2 py-1 rounded-lg transition-colors shrink-0"
              title="Rimuovi form collegato"
            >
              <Icon name="link_off" size={14} />
              Rimuovi
            </button>
          </div>
        )}
        {formId && (() => {
          const linkedForm = forms.find(f => f.id === formId)
          const numberNodes = (linkedForm?.nodes ?? []).filter(n => n.type === 'number')
          if (numberNodes.length === 0) return null
          const activeIds = attendeeFieldIds.length > 0 ? attendeeFieldIds : attendeeFieldId ? [attendeeFieldId] : []
          const previewCount = activeIds.length > 0
            ? responses.reduce((sum, r) => {
                const ans = (r.answers ?? {}) as Record<string, unknown>
                const val = activeIds.reduce((s, fid) => {
                  const n = Number(ans[fid] ?? 0)
                  return s + (isNaN(n) || n < 1 ? 0 : n)
                }, 0)
                return sum + (val < 1 ? 1 : val)
              }, 0)
            : responses.length
          return (
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Campi "numero persone"</label>
              <div className="flex flex-col gap-1.5 border border-[#dde0e7] rounded-lg p-2.5 bg-white">
                {numberNodes.map(n => {
                  const checked = attendeeFieldIds.includes(n.id)
                  return (
                    <label key={n.id} className="flex items-center gap-2 cursor-pointer text-sm text-[#333]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          setAttendeeFieldIds(prev =>
                            e.target.checked ? [...prev, n.id] : prev.filter(id => id !== n.id)
                          )
                          if (e.target.checked && attendeeFieldId === n.id) setAttendeeFieldId('')
                        }}
                        className="rounded"
                      />
                      {n.properties.label || n.id}
                    </label>
                  )
                })}
              </div>
              {responses.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-[#002068]">
                  Conteggio attuale: <strong>{previewCount} persone</strong> ({responses.length} iscrizioni)
                </p>
              )}
              <p className="mt-0.5 text-xs text-[#747684]">Seleziona i campi numerici da sommare per calcolare i posti occupati.</p>
            </div>
          )
        })()}
        {formId && (
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Testo bottone CTA</label>
            <input
              value={ctaLabel}
              onChange={e => setCtaLabel(e.target.value)}
              placeholder="es. Iscriviti ora"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-[#747684]">Testo del bottone sulla pagina pubblica evento. Se vuoto: "Iscriviti"</p>
          </div>
        )}
        {formId && (
          <div className="flex gap-2">
            <Link
              to={`/builder/${formId}`}
              className="flex items-center gap-1.5 text-xs font-bold text-[#002068] hover:text-[#fe9832] transition-colors"
            >
              <Icon name="edit" size={14} />
              Apri nel builder
            </Link>
            <span className="text-[#c4c5d5]">·</span>
            <Link
              to={`/f/${formId}`}
              target="_blank"
              className="flex items-center gap-1.5 text-xs font-bold text-[#002068] hover:text-[#fe9832] transition-colors"
            >
              <Icon name="open_in_new" size={14} />
              Anteprima form
            </Link>
            <span className="text-[#c4c5d5]">·</span>
            <Link
              to={`/responses/${formId}`}
              className="flex items-center gap-1.5 text-xs font-bold text-[#002068] hover:text-[#fe9832] transition-colors"
            >
              <Icon name="inbox" size={14} />
              Vedi risposte
            </Link>
          </div>
        )}
      </div>

      {/* Ricevute fiscali */}
      <div className="bg-white rounded-xl border border-[#c4c5d5] p-6 space-y-4">
        <h3 className="font-bold text-[#002068] flex items-center gap-2">
          <Icon name="receipt_long" size={18} />
          Ricevute fiscali
        </h3>
        <div>
          <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Dicitura / Causale</label>
          <textarea
            value={receiptDescription}
            onChange={e => setReceiptDescription(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder={`Contributo liberale per raccolta fondi occasionale ${title || event.title}`}
          />
          <p className="mt-1 text-xs text-[#747684]">Testo della causale stampato nella ricevuta. Se vuoto viene usato: "Contributo liberale per raccolta fondi occasionale &lt;titolo evento&gt;"</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving
          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : saved
            ? <Icon name="check_circle" size={18} />
            : <Icon name="save" size={18} />}
        {saved ? 'Salvato!' : 'Salva modifiche'}
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [event, setEvent] = useState<SolidandoEvent | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('participants')
  const [filterText, setFilterText] = useState('')
  const [filterPayment, setFilterPayment] = useState('all')
  const [filterCheckin, setFilterCheckin] = useState('all')
  const [ticketResponse, setTicketResponse] = useState<Response | null>(null)
  const [fiscal, setFiscal] = useState<FiscalConfig | null>(null)
  const [receiptModal, setReceiptModal] = useState<ReceiptModalState | null>(null)
  const [sendingReceipt, setSendingReceipt] = useState(false)
  const [showCassa, setShowCassa] = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)
  const [editModal, setEditModal] = useState<EditRegistrationState | null>(null)
  const [visibleCols, setVisibleCols] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem('event_table_cols')
      if (saved) return JSON.parse(saved) as ColKey[]
    } catch { /* ignore */ }
    return ALL_COLS
  })

  const workspaceId = profile?.workspaceIds?.[0] ?? user?.uid ?? ''

  useEffect(() => {
    if (!workspaceId) return
    getWorkspaceSettings(workspaceId).then(ws => {
      if (ws.fiscal) setFiscal({ ...ws.fiscal })
    }).catch(() => {})
  }, [workspaceId])

  useEffect(() => {
    if (!eventId) return
    Promise.all([
      getEvent(eventId),
      getForms(workspaceId, undefined, true),
    ]).then(([ev, fs]) => {
      setEvent(ev)
      setForms(fs)
      if (ev?.formId) {
        getResponses(ev.formId).then(setResponses)
      }
      setLoading(false)
    })
  }, [eventId, workspaceId])

  async function handleSave(data: Partial<SolidandoEvent>) {
    if (!eventId) return
    await updateEvent(eventId, data)
    setEvent(prev => prev ? { ...prev, ...data } : prev)
    // Se cambia il formId, ricarica le risposte
    if (data.formId !== undefined && data.formId !== event?.formId) {
      if (data.formId) {
        const r = await getResponses(data.formId as string)
        setResponses(r)
      } else {
        setResponses([])
      }
    }
  }

  async function handleCheckin(responseId: string) {
    await checkInResponse(responseId)
    setResponses(prev => prev.map(r =>
      r.id === responseId ? { ...r, checkInStatus: 'checked_in' as const } : r
    ))
  }

  async function handleResetCheckIn(responseId: string) {
    await resetCheckIn(responseId)
    setResponses(prev => prev.map(r =>
      r.id === responseId ? { ...r, checkInStatus: 'not_checked_in' as const, checkInAt: undefined } : r
    ))
  }

  async function handleResetPayment(responseId: string) {
    await resetPaymentStatus(responseId)
    setResponses(prev => prev.map(r =>
      r.id === responseId ? { ...r, paymentStatus: 'pending' as const } : r
    ))
  }

  async function handleDeleteResponse(responseId: string) {
    await deleteResponse(responseId)
    setResponses(prev => prev.filter(r => r.id !== responseId))
  }

  function handleEditResponse(response: Response) {
    setEditModal({ response, answers: { ...(response.answers as Record<string, unknown> ?? {}) } })
  }

  async function handleSaveEdit() {
    if (!editModal) return
    const linkedForm = forms.find(f => f.id === event?.formId)
    const hasAttendeeConfig = (event?.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event?.attendeeFieldId
    const attendeeCount = hasAttendeeConfig
      ? computeAttendeeCount(editModal.answers as Record<string, unknown>, event)
      : editModal.response.attendeeCount

    // Ricalcola importo se il form ha un blocco payment con formula
    let newPaymentAmount = editModal.response.paymentAmount
    if (linkedForm) {
      const paymentNode = linkedForm.nodes?.find(n => n.type === 'payment')
      if (paymentNode) {
        const recalculated = resolvePaymentAmount(
          paymentNode,
          linkedForm.variables ?? [],
          linkedForm.nodes ?? [],
          editModal.answers,
        )
        if (recalculated !== null) newPaymentAmount = recalculated
      }
    }

    const extraFields: Record<string, unknown> = {}
    if (newPaymentAmount !== editModal.response.paymentAmount) extraFields.paymentAmount = newPaymentAmount

    await updateResponseAnswers(editModal.response.id, editModal.answers, attendeeCount, extraFields)
    setResponses(prev => prev.map(r =>
      r.id === editModal.response.id
        ? { ...r, answers: editModal.answers, attendeeCount: attendeeCount ?? r.attendeeCount, ...(newPaymentAmount !== r.paymentAmount ? { paymentAmount: newPaymentAmount } : {}) }
        : r
    ))
    setEditModal(null)
    showToast('Iscrizione aggiornata', 'success')
  }

  function buildReceiptDataFromResponse(response: Response): ReceiptData {
    const nodes = (forms.find(f => f.id === event?.formId)?.nodes ?? [])
    let recipientName = ''
    let recipientEmail = ''
    for (const node of nodes) {
      const val = (response.answers as Record<string, unknown>)?.[node.id]
      if (!val) continue
      if (!recipientName && node.type === 'short_text' && typeof val === 'string') recipientName = val.trim()
      if (!recipientEmail && node.type === 'email' && typeof val === 'string') recipientEmail = val.trim()
    }
    if (!recipientName) recipientName = recipientEmail || 'N/D'
    const today = new Date()
    return {
      receiptNumber: response.receiptNumber ?? `????/${today.getFullYear()}`,
      receiptDate: today.toISOString().split('T')[0],
      recipientName,
      recipientEmail,
      amount: response.paymentAmount ?? 0,
      currency: 'EUR',
      eventTitle: event?.title ?? 'Iscrizione',
      receiptDescription: event?.receiptDescription || undefined,
      eventDate: event?.startDate,
      paymentMethod: response.paymentMethod === 'paypal' ? 'PayPal' : response.paymentMethod === 'in_person' ? 'Contanti / Persona' : 'N/D',
      paypalOrderId: response.paypalOrderId,
    }
  }

  function buildAttendeeInfo(response: Response): { attendeeCount: number; pricePerPerson: number | null } {
    const hasAttendeeConfig = (event?.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event?.attendeeFieldId
    const count = hasAttendeeConfig
      ? computeAttendeeCount((response.answers ?? {}) as Record<string, unknown>, event)
      : (response.attendeeCount ?? 1)
    const pricePerPerson = (response.paymentAmount && count > 1) ? response.paymentAmount / count : null
    return { attendeeCount: count, pricePerPerson }
  }

  function handleMarkPaid(response: Response) {
    const receiptData = buildReceiptDataFromResponse(response)
    const { attendeeCount, pricePerPerson } = buildAttendeeInfo(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal: fiscal ?? { organizationName: '', fiscalCode: '', address: '', city: '', postalCode: '', province: '' },
      sendReceipt: !!fiscal?.organizationName,
      mode: 'markPaid',
      attendeeCount,
      pricePerPerson,
    })
  }

  function handleSendCopy(response: Response) {
    if (!fiscal?.organizationName) {
      showToast('Configura prima i dati fiscali nelle Impostazioni', 'error')
      return
    }
    const receiptData = buildReceiptDataFromResponse(response)
    const { attendeeCount, pricePerPerson } = buildAttendeeInfo(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal,
      sendReceipt: true,
      mode: 'sendCopy',
      attendeeCount,
      pricePerPerson,
    })
  }

  function handleGenerate(response: Response) {
    if (!fiscal?.organizationName) {
      showToast('Configura prima i dati fiscali nelle Impostazioni', 'error')
      return
    }
    const receiptData = buildReceiptDataFromResponse(response)
    const { attendeeCount, pricePerPerson } = buildAttendeeInfo(response)
    setReceiptModal({
      responseId: response.id,
      recipientEmail: receiptData.recipientEmail ?? '',
      receipt: receiptData,
      fiscal,
      sendReceipt: true,
      mode: 'generate',
      attendeeCount,
      pricePerPerson,
    })
  }

  async function handleConfirmMarkPaid() {
    if (!receiptModal) return
    setSendingReceipt(true)
    try {
      const newAmount = receiptModal.pricePerPerson != null
        ? receiptModal.pricePerPerson * receiptModal.attendeeCount
        : receiptModal.receipt.amount
      await updateResponsePaymentStatus(receiptModal.responseId, 'completed', undefined, true)
      // Aggiorna attendeeCount e paymentAmount se modificati
      await updateDoc(fsDoc(db, 'responses', receiptModal.responseId), {
        attendeeCount: receiptModal.attendeeCount,
        paymentAmount: newAmount,
      })
      setResponses(prev => prev.map(r =>
        r.id === receiptModal.responseId
          ? { ...r, paymentStatus: 'completed' as const, attendeeCount: receiptModal.attendeeCount, paymentAmount: newAmount }
          : r
      ))
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
        setResponses(prev => prev.map(r => r.id === receiptModal.responseId ? { ...r, receiptNumber } : r))
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

  const hasPayment = responses.some(r => r.paymentStatus !== 'none')

  const filtered = useMemo(() => {
    const text = filterText.toLowerCase()
    return responses.filter(r => {
      const answers = (r.answers ?? {}) as Record<string, unknown>
      const textMatch = !text || Object.values(answers).some(v => String(v ?? '').toLowerCase().includes(text))
      const paymentMatch = filterPayment === 'all' || r.paymentStatus === filterPayment
      const checkinMatch = filterCheckin === 'all' || r.checkInStatus === filterCheckin
      return textMatch && paymentMatch && checkinMatch
    })
  }, [responses, filterText, filterPayment, filterCheckin])

  const completedCount = responses.filter(r => r.paymentStatus === 'completed').length
  const pendingCount = responses.filter(r => r.paymentStatus === 'pending').length
  const checkedInCount = responses.filter(r => r.checkInStatus === 'checked_in').length
  const capacity = event?.totalCapacity ?? null
  const bookedAttendees = countAttendees(responses, event?.attendeeFieldId, event?.attendeeFieldIds)
  const pct = capacity ? Math.min(100, Math.round((bookedAttendees / capacity) * 100)) : 0

  function exportCSV() {
    if (responses.length === 0) return
    const allKeys = Array.from(new Set(responses.flatMap(r => Object.keys((r.answers as object) ?? {}))))
    const headers = ['ID', 'Data', ...allKeys, 'Stato Pagamento', 'Check-in']
    const rows = responses.map(r => [
      r.id,
      r.submittedAt?.toDate?.().toISOString() ?? '',
      ...allKeys.map(k => String(((r.answers as Record<string, unknown>) ?? {})[k] ?? '')),
      r.paymentStatus,
      r.checkInStatus,
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `partecipanti-${eventId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fieldLabels = useMemo(() => {
    const map: Record<string, string> = {}
    const linkedForm = forms.find(f => f.id === event?.formId)
    linkedForm?.nodes?.forEach(n => { map[n.id] = n.properties.label || n.id })
    return map
  }, [forms, event?.formId])

  // nameKey = primo campo short_text o email del form (per colonna Nome)
  const nameKey = useMemo(() => {
    const linkedForm = forms.find(f => f.id === event?.formId)
    return linkedForm?.nodes?.find(n => n.type === 'short_text' || n.type === 'email')?.id ?? null
  }, [forms, event?.formId])

  const answerKeys = useMemo(() => {
    const allKeys = Array.from(new Set(responses.flatMap(r => Object.keys((r.answers as object) ?? {}))))
    // Escludi nameKey dalle colonne "campi form" aggiuntive (già mostrato in colonna Nome)
    return allKeys.filter(k => k !== nameKey).slice(0, 3)
  }, [responses, nameKey])

  function toggleCol(col: ColKey) {
    setVisibleCols(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
      localStorage.setItem('event_table_cols', JSON.stringify(next))
      return next
    })
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!event) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Icon name="event_busy" size={64} className="text-[#c4c5d5]" />
          <p className="text-[#444653]">Evento non trovato.</p>
          <button onClick={() => navigate('/events')} className="text-[#002068] font-bold hover:underline">
            Torna agli eventi
          </button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Back + header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/events')}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#747684] hover:text-[#002068] transition-colors mb-4"
        >
          <Icon name="arrow_back" size={16} />
          Tutti gli eventi
        </button>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black text-[#002068]">{event.title}</h1>
              {statusBadge(event.status)}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[#444653]">
              {event.startDate && (
                <span className="flex items-center gap-1.5">
                  <Icon name="calendar_month" size={15} className="text-[#002068]" />
                  {formatDate(event.startDate)}{event.startTime ? ` · ${event.startTime}` : ''}
                </span>
              )}
              {event.location && (
                <a
                  href={event.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:underline hover:text-[#002068]"
                >
                  <Icon name="location_on" size={15} className="text-[#002068]" />
                  {event.location}
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/e/${event.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 border border-[#002068] text-[#002068] rounded-xl font-bold text-sm hover:bg-[#dce1ff] transition-all"
              title="Vedi pagina pubblica evento"
            >
              <Icon name="open_in_new" size={18} />
              Pagina pubblica
            </a>
            {event.formId && (
              <Link
                to={`/events/${event.id}/new-registration`}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#e6f9ee] text-[#1a6b3a] border border-[#1a6b3a] rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all"
              >
                <Icon name="person_add" size={18} />
                Nuova iscrizione
              </Link>
            )}
            {event.formId && (
              <Link
                to={`/admin/checkin/${event.formId}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#fe9832] text-[#683700] rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow"
              >
                <Icon name="qr_code_scanner" size={18} />
                Scanner
              </Link>
            )}
            <button
              onClick={() => setShowCassa(true)}
              className="hidden md:flex items-center gap-2 px-4 py-2.5 bg-[#5c1a5e] text-white rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow"
            >
              <Icon name="point_of_sale" size={18} />
              Cassa
            </button>
            <button
              onClick={exportCSV}
              disabled={responses.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow disabled:opacity-50"
            >
              <Icon name="download" size={18} />
              Esporta CSV
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#002068] text-white p-4 rounded-xl">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">
            {event?.attendeeFieldId ? 'Persone' : 'Iscritti'}
          </p>
          <p className="text-3xl font-black mt-1">{bookedAttendees}</p>
          {event?.attendeeFieldId && (
            <p className="text-xs opacity-60 mt-0.5">{responses.length} iscrizioni</p>
          )}
          {capacity !== null && (
            <p className="text-xs opacity-60 mt-1">su {capacity} posti ({pct}%)</p>
          )}
        </div>
        {hasPayment && (
          <div className="bg-[#fe9832] text-[#683700] p-4 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Pagamenti OK</p>
            <p className="text-3xl font-black mt-1">{completedCount}</p>
            <p className="text-xs opacity-70 mt-1">{pendingCount} in attesa</p>
          </div>
        )}
        <div className="bg-[#1a1b22] text-white p-4 rounded-xl">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">Check-in</p>
          <p className="text-3xl font-black mt-1">{checkedInCount}</p>
          <p className="text-xs opacity-60 mt-1">{responses.length - checkedInCount} non entrati</p>
        </div>
        {capacity !== null && (
          <div className="bg-white border border-[#c4c5d5] p-4 rounded-xl">
            <p className="text-xs font-bold text-[#444653] uppercase tracking-widest mb-2">Posti disponibili</p>
            <p className="text-3xl font-black text-[#002068]">{Math.max(0, capacity - bookedAttendees)}</p>
            <div className="h-2 bg-[#e8e7f0] rounded-full mt-2">
              <div
                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : 'bg-[#fe9832]'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#e8e7f0] p-1 rounded-xl w-fit mb-6 flex-wrap">
        {([
          { key: 'participants', icon: 'people', label: 'Partecipanti' },
          { key: 'accounting', icon: 'account_balance_wallet', label: 'Contabilità' },
          { key: 'settings', icon: 'settings', label: 'Impostazioni' },
        ] as const).map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === key
                ? 'bg-white text-[#002068] shadow-sm'
                : 'text-[#444653] hover:text-[#002068]'
            }`}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Participants */}
      {tab === 'participants' && (
        <>
          {/* Filters */}
          <div className="bg-[#f4f3fc] p-4 rounded-xl border border-[#c4c5d5] flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444653]" />
              <input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-lg border border-[#c4c5d5] text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                placeholder="Cerca partecipante..."
              />
            </div>
            {hasPayment && (
              <select
                value={filterPayment}
                onChange={e => setFilterPayment(e.target.value)}
                className="bg-white border border-[#c4c5d5] rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              >
                <option value="all">Pagamento: Tutti</option>
                <option value="completed">Completato</option>
                <option value="pending">In attesa</option>
                <option value="failed">Fallito</option>
              </select>
            )}
            <select
              value={filterCheckin}
              onChange={e => setFilterCheckin(e.target.value)}
              className="bg-white border border-[#c4c5d5] rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            >
              <option value="all">Check-in: Tutti</option>
              <option value="checked_in">Entrati</option>
              <option value="not_checked_in">Non entrati</option>
            </select>
            {/* Selezione colonne — mostrato sempre, utile su mobile */}
            <div className="relative">
              <button
                onClick={() => setShowColPicker(p => !p)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#c4c5d5] rounded-lg text-sm font-bold text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-colors"
              >
                <Icon name="view_column" size={16} />
                <span className="hidden sm:inline">Colonne</span>
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#c4c5d5] rounded-xl shadow-lg z-20 min-w-[160px] py-2">
                  {ALL_COLS
                    .filter(c => c !== 'payment' || hasPayment)
                    .filter(c => c !== 'attendees' || (event.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event.attendeeFieldId)
                    .map(col => (
                      <label key={col} className="flex items-center gap-2.5 px-4 py-2 hover:bg-[#f4f3fc] cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(col)}
                          onChange={() => toggleCol(col)}
                          className="accent-[#002068]"
                        />
                        {COL_LABELS[col]}
                      </label>
                    ))}
                </div>
              )}
            </div>
            <span className="text-xs text-[#747684] ml-auto">{filtered.length} partecipanti</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-[#c4c5d5] shadow-sm overflow-hidden">
            {event.formId ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#eeedf6] border-b border-[#c4c5d5]">
                      {visibleCols.includes('date') && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider whitespace-nowrap">Data</th>
                      )}
                      {visibleCols.includes('name') && nameKey && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">
                          {fieldLabels[nameKey] ?? 'Nome'}
                        </th>
                      )}
                      {visibleCols.includes('answers') && answerKeys.map(k => (
                        <th key={k} className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">
                          {fieldLabels[k] ?? k}
                        </th>
                      ))}
                      {visibleCols.includes('attendees') && ((event.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event.attendeeFieldId) && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider whitespace-nowrap">Persone</th>
                      )}
                      {visibleCols.includes('payment') && hasPayment && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Pagamento</th>
                      )}
                      {visibleCols.includes('checkin') && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Check-in</th>
                      )}
                      <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e7f0]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={visibleCols.length + 1} className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <Icon name="people" size={48} className="text-[#c4c5d5]" />
                            <p className="text-[#444653] font-medium">
                              {responses.length === 0 ? 'Nessun iscritto ancora.' : 'Nessun risultato per i filtri applicati.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map(r => (
                        <ParticipantRow
                          key={r.id}
                          response={r}
                          nameKey={nameKey}
                          answerKeys={answerKeys}
                          fieldLabels={fieldLabels}
                          hasPayment={hasPayment}
                          visibleCols={visibleCols}
                          event={event}
                          onShowTicket={() => setTicketResponse(r)}
                          onCheckin={() => handleCheckin(r.id)}
                          onResetCheckIn={() => handleResetCheckIn(r.id)}
                          onResetPayment={() => handleResetPayment(r.id)}
                          onDelete={() => handleDeleteResponse(r.id)}
                          onMarkPaid={() => handleMarkPaid(r)}
                          onSendCopy={() => handleSendCopy(r)}
                          onGenerate={() => handleGenerate(r)}
                          onEdit={() => handleEditResponse(r)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-20 px-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#ffdcc2] flex items-center justify-center">
                  <Icon name="link_off" size={32} className="text-[#fe9832]" />
                </div>
                <div>
                  <p className="font-bold text-[#1a1b22] mb-1">Nessun form collegato</p>
                  <p className="text-sm text-[#747684] max-w-sm">
                    Collega un form di iscrizione nelle Impostazioni per raccogliere e visualizzare i partecipanti.
                  </p>
                </div>
                <button
                  onClick={() => setTab('settings')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-all"
                >
                  <Icon name="settings" size={16} />
                  Vai alle impostazioni
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab: Accounting */}
      {tab === 'accounting' && (
        <AccountingTab eventId={event.id} responses={responses} forms={forms} formId={event.formId} />
      )}

      {/* Tab: Settings */}
      {tab === 'settings' && (
        <SettingsPanel event={event} forms={forms} responses={responses} onSave={handleSave} />
      )}

      {ticketResponse && (
        <TicketModal
          response={ticketResponse}
          formTitle={event.title}
          fieldLabels={fieldLabels}
          attendeeFieldId={event.attendeeFieldId}
          event={event}
          onClose={() => setTicketResponse(null)}
        />
      )}

      {editModal && (() => {
        const linkedForm = forms.find(f => f.id === event.formId)
        const editableNodes = (linkedForm?.nodes ?? []).filter(n =>
          !['end_screen', 'page_break', 'divider', 'rich_text', 'html', 'payment'].includes(n.type)
        )
        const paymentNode = linkedForm?.nodes?.find(n => n.type === 'payment')
        const liveAmount = paymentNode
          ? resolvePaymentAmount(paymentNode, linkedForm?.variables ?? [], linkedForm?.nodes ?? [], editModal.answers)
          : null
        const originalAmount = editModal.response.paymentAmount ?? null
        const amountChanged = liveAmount !== null && liveAmount !== originalAmount
        const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: paymentNode?.properties?.currency ?? 'EUR' }).format(n)

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e7f0] shrink-0">
                <div>
                  <h2 className="text-lg font-black text-[#002068]">Modifica iscrizione</h2>
                  <p className="text-xs text-[#747684] mt-0.5">ID: {editModal.response.id.slice(0, 12)}…</p>
                </div>
                <button onClick={() => setEditModal(null)} className="text-[#747684] hover:text-[#1a1b22] p-1 rounded transition-colors">
                  <Icon name="close" size={20} />
                </button>
              </div>

              {/* Anteprima importo live */}
              {liveAmount !== null && (
                <div className={`mx-6 mt-4 rounded-xl px-4 py-3 flex items-center gap-3 ${amountChanged ? 'bg-[#fff3e0] border border-[#fe9832]' : 'bg-[#f4f3fc] border border-[#c4c5d5]'}`}>
                  <Icon name="payments" size={18} className={amountChanged ? 'text-[#fe9832]' : 'text-[#747684]'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#444653] uppercase tracking-wider">Importo calcolato</p>
                    <p className={`text-xl font-black ${amountChanged ? 'text-[#683700]' : 'text-[#002068]'}`}>{fmt(liveAmount)}</p>
                  </div>
                  {amountChanged && originalAmount !== null && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[#747684]">precedente</p>
                      <p className="text-sm font-semibold text-[#747684] line-through">{fmt(originalAmount)}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {editableNodes.length === 0 ? (
                  <p className="text-sm text-[#747684] text-center py-8">Nessun campo modificabile trovato nel form.</p>
                ) : editableNodes.map(node => (
                  <EditField
                    key={node.id}
                    node={node}
                    value={editModal.answers[node.id]}
                    onChange={v => setEditModal(m => m ? { ...m, answers: { ...m.answers, [node.id]: v } } : m)}
                  />
                ))}
              </div>
              <div className="px-6 py-4 border-t border-[#e8e7f0] bg-[#f4f3fc] rounded-b-2xl flex gap-3 shrink-0">
                <button
                  onClick={() => setEditModal(null)}
                  className="flex-1 py-2.5 border border-[#c4c5d5] text-[#444653] rounded-xl font-semibold text-sm hover:bg-white transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-colors"
                >
                  <Icon name="save" size={16} />
                  Salva modifiche
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Cassa fullscreen overlay ── */}
      {showCassa && (
        <CassaTab
          event={event}
          workspaceId={workspaceId}
          onUpdateEvent={handleSave}
          onClose={() => setShowCassa(false)}
        />
      )}

      {/* ── Modale Ricevuta ── */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e7f0] shrink-0">
              <div>
                <h2 className="text-lg font-black text-[#002068]">
                  {receiptModal.mode === 'markPaid' ? 'Segna come Pagato' : receiptModal.mode === 'generate' ? 'Genera Ricevuta' : 'Invia Copia Ricevuta'}
                </h2>
                <p className="text-xs text-[#747684] mt-0.5">
                  {receiptModal.mode === 'markPaid' ? 'Verifica i dati prima di confermare il pagamento' : receiptModal.mode === 'generate' ? 'Genera e invia la ricevuta per questo pagamento già completato' : 'Invia una copia della ricevuta al destinatario'}
                </p>
              </div>
              <button onClick={() => !sendingReceipt && setReceiptModal(null)} className="text-[#747684] hover:text-[#1a1b22] p-1 rounded transition-colors">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {receiptModal.fiscal.organizationName ? (
                <ReceiptDocument fiscal={receiptModal.fiscal} receipt={receiptModal.receipt} compact />
              ) : (
                <div className="flex items-center gap-3 p-4 bg-[#fff3e0] border border-[#fe9832] rounded-xl">
                  <Icon name="warning" size={20} className="text-[#fe9832] shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[#683700]">Dati fiscali non configurati</p>
                    <p className="text-xs text-[#8f5a00] mt-0.5">Vai in Impostazioni → Dati Fiscali per abilitare l'invio delle ricevute.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#e8e7f0] bg-[#f4f3fc] rounded-b-2xl shrink-0 space-y-4">
              {/* Numero partecipanti modificabile */}
              {receiptModal.mode === 'markPaid' && (
                <div className="p-3 bg-white rounded-xl border border-[#c4c5d5] space-y-3">
                  <p className="text-xs font-bold text-[#444653] uppercase tracking-wider">Numero partecipanti</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setReceiptModal(m => m && m.attendeeCount > 1 ? { ...m, attendeeCount: m.attendeeCount - 1 } : m)}
                      className="w-9 h-9 rounded-lg border border-[#c4c5d5] text-[#444653] font-bold text-lg hover:bg-[#f4f3fc] transition-colors flex items-center justify-center"
                    >−</button>
                    <span className="text-2xl font-black text-[#002068] min-w-[2rem] text-center">{receiptModal.attendeeCount}</span>
                    <button
                      onClick={() => setReceiptModal(m => m ? { ...m, attendeeCount: m.attendeeCount + 1 } : m)}
                      className="w-9 h-9 rounded-lg border border-[#c4c5d5] text-[#444653] font-bold text-lg hover:bg-[#f4f3fc] transition-colors flex items-center justify-center"
                    >+</button>
                    {receiptModal.pricePerPerson != null && (
                      <span className="ml-2 text-sm text-[#747684]">
                        × €{receiptModal.pricePerPerson.toFixed(2)}&nbsp;=&nbsp;
                        <strong className="text-[#002068]">€{(receiptModal.pricePerPerson * receiptModal.attendeeCount).toFixed(2)}</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#747684]">Modifica se il numero di persone presenti differisce dall'iscrizione originale. L'importo verrà aggiornato.</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider block">Email destinatario</label>
                <input
                  type="email"
                  value={receiptModal.recipientEmail}
                  onChange={e => setReceiptModal(m => m ? { ...m, recipientEmail: e.target.value } : m)}
                  placeholder="email@esempio.it"
                  className="w-full h-10 px-4 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                />
              </div>
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
              <div className="flex gap-3">
                {receiptModal.mode === 'markPaid' ? (
                  <button
                    onClick={handleConfirmMarkPaid}
                    disabled={sendingReceipt}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-[#4caf50] text-white rounded-xl font-bold text-sm hover:bg-[#388e3c] transition-colors disabled:opacity-60 shadow-md"
                  >
                    {sendingReceipt ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="payments" size={16} />}
                    {sendingReceipt ? 'In corso…' : 'Pagato'}
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmSendCopy}
                    disabled={sendingReceipt || (receiptModal.sendReceipt && !receiptModal.recipientEmail)}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-colors disabled:opacity-60 shadow-md"
                  >
                    {sendingReceipt ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="receipt_long" size={16} />}
                    {sendingReceipt ? 'Generazione…' : receiptModal.sendReceipt
                      ? (receiptModal.mode === 'generate' ? 'Genera e invia' : 'Invia copia')
                      : 'Genera ricevuta'}
                  </button>
                )}
                <button onClick={() => setReceiptModal(null)} disabled={sendingReceipt} className="px-5 py-2.5 border border-[#c4c5d5] text-[#444653] rounded-xl font-bold text-sm hover:bg-white transition-colors disabled:opacity-50">
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

// ─── Participant Row ──────────────────────────────────────────────────────────

// ─── EditField: input per la modale di modifica iscrizione ───────────────────

function EditField({
  node,
  value,
  onChange,
}: {
  node: import('../../types/form').FormNode
  value: unknown
  onChange: (v: unknown) => void
}) {
  const { type, properties } = node
  const inputCls = 'w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm bg-white'

  return (
    <div>
      <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
        {properties.label || node.id}
        {properties.required && <span className="text-[#ba1a1a] ml-1">*</span>}
      </label>
      {(type === 'short_text' || type === 'email' || type === 'phone') && (
        <input
          type={type === 'email' ? 'email' : type === 'phone' ? 'tel' : 'text'}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={properties.placeholder ?? ''}
          className={inputCls}
        />
      )}
      {type === 'long_text' && (
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={properties.placeholder ?? ''}
          className={`${inputCls} resize-none`}
        />
      )}
      {type === 'number' && (
        <input
          type="number"
          value={value !== undefined && value !== null && value !== '' ? String(value) : ''}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={properties.placeholder ?? ''}
          className={inputCls}
        />
      )}
      {type === 'date' && (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {type === 'time' && (
        <input
          type="time"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {(type === 'radio' || type === 'dropdown') && (
        <div className="space-y-1.5">
          {(properties.options ?? []).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`w-full flex items-center gap-3 p-3 border rounded-xl text-left text-sm transition-all ${
                value === opt.value
                  ? 'border-[#002068] bg-[#dce1ff]'
                  : 'border-[#c4c5d5] hover:border-[#b5c4ff] bg-white'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${value === opt.value ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'}`} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
      {type === 'checkbox' && (
        <div className="space-y-1.5">
          {(properties.options ?? []).map(opt => {
            const selected: string[] = Array.isArray(value) ? value as string[] : []
            const checked = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const next = checked ? selected.filter(v => v !== opt.value) : [...selected, opt.value]
                  onChange(next)
                }}
                className={`w-full flex items-center gap-3 p-3 border rounded-xl text-left text-sm transition-all ${
                  checked ? 'border-[#002068] bg-[#dce1ff]' : 'border-[#c4c5d5] hover:border-[#b5c4ff] bg-white'
                }`}
              >
                <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${checked ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'}`}>
                  {checked && <Icon name="check" size={12} className="text-white" />}
                </div>
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
      {type === 'hidden' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
      )}
      {properties.helpText && (
        <p className="mt-1 text-xs text-[#747684]">{properties.helpText}</p>
      )}
    </div>
  )
}

function ParticipantRow({
  response,
  nameKey,
  answerKeys,
  fieldLabels: _fieldLabels,
  hasPayment,
  visibleCols,
  event,
  onShowTicket,
  onCheckin,
  onResetCheckIn,
  onResetPayment,
  onDelete,
  onMarkPaid,
  onSendCopy,
  onGenerate,
  onEdit,
}: {
  response: Response
  nameKey: string | null
  answerKeys: string[]
  fieldLabels: Record<string, string>
  hasPayment: boolean
  visibleCols: ColKey[]
  event: SolidandoEvent
  onShowTicket: () => void
  onCheckin: () => Promise<void>
  onResetCheckIn: () => Promise<void>
  onResetPayment: () => Promise<void>
  onDelete: () => Promise<void>
  onMarkPaid: () => void
  onSendCopy: () => void
  onGenerate: () => void
  onEdit: () => void
}) {
  const [checkingIn, setCheckingIn] = useState(false)
  const [resettingCheckIn, setResettingCheckIn] = useState(false)
  const [resettingPayment, setResettingPayment] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const answers = (response.answers ?? {}) as Record<string, unknown>
  const date = response.submittedAt?.toDate
    ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(response.submittedAt.toDate())
    : '—'

  function formatValue(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—'
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }


  const checkedIn = response.checkInStatus === 'checked_in'

  async function handleCheckin() {
    setCheckingIn(true)
    try {
      await onCheckin()
    } catch {
      // errore gestito dal parent; resetta lo spinner
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleResetCheckIn() {
    setResettingCheckIn(true)
    try { await onResetCheckIn() } catch { /* ignore */ } finally { setResettingCheckIn(false) }
  }

  async function handleResetPayment() {
    setResettingPayment(true)
    try { await onResetPayment() } catch { /* ignore */ } finally { setResettingPayment(false) }
  }

  async function handleDelete() {
    if (!window.confirm('Eliminare questa iscrizione? L\'operazione non è reversibile.')) return
    setDeleting(true)
    try { await onDelete() } catch { /* ignore */ } finally { setDeleting(false) }
  }

  return (
    <tr className="hover:bg-[#f4f3fc] transition-colors">
      {visibleCols.includes('date') && (
        <td className="px-5 py-4 text-sm text-[#444653] whitespace-nowrap">{date}</td>
      )}
      {visibleCols.includes('name') && nameKey && (
        <td className="px-5 py-4 text-sm font-semibold text-[#1a1b22] max-w-[200px] truncate">
          {formatValue(answers[nameKey])}
        </td>
      )}
      {visibleCols.includes('answers') && answerKeys.map(k => (
        <td key={k} className="px-5 py-4 text-sm text-[#1a1b22] max-w-[160px] truncate">
          {formatValue(answers[k])}
        </td>
      ))}
      {visibleCols.includes('attendees') && ((event.attendeeFieldIds && event.attendeeFieldIds.length > 0) || !!event.attendeeFieldId) && (
        <td className="px-5 py-4 text-sm font-bold text-[#002068] text-center">
          {computeAttendeeCount(answers, event)}
        </td>
      )}
      {visibleCols.includes('payment') && hasPayment && (
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5">
            {response.paymentStatus === 'completed' && (
              <span title="Pagato"><Icon name="check_circle" size={18} className="text-[#2e7d32]" /></span>
            )}
            {response.paymentStatus === 'pending' && (
              <span title="In attesa"><Icon name="hourglass_top" size={18} className="text-[#e65100]" /></span>
            )}
            {response.paymentStatus === 'failed' && (
              <span title="Fallito"><Icon name="cancel" size={18} className="text-[#ba1a1a]" /></span>
            )}
            {response.paymentMethod === 'paypal' && (
              <span title="PayPal"><Icon name="credit_card" size={15} className="text-[#747684]" /></span>
            )}
            {response.paymentMethod === 'in_person' && (
              <span title="Contanti / In persona"><Icon name="payments" size={15} className="text-[#747684]" /></span>
            )}
          </div>
        </td>
      )}
      {visibleCols.includes('checkin') && (
        <td className="px-5 py-4">
          {checkedIn
            ? <span title="Entrato"><Icon name="how_to_reg" size={20} className="text-[#2e7d32]" /></span>
            : <span title="In attesa"><Icon name="schedule" size={20} className="text-[#e65100]" /></span>}
        </td>
      )}
      <td className="px-5 py-4">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={onShowTicket}
            title="Visualizza biglietto"
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-colors sm:px-3"
          >
            <Icon name="qr_code" size={14} />
            <span className="hidden sm:inline">Biglietto</span>
          </button>
          {hasPayment && response.paymentStatus === 'pending' && (
            <button
              onClick={onMarkPaid}
              title="Segna come pagato"
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#4caf50] border border-[#4caf50] rounded-lg hover:bg-[#e8f5e9] transition-colors sm:px-3"
            >
              <Icon name="payments" size={14} />
              <span className="hidden sm:inline">Pagato</span>
            </button>
          )}
          {hasPayment && response.paymentStatus === 'completed' && !response.receiptNumber && (
            <button
              onClick={onGenerate}
              title="Genera ricevuta"
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#fe9832] border border-[#fe9832] rounded-lg hover:bg-[#fff3e0] transition-colors sm:px-3"
            >
              <Icon name="receipt_long" size={14} />
              <span className="hidden sm:inline">Genera Ricevuta</span>
            </button>
          )}
          {hasPayment && response.paymentStatus === 'completed' && response.receiptNumber && (
            <button
              onClick={onSendCopy}
              title={`Invia copia ricevuta ${response.receiptNumber}`}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-colors sm:px-3"
            >
              <Icon name="receipt_long" size={14} />
              <span className="hidden sm:inline">Ricevuta</span>
            </button>
          )}
          {!checkedIn && (
            <button
              onClick={handleCheckin}
              disabled={checkingIn}
              title="Segna come entrato"
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#1a6b3a] border border-[#1a6b3a] rounded-lg hover:bg-[#e6f9ee] transition-colors disabled:opacity-50 sm:px-3"
            >
              {checkingIn
                ? <span className="w-3 h-3 border-2 border-[#1a6b3a] border-t-transparent rounded-full animate-spin" />
                : <Icon name="how_to_reg" size={14} />}
              <span className="hidden sm:inline">Check-in</span>
            </button>
          )}
          {checkedIn && (
            <button
              onClick={handleResetCheckIn}
              disabled={resettingCheckIn}
              title="Annulla check-in"
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#747684] border border-[#747684] rounded-lg hover:bg-[#f4f3fc] transition-colors disabled:opacity-50 sm:px-3"
            >
              {resettingCheckIn
                ? <span className="w-3 h-3 border-2 border-[#747684] border-t-transparent rounded-full animate-spin" />
                : <Icon name="undo" size={14} />}
              <span className="hidden sm:inline">Annulla check-in</span>
            </button>
          )}
          {hasPayment && response.paymentStatus === 'completed' && (
            <button
              onClick={handleResetPayment}
              disabled={resettingPayment}
              title="Ripristina stato pagamento a 'In attesa'"
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#747684] border border-[#747684] rounded-lg hover:bg-[#f4f3fc] transition-colors disabled:opacity-50 sm:px-3"
            >
              {resettingPayment
                ? <span className="w-3 h-3 border-2 border-[#747684] border-t-transparent rounded-full animate-spin" />
                : <Icon name="undo" size={14} />}
              <span className="hidden sm:inline">Annulla pagato</span>
            </button>
          )}
          <button
            onClick={onEdit}
            title="Modifica iscrizione"
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#444653] border border-[#c4c5d5] rounded-lg hover:bg-[#f4f3fc] transition-colors sm:px-3"
          >
            <Icon name="edit" size={14} />
            <span className="hidden sm:inline">Modifica</span>
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Elimina iscrizione"
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold text-[#ba1a1a] border border-[#ba1a1a] rounded-lg hover:bg-[#fdecea] transition-colors disabled:opacity-50 sm:px-3"
          >
            {deleting
              ? <span className="w-3 h-3 border-2 border-[#ba1a1a] border-t-transparent rounded-full animate-spin" />
              : <Icon name="delete" size={14} />}
            <span className="hidden sm:inline">Elimina</span>
          </button>
        </div>
      </td>
    </tr>
  )
}
