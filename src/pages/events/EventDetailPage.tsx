import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { getEvent, updateEvent, countAttendees } from '../../firebase/events'
import { getResponses, checkInResponse } from '../../firebase/responses'
import { getForms } from '../../firebase/forms'
import { useAuthStore } from '../../stores/authStore'
import type { SolidandoEvent, Response, Form, EventStatus, TicketType } from '../../types/form'
import { nanoid } from 'nanoid'

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

// ─── Ticket Modal ─────────────────────────────────────────────────────────────

function TicketModal({ response, formTitle, fieldLabels, attendeeFieldId, event, onClose }: {
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
  if (attendeeFieldId && answers[attendeeFieldId]) {
    const count = Number(answers[attendeeFieldId])
    if (!isNaN(count) && count > 0) {
      ticketLines.push({ label: 'Partecipanti', value: String(count) })
    }
  } else if (response.attendeeCount && response.attendeeCount > 1) {
    ticketLines.push({ label: 'Partecipanti', value: String(response.attendeeCount) })
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

type Tab = 'participants' | 'settings'

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
  const [ctaLabel, setCtaLabel] = useState(event.ctaLabel ?? '')
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(event.ticketTypes ?? [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      ctaLabel: ctaLabel.trim() || undefined,
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
        <select value={formId} onChange={e => { setFormId(e.target.value); setAttendeeFieldId('') }} className={inputCls}>
          <option value="">— Nessun form —</option>
          {forms.map(f => (
            <option key={f.id} value={f.id}>{f.title}</option>
          ))}
        </select>
        {formId && (() => {
          const linkedForm = forms.find(f => f.id === formId)
          const numberNodes = (linkedForm?.nodes ?? []).filter(n => n.type === 'number')
          if (numberNodes.length === 0) return null
          const previewCount = attendeeFieldId
            ? responses.reduce((sum, r) => {
                const val = Number((r.answers as Record<string, unknown>)?.[attendeeFieldId] ?? 1)
                return sum + (isNaN(val) || val < 1 ? 1 : val)
              }, 0)
            : responses.length
          return (
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Campo "numero persone"</label>
              <select value={attendeeFieldId} onChange={e => setAttendeeFieldId(e.target.value)} className={inputCls}>
                <option value="">— Conta le risposte (1 per iscrizione) —</option>
                {numberNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
                ))}
              </select>
              {responses.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-[#002068]">
                  Conteggio attuale: <strong>{previewCount} persone</strong> ({responses.length} iscrizioni)
                </p>
              )}
              <p className="mt-0.5 text-xs text-[#747684]">Se impostato, i posti occupati si calcolano sommando il valore di questo campo su ogni risposta.</p>
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

  const workspaceId = profile?.workspaceIds?.[0] ?? user?.uid ?? ''

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
  const bookedAttendees = countAttendees(responses, event?.attendeeFieldId)
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

  const answerKeys = useMemo(
    () => Array.from(new Set(responses.flatMap(r => Object.keys((r.answers as object) ?? {})))).slice(0, 3),
    [responses],
  )

  const fieldLabels = useMemo(() => {
    const map: Record<string, string> = {}
    // If we have a linked form in forms list, use its node labels
    const linkedForm = forms.find(f => f.id === event?.formId)
    linkedForm?.nodes?.forEach(n => { map[n.id] = n.properties.label || n.id })
    return map
  }, [forms, event?.formId])

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

          <div className="flex items-center gap-2">
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
                to={`/admin/checkin/${event.formId}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#fe9832] text-[#683700] rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all shadow"
              >
                <Icon name="qr_code_scanner" size={18} />
                Scanner
              </Link>
            )}
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
      <div className="flex gap-1 bg-[#e8e7f0] p-1 rounded-xl w-fit mb-6">
        {([
          { key: 'participants', icon: 'people', label: 'Partecipanti' },
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
            <span className="text-xs text-[#747684] ml-auto">{filtered.length} partecipanti</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-[#c4c5d5] shadow-sm overflow-hidden">
            {event.formId ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#eeedf6] border-b border-[#c4c5d5]">
                      <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Data iscrizione</th>
                      {answerKeys.map(k => (
                        <th key={k} className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">
                          {fieldLabels[k] ?? k}
                        </th>
                      ))}
                      {hasPayment && (
                        <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Pagamento</th>
                      )}
                      <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Check-in</th>
                      <th className="px-5 py-4 text-xs font-bold text-[#444653] uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e7f0]">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={answerKeys.length + 4} className="px-6 py-16 text-center">
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
                          answerKeys={answerKeys}
                          fieldLabels={fieldLabels}
                          hasPayment={hasPayment}
                          onShowTicket={() => setTicketResponse(r)}
                          onCheckin={() => handleCheckin(r.id)}
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
    </AppLayout>
  )
}

// ─── Participant Row ──────────────────────────────────────────────────────────

function ParticipantRow({
  response,
  answerKeys,
  hasPayment,
  onShowTicket,
  onCheckin,
}: {
  response: Response
  answerKeys: string[]
  fieldLabels: Record<string, string>
  hasPayment: boolean
  onShowTicket: () => void
  onCheckin: () => Promise<void>
}) {
  const [checkingIn, setCheckingIn] = useState(false)
  const answers = (response.answers ?? {}) as Record<string, unknown>
  const date = response.submittedAt?.toDate
    ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(response.submittedAt.toDate())
    : '—'

  function formatValue(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—'
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  }

  const paymentBadge = () => {
    const map: Record<string, { variant: 'success' | 'warning' | 'error'; label: string }> = {
      completed: { variant: 'success', label: 'Pagato' },
      pending: { variant: 'warning', label: 'In attesa' },
      failed: { variant: 'error', label: 'Fallito' },
    }
    const s = map[response.paymentStatus]
    if (!s) return null
    return <Badge variant={s.variant} dot>{s.label}</Badge>
  }

  const checkedIn = response.checkInStatus === 'checked_in'

  async function handleCheckin() {
    setCheckingIn(true)
    await onCheckin()
    setCheckingIn(false)
  }

  return (
    <tr className="hover:bg-[#f4f3fc] transition-colors">
      <td className="px-5 py-4 text-sm text-[#444653] whitespace-nowrap">{date}</td>
      {answerKeys.map(k => (
        <td key={k} className="px-5 py-4 text-sm text-[#1a1b22] max-w-[180px] truncate">
          {formatValue(answers[k])}
        </td>
      ))}
      {hasPayment && (
        <td className="px-5 py-4">{paymentBadge()}</td>
      )}
      <td className="px-5 py-4">
        {checkedIn
          ? <Badge variant="success" dot>Entrato</Badge>
          : <Badge variant="warning" dot>In attesa</Badge>}
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onShowTicket}
            title="Visualizza biglietto"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-colors"
          >
            <Icon name="qr_code" size={14} />
            Biglietto
          </button>
          {!checkedIn && (
            <button
              onClick={handleCheckin}
              disabled={checkingIn}
              title="Segna come entrato"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1a6b3a] border border-[#1a6b3a] rounded-lg hover:bg-[#e6f9ee] transition-colors disabled:opacity-50"
            >
              {checkingIn
                ? <span className="w-3 h-3 border-2 border-[#1a6b3a] border-t-transparent rounded-full animate-spin" />
                : <Icon name="how_to_reg" size={14} />}
              Check-in
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
