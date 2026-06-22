import { useEffect, useRef, useState } from 'react'
import {
  collection, addDoc, getDocs, getDoc, query, where, orderBy, deleteDoc, doc, serverTimestamp, updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../firebase/config'
import { showToast } from '../ui/Toast'
import Icon from '../ui/Icon'
import ImageGalleryModal from '../ui/ImageGalleryModal'
import { nanoid } from 'nanoid'
import type { SolidandoEvent, CassaItem, CassaTransaction, CassaTransactionItem, ManualIncomeMethod, Response, Form } from '../../types/form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
}

function today() {
  return new Date().toISOString().split('T')[0]
}

const PAYMENT_METHODS: { value: ManualIncomeMethod; label: string; icon: string }[] = [
  { value: 'cash',          label: 'Contanti',      icon: 'payments' },
  { value: 'bank_transfer', label: 'Bonifico',       icon: 'account_balance' },
  { value: 'paypal',        label: 'PayPal',         icon: 'paypal' },
  { value: 'stripe',        label: 'Carta/POS',      icon: 'credit_card' },
  { value: 'other',         label: 'Altro',          icon: 'more_horiz' },
]

const DEFAULT_COLORS = [
  '#002068', '#1a6b3a', '#683700', '#5c1a5e',
  '#1a4a6b', '#6b1a2e', '#3d5a00', '#444653',
]

// ─── Firebase helpers ─────────────────────────────────────────────────────────

async function addCassaTransaction(
  eventId: string,
  workspaceId: string,
  data: Omit<CassaTransaction, 'id' | 'createdAt'>,
): Promise<string> {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, 'cassa_transactions'), {
    ...clean,
    eventId,
    workspaceId,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

async function getCassaTransactions(eventId: string): Promise<CassaTransaction[]> {
  // orderBy rimosso: l'indice composto potrebbe essere ancora in building; ordiniamo in memoria
  const q = query(
    collection(db, 'cassa_transactions'),
    where('eventId', '==', eventId),
  )
  const snap = await getDocs(q)
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as CassaTransaction))
  return docs.sort((a, b) => {
    const aT = a.createdAt?.toDate?.()?.getTime() ?? 0
    const bT = b.createdAt?.toDate?.()?.getTime() ?? 0
    return bT - aT
  })
}

async function deleteCassaTransaction(txId: string) {
  await deleteDoc(doc(db, 'cassa_transactions', txId))
}

// ─── Cart types ───────────────────────────────────────────────────────────────

interface BookingMeta {
  responseId: string
  alreadyPaid: boolean
  effectiveCount: number
  pricePerPerson: number
  effectiveTotal: number
  sendReceipt: boolean
  recipientEmail: string
}

interface CartLine {
  cassaItemId: string | 'custom'
  label: string
  price: number   // prezzo unitario
  qty: number
  bookingMeta?: BookingMeta
}

// ─── Item Editor Modal ────────────────────────────────────────────────────────

interface ItemEditorProps {
  initial?: CassaItem
  onSave: (item: CassaItem) => void
  onClose: () => void
}

