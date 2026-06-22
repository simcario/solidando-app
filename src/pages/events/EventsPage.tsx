import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { useAuthStore } from '../../stores/authStore'
import { getEvents, createEvent, deleteEvent, updateEvent, getEventBookedCount } from '../../firebase/events'
import { getForms } from '../../firebase/forms'
import type { SolidandoEvent, EventStatus, TicketType, Form } from '../../types/form'
import { nanoid } from 'nanoid'
import ImageGalleryModal from '../../components/ui/ImageGalleryModal'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function lowestPrice(types: TicketType[]) {
  if (!types || types.length === 0) return 'Gratuito'
  const prices = types.map(t => t.price)
  const min = Math.min(...prices)
  if (min === 0) return 'Gratuito'
  return `da €${min.toFixed(2)}`
}

// ─── Create/Edit Modal ────────────────────────────────────────────────────────

interface EventModalProps {
  event?: SolidandoEvent
  onClose: () => void
  onSave: (data: Partial<SolidandoEvent>) => Promise<void>
  forms: Form[]
}

function EventModal({ event, onClose, onSave, forms }: EventModalProps) {
  const isEdit = !!event
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [locationUrl, setLocationUrl] = useState(event?.locationUrl ?? '')
  const [startDate, setStartDate] = useState(event?.startDate ?? '')
  const [startTime, setStartTime] = useState(event?.startTime ?? '')
  const [endDate, setEndDate] = useState(event?.endDate ?? '')
  const [endTime, setEndTime] = useState(event?.endTime ?? '')
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? '')
  const [totalCapacity, setTotalCapacity] = useState<string>(event?.totalCapacity?.toString() ?? '')
  const [status, setStatus] = useState<EventStatus>(event?.status ?? 'draft')
  const [formId, setFormId] = useState(event?.formId ?? '')
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>(
    event?.ticketTypes ?? [{ id: nanoid(6), label: 'Standard', price: 0, currency: 'EUR', capacity: null }]
  )
  const [saving, setSaving] = useState(false)
  const [showGallery, setShowGallery] = useState(false)

  function addTicketType() {
    setTicketTypes(prev => [...prev, { id: nanoid(6), label: '', price: 0, currency: 'EUR', capacity: null }])
  }

  function removeTicketType(id: string) {
    setTicketTypes(prev => prev.filter(t => t.id !== id))
  }

  function updateTicket(id: string, field: keyof TicketType, value: unknown) {
    setTicketTypes(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
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
      imageUrl: imageUrl || undefined,
      totalCapacity: totalCapacity ? parseInt(totalCapacity) : null,
      status,
      formId: formId || undefined,
      ticketTypes,
    })
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#002068] px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{isEdit ? 'Modifica Evento' : 'Nuovo Evento'}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <Icon name="close" size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Basic info */}
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
              Titolo *
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              placeholder="Nome dell'evento"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
              Descrizione
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm resize-none"
              placeholder="Descrizione dell'evento..."
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
              Immagine copertina
            </label>
            <div className="flex gap-2">
              <input
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="flex-1 px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
                placeholder="https://..."
              />
              <button
                type="button"
                onClick={() => setShowGallery(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-[#f4f3fc] transition-colors"
              >
                <Icon name="photo_library" size={18} />
                Galleria
              </button>
            </div>
            {imageUrl && (
              <div className="mt-2 relative h-24 rounded-xl overflow-hidden border border-[#c4c5d5]">
                <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
              Luogo
            </label>
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              placeholder="es. Milano, Palazzo Reale / Online (Zoom)"
            />
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
                className="w-full px-4 py-2 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-xs text-[#888]"
                placeholder="Link Google Maps personalizzato (opzionale)"
              />
            </div>
          </div>

          {/* Date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Data inizio *</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Orario inizio</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Data fine</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Orario fine</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
              />
            </div>
          </div>

          {/* Capacity & status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
                Posti totali (vuoto = illimitato)
              </label>
              <input
                type="number"
                min={1}
                value={totalCapacity}
                onChange={e => setTotalCapacity(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm"
                placeholder="es. 100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Stato</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as EventStatus)}
                className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm bg-white"
              >
                <option value="draft">Bozza</option>
                <option value="published">Pubblicato</option>
                <option value="closed">Chiuso</option>
                <option value="cancelled">Annullato</option>
              </select>
            </div>
          </div>

          {/* Form iscrizione */}
          <div>
            <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
              Form iscrizione
            </label>
            <select
              value={formId}
              onChange={e => setFormId(e.target.value)}
              className="w-full px-4 py-2.5 border border-[#c4c5d5] rounded-xl focus:ring-2 focus:ring-[#002068] focus:outline-none text-sm bg-white"
            >
              <option value="">— Nessun form collegato —</option>
              {forms.map(f => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#747684]">Il form verrà usato per raccogliere le iscrizioni online e manuali.</p>
          </div>

          {/* Ticket types */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#444653] uppercase tracking-wider">Tipologie biglietto</label>
              <button
                type="button"
                onClick={addTicketType}
                className="flex items-center gap-1 text-xs font-bold text-[#002068] hover:text-[#fe9832] transition-colors"
              >
                <Icon name="add_circle" size={16} />
                Aggiungi
              </button>
            </div>
            <div className="space-y-2">
              {ticketTypes.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-3 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
                  <input
                    value={t.label}
                    onChange={e => updateTicket(t.id, 'label', e.target.value)}
                    className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                    placeholder="es. Adulto, Early Bird..."
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
                    <button
                      type="button"
                      onClick={() => removeTicketType(t.id)}
                      className="text-[#747684] hover:text-[#ba1a1a] transition-colors p-1"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-[#747684]">Prezzo · Posti (lascia vuoto = illimitato per tipo)</p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#c4c5d5] flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-semibold hover:bg-[#f4f3fc] transition-all text-sm"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-6 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-all disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Salva modifiche' : 'Crea evento'}
          </button>
        </div>
      </div>

      {showGallery && (
        <ImageGalleryModal
          paths={['covers', 'backgrounds']}
          uploadPath="covers"
          currentUrl={imageUrl}
          onSelect={url => setImageUrl(url)}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [events, setEvents] = useState<SolidandoEvent[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SolidandoEvent | null>(null)

  const isAdmin = profile?.role === 'admin'
  const workspaceId = profile?.workspaceIds?.[0] ?? user?.uid ?? ''

  useEffect(() => {
    if (!workspaceId) return
    getForms(workspaceId, undefined, true).then(setForms)
    loadEvents().finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, isAdmin])

  async function loadEvents() {
    const evs = await getEvents(workspaceId, isAdmin)
    const withCounts = await Promise.all(
      evs.map(async (ev) => {
        if (!ev.formId) return ev
        const count = await getEventBookedCount(ev.formId, ev.attendeeFieldId, ev.attendeeFieldIds)
        return { ...ev, _bookedCount: count }
      })
    )
    setEvents(withCounts)
  }

  async function handleCreate(data: Partial<SolidandoEvent>) {
    const id = await createEvent(workspaceId, user!.uid)
    await updateEvent(id, data)
    await loadEvents()
    setShowModal(false)
  }

  async function handleEdit(data: Partial<SolidandoEvent>) {
    if (!editingEvent) return
    await updateEvent(editingEvent.id, data)
    setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...data } : e))
    setEditingEvent(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Eliminare questo evento? L\'operazione non può essere annullata.')) return
    await deleteEvent(id)
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  async function handleToggleStatus(event: SolidandoEvent) {
    const next: EventStatus = event.status === 'published' ? 'draft' : 'published'
    await updateEvent(event.id, { status: next })
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, status: next } : e))
  }

  const publishedCount = events.filter(e => e.status === 'published').length
  const totalCapacity = events.reduce((sum, e) => sum + (e.totalCapacity ?? 0), 0)

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-black text-[#002068]">Gestione Eventi</h1>
          <p className="text-[#444653] mt-1">Crea e gestisci eventi con iscrizioni e pagamenti integrati.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 whitespace-nowrap"
        >
          <Icon name="add_circle" filled size={22} />
          <span className="uppercase tracking-wider text-sm">Nuovo Evento</span>
        </button>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-[#c4c5d5] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#dce1ff] flex items-center justify-center flex-shrink-0">
            <Icon name="event" size={20} className="text-[#002068]" />
          </div>
          <div>
            <p className="text-2xl font-black text-[#002068]">{loading ? '—' : events.length}</p>
            <p className="text-xs text-[#444653]">Totale eventi</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#c4c5d5] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#d6f5e5] flex items-center justify-center flex-shrink-0">
            <Icon name="public" size={20} className="text-[#1a6b3a]" />
          </div>
          <div>
            <p className="text-2xl font-black text-[#1a6b3a]">{loading ? '—' : publishedCount}</p>
            <p className="text-xs text-[#444653]">Pubblicati</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#c4c5d5] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ffdcc2] flex items-center justify-center flex-shrink-0">
            <Icon name="people" size={20} className="text-[#8f4e00]" />
          </div>
          <div>
            <p className="text-2xl font-black text-[#8f4e00]">{loading ? '—' : totalCapacity || '∞'}</p>
            <p className="text-xs text-[#444653]">Capienza totale</p>
          </div>
        </div>
      </div>

      {/* Events grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#c4c5d5] h-64 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-[#dce1ff] flex items-center justify-center">
            <Icon name="event" size={40} className="text-[#b5c4ff]" />
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-[#1a1b22] mb-1">Nessun evento ancora</p>
            <p className="text-[#747684]">Crea il primo evento per iniziare a raccogliere iscrizioni.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all mt-2"
          >
            <Icon name="add_circle" size={20} />
            Crea il primo evento
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map(event => (
            <EventCard
              key={event.id}
              event={event}
              onManage={() => navigate(`/events/${event.id}`)}
              onEdit={() => setEditingEvent(event)}
              onDelete={() => handleDelete(event.id)}
              onToggleStatus={() => handleToggleStatus(event)}
            />
          ))}

          {/* Add card */}
          <button
            onClick={() => setShowModal(true)}
            className="bg-white rounded-xl border-2 border-dashed border-[#c4c5d5] flex flex-col items-center justify-center min-h-[280px] cursor-pointer hover:border-[#002068] hover:bg-[#f4f3fc] transition-all group"
          >
            <Icon name="add_circle" size={48} className="text-[#c4c5d5] group-hover:text-[#002068] group-hover:scale-110 transition-all mb-3" />
            <p className="text-sm font-semibold text-[#444653] group-hover:text-[#002068] transition-colors">Crea nuovo evento</p>
          </button>
        </div>
      )}

      {showModal && (
        <EventModal
          onClose={() => setShowModal(false)}
          onSave={handleCreate}
          forms={forms}
        />
      )}
      {editingEvent && (
        <EventModal
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSave={handleEdit}
          forms={forms}
        />
      )}
    </AppLayout>
  )
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  onManage,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  event: SolidandoEvent
  onManage: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
}) {
  const bookedCount = event._bookedCount ?? 0
  const capacity = event.totalCapacity
  const pct = capacity ? Math.min(100, Math.round((bookedCount / capacity) * 100)) : 0
  const [copied, setCopied] = useState(false)
  const publicEventUrl = `${window.location.origin}/e/${event.id}`

  function openPublic(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(publicEventUrl, '_blank')
  }

  function copyLink(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(publicEventUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-white rounded-xl border border-[#c4c5d5] shadow-sm hover:shadow-md transition-all group flex flex-col">
      {/* Hero */}
      <div className="h-36 bg-gradient-to-br from-[#002068] to-[#003399] rounded-t-xl relative overflow-hidden flex items-end p-4">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover opacity-60" />
        ) : (
          <div className="absolute inset-0 opacity-10">
            <Icon name="event" size={128} className="text-white absolute -top-4 -right-4" />
          </div>
        )}
        <div className="relative z-10 flex items-center justify-between w-full">
          {statusBadge(event.status)}
          <div className="flex items-center gap-1">
            <button
              onClick={openPublic}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
              title="Apri pagina pubblica evento"
            >
              <Icon name="open_in_new" size={14} />
            </button>
            <button
              onClick={copyLink}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
              title={copied ? 'Copiato!' : 'Copia link evento'}
            >
              <Icon name={copied ? 'check' : 'link'} size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
              title="Modifica"
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="w-7 h-7 rounded-lg bg-white/20 hover:bg-red-500/60 flex items-center justify-center text-white transition-colors"
              title="Elimina"
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-[#1a1b22] group-hover:text-[#002068] transition-colors mb-3 line-clamp-2">
          {event.title}
        </h3>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="calendar_month" size={15} className="text-[#002068] flex-shrink-0" />
            <span className="text-xs text-[#444653]">{formatDate(event.startDate)}</span>
          </div>
          {event.startTime && (
            <div className="flex items-center gap-2">
              <Icon name="schedule" size={15} className="text-[#002068] flex-shrink-0" />
              <span className="text-xs text-[#444653]">{event.startTime}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2 col-span-2">
              <Icon name="location_on" size={15} className="text-[#002068] flex-shrink-0" />
              <a
                href={event.locationUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#444653] line-clamp-1 hover:text-[#002068] hover:underline"
                onClick={e => e.stopPropagation()}
              >
                {event.location}
              </a>
            </div>
          )}
          <div className="flex items-center gap-2 col-span-2">
            <Icon name="payments" size={15} className="text-[#002068] flex-shrink-0" />
            <span className="text-xs font-bold text-[#002068]">{lowestPrice(event.ticketTypes)}</span>
          </div>
        </div>

        {/* Seats progress */}
        {(capacity !== null || bookedCount > 0) && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-[#444653] mb-1">
              <span>Iscritti</span>
              <span className="font-bold">
                {capacity !== null ? `${bookedCount}/${capacity}` : bookedCount}
              </span>
            </div>
            {capacity !== null && (
              <div className="h-2 bg-[#e8e7f0] rounded-full">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : 'bg-[#fe9832]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-4 border-t border-[#c4c5d5]">
          <button
            onClick={onToggleStatus}
            className="flex-1 py-2 text-xs font-bold text-[#002068] border border-[#002068] rounded-lg hover:bg-[#dce1ff] transition-colors"
          >
            {event.status === 'published' ? 'Metti in bozza' : 'Pubblica'}
          </button>
          <button
            onClick={onManage}
            className="flex-1 py-2 text-xs font-bold bg-[#002068] text-white rounded-lg hover:bg-[#003399] transition-colors"
          >
            Gestisci
          </button>
        </div>
      </div>
    </div>
  )
}
