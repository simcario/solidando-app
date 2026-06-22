import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import { httpsCallable } from 'firebase/functions'
import {
  doc, updateDoc, serverTimestamp, addDoc, collection,
} from 'firebase/firestore'
import { db, functions } from '../../firebase/config'
import Icon from '../../components/ui/Icon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketInfo {
  responseId: string
  formId: string
  formTitle: string
  submittedAt: string | null
  paymentStatus: 'pending' | 'completed' | 'failed' | 'none'
  paymentAmount: number | null
  paymentCurrency: string | null
  checkInStatus: 'not_checked_in' | 'checked_in'
  checkInAt: string | null
  answers: Record<string, unknown>
  labels: Record<string, string>
  attendeeCount?: number
}

interface CartTicket {
  ticket: TicketInfo
  effectiveCount: number
}

type ScanState = 'scanning' | 'loading' | 'preview' | 'already' | 'error'
type PayMethod = 'cash' | 'bank_transfer' | 'paypal' | 'stripe' | 'other'

const PAY_METHODS: { value: PayMethod; label: string; icon: string }[] = [
  { value: 'cash',          label: 'Contanti',  icon: 'payments' },
  { value: 'bank_transfer', label: 'Bonifico',  icon: 'account_balance' },
  { value: 'paypal',        label: 'PayPal',    icon: 'paypal' },
  { value: 'stripe',        label: 'Carta/POS', icon: 'credit_card' },
  { value: 'other',         label: 'Altro',     icon: 'more_horiz' },
]

