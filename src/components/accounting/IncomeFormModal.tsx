import { useState } from 'react'
import Icon from '../ui/Icon'
import { showToast } from '../ui/Toast'
import type { ManualIncomeMethod, SolidandoEvent } from '../../types/form'

export const INCOME_METHODS: { value: ManualIncomeMethod; label: string }[] = [
  { value: 'cash', label: 'Contanti' },
  { value: 'bank_transfer', label: 'Bonifico' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Altro' },
]

export function methodLabel(m: ManualIncomeMethod) {
  return INCOME_METHODS.find(x => x.value === m)?.label ?? m
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export interface IncomeFormData {
  description: string
  amount: number
  method: ManualIncomeMethod
  date: string
  notes?: string
  eventId?: string   // undefined = entrata generale workspace
}

interface IncomeFormModalProps {
  initial?: Partial<IncomeFormData>
  events?: SolidandoEvent[]      // se fornito mostra selettore evento (con opzione "nessun evento")
  defaultEventId?: string
  onSave: (data: IncomeFormData) => Promise<void>
  onClose: () => void
}

const NO_EVENT = '__none__'

export default function IncomeFormModal({
  initial,
  events,
  defaultEventId,
  onSave,
  onClose,
}: IncomeFormModalProps) {
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [method, setMethod] = useState<ManualIncomeMethod>(initial?.method ?? 'cash')
  const [date, setDate] = useState(initial?.date ?? today())
  const [notes, setNotes] = useState(initial?.notes ?? '')
  // defaultEventId può essere undefined → nessun evento pre-selezionato
  const [eventId, setEventId] = useState(initial?.eventId ?? defaultEventId ?? NO_EVENT)
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
        amount: parseFloat(amount),
        method,
        date,
        notes: notes.trim() || undefined,
        eventId: eventId === NO_EVENT ? undefined : eventId,
      })
      onClose()
    } catch {
      showToast('Errore nel salvataggio', 'error')
    } finally {
      setSaving(false)
    }
  }

  const isGeneral = eventId === NO_EVENT

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-[#e8e7f0] flex items-center justify-between">
          <h3 className="font-bold text-[#1a6b3a] flex items-center gap-2">
            <Icon name="add_card" size={18} />
            {initial ? 'Modifica entrata' : 'Nuova entrata'}
          </h3>
          <button onClick={onClose} className="text-[#747684] hover:text-[#002068]">
            <Icon name="close" size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          {/* Selettore evento — mostrato solo se viene passata la lista eventi */}
          {events !== undefined && (
            <div>
              <label className={lbl}>Evento / Destinazione</label>
              <select value={eventId} onChange={e => setEventId(e.target.value)} className={inp}>
                <option value={NO_EVENT}>— Entrata generale (nessun evento) —</option>
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
              {isGeneral && (
                <p className="text-xs text-[#747684] mt-1 flex items-center gap-1">
                  <Icon name="info" size={13} />
                  Verrà registrata come fondo/entrata generale del workspace
                </p>
              )}
            </div>
          )}

          <div>
            <label className={lbl}>Descrizione *</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={inp}
              placeholder={isGeneral ? 'es. Fondo cassa iniziale, Contributo socio…' : 'es. Quota iscrizione extra, Sponsor…'}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Importo (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className={inp}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label className={lbl}>Data *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} required />
            </div>
          </div>
          <div>
            <label className={lbl}>Metodo</label>
            <select value={method} onChange={e => setMethod(e.target.value as ManualIncomeMethod)} className={inp}>
              {INCOME_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Note</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={`${inp} resize-none`}
              placeholder="Note aggiuntive…"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-[#c4c5d5] rounded-xl text-sm font-semibold text-[#444653] hover:bg-[#f4f3fc] transition-all"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-[#1a6b3a] text-white rounded-xl text-sm font-bold hover:bg-[#145530] transition-all disabled:opacity-50"
            >
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
