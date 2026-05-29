import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { getMyResponses } from '../../firebase/responses'
import { getForm } from '../../firebase/forms'
import { getPublishedEvents } from '../../firebase/events'
import { logout } from '../../firebase/auth'
import Icon from '../../components/ui/Icon'
import type { Response, Form, SolidandoEvent } from '../../types/form'
import sLogo from '../../assets/s_logo.png'

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

interface EnrichedResponse extends Response {
  form: Form | null
}

interface TicketModalProps {
  item: EnrichedResponse
  isAdmin: boolean
  event?: SolidandoEvent
  onClose: () => void
}

function TicketModal({ item, isAdmin, event, onClose }: TicketModalProps) {
  const formTitle = item.form?.title ?? 'Biglietto'
  const checkinUrl = `${window.location.origin}/admin/checkin/${item.formId}?scan=${item.id}`
  const ticketUrl = `${window.location.origin}/ticket/${item.id}`
  const scannerUrl = `/admin/checkin/${item.formId}`
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

  const isPending = item.paymentStatus === 'pending'
  const isCheckedIn = item.checkInStatus === 'checked_in'

  // Info righe per il canvas
  const ticketLines: { label: string; value: string }[] = []
  const answers = (item.answers ?? {}) as Record<string, unknown>
  const firstVal = Object.values(answers).find(v => v && typeof v === 'string')
  if (firstVal) ticketLines.push({ label: 'Iscritto', value: String(firstVal) })
  if (item.attendeeCount && item.attendeeCount > 1) {
    ticketLines.push({ label: 'Partecipanti', value: String(item.attendeeCount) })
  }
  if (item.paymentAmount != null && item.paymentAmount > 0) {
    ticketLines.push({ label: isPending ? 'Importo' : 'Pagato', value: `€ ${item.paymentAmount.toFixed(2)}` })
  }

  async function handleDownload() {
    if (!qrSrc) return
    const dataUrl = await buildTicketCanvas(qrSrc, formTitle, item.id, ticketLines)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `biglietto-${item.id.slice(0, 8)}.png`
    a.click()
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Biglietto: ${formTitle}`,
          text: `Il tuo biglietto per "${formTitle}". Codice: ${item.id}`,
          url: ticketUrl,
        })
      } catch { /* annullato */ }
    } else {
      await navigator.clipboard.writeText(ticketUrl)
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
          {isPending && (
            <div className="w-full flex items-center gap-2 px-3 py-2 bg-[#fff4e0] rounded-xl text-[#8f4e00] text-sm font-semibold">
              <Icon name="hourglass_empty" size={16} />
              Pagamento in attesa di conferma
            </div>
          )}
          {isCheckedIn && (
            <div className="w-full flex items-center gap-2 px-3 py-2 bg-[#e6f9ee] rounded-xl text-[#1a6b3a] text-sm font-semibold">
              <Icon name="how_to_reg" size={16} />
              Check-in effettuato
            </div>
          )}

          {qrSrc ? (
            <>
              <img src={qrSrc} alt="QR code biglietto" width={160} height={160} className="rounded-xl border border-[#e8e7f0]" />
              <p className="text-xs text-[#747684]">Mostra questo QR code all'ingresso</p>
              <p className="text-[10px] font-mono text-[#c4c5d5] select-all">{item.id}</p>
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
            Condividi link biglietto
          </button>
          {isAdmin && (
            <Link
              to={scannerUrl}
              className="w-full py-2.5 border-2 border-[#002068] text-[#002068] rounded-xl font-bold hover:bg-[#dce1ff] transition-all text-sm flex items-center justify-center gap-2"
              onClick={onClose}
            >
              <Icon name="qr_code_scanner" size={16} />
              Apri scanner check-in
            </Link>
          )}
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

export default function MyPortalPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [items, setItems] = useState<EnrichedResponse[]>([])
  const [events, setEvents] = useState<SolidandoEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [eventsLoading, setEventsLoading] = useState(true)
  const [ticketItem, setTicketItem] = useState<EnrichedResponse | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    async function load() {
      const responses = await getMyResponses(user!.uid)
      const enriched = await Promise.all(
        responses.map(async r => ({
          ...r,
          form: await getForm(r.formId),
        }))
      )
      setItems(enriched)
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    getPublishedEvents()
      .then(setEvents)
      .finally(() => setEventsLoading(false))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const displayName = profile?.name ?? user?.displayName ?? 'Utente'
  const avatarUrl = profile?.avatar ?? user?.photoURL ?? null
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-[#faf8ff] flex flex-col overflow-x-hidden">
      {/* Top bar */}
      <header className="bg-[#002068] text-white sticky top-0 z-10" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={sLogo} alt="" className="h-9 brightness-0 invert" />
          </div>

          <div className="flex items-center gap-3">
            {profile?.role === 'admin' && (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-[#fe9832] text-[#683700] rounded-lg hover:brightness-105 transition-all"
              >
                <Icon name="admin_panel_settings" size={16} />
                <span className="hidden sm:inline">Pannello Admin</span>
              </Link>
            )}
            <div className="flex items-center gap-2">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover ring-2 ring-white/30" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#fe9832] flex items-center justify-center text-[#683700] text-xs font-bold">
                  {initials}
                </div>
              )}
              <span className="text-sm font-medium hidden sm:block">{displayName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#b5c4ff] hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Icon name="logout" size={16} />
              <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#002068] via-[#003399] to-[#002068] text-white">
        <div className="max-w-4xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center gap-6 min-w-0">
          <div className="flex-1">
            <p className="text-[#8aa4ff] text-sm font-semibold uppercase tracking-wider mb-1">Il tuo portale</p>
            <h1 className="text-3xl font-black mb-2">Ciao, {displayName.split(' ')[0]}!</h1>
            <p className="text-[#b5c4ff]">
              Qui trovi tutti i form a cui hai partecipato e, presto, gli eventi della community.
            </p>
          </div>
          <img src={sLogo} alt="" className="w-28 opacity-15 flex-shrink-0 hidden sm:block" />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10 min-w-0">

        {/* Forms section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#dce1ff] flex items-center justify-center">
              <Icon name="assignment" size={18} className="text-[#002068]" />
            </div>
            <h2 className="text-lg font-bold text-[#1a1b22]">Form compilati</h2>
            {!loading && (
              <span className="ml-auto text-sm text-[#747684]">{items.length} {items.length === 1 ? 'iscrizione' : 'iscrizioni'}</span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[#444653]">Caricamento...</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map(item => (
                <FormCard key={item.id} item={item} onTicket={() => setTicketItem(item)} />
              ))}
            </div>
          )}
        </section>

        {/* Events section */}
        <section className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#ffdcc2] flex items-center justify-center">
              <Icon name="event" size={18} className="text-[#8f4e00]" />
            </div>
            <h2 className="text-lg font-bold text-[#1a1b22]">Prossimi eventi</h2>
            {!eventsLoading && events.length > 0 && (
              <span className="ml-auto text-sm text-[#747684]">{events.length} {events.length === 1 ? 'evento' : 'eventi'}</span>
            )}
          </div>

          {eventsLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[#c4c5d5] p-10 flex flex-col items-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-[#ffdcc2] flex items-center justify-center">
                <Icon name="event_upcoming" size={28} className="text-[#fe9832]" />
              </div>
              <p className="font-semibold text-[#1a1b22]">Nessun evento in programma</p>
              <p className="text-sm text-[#747684] max-w-xs">
                Gli eventi della community appariranno qui non appena saranno disponibili.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {events.map(ev => <EventCard key={ev.id} event={ev} />)}
            </div>
          )}
        </section>
      </main>

      {ticketItem && (
        <TicketModal
          item={ticketItem}
          isAdmin={profile?.role === 'admin'}
          event={ticketItem.eventId ? events.find(e => e.id === ticketItem.eventId) : undefined}
          onClose={() => setTicketItem(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-[#c4c5d5] py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={sLogo} alt="" className="h-6 opacity-40" />
            <span className="text-xs text-[#747684]">© 2025 Solidando · La Gioia nel Dare</span>
          </div>
          <p className="text-xs text-[#c4c5d5]">Piattaforma riservata ai soci</p>
        </div>
      </footer>
    </div>
  )
}

function FormCard({ item, onTicket }: { item: EnrichedResponse; onTicket: () => void }) {
  const form = item.form
  const title = form?.title ?? 'Form'
  const submittedAt = item.submittedAt?.toDate?.()
  const dateStr = submittedAt
    ? submittedAt.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const hasTicket = item.paymentStatus !== 'none'
  const isCheckedIn = item.checkInStatus === 'checked_in'
  const isPendingPayment = item.paymentStatus === 'pending'

  return (
    <div className="bg-white rounded-2xl border border-[#c4c5d5] overflow-hidden hover:shadow-md transition-shadow min-w-0">
      {/* Card top strip */}
      <div className="h-1.5 bg-gradient-to-r from-[#002068] to-[#fe9832]" />
      <div className="p-5 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#1a1b22] truncate">{title}</p>
            {dateStr && (
              <p className="text-xs text-[#747684] mt-0.5 flex items-center gap-1">
                <Icon name="calendar_today" size={12} className="text-[#c4c5d5]" />
                {dateStr}
              </p>
            )}
          </div>
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#dce1ff] flex items-center justify-center">
            <Icon name={hasTicket ? 'confirmation_number' : 'assignment_turned_in'} size={18} className="text-[#002068]" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#dce1ff] text-[#002068] text-xs font-semibold">
            <Icon name="check_circle" size={13} />
            Compilato
          </span>

          {hasTicket && isPendingPayment && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fff4e0] text-[#8f4e00] text-xs font-semibold">
              <Icon name="hourglass_empty" size={13} />
              Pagamento in attesa
            </span>
          )}

          {hasTicket && !isPendingPayment && isCheckedIn && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#e6f9ee] text-[#1a6b3a] text-xs font-semibold">
              <Icon name="how_to_reg" size={13} />
              Check-in effettuato
            </span>
          )}

          {hasTicket && (
            <button
              onClick={onTicket}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fe9832] text-[#683700] text-xs font-bold hover:brightness-105 transition-all"
            >
              <Icon name="qr_code" size={13} />
              Il mio biglietto
            </button>
          )}

          {form?.published && (
            <Link
              to={`/f/${item.formId}`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f4f3fc] text-[#444653] text-xs font-medium hover:bg-[#dce1ff] hover:text-[#002068] transition-colors"
            >
              <Icon name="open_in_new" size={12} />
              Rivedi
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#c4c5d5] p-12 flex flex-col items-center gap-4 text-center">
      <div className="w-16 h-16 rounded-full bg-[#dce1ff] flex items-center justify-center">
        <Icon name="inbox" size={32} className="text-[#b5c4ff]" />
      </div>
      <div>
        <p className="font-semibold text-[#1a1b22] mb-1">Nessun form ancora</p>
        <p className="text-sm text-[#747684] max-w-xs">
          Quando compilerai un form della community apparirà qui.
        </p>
      </div>
    </div>
  )
}

function EventCard({ event }: { event: SolidandoEvent }) {
  const [y, m, d] = (event.startDate ?? '').split('-')
  const dateStr = event.startDate ? `${d}/${m}/${y}` : ''
  const hasForm = !!event.formId

  const lowestPrice = () => {
    if (!event.ticketTypes || event.ticketTypes.length === 0) return 'Gratuito'
    const min = Math.min(...event.ticketTypes.map(t => t.price))
    return min === 0 ? 'Gratuito' : `da €${min.toFixed(2)}`
  }

  return (
    <div className="bg-white rounded-2xl border border-[#c4c5d5] overflow-hidden hover:shadow-md transition-shadow min-w-0">
      <div className="h-1.5 bg-gradient-to-r from-[#fe9832] to-[#002068]" />
      <div className="p-5 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#1a1b22] truncate">{event.title}</p>
            {event.description && (
              <p className="text-xs text-[#747684] mt-0.5 line-clamp-2">{event.description}</p>
            )}
          </div>
          <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#ffdcc2] flex items-center justify-center">
            <Icon name="event" size={18} className="text-[#8f4e00]" />
          </div>
        </div>

        <div className="space-y-1.5 mb-4">
          {dateStr && (
            <p className="text-xs text-[#444653] flex items-center gap-1.5">
              <Icon name="calendar_today" size={13} className="text-[#fe9832]" />
              {dateStr}{event.startTime ? ` · ${event.startTime}` : ''}
            </p>
          )}
          {event.location && (
            <p className="text-xs text-[#444653] flex items-center gap-1.5">
              <Icon name="location_on" size={13} className="text-[#fe9832]" />
              {event.location}
            </p>
          )}
          <p className="text-xs font-bold text-[#002068] flex items-center gap-1.5">
            <Icon name="payments" size={13} className="text-[#fe9832]" />
            {lowestPrice()}
          </p>
        </div>

        <Link
          to={`/e/${event.id}`}
          className="block w-full py-2.5 text-center bg-[#002068] text-white rounded-xl text-sm font-bold hover:bg-[#003399] transition-colors"
        >
          {hasForm ? (event.ctaLabel?.trim() || 'Iscriviti') : 'Scopri di più'}
        </Link>
      </div>
    </div>
  )
}