function fmtEur(n: number, currency = 'EUR') {
  return n.toLocaleString('it-IT', { style: 'currency', currency })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { formId } = useParams<{ formId: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const processingRef = useRef(false)

  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [cameraError, setCameraError] = useState(false)

  // Carrello
  const [cart, setCart] = useState<CartTicket[]>([])
  const [checkedInCount, setCheckedInCount] = useState(0)

  // Pannello carrello / incasso
  const [showCartPanel, setShowCartPanel] = useState(false)
  const [discountType, setDiscountType] = useState<'pct' | 'fixed'>('pct')
  const [discountValue, setDiscountValue] = useState('')
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')
  const [cashGiven, setCashGiven] = useState('')
  const [payNote, setPayNote] = useState('')
  const [cashing, setCashing] = useState(false)

  // ── Camera setup ─────────────────────────────────────────────────────────

  useEffect(() => {
    let stream: MediaStream | null = null
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      } catch {
        setCameraError(true)
      }
    }
    startCamera()
    return () => {
      stream?.getTracks().forEach(t => t.stop())
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  // ── QR scan loop ──────────────────────────────────────────────────────────

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || processingRef.current) {
      animRef.current = requestAnimationFrame(scanFrame)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) { animRef.current = requestAnimationFrame(scanFrame); return }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code?.data) {
      handleQrDetected(code.data)
    } else {
      animRef.current = requestAnimationFrame(scanFrame)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scanState === 'scanning') {
      animRef.current = requestAnimationFrame(scanFrame)
    } else {
      cancelAnimationFrame(animRef.current)
    }
    return () => cancelAnimationFrame(animRef.current)
  }, [scanState, scanFrame])

  // ── QR detected ──────────────────────────────────────────────────────────

  async function handleQrDetected(raw: string) {
    if (processingRef.current) return
    processingRef.current = true
    setScanState('loading')
    try {
      let responseId = raw
      try {
        const url = new URL(raw)
        const scan = url.searchParams.get('scan')
        if (scan) responseId = scan
      } catch { /* raw non è URL */ }

      // Già nel carrello?
      if (cart.some(c => c.ticket.responseId === responseId)) {
        setErrorMsg('Biglietto già nel carrello.')
        setScanState('error')
        return
      }

      const getInfo = httpsCallable<{ responseId: string }, TicketInfo>(functions, 'getResponseForCheckin')
      const res = await getInfo({ responseId })
      const info = res.data

      if (formId && info.formId !== formId) {
        setErrorMsg('Questo biglietto non appartiene a questo evento.')
        setScanState('error')
        return
      }

      if (info.checkInStatus === 'checked_in') {
        setTicket(info)
        setScanState('already')
        return
      }

      setTicket(info)
      setScanState('preview')
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Errore sconosciuto'
      setErrorMsg(msg)
      setScanState('error')
    }
  }

  function resetScan() {
    processingRef.current = false
    setTicket(null)
    setErrorMsg('')
    setScanState('scanning')
  }

  // ── Carrello ──────────────────────────────────────────────────────────────

  function addToCart(info: TicketInfo, count: number) {
    setCart(prev => [...prev, { ticket: info, effectiveCount: count }])
    resetScan()
  }

  function removeFromCart(responseId: string) {
    setCart(prev => prev.filter(c => c.ticket.responseId !== responseId))
  }

  function updateCount(responseId: string, delta: number) {
    setCart(prev => prev.map(c =>
      c.ticket.responseId === responseId
        ? { ...c, effectiveCount: Math.max(1, c.effectiveCount + delta) }
        : c,
    ))
  }

  // ── Calcoli totale ────────────────────────────────────────────────────────

  const subtotal = cart.reduce((s, c) => {
    if (c.ticket.paymentStatus === 'completed') return s
    const pricePerPerson = (c.ticket.paymentAmount ?? 0) / (c.ticket.attendeeCount ?? 1)
    return s + pricePerPerson * c.effectiveCount
  }, 0)

  const discountNum = parseFloat(discountValue.replace(',', '.'))
  const discountAmount = !isNaN(discountNum) && discountNum > 0
    ? discountType === 'pct'
      ? Math.min(subtotal, subtotal * discountNum / 100)
      : Math.min(subtotal, discountNum)
    : 0
  const total = Math.max(0, subtotal - discountAmount)

  const cashVal = parseFloat(cashGiven.replace(',', '.'))
  const change = !isNaN(cashVal) && cashVal >= total ? cashVal - total : 0
  const shortfall = !isNaN(cashVal) && cashVal < total ? total - cashVal : 0

  // ── Incasso ───────────────────────────────────────────────────────────────

  async function handleCassa() {
    if (cart.length === 0) return
    setCashing(true)
    try {
      await Promise.all(cart.map(async ({ ticket: t, effectiveCount }) => {
        const alreadyPaid = t.paymentStatus === 'completed'
        const pricePerPerson = (t.paymentAmount ?? 0) / (t.attendeeCount ?? 1)
        const effectiveTotal = alreadyPaid ? 0 : pricePerPerson * effectiveCount

        const updatePayload: Record<string, unknown> = {
          checkInStatus: 'checked_in',
          checkInAt: serverTimestamp(),
          checkInAttendeeCount: effectiveCount,
          cassaCheckIn: true,
        }
        if (!alreadyPaid) {
          updatePayload.paymentStatus = 'completed'
          updatePayload.paymentAmount = effectiveTotal
          updatePayload.paymentMethod = payMethod
        }
        await updateDoc(doc(db, 'responses', t.responseId), updatePayload)
      }))

      // Registra transazione cassa se c'è un totale da incassare
      if (total > 0) {
        const discountNote = discountAmount > 0
          ? `Sconto ${discountType === 'pct' ? `${discountNum}%` : fmtEur(discountAmount)} (−${fmtEur(discountAmount)})`
          : ''
        const items = cart
          .filter(c => c.ticket.paymentStatus !== 'completed')
          .map(({ ticket: t, effectiveCount }) => {
            const pricePerPerson = (t.paymentAmount ?? 0) / (t.attendeeCount ?? 1)
            return {
              cassaItemId: t.responseId,
              label: extractName(t),
              price: pricePerPerson,
              qty: effectiveCount,
              subtotal: pricePerPerson * effectiveCount,
            }
          })
        await addDoc(collection(db, 'cassa_transactions'), {
          eventId: formId ?? '',
          workspaceId: '',
          items,
          total,
          method: payMethod,
          note: [payNote.trim(), discountNote].filter(Boolean).join(' · ') || undefined,
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp(),
        })
      }

      setCheckedInCount(c => c + cart.length)
      setCart([])
      setDiscountValue('')
      setCashGiven('')
      setPayNote('')
      setShowCartPanel(false)
    } catch (err) {
      console.error(err)
    } finally {
      setCashing(false)
    }
  }

  function extractName(t: TicketInfo): string {
    const entry = Object.entries(t.answers ?? {}).find(([, v]) => typeof v === 'string' && (v as string).trim().length > 1)
    return entry ? String(entry[1]) : t.responseId.slice(0, 8)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0b10] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#1a1b22] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#002068] flex items-center justify-center">
            <span className="text-white text-xs font-black">S</span>
          </div>
          <span className="font-bold text-sm text-white">Check-in Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#002068] px-3 py-1 rounded-full">
            <Icon name="check_circle" size={14} className="text-[#8aa4ff]" />
            <span className="text-xs font-bold text-[#8aa4ff]">{checkedInCount} oggi</span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setShowCartPanel(true)}
              className="flex items-center gap-1.5 bg-[#1a6b3a] px-3 py-1 rounded-full hover:bg-[#155530] transition-colors"
            >
              <Icon name="shopping_cart" size={14} className="text-white" />
              <span className="text-xs font-bold text-white">{cart.length}</span>
            </button>
          )}
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full bg-[#2a2b35] flex items-center justify-center hover:bg-[#3a3b45] active:scale-90 transition-all"
            aria-label="Chiudi"
          >
            <Icon name="close" size={18} className="text-white" />
          </button>
        </div>
      </header>

      {cameraError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Icon name="no_photography" size={64} className="text-[#444653]" />
          <p className="text-[#c4c5d5] font-medium">Accesso alla fotocamera negato</p>
          <p className="text-sm text-[#747684]">Consenti l'accesso alla fotocamera nelle impostazioni del browser per usare lo scanner.</p>
        </div>
      ) : (
        <>
          {/* Camera viewfinder */}
          <div className="relative bg-black overflow-hidden" style={{ height: scanState === 'scanning' ? '60vh' : '30vh' }}>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#fe9832] rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#fe9832] rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#fe9832] rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#fe9832] rounded-br-sm" />
                  <div className="absolute left-2 right-2 h-0.5 bg-[#fe9832] opacity-80 animate-[scanline_2s_ease-in-out_infinite]" style={{ top: '50%' }} />
                </div>
                <p className="absolute bottom-8 text-sm text-white/70 font-medium">Inquadra il QR code del biglietto</p>
              </div>
            )}

            {scanState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="w-12 h-12 border-4 border-[#fe9832] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Result panel */}
          <div className="flex-1 overflow-y-auto pb-32">
            {scanState === 'preview' && ticket && (
              <TicketPreview
                ticket={ticket}
                onAddToCart={addToCart}
                onReset={resetScan}
              />
            )}
            {scanState === 'already' && ticket && (
              <AlreadyCard ticket={ticket} onReset={resetScan} />
            )}
            {scanState === 'error' && (
              <ErrorCard message={errorMsg} onReset={resetScan} />
            )}
            {scanState === 'scanning' && cart.length > 0 && (
              <CartSummary
                cart={cart}
                onRemove={removeFromCart}
                onUpdateCount={updateCount}
              />
            )}
          </div>

          {/* FAB carrello */}
          {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0a0b10]/95 border-t border-[#2a2b35]">
              <button
                onClick={() => setShowCartPanel(true)}
                className="w-full py-4 bg-[#1a6b3a] text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 hover:bg-[#155530] active:scale-95 transition-all shadow-xl"
              >
                <Icon name="point_of_sale" size={24} />
                Incassa carrello ({cart.length} {cart.length === 1 ? 'biglietto' : 'biglietti'}) · {fmtEur(total)}
              </button>
            </div>
          )}
        </>
      )}

      {/* Pannello incasso */}
      {showCartPanel && (
        <CartPanel
          cart={cart}
          subtotal={subtotal}
          discountType={discountType}
          discountValue={discountValue}
          discountAmount={discountAmount}
          total={total}
          payMethod={payMethod}
          cashGiven={cashGiven}
          change={change}
          shortfall={shortfall}
          payNote={payNote}
          cashing={cashing}
          onRemove={removeFromCart}
          onUpdateCount={updateCount}
          onSetDiscountType={setDiscountType}
          onSetDiscountValue={setDiscountValue}
          onSetPayMethod={setPayMethod}
          onSetCashGiven={setCashGiven}
          onSetPayNote={setPayNote}
          onCassa={handleCassa}
          onClose={() => setShowCartPanel(false)}
        />
      )}

      <style>{`
        @keyframes scanline {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
      `}</style>
    </div>
  )
}