function ItemEditorModal({ initial, onSave, onClose }: ItemEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '')
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLORS[0])
  const [showGallery, setShowGallery] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    if (!label.trim()) { showToast('Inserisci un\'etichetta', 'error'); return }
    const parsedPrice = parseFloat(price)
    onSave({
      id: initial?.id ?? nanoid(6),
      label: label.trim(),
      price: isNaN(parsedPrice) || parsedPrice < 0 ? 0 : parsedPrice,
      currency: 'EUR',
      emoji: emoji.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      color,
      sortOrder: initial?.sortOrder,
    })
    onClose()
  }

  const inp = 'w-full px-3 py-2 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none bg-white'
  const lbl = 'block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1'

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#002068] px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-white text-lg">
            {initial ? 'Modifica articolo' : 'Nuovo articolo'}
          </h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preview tasto */}
          <div className="flex justify-center mb-2">
            <div
              className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md select-none"
              style={{ backgroundColor: color }}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-10 h-10 object-contain rounded-lg" />
              ) : emoji ? (
                <span className="text-3xl leading-none">{emoji}</span>
              ) : (
                <Icon name="shopping_bag" size={28} className="text-white/70" />
              )}
              <span className="text-white text-xs font-bold text-center px-1 leading-tight line-clamp-2 max-w-full">
                {label || 'Articolo'}
              </span>
            </div>
          </div>

          <div>
            <label className={lbl}>Etichetta *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} className={inp} placeholder="es. Ingresso adulto" autoFocus />
          </div>

          <div>
            <label className={lbl}>Prezzo (€) — 0 = importo libero</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444653] text-sm font-bold">€</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={e => setPrice(e.target.value)}
                className={`${inp} pl-7`}
                placeholder="0.00"
              />
            </div>
            {(parseFloat(price) === 0 || price === '' || price === '0') && (
              <p className="mt-1 text-xs text-[#fe9832] font-semibold">Importo libero — l'operatore inserirà il valore al momento</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Emoji</label>
              <input value={emoji} onChange={e => { setEmoji(e.target.value); if (e.target.value) setImageUrl('') }} className={inp} placeholder="es. 🎟️" maxLength={4} />
            </div>
            <div>
              <label className={lbl}>Immagine da galleria</label>
              <button
                type="button"
                onClick={() => setShowGallery(true)}
                className="w-full px-3 py-2 border border-[#c4c5d5] rounded-xl text-sm text-left text-[#444653] hover:border-[#002068] transition-colors truncate"
              >
                {imageUrl ? '✓ Immagine selezionata' : 'Scegli dalla galleria...'}
              </button>
            </div>
          </div>

          {imageUrl && (
            <div className="flex items-center gap-2 p-2 bg-[#f4f3fc] rounded-xl">
              <img src={imageUrl} alt="" className="w-10 h-10 object-contain rounded-lg border border-[#c4c5d5]" />
              <span className="flex-1 text-xs text-[#444653] truncate">{imageUrl}</span>
              <button onClick={() => setImageUrl('')} className="text-[#747684] hover:text-[#ba1a1a]">
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          <div>
            <label className={lbl}>Colore sfondo tasto</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DEFAULT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${color === c ? 'border-white ring-2 ring-[#002068] scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border border-[#c4c5d5] p-0.5"
                  title="Colore personalizzato"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-semibold hover:bg-[#f4f3fc] transition-all text-sm"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all text-sm"
          >
            Salva articolo
          </button>
        </div>
      </div>

      {showGallery && (
        <ImageGalleryModal
          uploadPath="covers"
          onSelect={url => { setImageUrl(url); setEmoji(''); setShowGallery(false) }}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}

// ─── Custom Amount Modal ───────────────────────────────────────────────────────

function CustomAmountModal({
  label,
  onConfirm,
  onClose,
}: {
  label: string
  onConfirm: (amount: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') handleConfirm()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleConfirm() {
    const n = parseFloat(value.replace(',', '.'))
    if (isNaN(n) || n <= 0) { showToast('Inserisci un importo valido', 'error'); return }
    onConfirm(n)
  }

  // Tastierino numerico
  function press(k: string) {
    if (k === 'DEL') { setValue(v => v.slice(0, -1)); return }
    if (k === '.' && value.includes('.')) return
    if (k === '.' && value === '') { setValue('0.'); return }
    setValue(v => v + k)
  }

  const keys = ['7','8','9','4','5','6','1','2','3','0','.','DEL']

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        <div className="bg-[#002068] px-5 py-4">
          <p className="text-xs font-bold text-[#8aa4ff] uppercase tracking-wider">Importo libero</p>
          <p className="text-white font-bold text-lg mt-0.5 truncate">{label}</p>
        </div>
        <div className="p-5">
          <div className="bg-[#f4f3fc] rounded-xl px-4 py-3 mb-4 text-right">
            <span className="text-3xl font-black text-[#002068]">
              € {value || '0'}
            </span>
            <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} className="sr-only" type="number" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {keys.map(k => (
              <button
                key={k}
                onClick={() => press(k)}
                className={`py-4 rounded-xl font-bold text-lg transition-all active:scale-95 ${
                  k === 'DEL'
                    ? 'bg-[#ffe0e0] text-[#ba1a1a] hover:bg-[#ffc8c8]'
                    : 'bg-[#e8e7f0] text-[#1a1b22] hover:bg-[#c4c5d5]'
                }`}
              >
                {k === 'DEL' ? '⌫' : k}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-3 border-2 border-[#c4c5d5] rounded-xl font-semibold text-[#444653] hover:bg-[#f4f3fc]">
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              className="flex-2 flex-grow-[2] py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all"
            >
              Conferma
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────

const BANKNOTES = [5, 10, 20, 50, 100]

function PaymentModal({
  total,
  cart,
  onConfirm,
  onClose,
}: {
  total: number
  cart: CartLine[]
  onConfirm: (method: ManualIncomeMethod, note: string, change: number) => void
  onClose: () => void
}) {
  const [method, setMethod] = useState<ManualIncomeMethod>('cash')
  const [note, setNote] = useState('')
  const [cashGiven, setCashGiven] = useState<number | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const change = cashGiven !== null && cashGiven >= total ? cashGiven - total : 0
  const shortfall = cashGiven !== null && cashGiven < total ? total - cashGiven : 0

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Banconote: mostra quelle >= totale arrotondate + la prima inferiore
  const relevantNotes = BANKNOTES.filter(b => {
    const rounded = Math.ceil(total / b) * b
    return rounded <= 500
  }).map(b => Math.ceil(total / b) * b).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)
  const extraNotes = BANKNOTES.filter(b => b > total && !relevantNotes.includes(b)).slice(0, 2)
  const allNotes = [...new Set([...relevantNotes, ...extraNotes])].sort((a, b) => a - b).slice(0, 6)

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[95vh]">

        {/* Header totale */}
        <div className="bg-[#1a6b3a] px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#b8f5cd] uppercase tracking-wider">Totale da incassare</p>
              <p className="text-4xl font-black text-white mt-1">{fmtEur(total)}</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <Icon name="close" size={22} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Riepilogo carrello */}
          <div className="px-6 pt-5 pb-3 border-b border-[#e8e7f0]">
            <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-2">Riepilogo</p>
            <div className="space-y-1.5">
              {cart.map((line, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-[#1a1b22] truncate flex-1 mr-2">
                    {line.qty > 1 ? `${line.qty}× ` : ''}{line.label}
                  </span>
                  <span className="font-semibold text-[#1a1b22] shrink-0">
                    {fmtEur(line.price * line.qty)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metodo di pagamento */}
          <div className="px-6 pt-4 pb-3">
            <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-2">Metodo di pagamento</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => { setMethod(m.value); setCashGiven(null) }}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${
                    method === m.value
                      ? 'border-[#002068] bg-[#dce1ff] text-[#002068]'
                      : 'border-[#e8e7f0] text-[#444653] hover:border-[#002068]'
                  }`}
                >
                  <Icon name={m.icon} size={20} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contanti — banconote + resto */}
          {method === 'cash' && (
            <div className="px-6 pb-4">
              <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-3">Banconota ricevuta</p>

              {/* Griglia banconote */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {allNotes.map(v => (
                  <button
                    key={v}
                    onClick={() => setCashGiven(cashGiven === v ? null : v)}
                    className={`relative py-4 rounded-xl border-2 font-black text-xl transition-all active:scale-95 ${
                      cashGiven === v
                        ? 'border-[#1a6b3a] bg-[#e6f9ee] text-[#1a6b3a] shadow-md'
                        : 'border-[#e8e7f0] bg-[#f9f9fb] text-[#1a1b22] hover:border-[#1a6b3a] hover:bg-[#f0fdf5]'
                    }`}
                  >
                    <span className="text-xs font-bold absolute top-1.5 left-2.5 opacity-60">€</span>
                    {v}
                  </button>
                ))}
              </div>

              {/* Box resto */}
              <div className={`px-5 py-4 rounded-2xl flex items-center justify-between transition-all ${
                cashGiven === null
                  ? 'bg-[#f4f3fc] text-[#747684]'
                  : change > 0
                    ? 'bg-[#e6f9ee] text-[#1a6b3a]'
                    : shortfall > 0
                      ? 'bg-[#ffeee0] text-[#683700]'
                      : 'bg-[#e6f9ee] text-[#1a6b3a]'
              }`}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70">
                    {cashGiven === null ? 'Seleziona una banconota' : change > 0 ? 'Resto da dare' : shortfall > 0 ? 'Importo mancante' : 'Pagamento esatto'}
                  </p>
                  {cashGiven !== null && (
                    <p className="text-xs opacity-60 mt-0.5">Ricevuto {fmtEur(cashGiven)}</p>
                  )}
                </div>
                <span className="text-3xl font-black">
                  {cashGiven === null ? '—' : fmtEur(change > 0 ? change : shortfall > 0 ? shortfall : 0)}
                </span>
              </div>
            </div>
          )}

          {/* Nota */}
          <div className="px-6 pb-5">
            <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">Nota (opzionale)</p>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              placeholder="es. Tavolo 5, cognome cliente..."
            />
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-6 pb-6 pt-3 border-t border-[#e8e7f0] shrink-0 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 border-2 border-[#c4c5d5] rounded-xl font-semibold text-[#444653] hover:bg-[#f4f3fc] text-sm">
            Annulla
          </button>
          <button
            onClick={() => onConfirm(method, note, change)}
            disabled={method === 'cash' && cashGiven !== null && shortfall > 0}
            className="flex-[2] py-3.5 bg-[#1a6b3a] text-white rounded-xl font-bold hover:bg-[#155530] transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            <Icon name="check_circle" size={22} />
            Conferma incasso
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transaction History ───────────────────────────────────────────────────────

function TransactionHistory({ eventId, refreshKey }: { eventId: string; refreshKey: number }) {
  const [transactions, setTransactions] = useState<CassaTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getCassaTransactions(eventId).then(txs => {
      setTransactions(txs)
      setLoading(false)
    })
  }, [eventId, refreshKey])

  const total = transactions.reduce((s, t) => s + t.total, 0)
  const byMethod = transactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.method] = (acc[t.method] ?? 0) + t.total
    return acc
  }, {})

  async function handleDelete(txId: string) {
    if (!confirm('Eliminare questa transazione?')) return
    setDeleting(txId)
    try {
      await deleteCassaTransaction(txId)
      setTransactions(prev => prev.filter(t => t.id !== txId))
      showToast('Transazione eliminata', 'success')
    } catch {
      showToast('Errore eliminazione', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const methodIcon = (m: string) => PAYMENT_METHODS.find(p => p.value === m)?.icon ?? 'payments'
  const methodLabel = (m: string) => PAYMENT_METHODS.find(p => p.value === m)?.label ?? m

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* KPI riepilogo */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#1a6b3a] text-white p-4 rounded-xl">
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Totale incassato</p>
            <p className="text-2xl font-black mt-1">{fmtEur(total)}</p>
            <p className="text-xs opacity-60 mt-0.5">{transactions.length} transazioni</p>
          </div>
          {Object.entries(byMethod).map(([m, v]) => (
            <div key={m} className="bg-white border border-[#c4c5d5] p-4 rounded-xl">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon name={methodIcon(m)} size={14} className="text-[#002068]" />
                <p className="text-xs font-bold text-[#444653] uppercase tracking-wider">{methodLabel(m)}</p>
              </div>
              <p className="text-xl font-black text-[#002068]">{fmtEur(v)}</p>
            </div>
          ))}
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-[#c4c5d5]">
          <Icon name="point_of_sale" size={56} />
          <p className="text-[#747684] font-medium">Nessuna transazione ancora</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#c4c5d5] overflow-hidden">
          {transactions.map((tx, i) => {
            const isExp = expanded === tx.id
            const txDate = tx.createdAt?.toDate?.()
            const dateStr = txDate
              ? txDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : tx.date
            const timeStr = txDate
              ? txDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
              : ''

            return (
              <div key={tx.id} className={`${i > 0 ? 'border-t border-[#e8e7f0]' : ''}`}>
                <div
                  className="px-5 py-3 flex items-center gap-3 hover:bg-[#fafafa] cursor-pointer transition-colors"
                  onClick={() => setExpanded(isExp ? null : tx.id)}
                >
                  <div className="w-9 h-9 rounded-xl bg-[#e6f9ee] flex items-center justify-center shrink-0">
                    <Icon name={methodIcon(tx.method)} size={18} className="text-[#1a6b3a]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#1a1b22] text-sm">{fmtEur(tx.total)}</span>
                      <span className="text-xs text-[#747684]">{methodLabel(tx.method)}</span>
                      {tx.note && <span className="text-xs text-[#747684] truncate">· {tx.note}</span>}
                    </div>
                    <p className="text-xs text-[#c4c5d5] mt-0.5">
                      {dateStr}{timeStr ? ` · ${timeStr}` : ''}
                      {tx.operatorName ? ` · ${tx.operatorName}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(tx.id) }}
                      disabled={deleting === tx.id}
                      className="p-1.5 text-[#c4c5d5] hover:text-[#ba1a1a] rounded-lg hover:bg-[#fff0f0] transition-colors"
                      title="Elimina"
                    >
                      <Icon name={deleting === tx.id ? 'hourglass_empty' : 'delete'} size={16} />
                    </button>
                    <Icon name={isExp ? 'expand_less' : 'expand_more'} size={18} className="text-[#747684]" />
                  </div>
                </div>
                {isExp && (
                  <div className="px-5 pb-3 pt-0 bg-[#fafafa] border-t border-[#e8e7f0]">
                    <div className="space-y-1.5 mt-2">
                      {tx.items.map((item, j) => (
                        <div key={j} className="flex items-center justify-between text-sm">
                          <span className="text-[#444653]">
                            {item.qty > 1 ? `${item.qty}× ` : ''}{item.label}
                          </span>
                          <span className="font-bold text-[#1a1b22]">{fmtEur(item.subtotal)}</span>
                        </div>
                      ))}
                      <div className="border-t border-dashed border-[#e8e7f0] pt-1.5 flex items-center justify-between font-black text-sm">
                        <span>Totale</span>
                        <span className="text-[#1a6b3a]">{fmtEur(tx.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Configurazione articoli ───────────────────────────────────────────────────

function ItemsConfigPanel({ event, onSave }: { event: SolidandoEvent; onSave: (items: CassaItem[]) => Promise<void> }) {
  const [items, setItems] = useState<CassaItem[]>(event.cassaItems ?? [])
  const [editItem, setEditItem] = useState<CassaItem | null | 'new'>(null)
  const [saving, setSaving] = useState(false)

  // Sincronizza se l'evento cambia dall'esterno
  useEffect(() => {
    setItems(event.cassaItems ?? [])
  }, [event.cassaItems])

  function handleSaveItem(item: CassaItem) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = item
        return next
      }
      return [...prev, { ...item, sortOrder: prev.length }]
    })
  }

  function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function moveItem(id: string, dir: -1 | 1) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id)
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  async function handleSaveAll() {
    setSaving(true)
    try {
      await onSave(items)
      showToast('Articoli salvati', 'success')
    } catch (err) {
      console.error('Errore salvataggio articoli cassa:', err)
      showToast('Errore salvataggio', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[#002068] flex items-center gap-2">
          <Icon name="grid_view" size={18} />
          Articoli cassa ({items.length})
        </h3>
        <button
          onClick={() => setEditItem('new')}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#002068] text-white rounded-xl text-sm font-bold hover:bg-[#003399] transition-all"
        >
          <Icon name="add" size={16} />
          Nuovo articolo
        </button>
      </div>

      <div className="bg-[#f4f3fc] rounded-xl border border-[#c4c5d5] p-4">
        <p className="text-xs text-[#747684]">
          Di default l'evento stesso è disponibile come articolo. Aggiungi qui altri articoli (biglietti, gadget, bevande, ecc.).
          Gli articoli con prezzo 0 richiedono l'inserimento dell'importo al momento della vendita.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-[#c4c5d5]">
          <Icon name="shopping_bag" size={48} />
          <p className="text-[#747684] text-sm">Nessun articolo configurato</p>
          <button
            onClick={() => setEditItem('new')}
            className="text-[#002068] font-bold text-sm hover:underline"
          >
            + Aggiungi il primo articolo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#c4c5d5] hover:border-[#002068] transition-colors group"
            >
              {/* Preview colore/emoji/img */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ backgroundColor: item.color ?? '#002068' }}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="w-7 h-7 object-contain rounded" />
                ) : item.emoji ? (
                  <span className="text-xl">{item.emoji}</span>
                ) : (
                  <Icon name="shopping_bag" size={20} className="text-white/70" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-[#1a1b22] truncate">{item.label}</p>
                <p className="text-xs text-[#747684]">
                  {item.price > 0 ? fmtEur(item.price) : <span className="text-[#fe9832] font-semibold">Importo libero</span>}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveItem(item.id, -1)}
                  disabled={idx === 0}
                  className="p-1.5 text-[#747684] hover:text-[#002068] rounded-lg hover:bg-[#f4f3fc] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Icon name="arrow_upward" size={14} />
                </button>
                <button
                  onClick={() => moveItem(item.id, 1)}
                  disabled={idx === items.length - 1}
                  className="p-1.5 text-[#747684] hover:text-[#002068] rounded-lg hover:bg-[#f4f3fc] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Icon name="arrow_downward" size={14} />
                </button>
                <button
                  onClick={() => setEditItem(item)}
                  className="p-2 md:p-2.5 text-[#002068] rounded-lg bg-[#f4f3fc] hover:bg-[#dce1ff] transition-colors"
                >
                  <Icon name="edit" size={16} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-2 md:p-2.5 text-[#ba1a1a] rounded-lg bg-[#fff0f0] hover:bg-[#ffc8c8] transition-colors"
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleSaveAll}
        disabled={saving}
        className="w-full py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving
          ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <Icon name="save" size={18} />}
        Salva configurazione articoli
      </button>

      {editItem !== null && (
        <ItemEditorModal
          initial={editItem === 'new' ? undefined : editItem}
          onSave={handleSaveItem}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  )
}

// ─── Booking Picker Modal ─────────────────────────────────────────────────────

async function getResponsesByFormId(formId: string): Promise<Response[]> {
  const q = query(
    collection(db, 'responses'),
    where('formId', '==', formId),
    orderBy('submittedAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Response))
}

async function getFormById(formId: string): Promise<Form | null> {
  const snap = await getDoc(doc(db, 'forms', formId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Form
}

interface BookingPickerProps {
  event: SolidandoEvent
  workspaceId: string
  onClose: () => void
  onAddToCart: (line: CartLine) => void
}

function BookingPickerModal({ event, workspaceId: _workspaceId, onClose, onAddToCart }: BookingPickerProps) {
  const [responses, setResponses] = useState<Response[]>([])
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Response | null>(null)
  const [effectiveCount, setEffectiveCount] = useState(1)
  const [sendReceipt, setSendReceipt] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [resps, frm] = await Promise.all([
        event.formId ? getResponsesByFormId(event.formId).catch(() => [] as Response[]) : Promise.resolve([] as Response[]),
        event.formId ? getFormById(event.formId).catch(() => null) : Promise.resolve(null),
      ])
      setResponses(resps)
      setForm(frm)
      setLoading(false)
    }
    load()
  }, [event.id, event.formId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') { selected ? setSelected(null) : onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, selected])

  function handleSearch() {
    setSearchQuery(search)
  }

  // Estrai nome e email da una risposta usando i nodi del form
  function extractNameEmail(r: Response): { name: string; email: string } {
    const nodes = form?.nodes ?? []
    let name = ''
    let email = ''
    for (const node of nodes) {
      const val = (r.answers as Record<string, unknown>)?.[node.id]
      if (!val || typeof val !== 'string') continue
      if (!email && node.type === 'email') email = val.trim()
      if (!name && node.type === 'short_text') name = val.trim()
    }
    return { name: name || email || r.id.slice(0, 8), email }
  }

  const filtered = responses.filter(r => {
    if (!searchQuery.trim()) return true
    const { name, email } = extractNameEmail(r)
    const hay = `${name} ${email} ${r.id}`.toLowerCase()
    return searchQuery.toLowerCase().split(' ').every(w => hay.includes(w))
  })

  function handleSelect(r: Response) {
    const { email } = extractNameEmail(r)
    setRecipientEmail(email)
    setSendReceipt(!!email && !r.receiptNumber)
    setEffectiveCount(r.checkInAttendeeCount ?? r.attendeeCount ?? 1)
    setSelected(r)
  }

  function handleAddToCart() {
    if (!selected) return
    const alreadyPaid = selected.paymentStatus === 'completed'
    const bookingCount = selected.attendeeCount ?? 1
    const pricePerPerson = bookingCount > 0
      ? (selected.paymentAmount ?? 0) / bookingCount
      : (selected.paymentAmount ?? 0)
    const effectiveTotal = alreadyPaid ? 0 : pricePerPerson * effectiveCount
    const { name } = extractNameEmail(selected)

    const line: CartLine = {
      cassaItemId: '__booking__',
      label: name || `Prenotazione #${selected.id.slice(0, 8)}`,
      price: alreadyPaid ? 0 : pricePerPerson,
      qty: alreadyPaid ? 1 : effectiveCount,
      bookingMeta: {
        responseId: selected.id,
        alreadyPaid,
        effectiveCount,
        pricePerPerson,
        effectiveTotal,
        sendReceipt,
        recipientEmail,
      },
    }
    onAddToCart(line)
    showToast(`"${line.label}" aggiunto al carrello`, 'success')
    onClose()
  }

  const statusBadge = (r: Response) => {
    const paid = r.paymentStatus === 'completed'
    const checkedIn = r.checkInStatus === 'checked_in'
    return (
      <div className="flex gap-1 flex-wrap justify-end">
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${paid ? 'bg-[#e6f9ee] text-[#1a6b3a]' : 'bg-[#ffeee0] text-[#683700]'}`}>
          {paid ? 'Pagato' : 'Non pagato'}
        </span>
        {checkedIn && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#dce1ff] text-[#002068]">
            Check-in
          </span>
        )}
      </div>
    )
  }

  const { name: selName } = selected ? extractNameEmail(selected) : { name: '' }
  const selPaid = selected?.paymentStatus === 'completed'

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#5c1a5e] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="confirmation_number" size={20} className="text-white" />
            <h2 className="font-bold text-white text-lg">Prenotazione</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <Icon name="close" size={20} />
          </button>
        </div>

        {!selected ? (
          <>
            {/* Ricerca */}
            <div className="p-4 border-b border-[#e8e7f0] shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747684]" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                    placeholder="Cerca per nome, email..."
                    className="w-full pl-9 pr-4 py-2.5 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#5c1a5e] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2.5 bg-[#5c1a5e] text-white rounded-xl text-sm font-semibold hover:bg-[#4a1550] active:bg-[#3a1040] transition-colors shrink-0"
                >
                  Cerca
                </button>
              </div>
              <p className="text-xs text-[#747684] mt-2">
                {loading ? 'Caricamento...' : searchQuery ? `${filtered.length} prenotazion${filtered.length === 1 ? 'e' : 'i'}` : 'Inserisci un nome o email e premi Cerca'}
              </p>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#e8e7f0]">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-4 border-[#5c1a5e] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : !searchQuery ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[#747684]">
                  <Icon name="manage_search" size={40} className="text-[#c4c5d5]" />
                  <p className="text-sm">Cerca una prenotazione per iniziare</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-[#747684]">
                  <Icon name="search_off" size={40} className="text-[#c4c5d5]" />
                  <p className="text-sm">Nessuna prenotazione trovata</p>
                </div>
              ) : (
                filtered.map(r => {
                  const { name, email } = extractNameEmail(r)
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelect(r)}
                      className="w-full text-left px-5 py-3.5 hover:bg-[#f4f3fc] transition-colors flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-xl bg-[#f4f3fc] flex items-center justify-center shrink-0 text-[#5c1a5e] font-black text-lg">
                        {(name[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#1a1b22] truncate">{name}</p>
                        {email && <p className="text-xs text-[#747684] truncate">{email}</p>}
                        {r.attendeeCount && r.attendeeCount > 1 && (
                          <p className="text-xs text-[#5c1a5e] font-semibold">{r.attendeeCount} persone</p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {statusBadge(r)}
                        {r.paymentAmount != null && r.paymentAmount > 0 && (
                          <p className="text-xs font-bold text-[#1a6b3a]">{fmtEur(r.paymentAmount)}</p>
                        )}
                      </div>
                      <Icon name="chevron_right" size={18} className="text-[#c4c5d5] shrink-0" />
                    </button>
                  )
                })
              )}
            </div>
          </>
        ) : (
          /* Schermata conferma */
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Riepilogo prenotazione */}
              <div className="bg-[#f4f3fc] rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#5c1a5e] flex items-center justify-center text-white font-black text-xl shrink-0">
                    {(selName[0] ?? '?').toUpperCase()}
                  </div>
                  <div>
                    <p className="font-black text-[#1a1b22] text-lg">{selName}</p>
                    <p className="text-xs text-[#747684]">Prenotazione #{selected.id.slice(0, 8)}</p>
                  </div>
                </div>
                {statusBadge(selected)}
              </div>

              {/* Editor numero persone */}
              {(() => {
                const bookingCount = selected.attendeeCount ?? 1
                const pricePerPerson = bookingCount > 0
                  ? (selected.paymentAmount ?? 0) / bookingCount
                  : (selected.paymentAmount ?? 0)
                const effectiveTotal = pricePerPerson * effectiveCount
                return (
                  <div className="bg-white rounded-2xl border border-[#c4c5d5] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#e8e7f0] flex items-center justify-between">
                      <span className="text-sm font-bold text-[#444653] uppercase tracking-wider">Numero persone</span>
                      {effectiveCount !== bookingCount && (
                        <span className="text-xs text-[#fe9832] font-semibold">
                          Prenotazione: {bookingCount}
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEffectiveCount(c => Math.max(1, c - 1))}
                          className="w-10 h-10 rounded-xl bg-[#f4f3fc] flex items-center justify-center text-[#002068] font-black text-xl hover:bg-[#dce1ff] transition-colors"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-black text-2xl text-[#1a1b22]">{effectiveCount}</span>
                        <button
                          onClick={() => setEffectiveCount(c => c + 1)}
                          className="w-10 h-10 rounded-xl bg-[#f4f3fc] flex items-center justify-center text-[#002068] font-black text-xl hover:bg-[#dce1ff] transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-right">
                        {selPaid ? (
                          <>
                            <p className="text-xs text-[#747684]">Già pagato{selected.paymentAmount != null && selected.paymentAmount > 0 ? ` (${fmtEur(selected.paymentAmount)})` : ''}</p>
                            <p className="text-2xl font-black text-[#1a6b3a]">Saldo {fmtEur(0)}</p>
                          </>
                        ) : (
                          <>
                            {pricePerPerson > 0 && (
                              <p className="text-xs text-[#747684]">{fmtEur(pricePerPerson)} × {effectiveCount}</p>
                            )}
                            <p className="text-2xl font-black text-[#1a6b3a]">{fmtEur(effectiveTotal)}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Info azione */}
              <div className="flex items-start gap-2 p-3 bg-[#e6f9ee] rounded-xl text-sm text-[#1a6b3a]">
                <Icon name="info" size={18} className="shrink-0 mt-0.5" />
                {selPaid ? (
                  <p>Pagamento già effettuato: aggiungendo al carrello verrà eseguito il <strong>check-in</strong> all'incasso.</p>
                ) : (
                  <p>La prenotazione viene aggiunta al carrello. Il <strong>check-in</strong> e il <strong>pagamento</strong> si completano all'incasso.</p>
                )}
              </div>

              {/* Toggle + campo email ricevuta */}
              <div className="space-y-3">
                {selected.receiptNumber && (
                  <div className="flex items-start gap-2 p-3 bg-[#fff8e1] rounded-xl text-sm text-[#7a5800] border border-[#ffe082]">
                    <Icon name="warning" size={16} className="shrink-0 mt-0.5" />
                    <p>Ricevuta <strong>{selected.receiptNumber}</strong> già emessa. Attivando il toggle verrà inviata una copia.</p>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#c4c5d5]">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1b22]">Invia ricevuta (opzionale)</p>
                    <p className="text-xs text-[#747684]">Invia una ricevuta via email al partecipante</p>
                  </div>
                  <button
                    onClick={() => setSendReceipt(v => !v)}
                    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${sendReceipt ? 'bg-[#5c1a5e]' : 'bg-[#c4c5d5]'}`}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${sendReceipt ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                {sendReceipt && (
                  <div>
                    <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1">
                      Email destinatario
                    </label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#5c1a5e] focus:outline-none"
                      placeholder="es. mario@esempio.it"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Bottoni */}
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 py-3 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-semibold hover:bg-[#f4f3fc] transition-all text-sm"
              >
                Indietro
              </button>
              <button
                onClick={handleAddToCart}
                className="flex-[2] py-3 bg-[#5c1a5e] text-white rounded-xl font-bold hover:bg-[#7a2280] transition-all flex items-center justify-center gap-2"
              >
                <Icon name="add_shopping_cart" size={20} />
                Aggiungi al carrello
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── POS (registratore di cassa) ───────────────────────────────────────────────

interface PendingCustom {
  cassaItemId: string | 'custom'
  label: string
}

export default function CassaTab({ event, workspaceId, onUpdateEvent, onClose }: {
  event: SolidandoEvent
  workspaceId: string
  onUpdateEvent: (data: Partial<SolidandoEvent>) => Promise<void>
  onClose: () => void
}) {
  const [posView, setPosView] = useState<'pos' | 'history' | 'config'>('pos')
  const [cart, setCart] = useState<CartLine[]>([])
  const [pendingCustom, setPendingCustom] = useState<PendingCustom | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showBooking, setShowBooking] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('cassa_operator') ?? '')
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('pct')
  const [discountValue, setDiscountValue] = useState('')

  // Articoli: evento come primo elemento + articoli configurati
  const eventItem: CassaItem = {
    id: '__event__',
    label: event.title,
    price: (event.ticketTypes?.[0]?.price ?? 0),
    currency: 'EUR',
    color: '#002068',
  }

  const allItems: CassaItem[] = [eventItem, ...(event.cassaItems ?? [])]

  // Articolo importo libero
  const freeItem: CassaItem = {
    id: 'custom',
    label: 'Importo libero',
    price: 0,
    currency: 'EUR',
    color: '#444653',
    emoji: '✏️',
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)
  const discountNum = parseFloat(discountValue.replace(',', '.'))
  const discountAmount = !isNaN(discountNum) && discountNum > 0
    ? discountType === 'pct'
      ? Math.min(subtotal, subtotal * discountNum / 100)
      : Math.min(subtotal, discountNum)
    : 0
  const total = Math.max(0, subtotal - discountAmount)

  function addToCart(item: CassaItem) {
    if (item.price === 0) {
      // Importo libero — apri modale
      setPendingCustom({ cassaItemId: item.id, label: item.label })
      return
    }
    setCart(prev => {
      const idx = prev.findIndex(l => l.cassaItemId === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { cassaItemId: item.id, label: item.label, price: item.price, qty: 1 }]
    })
  }

  function addCustomAmount(amount: number) {
    if (!pendingCustom) return
    setCart(prev => [...prev, {
      cassaItemId: pendingCustom.cassaItemId,
      label: pendingCustom.label,
      price: amount,
      qty: 1,
    }])
    setPendingCustom(null)
  }

  function updateQty(cassaItemId: string, _label: string, price: number, delta: number) {
    setCart(prev => {
      const idx = prev.findIndex(l => l.cassaItemId === cassaItemId && l.price === price)
      if (idx < 0) return prev
      const newQty = prev[idx].qty + delta
      if (newQty <= 0) return prev.filter((_, i) => i !== idx)
      const next = [...prev]
      next[idx] = { ...next[idx], qty: newQty }
      return next
    })
  }

  function clearCart() { setCart([]) }

  async function handleConfirmPayment(method: ManualIncomeMethod, note: string) {
    if (cart.length === 0) return
    setProcessing(true)
    setShowPayment(false)
    try {
      // Esegui check-in per le prenotazioni nel carrello
      const bookingLines = cart.filter(l => l.bookingMeta)
      await Promise.all(bookingLines.map(async line => {
        const bm = line.bookingMeta!
        const updatePayload: Record<string, unknown> = {
          checkInStatus: 'checked_in',
          checkInAt: serverTimestamp(),
          checkInAttendeeCount: bm.effectiveCount,
          cassaCheckIn: true,
        }
        if (!bm.alreadyPaid) {
          updatePayload.paymentStatus = 'completed'
          updatePayload.paymentAmount = bm.effectiveTotal
          updatePayload.paymentMethod = method
        }
        await updateDoc(doc(db, 'responses', bm.responseId), updatePayload)
        if (bm.sendReceipt && bm.recipientEmail.trim()) {
          try {
            const fns = getFunctions(app, 'europe-west1')
            await httpsCallable(fns, 'sendReceipt')({ responseId: bm.responseId, recipientEmail: bm.recipientEmail.trim() })
          } catch {
            // ricevuta non bloccante
          }
        }
      }))

      const txItems: CassaTransactionItem[] = cart.map(l => ({
        cassaItemId: l.cassaItemId,
        label: l.label,
        price: l.price,
        qty: l.qty,
        subtotal: l.price * l.qty,
      }))
      const txNote = [
        note.trim(),
        discountAmount > 0
          ? `Sconto ${discountType === 'pct' ? `${discountNum}%` : fmtEur(discountAmount)} (−${fmtEur(discountAmount)})`
          : '',
      ].filter(Boolean).join(' · ') || undefined

      await addCassaTransaction(event.id, workspaceId, {
        eventId: event.id,
        workspaceId,
        items: txItems,
        total,
        method,
        note: txNote,
        operatorName: operatorName.trim() || undefined,
        date: today(),
      })
      showToast(`Incassato ${fmtEur(total)}`, 'success')
      setCart([])
      setDiscountValue('')
      setHistoryKey(k => k + 1)
    } catch {
      showToast('Errore durante il salvataggio', 'error')
    } finally {
      setProcessing(false)
    }
  }

  async function handleSaveItems(items: CassaItem[]) {
    // Firestore rifiuta undefined nei valori — rimuovi tutti i campi undefined dagli oggetti
    const clean = items.map(item =>
      Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined))
    ) as CassaItem[]
    await onUpdateEvent({ cassaItems: clean })
  }

  const btnBase = 'relative flex flex-col items-center justify-center gap-1.5 rounded-2xl shadow-md transition-all active:scale-95 hover:brightness-110 select-none overflow-hidden font-bold text-white'

  // Chiudi con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && posView === 'pos') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [posView, onClose])

  return (
    <div className="fixed inset-0 z-[60] bg-[#f4f3fc] flex flex-col">
      {/* ── Barra superiore ── */}
      <div className="flex items-center gap-3 px-6 py-3 bg-[#5c1a5e] shadow-lg shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon name="point_of_sale" size={22} className="text-white shrink-0" />
          <div className="min-w-0">
            <p className="text-white font-black text-lg leading-tight truncate">Cassa</p>
            <p className="text-white/60 text-xs truncate">{event.title}</p>
          </div>
        </div>

        {/* Sub-nav centrato */}
        <div className="flex gap-1 bg-white/10 p-1 rounded-xl">
          {([
            { key: 'pos',     icon: 'point_of_sale', label: 'Cassa' },
            { key: 'history', icon: 'receipt_long',  label: 'Storico' },
            { key: 'config',  icon: 'tune',          label: 'Configura' },
          ] as const).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setPosView(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                posView === key
                  ? 'bg-white text-[#5c1a5e] shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-all shrink-0"
        >
          <Icon name="close" size={18} />
          Chiudi
        </button>
      </div>

      {/* ── Contenuto ── */}

      {/* POS: layout fisso, senza scroll esterno — griglia sinistra + carrello destra */}
      {posView === 'pos' && (
        <div className="flex-1 min-h-0 flex gap-0 overflow-hidden">
          {/* Griglia articoli — scrollabile */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {allItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`${btnBase} h-36 lg:h-40 p-3 text-center`}
                  style={{ backgroundColor: item.color ?? '#002068' }}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-12 h-12 object-contain rounded-xl" />
                  ) : item.emoji ? (
                    <span className="text-4xl leading-none">{item.emoji}</span>
                  ) : (
                    <Icon name="shopping_bag" size={32} className="text-white/70" />
                  )}
                  <span className="text-sm leading-tight line-clamp-2 px-1 text-center font-bold">
                    {item.label}
                  </span>
                  {item.price > 0 ? (
                    <span className="text-sm font-black opacity-90">{fmtEur(item.price)}</span>
                  ) : (
                    <span className="text-sm font-black text-yellow-300 opacity-90">Libero</span>
                  )}
                </button>
              ))}

              {/* Tasto importo libero */}
              <button
                onClick={() => addToCart(freeItem)}
                className={`${btnBase} h-36 lg:h-40 p-3 text-center border-2 border-dashed border-[#888]`}
                style={{ backgroundColor: '#444653' }}
              >
                <span className="text-4xl leading-none">✏️</span>
                <span className="text-sm font-bold leading-tight">Importo libero</span>
                <span className="text-sm font-black text-yellow-300 opacity-90">Libero</span>
              </button>

              {/* Tasto prenotazione */}
              {event.formId && (
                <button
                  onClick={() => setShowBooking(true)}
                  className={`${btnBase} h-36 lg:h-40 p-3 text-center border-2 border-dashed border-[#a35ca5]`}
                  style={{ backgroundColor: '#5c1a5e' }}
                >
                  <Icon name="confirmation_number" size={32} className="text-white/90" />
                  <span className="text-sm font-bold leading-tight">Prenotazione</span>
                  <span className="text-xs font-semibold text-[#e8b4ea] opacity-90">Check-in</span>
                </button>
              )}
            </div>

            {/* Operatore */}
            <div className="mt-5 flex items-center gap-2">
              <Icon name="badge" size={16} className="text-[#747684] shrink-0" />
              <input
                value={operatorName}
                onChange={e => { setOperatorName(e.target.value); localStorage.setItem('cassa_operator', e.target.value) }}
                className="flex-1 max-w-xs px-3 py-1.5 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#5c1a5e] focus:outline-none bg-white"
                placeholder="Nome operatore (opzionale)"
              />
            </div>
          </div>

          {/* Carrello — fisso a destra, altezza piena */}
          <div className="w-96 shrink-0 flex flex-col bg-white border-l border-[#e8e7f0] shadow-xl overflow-hidden">
            <div className="bg-[#1a1b22] px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Carrello</p>
                <p className="text-white font-black text-xl mt-0.5">{itemCount > 0 ? `${itemCount} articoli` : 'Vuoto'}</p>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-white/40 hover:text-white transition-colors p-1"
                  title="Svuota carrello"
                >
                  <Icon name="delete_sweep" size={22} />
                </button>
              )}
            </div>

            {/* Righe carrello */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#e8e7f0]">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-[#c4c5d5]">
                  <Icon name="shopping_cart" size={48} />
                  <p className="text-sm text-[#747684]">Seleziona gli articoli</p>
                </div>
              ) : (
                cart.map((line, i) => {
                  const isBooking = !!line.bookingMeta
                  const bm = line.bookingMeta
                  return (
                    <div key={i} className="flex items-center gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-[#1a1b22] truncate">{line.label}</p>
                          {isBooking && (
                            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-[#e8d0e8] text-[#5c1a5e] shrink-0">
                              Check-in
                            </span>
                          )}
                        </div>
                        {isBooking && bm?.alreadyPaid ? (
                          <p className="text-sm text-[#1a6b3a] font-semibold">Già pagato · saldo {fmtEur(0)}</p>
                        ) : (
                          <p className="text-sm text-[#747684]">{fmtEur(line.price)} × {line.qty} = <strong>{fmtEur(line.price * line.qty)}</strong></p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isBooking ? (
                          // Le prenotazioni si rimuovono con il tasto −
                          <button
                            onClick={() => setCart(prev => prev.filter((_, j) => j !== i))}
                            className="w-8 h-8 rounded-lg bg-[#fff0f0] flex items-center justify-center text-[#ba1a1a] font-black text-lg hover:bg-[#ffc8c8] transition-colors"
                            title="Rimuovi prenotazione dal carrello"
                          >
                            <Icon name="close" size={16} />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => updateQty(line.cassaItemId, line.label, line.price, -1)}
                              className="w-8 h-8 rounded-lg bg-[#f4f3fc] flex items-center justify-center text-[#002068] font-black text-lg hover:bg-[#dce1ff] transition-colors"
                            >
                              −
                            </button>
                            <span className="w-7 text-center font-black text-lg">{line.qty}</span>
                            <button
                              onClick={() => updateQty(line.cassaItemId, line.label, line.price, 1)}
                              className="w-8 h-8 rounded-lg bg-[#f4f3fc] flex items-center justify-center text-[#002068] font-black text-lg hover:bg-[#dce1ff] transition-colors"
                            >
                              +
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Sconto + Totale + bottone incassa */}
            <div className="border-t-2 border-[#e8e7f0] p-5 space-y-3 shrink-0 bg-white">
              {/* Sconto */}
              {cart.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#747684] uppercase tracking-wider">Sconto</span>
                    <div className="flex gap-1 bg-[#f4f3fc] p-0.5 rounded-lg">
                      <button
                        onClick={() => setDiscountType('pct')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${discountType === 'pct' ? 'bg-white text-[#002068] shadow-sm' : 'text-[#747684]'}`}
                      >%</button>
                      <button
                        onClick={() => setDiscountType('fixed')}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${discountType === 'fixed' ? 'bg-white text-[#002068] shadow-sm' : 'text-[#747684]'}`}
                      >€</button>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747684] text-sm font-bold">
                      {discountType === 'pct' ? '%' : '€'}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={discountType === 'pct' ? 1 : 0.01}
                      max={discountType === 'pct' ? 100 : undefined}
                      value={discountValue}
                      onChange={e => setDiscountValue(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 border border-[#c4c5d5] rounded-xl text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#747684]">Subtotale</span>
                      <span className="text-[#444653]">{fmtEur(subtotal)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-[#ba1a1a] font-semibold">
                      <span>Sconto</span>
                      <span>−{fmtEur(discountAmount)}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="font-black text-[#444653] uppercase tracking-wide text-sm">Totale</span>
                <span className="text-3xl font-black text-[#1a6b3a]">{fmtEur(total)}</span>
              </div>
              <button
                onClick={() => setShowPayment(true)}
                disabled={cart.length === 0 || processing}
                className="w-full py-5 bg-[#1a6b3a] text-white rounded-2xl font-black text-xl hover:bg-[#155530] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
              >
                {processing
                  ? <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Icon name="point_of_sale" size={26} />}
                Incassa
              </button>
            </div>
          </div>
        </div>
      )}

      {(posView === 'history' || posView === 'config') && (
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {posView === 'history' && (
            <TransactionHistory eventId={event.id} refreshKey={historyKey} />
          )}
          {posView === 'config' && (
            <ItemsConfigPanel event={event} onSave={handleSaveItems} />
          )}
        </div>
      )}

      {/* Modale importo libero */}
      {pendingCustom && (
        <CustomAmountModal
          label={pendingCustom.label}
          onConfirm={addCustomAmount}
          onClose={() => setPendingCustom(null)}
        />
      )}

      {/* Modale pagamento */}
      {showPayment && (
        <PaymentModal
          total={total}
          cart={cart}
          onConfirm={(method, note, _change) => handleConfirmPayment(method, note)}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Modale prenotazione */}
      {showBooking && (
        <BookingPickerModal
          event={event}
          workspaceId={workspaceId}
          onClose={() => setShowBooking(false)}
          onAddToCart={line => {
            setCart(prev => {
              // Prenotazioni sempre come riga separata (stesso responseId non raddoppiato)
              const alreadyInCart = prev.some(l => l.bookingMeta?.responseId === line.bookingMeta?.responseId)
              if (alreadyInCart) {
                showToast('Prenotazione già nel carrello', 'error')
                return prev
              }
              return [...prev, line]
            })
            setShowBooking(false)
          }}
        />
      )}
    </div>
  )
}
