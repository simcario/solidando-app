import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { getEvent, getEventBookedCount } from '../../firebase/events'
import { useAuthStore } from '../../stores/authStore'
import Icon from '../../components/ui/Icon'
import type { SolidandoEvent } from '../../types/form'
import solidandoLogo from '../../assets/solidando.png'

function formatDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(t: string) {
  if (!t) return ''
  return t
}

function lowestPrice(event: SolidandoEvent): string {
  const prices = (event.ticketTypes ?? []).map(t => t.price)
  if (prices.length === 0) return ''
  const min = Math.min(...prices)
  if (min === 0) return 'Gratuito'
  return `Da €${min.toFixed(2)}`
}

export default function PublicEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user, loading: authLoading } = useAuthStore()
  const navigate = useNavigate()
  const [event, setEvent] = useState<SolidandoEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [availableSpots, setAvailableSpots] = useState<number | null>(null)

  useEffect(() => {
    if (!eventId || authLoading || !user) return
    getEvent(eventId).then(async ev => {
      if (!ev || ev.status === 'draft') {
        setNotFound(true)
      } else {
        setEvent(ev)
        if (ev.totalCapacity !== null && ev.formId) {
          const booked = await getEventBookedCount(ev.formId, ev.attendeeFieldId, ev.attendeeFieldIds)
          setAvailableSpots(Math.max(0, ev.totalCapacity - booked))
        }
      }
      setLoading(false)
    })
  }, [eventId, user, authLoading])

  if (authLoading || (user && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f3fc]">
        <span className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f4f3fc] flex flex-col overflow-x-hidden">
        <header className="bg-white border-b border-[#e8e7f4] px-6 py-3 flex items-center">
          <Link to="/login">
            <img src={solidandoLogo} alt="Solidando" className="h-7 object-contain" />
          </Link>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center gap-6">
          <div className="w-16 h-16 rounded-full bg-[#e8e7f4] flex items-center justify-center">
            <Icon name="lock" size={32} className="text-[#002068]" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h1 className="text-xl font-bold text-[#002068]">Accesso richiesto</h1>
            <p className="text-sm text-[#747684] leading-relaxed">
              Per visualizzare questo evento devi effettuare il login.
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => navigate('/login', { state: { from: { pathname: `/e/${eventId}` } } })}
              className="w-full py-3 bg-[#002068] text-white font-bold text-sm rounded-xl hover:bg-[#003399] active:scale-95 transition-all shadow-md"
            >
              Accedi
            </button>
            <button
              onClick={() => navigate('/register', { state: { from: { pathname: `/e/${eventId}` } } })}
              className="w-full py-3 bg-white border border-[#002068] text-[#002068] font-bold text-sm rounded-xl hover:bg-[#f4f3fc] active:scale-95 transition-all"
            >
              Registrati
            </button>
          </div>
        </main>
        <footer className="py-6 text-center text-xs text-[#aaa] border-t border-[#e8e7f4]">
          Powered by <span className="font-bold text-[#002068]">Solidando</span>
        </footer>
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f4f3fc] px-4 text-center">
        <Icon name="event_busy" size={48} className="text-[#c4c5d5]" />
        <h1 className="text-2xl font-bold text-[#002068]">Evento non trovato</h1>
        <p className="text-[#747684]">Questo evento non esiste o non è ancora disponibile.</p>
        <Link to="/my" className="mt-2 text-sm font-bold text-[#002068] hover:text-[#fe9832] transition-colors">
          Torna alla home
        </Link>
      </div>
    )
  }

  const price = lowestPrice(event)
  const hasEndDate = event.endDate && event.endDate !== event.startDate
  const ctaLabel = event.ctaLabel?.trim() || 'Iscriviti'
  const isClosed = event.status === 'closed' || event.status === 'cancelled'

  const pageUrl = `${window.location.origin}/e/${eventId}`
  const ogImage = event.imageUrl || ''
  const ogDescription = event.description
    ? event.description.slice(0, 200)
    : `${formatDate(event.startDate)}${event.location ? ' · ' + event.location : ''}`

  return (
    <div className="min-h-screen bg-[#f4f3fc] flex flex-col overflow-x-hidden">
      <Helmet>
        <title>{event.title} — Solidando</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={event.title} />
        <meta property="og:description" content={ogDescription} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:site_name" content="Solidando" />
        <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={event.title} />
        <meta name="twitter:description" content={ogDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>

      {/* Navbar minimal */}
      <header className="bg-white border-b border-[#e8e7f4] py-3 flex justify-center">
        <div className="w-full max-w-2xl px-4 flex items-center">
          <Link to="/my">
            <img src={solidandoLogo} alt="Solidando" className="h-7 object-contain" />
          </Link>
        </div>
      </header>

      {/* Banner immagine */}
      <div className="flex justify-center">
        <div className="w-full max-w-2xl px-4">
          {event.imageUrl ? (
            <div className="w-full h-56 sm:h-72 md:h-80 overflow-hidden bg-[#002068] rounded-b-2xl">
              <img
                src={event.imageUrl}
                alt={event.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-full h-40 sm:h-56 bg-gradient-to-br from-[#002068] to-[#1a3a8f] rounded-b-2xl flex items-center justify-center">
              <Icon name="event" size={64} className="text-white/30" />
            </div>
          )}
        </div>
      </div>

      {/* Contenuto */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 space-y-6">

        {/* Titolo + prezzo */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#002068] leading-tight">{event.title}</h1>
          {price && (
            <p className="mt-1 text-base font-semibold text-[#fe9832]">{price}</p>
          )}
        </div>

        {/* Info: data, ora, luogo */}
        <div className="bg-white rounded-2xl border border-[#e8e7f4] divide-y divide-[#e8e7f4] overflow-hidden">

          {/* Data inizio */}
          {event.startDate && (
            <div className="flex items-start gap-3 px-5 py-4">
              <Icon name="calendar_today" size={20} className="text-[#002068] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-[#002068] capitalize">{formatDate(event.startDate)}</p>
                {event.startTime && (
                  <p className="text-sm text-[#747684]">
                    Ore {formatTime(event.startTime)}
                    {event.endTime && ` – ${formatTime(event.endTime)}`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Data fine (solo se diversa dall'inizio) */}
          {hasEndDate && event.endDate && (
            <div className="flex items-start gap-3 px-5 py-4">
              <Icon name="event_available" size={20} className="text-[#002068] mt-0.5 shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-[#747684] mb-0.5">Fine evento</p>
                <p className="text-sm font-bold text-[#002068] capitalize">{formatDate(event.endDate)}</p>
                {event.endTime && (
                  <p className="text-sm text-[#747684]">Ore {formatTime(event.endTime)}</p>
                )}
              </div>
            </div>
          )}

          {/* Luogo */}
          {event.location && (
            <div className="flex items-start gap-3 px-5 py-4">
              <Icon name="location_on" size={20} className="text-[#002068] mt-0.5 shrink-0" />
              <a
                href={event.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#333448] hover:text-[#002068] hover:underline"
              >
                {event.location}
              </a>
            </div>
          )}

          {/* Posti disponibili */}
          {event.totalCapacity !== null && (
            <div className="flex items-start gap-3 px-5 py-4">
              <Icon name="people" size={20} className={`mt-0.5 shrink-0 ${availableSpots === 0 ? 'text-[#ba1a1a]' : 'text-[#002068]'}`} />
              <div>
                {availableSpots === null ? (
                  <p className="text-sm text-[#333448]">{event.totalCapacity} posti totali</p>
                ) : availableSpots === 0 ? (
                  <p className="text-sm font-bold text-[#ba1a1a]">Posti esauriti</p>
                ) : (
                  <p className="text-sm text-[#333448]">{availableSpots} posti disponibili su {event.totalCapacity}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Descrizione */}
        {event.description && (
          <div className="bg-white rounded-2xl border border-[#e8e7f4] px-5 py-5">
            <h2 className="text-sm font-bold text-[#444653] uppercase tracking-wider mb-3">Descrizione</h2>
            <p className="text-sm text-[#333448] whitespace-pre-line leading-relaxed">{event.description}</p>
          </div>
        )}

        {/* Tipologie biglietto */}
        {event.ticketTypes && event.ticketTypes.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#e8e7f4] px-5 py-5">
            <h2 className="text-sm font-bold text-[#444653] uppercase tracking-wider mb-3">Biglietti</h2>
            <div className="space-y-2">
              {event.ticketTypes.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-[#f4f3fc] last:border-0">
                  <span className="text-sm font-medium text-[#333448]">{t.label || 'Standard'}</span>
                  <span className="text-sm font-bold text-[#002068]">
                    {t.price === 0 ? 'Gratuito' : `€${t.price.toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA form / stato chiuso */}
        {isClosed ? (
          <div className="w-full text-center py-4 bg-[#e8e7f0] text-[#747684] font-bold text-base rounded-2xl cursor-not-allowed">
            {event.status === 'cancelled' ? 'Evento annullato' : 'Iscrizioni chiuse'}
          </div>
        ) : event.formId && (
          availableSpots === 0 ? (
            <div className="w-full text-center py-4 bg-[#e8e7f0] text-[#747684] font-bold text-base rounded-2xl cursor-not-allowed">
              Posti esauriti
            </div>
          ) : (
            <Link
              to={`/f/${event.formId}`}
              className="block w-full text-center py-4 bg-[#002068] text-white font-bold text-base rounded-2xl hover:bg-[#003399] active:scale-95 transition-all shadow-md"
            >
              {ctaLabel}
            </Link>
          )
        )}

        {/* Chiusura iscrizioni */}
        {!isClosed && event.closesAt && (
          <p className="text-center text-xs text-[#747684]">
            Le iscrizioni chiudono il{' '}
            {new Date(event.closesAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[#aaa] border-t border-[#e8e7f4]">
        Powered by <span className="font-bold text-[#002068]">Solidando</span>
      </footer>
    </div>
  )
}