// ─── Ticket Preview (anteprima dopo scansione) ────────────────────────────────

function TicketPreview({
  ticket,
  onAddToCart,
  onReset,
}: {
  ticket: TicketInfo
  onAddToCart: (t: TicketInfo, count: number) => void
  onReset: () => void
}) {
  const [count, setCount] = useState(ticket.attendeeCount ?? 1)
  const needsPayment = ticket.paymentStatus !== 'completed' && ticket.paymentStatus !== 'none'
  const pricePerPerson = needsPayment && ticket.paymentAmount
    ? ticket.paymentAmount / (ticket.attendeeCount ?? 1)
    : null

  const answerEntries = Object.entries(ticket.answers ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'paypal' && v !== 'in_person')
    .slice(0, 6)

  function formatDate(iso: string | null) {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  }

  return (
    <div className="p-4 space-y-4">
      {/* Banner stato */}
      <div className={`border-2 rounded-2xl p-5 flex items-center gap-4 ${
        needsPayment
          ? 'bg-[#5a1a00] border-[#ba1a1a]'
          : 'bg-[#1a3a5c] border-[#4a7fbf]'
      }`}>
        <Icon
          name={needsPayment ? 'payments' : 'confirmation_number'}
          size={44}
          filled
          className={needsPayment ? 'text-[#ff6b6b]' : 'text-[#8aa4ff]'}
        />
        <div>
          <p className="font-black text-lg text-white">
            {needsPayment ? 'Da pagare alla cassa' : 'Biglietto valido'}
          </p>
          <p className="text-sm text-white/70">
            {needsPayment ? 'Il check-in avverrà all\'incasso' : 'Sarà aggiunto al carrello'}
          </p>
        </div>
      </div>

      {/* Info biglietto */}
      <div className="bg-[#1a1b22] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="confirmation_number" size={18} className="text-[#8aa4ff]" />
          <p className="font-bold text-[#8aa4ff] text-sm uppercase tracking-wider">{ticket.formTitle}</p>
        </div>
        <InfoRow label="ID Biglietto" value={ticket.responseId.slice(0, 12) + '…'} mono />
        <InfoRow label="Iscrizione" value={formatDate(ticket.submittedAt)} />
        {needsPayment && ticket.paymentAmount != null && (
          <div className="pt-2 border-t border-[#2a2b35]">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#747684] font-bold uppercase tracking-wider">Totale da pagare</span>
              <span className="text-xl font-black text-[#ff6b6b]">
                {new Intl.NumberFormat('it-IT', { style: 'currency', currency: ticket.paymentCurrency ?? 'EUR' }).format(ticket.paymentAmount)}
              </span>
            </div>
          </div>
        )}
        {answerEntries.length > 0 && (
          <div className="pt-2 border-t border-[#2a2b35]">
            <p className="text-xs text-[#747684] font-bold uppercase tracking-wider mb-2">Dati iscritto</p>
            {answerEntries.map(([fieldId, value]) => (
              <InfoRow
                key={fieldId}
                label={ticket.labels[fieldId] ?? fieldId}
                value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Numero partecipanti */}
      <div className="bg-[#1a1b22] rounded-2xl p-4">
        <p className="text-xs text-[#747684] font-bold uppercase tracking-wider mb-3">Numero partecipanti presenti</p>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCount(c => Math.max(1, c - 1))}
            className="w-11 h-11 rounded-xl bg-[#2a2b35] text-white font-black text-xl hover:bg-[#3a3b45] transition-colors flex items-center justify-center"
          >−</button>
          <span className="text-3xl font-black text-white min-w-[2.5rem] text-center">{count}</span>
          <button
            onClick={() => setCount(c => c + 1)}
            className="w-11 h-11 rounded-xl bg-[#2a2b35] text-white font-black text-xl hover:bg-[#3a3b45] transition-colors flex items-center justify-center"
          >+</button>
          {pricePerPerson != null && (
            <span className="text-sm text-[#747684] ml-1">
              × {new Intl.NumberFormat('it-IT', { style: 'currency', currency: ticket.paymentCurrency ?? 'EUR' }).format(pricePerPerson)}
              {' = '}
              <strong className="text-white">{new Intl.NumberFormat('it-IT', { style: 'currency', currency: ticket.paymentCurrency ?? 'EUR' }).format(pricePerPerson * count)}</strong>
            </span>
          )}
        </div>
        {(ticket.attendeeCount ?? 1) !== count && (
          <p className="text-xs text-[#fe9832] mt-2">Iscrizione originale: {ticket.attendeeCount ?? 1} persona/e</p>
        )}
      </div>

      {/* Bottoni */}
      <button
        onClick={() => onAddToCart(ticket, count)}
        className="w-full py-4 bg-[#1a6b3a] rounded-2xl font-bold text-white text-lg hover:bg-[#155530] active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="add_shopping_cart" size={22} />
        Aggiungi al carrello
      </button>
      <button
        onClick={onReset}
        className="w-full py-3 bg-[#2a2b35] rounded-2xl font-semibold text-white/70 text-sm hover:bg-[#3a3b45] active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="qr_code_scanner" size={18} />
        Scansiona altro
      </button>
    </div>
  )
}

// ─── Cart Summary (lista compatta nel pannello scanner) ───────────────────────

function CartSummary({
  cart,
  onRemove,
  onUpdateCount,
}: {
  cart: CartTicket[]
  onRemove: (id: string) => void
  onUpdateCount: (id: string, delta: number) => void
}) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-[#747684] font-bold uppercase tracking-wider px-1">Carrello ({cart.length})</p>
      {cart.map(({ ticket: t, effectiveCount }) => {
        const alreadyPaid = t.paymentStatus === 'completed'
        const pricePerPerson = alreadyPaid ? 0 : (t.paymentAmount ?? 0) / (t.attendeeCount ?? 1)
        const lineTotal = pricePerPerson * effectiveCount
        const name = Object.values(t.answers ?? {}).find(v => typeof v === 'string' && (v as string).trim().length > 1) as string | undefined
        return (
          <div key={t.responseId} className="bg-[#1a1b22] rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm truncate">{name ?? t.responseId.slice(0, 10)}</p>
              <p className="text-xs text-[#747684]">
                {alreadyPaid ? 'Già pagato' : `${effectiveCount} pers. · ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: t.paymentCurrency ?? 'EUR' }).format(lineTotal)}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!alreadyPaid && (
                <>
                  <button onClick={() => onUpdateCount(t.responseId, -1)} className="w-7 h-7 rounded-lg bg-[#2a2b35] text-white font-black flex items-center justify-center hover:bg-[#3a3b45] transition-colors">−</button>
                  <span className="w-5 text-center font-black text-sm">{effectiveCount}</span>
                  <button onClick={() => onUpdateCount(t.responseId, 1)} className="w-7 h-7 rounded-lg bg-[#2a2b35] text-white font-black flex items-center justify-center hover:bg-[#3a3b45] transition-colors">+</button>
                </>
              )}
              <button onClick={() => onRemove(t.responseId)} className="w-7 h-7 rounded-lg bg-[#3a1a1a] text-[#ff6b6b] flex items-center justify-center hover:bg-[#5a1a00] transition-colors ml-1">
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Cart Panel (drawer incasso) ──────────────────────────────────────────────

function CartPanel({
  cart, subtotal, discountType, discountValue, discountAmount, total,
  payMethod, cashGiven, change, shortfall, payNote, cashing,
  onRemove, onUpdateCount,
  onSetDiscountType, onSetDiscountValue, onSetPayMethod, onSetCashGiven, onSetPayNote,
  onCassa, onClose,
}: {
  cart: CartTicket[]
  subtotal: number
  discountType: 'pct' | 'fixed'
  discountValue: string
  discountAmount: number
  total: number
  payMethod: PayMethod
  cashGiven: string
  change: number
  shortfall: number
  payNote: string
  cashing: boolean
  onRemove: (id: string) => void
  onUpdateCount: (id: string, delta: number) => void
  onSetDiscountType: (v: 'pct' | 'fixed') => void
  onSetDiscountValue: (v: string) => void
  onSetPayMethod: (v: PayMethod) => void
  onSetCashGiven: (v: string) => void
  onSetPayNote: (v: string) => void
  onCassa: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0b10] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#1a1b22] shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="shopping_cart" size={20} className="text-[#8aa4ff]" />
          <span className="font-black text-lg text-white">Carrello · {cart.length} bigliett{cart.length === 1 ? 'o' : 'i'}</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#2a2b35] flex items-center justify-center hover:bg-[#3a3b45] transition-colors">
          <Icon name="close" size={18} className="text-white" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Lista biglietti nel carrello */}
        <div className="space-y-2">
          {cart.map(({ ticket: t, effectiveCount }) => {
            const alreadyPaid = t.paymentStatus === 'completed'
            const pricePerPerson = alreadyPaid ? 0 : (t.paymentAmount ?? 0) / (t.attendeeCount ?? 1)
            const lineTotal = pricePerPerson * effectiveCount
            const name = Object.values(t.answers ?? {}).find(v => typeof v === 'string' && (v as string).trim().length > 1) as string | undefined
            return (
              <div key={t.responseId} className="bg-[#1a1b22] rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white truncate">{name ?? t.responseId.slice(0, 10)}</p>
                      {alreadyPaid && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#1a4a2a] text-[#4caf50]">Già pagato</span>
                      )}
                    </div>
                    {!alreadyPaid && (
                      <p className="text-sm text-[#8aa4ff] mt-0.5">
                        {new Intl.NumberFormat('it-IT', { style: 'currency', currency: t.paymentCurrency ?? 'EUR' }).format(pricePerPerson)} × {effectiveCount} = <strong>{new Intl.NumberFormat('it-IT', { style: 'currency', currency: t.paymentCurrency ?? 'EUR' }).format(lineTotal)}</strong>
                      </p>
                    )}
                  </div>
                  <button onClick={() => onRemove(t.responseId)} className="w-7 h-7 rounded-lg bg-[#3a1a1a] text-[#ff6b6b] flex items-center justify-center hover:bg-[#5a1a00] transition-colors shrink-0">
                    <Icon name="close" size={14} />
                  </button>
                </div>
                {!alreadyPaid && (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-xs text-[#747684]">Persone presenti:</span>
                    <button onClick={() => onUpdateCount(t.responseId, -1)} className="w-8 h-8 rounded-lg bg-[#2a2b35] text-white font-black flex items-center justify-center hover:bg-[#3a3b45] transition-colors">−</button>
                    <span className="font-black text-white text-lg w-6 text-center">{effectiveCount}</span>
                    <button onClick={() => onUpdateCount(t.responseId, 1)} className="w-8 h-8 rounded-lg bg-[#2a2b35] text-white font-black flex items-center justify-center hover:bg-[#3a3b45] transition-colors">+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Sconto */}
        <div className="bg-[#1a1b22] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-white">Sconto</span>
            <div className="flex gap-1 bg-[#2a2b35] p-0.5 rounded-lg">
              <button
                onClick={() => onSetDiscountType('pct')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${discountType === 'pct' ? 'bg-white text-[#002068]' : 'text-[#747684]'}`}
              >%</button>
              <button
                onClick={() => onSetDiscountType('fixed')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${discountType === 'fixed' ? 'bg-white text-[#002068]' : 'text-[#747684]'}`}
              >€</button>
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747684] font-bold">{discountType === 'pct' ? '%' : '€'}</span>
            <input
              type="number"
              min={0}
              step={discountType === 'pct' ? 1 : 0.01}
              max={discountType === 'pct' ? 100 : undefined}
              value={discountValue}
              onChange={e => onSetDiscountValue(e.target.value)}
              className="w-full pl-8 pr-4 py-2.5 bg-[#2a2b35] border border-[#3a3b45] rounded-xl text-white focus:ring-2 focus:ring-[#8aa4ff] focus:outline-none"
              placeholder="0"
            />
          </div>
        </div>

        {/* Riepilogo importi */}
        <div className="bg-[#1a1b22] rounded-2xl p-4 space-y-2">
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#747684]">Subtotale</span>
              <span className="text-white">{fmtEur(subtotal)}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-[#ff6b6b] font-semibold">
              <span>Sconto</span>
              <span>−{fmtEur(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-[#2a2b35]">
            <span className="font-black text-white uppercase tracking-wide text-sm">Totale</span>
            <span className="text-3xl font-black text-[#4caf50]">{fmtEur(total)}</span>
          </div>
        </div>

        {/* Metodo pagamento */}
        <div className="bg-[#1a1b22] rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-white">Metodo di pagamento</p>
          <div className="grid grid-cols-3 gap-2">
            {PAY_METHODS.map(m => (
              <button
                key={m.value}
                onClick={() => onSetPayMethod(m.value)}
                className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-xs transition-all ${
                  payMethod === m.value
                    ? 'border-[#8aa4ff] bg-[#002068] text-white'
                    : 'border-[#2a2b35] text-[#747684] hover:border-[#8aa4ff]'
                }`}
              >
                <Icon name={m.icon} size={20} />
                {m.label}
              </button>
            ))}
          </div>

          {payMethod === 'cash' && total > 0 && (
            <div>
              <p className="text-xs font-bold text-[#747684] uppercase tracking-wider mb-1.5">Contante ricevuto</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747684] font-bold">€</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={cashGiven}
                  onChange={e => onSetCashGiven(e.target.value)}
                  className="w-full pl-8 pr-4 py-2.5 bg-[#2a2b35] border border-[#3a3b45] rounded-xl text-white text-lg font-bold focus:ring-2 focus:ring-[#8aa4ff] focus:outline-none"
                  placeholder={total.toFixed(2)}
                />
              </div>
              {cashGiven && (
                <div className={`mt-2 px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-between ${
                  change > 0 ? 'bg-[#1a4a2a] text-[#4caf50]' : shortfall > 0 ? 'bg-[#4a2a00] text-[#fe9832]' : 'bg-[#2a2b35] text-white'
                }`}>
                  <span>{change > 0 ? 'Resto' : shortfall > 0 ? 'Mancano' : 'Esatto'}</span>
                  {(change > 0 || shortfall > 0) && <span className="text-lg">{fmtEur(change > 0 ? change : shortfall)}</span>}
                </div>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {[5, 10, 20, 50].map(v => (
                  <button
                    key={v}
                    onClick={() => onSetCashGiven(String(Math.ceil(total / v) * v))}
                    className="px-3 py-1.5 bg-[#2a2b35] rounded-lg text-xs font-bold text-white hover:bg-[#3a3b45] transition-colors"
                  >
                    € {Math.ceil(total / v) * v}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-[#747684] uppercase tracking-wider mb-1.5">Nota (opzionale)</p>
            <input
              value={payNote}
              onChange={e => onSetPayNote(e.target.value)}
              className="w-full px-3 py-2 bg-[#2a2b35] border border-[#3a3b45] rounded-xl text-sm text-white focus:ring-2 focus:ring-[#8aa4ff] focus:outline-none"
              placeholder="es. Tavolo 5, cognome cliente..."
            />
          </div>
        </div>
      </div>

      {/* Bottone incassa */}
      <div className="p-4 bg-[#1a1b22] border-t border-[#2a2b35] shrink-0">
        <button
          onClick={onCassa}
          disabled={cashing || (payMethod === 'cash' && !!cashGiven && shortfall > 0)}
          className="w-full py-5 bg-[#1a6b3a] text-white rounded-2xl font-black text-xl hover:bg-[#155530] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl"
        >
          {cashing
            ? <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Icon name="how_to_reg" size={26} />}
          {cashing ? 'Elaborazione...' : `Incassa e check-in · ${fmtEur(total)}`}
        </button>
      </div>
    </div>
  )
}

// ─── Already Card ─────────────────────────────────────────────────────────────

function AlreadyCard({ ticket, onReset }: { ticket: TicketInfo; onReset: () => void }) {
  const name = Object.values(ticket.answers ?? {}).find(v => typeof v === 'string' && (v as string).trim().length > 1) as string | undefined
  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#4a3a00] border-2 border-[#fe9832] rounded-2xl p-5 flex items-center gap-4">
        <Icon name="warning" size={48} filled className="text-[#fe9832]" />
        <div>
          <p className="font-black text-lg text-white">Già entrato</p>
          <p className="text-sm text-white/70">{name ?? ticket.responseId.slice(0, 10)} · check-in già registrato</p>
        </div>
      </div>
      <button
        onClick={onReset}
        className="w-full py-4 bg-[#002068] rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2"
      >
        <Icon name="qr_code_scanner" size={22} />
        Scansiona prossimo
      </button>
    </div>
  )
}

// ─── Error Card ───────────────────────────────────────────────────────────────

function ErrorCard({ message, onReset }: { message: string; onReset: () => void }) {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#5a1a00] border-2 border-[#ba1a1a] rounded-2xl p-5 flex items-center gap-4">
        <Icon name="error" size={48} filled className="text-[#ff6b6b]" />
        <div>
          <p className="font-black text-lg text-white">QR non valido</p>
          <p className="text-sm text-white/70">{message}</p>
        </div>
      </div>
      <button
        onClick={onReset}
        className="w-full py-4 bg-[#002068] rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2"
      >
        <Icon name="qr_code_scanner" size={22} />
        Riprova
      </button>
    </div>
  )
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-[#747684] flex-shrink-0">{label}</span>
      <span className={`text-sm text-white text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value || '—'}</span>
    </div>
  )
}
