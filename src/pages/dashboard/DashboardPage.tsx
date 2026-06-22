import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { useAuthStore } from '../../stores/authStore'
import { getEvents, createEvent, deleteEvent, updateEvent, getEventBookedCount } from '../../firebase/events'
import { getRecentResponsesByForms, getResponseCountsByForms } from '../../firebase/responses'
import type { SolidandoEvent, EventStatus, Response } from '../../types/form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'Pochi secondi fa'
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(date)
}

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

// ─── Page ─────────────────────────────────────────────────────────────────────

function resolveWorkspaceId(profile: ReturnType<typeof useAuthStore.getState>['profile']): string | null {
  if (!profile) return null
  return profile.workspaceIds?.[0] || profile.uid
}

export default function DashboardPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const workspaceId = resolveWorkspaceId(profile)

  const [events, setEvents] = useState<SolidandoEvent[]>([])
  const [recentResponses, setRecentResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingEvent, setCreatingEvent] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!user || !workspaceId) return
    ;(async () => {
      const loadedEvents = await getEvents(workspaceId!, isAdmin).catch(() => [] as SolidandoEvent[])

      const withCounts = await Promise.all(
        loadedEvents.map(async (ev) => {
          if (!ev.formId) return ev
          const count = await getEventBookedCount(ev.formId, ev.attendeeFieldId, ev.attendeeFieldIds).catch(() => 0)
          return { ...ev, _bookedCount: count }
        })
      )

      const formIds = loadedEvents.map(e => e.formId).filter(Boolean) as string[]
      const [counts, recent] = await Promise.all([
        formIds.length > 0
          ? getResponseCountsByForms(formIds).catch(() => ({} as Record<string, number>))
          : Promise.resolve({} as Record<string, number>),
        formIds.length > 0
          ? getRecentResponsesByForms(formIds, 5).catch(() => [] as Response[])
          : Promise.resolve([] as Response[]),
      ])

      setEvents(withCounts.map(ev => ({
        ...ev,
        _responseCount: ev.formId ? (counts[ev.formId] ?? 0) : 0,
      })))
      setRecentResponses(recent)
      setLoading(false)
    })()
  }, [user, workspaceId, isAdmin])

  // ── KPI derivati ─────────────────────────────────────────────────────────
  const totalEvents = events.length
  const publishedEvents = events.filter(e => e.status === 'published').length
  const totalBookings = events.reduce((sum, e) => sum + (e._bookedCount ?? 0), 0)
  const publishedRate = totalEvents > 0 ? Math.round((publishedEvents / totalEvents) * 100) : 0

  const kpiCards = [
    {
      key: 'events',
      label: 'Eventi Totali',
      value: String(totalEvents),
      sub: `${publishedEvents} pubblicati`,
      icon: 'event',
    },
    {
      key: 'bookings',
      label: 'Iscrizioni Totali',
      value: totalBookings > 999 ? `${(totalBookings / 1000).toFixed(1)}k` : String(totalBookings),
      sub: recentResponses.length > 0 ? `Ultima: ${relativeTime(recentResponses[0].submittedAt?.toDate?.() ?? new Date(0))}` : 'Nessuna iscrizione',
      icon: 'how_to_reg',
    },
    {
      key: 'published',
      label: 'Pubblicati',
      value: `${publishedRate}%`,
      sub: `${publishedEvents} di ${totalEvents}`,
      icon: 'task_alt',
    },
  ]

  async function handleNewEvent() {
    if (!user || !workspaceId) return
    setCreatingEvent(true)
    try {
      const id = await createEvent(workspaceId!, user.uid)
      navigate(`/events/${id}`)
    } finally {
      setCreatingEvent(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Eliminare questo evento?')) return
    await deleteEvent(id)
    setEvents(ev => ev.filter(x => x.id !== id))
  }

  async function handleToggleStatus(event: SolidandoEvent, e: React.MouseEvent) {
    e.stopPropagation()
    const next: EventStatus = event.status === 'published' ? 'draft' : 'published'
    await updateEvent(event.id, { status: next })
    setEvents(prev => prev.map(ev => ev.id === event.id ? { ...ev, status: next } : ev))
  }

  return (
    <AppLayout>
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-[#002068] leading-tight">
            Bentornato, {profile?.name?.split(' ')[0] ?? 'utente'}
          </h1>
          <p className="text-sm md:text-lg text-[#444653] mt-1">Ecco cosa è successo nei tuoi eventi.</p>
        </div>
        <button
          onClick={handleNewEvent}
          disabled={creatingEvent}
          className="hidden sm:flex items-center gap-3 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-60"
        >
          <Icon name="add_circle" filled size={22} />
          <span className="uppercase tracking-wider text-sm">Nuovo Evento</span>
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8 md:mb-12">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-5 md:p-8 rounded-xl border border-[#c4c5d5] animate-pulse h-24 md:h-32" />
          ))
        ) : (
          kpiCards.map(({ key, label, value, sub, icon }) => (
            <div key={key} className="bg-white p-4 md:p-8 rounded-xl border border-[#c4c5d5] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 md:p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Icon name={icon} size={48} className="md:hidden" />
                <Icon name={icon} size={64} className="hidden md:block" />
              </div>
              <p className="text-[10px] md:text-xs font-semibold tracking-wider text-[#444653] mb-1 md:mb-2 uppercase">{label}</p>
              <div className="flex items-baseline gap-2 mb-0.5 md:mb-1">
                <span className="text-2xl md:text-4xl font-black text-[#002068]">{value}</span>
              </div>
              <p className="text-[10px] md:text-xs text-[#747684] truncate">{sub}</p>
            </div>
          ))
        )}
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* Recent Events */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[#1a1b22]">Eventi Recenti</h3>
            <button
              onClick={() => navigate('/events')}
              className="text-sm font-semibold text-[#002068] hover:underline"
            >
              Vedi tutti
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl border border-[#c4c5d5] animate-pulse h-48" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-[#c4c5d5] p-12 flex flex-col items-center justify-center text-center">
              <Icon name="event" size={48} className="text-[#c4c5d5] mb-4" />
              <p className="text-[#444653] font-medium mb-4">Nessun evento ancora.</p>
              <button onClick={handleNewEvent} className="px-5 py-2.5 bg-[#fe9832] text-[#683700] rounded-lg font-bold text-sm">
                Crea il primo evento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.slice(0, 4).map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onOpen={() => navigate(`/events/${event.id}`)}
                  onDelete={e => handleDelete(event.id, e)}
                  onToggleStatus={e => handleToggleStatus(event, e)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Event status breakdown */}
          {!loading && events.length > 0 && (
            <div className="bg-white border border-[#c4c5d5] rounded-xl p-5 shadow-sm">
              <h4 className="text-sm font-bold text-[#1a1b22] mb-4">Stato Eventi</h4>
              <div className="space-y-3">
                <StatusRow
                  label="Pubblicati"
                  count={publishedEvents}
                  total={totalEvents}
                  color="bg-[#4caf50]"
                />
                <StatusRow
                  label="Bozze"
                  count={events.filter(e => e.status === 'draft').length}
                  total={totalEvents}
                  color="bg-[#c4c5d5]"
                />
                <StatusRow
                  label="Chiusi"
                  count={events.filter(e => e.status === 'closed').length}
                  total={totalEvents}
                  color="bg-[#fe9832]"
                />
              </div>
              <div className="mt-4 pt-4 border-t border-[#e8e7f0] flex justify-between text-xs text-[#747684]">
                <span>{totalEvents} eventi totali</span>
                <span>{totalBookings} iscrizioni</span>
              </div>
            </div>
          )}

          {/* Activity feed */}
          <div className="bg-[#002068] text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-3">Attività Recente</h4>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-4 bg-white/10 rounded animate-pulse" />
                  ))}
                </div>
              ) : recentResponses.length === 0 ? (
                <p className="text-xs opacity-60">Nessuna iscrizione ricevuta ancora.</p>
              ) : (
                <ul className="space-y-2">
                  {recentResponses.map(r => {
                    const event = events.find(ev => ev.formId === r.formId)
                    const date = r.submittedAt?.toDate?.()
                    return (
                      <li key={r.id} className="text-xs flex gap-2 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#fe9832] mt-1.5 flex-shrink-0" />
                        <span>
                          Nuova iscrizione a{' '}
                          <span className="font-bold">"{event?.title ?? r.formId}"</span>
                          {date ? ` · ${relativeTime(date)}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Icon name="history" size={120} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={handleNewEvent}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#fe9832] text-[#683700] shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-50 md:hidden" style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Icon name="add" filled size={28} />
      </button>
    </AppLayout>
  )
}

// ─── Status row ───────────────────────────────────────────────────────────────

function StatusRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-[#444653] mb-1">
        <span>{label}</span>
        <span className="font-semibold">{count}</span>
      </div>
      <div className="h-2 bg-[#e8e7f0] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, onOpen, onDelete, onToggleStatus
}: {
  event: SolidandoEvent
  onOpen: () => void
  onDelete: (e: React.MouseEvent) => void
  onToggleStatus: (e: React.MouseEvent) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      onClick={onOpen}
      className="bg-white rounded-xl border border-[#c4c5d5] hover:border-[#002068] transition-all group cursor-pointer relative overflow-hidden"
    >
      {/* Cover / thumbnail */}
      <div className="h-24 md:h-32 w-full relative overflow-hidden">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#dce1ff] to-[#f4f3fc] flex items-center justify-center">
            <Icon name="event" size={64} className="text-[#002068] opacity-20" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          {statusBadge(event.status)}
        </div>
        {!event.formId && (
          <div
            className="absolute top-2 left-2 flex items-center gap-1 bg-[#fff3cd] border border-[#ffc107] text-[#664d03] text-xs font-bold px-2 py-0.5 rounded-lg"
            title="Nessun form di iscrizione collegato"
          >
            <Icon name="warning" size={13} />
            Nessun form
          </div>
        )}
      </div>

      <div className="p-4">
        <h4 className="font-bold text-[#1a1b22] group-hover:text-[#002068] transition-colors line-clamp-1">{event.title}</h4>
        <p className="text-xs text-[#444653] mt-1">
          {event.startDate ? formatDate(event.startDate) : '—'} ·{' '}
          {(event._bookedCount ?? 0)} iscritti
          {event.totalCapacity ? ` / ${event.totalCapacity}` : ''}
        </p>
        <div className="flex items-center justify-between border-t border-[#c4c5d5] pt-3 mt-3">
          <button
            onClick={e => { e.stopPropagation(); onOpen() }}
            className="text-xs font-semibold text-[#002068] hover:underline"
          >
            Gestisci
          </button>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              className="p-1 text-[#444653] hover:text-[#002068] rounded transition-colors"
            >
              <Icon name="more_vert" size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 w-44 bg-white rounded-xl border border-[#c4c5d5] shadow-xl z-20 overflow-hidden">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onOpen() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#f4f3fc]">
                  <Icon name="open_in_new" size={16} /> Apri dettaglio
                </button>
                <button onClick={e => { onToggleStatus(e); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#f4f3fc]">
                  <Icon name={event.status === 'published' ? 'unpublished' : 'publish'} size={16} />
                  {event.status === 'published' ? 'Archivia' : 'Pubblica'}
                </button>
                <button onClick={e => { onDelete(e); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#ffdad6] text-[#ba1a1a]">
                  <Icon name="delete" size={16} /> Elimina
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
