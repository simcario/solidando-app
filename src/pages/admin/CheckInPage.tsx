import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
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
}

type ScanState = 'scanning' | 'loading' | 'ok' | 'already' | 'pending_confirm' | 'error'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CheckInPage() {
  const { formId } = useParams<{ formId: string }>()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const processingRef = useRef(false)

  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [cameraError, setCameraError] = useState(false)
  const [checkinCount, setCheckinCount] = useState(0)

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
      // Estrai responseId dal parametro ?scan= oppure usa raw direttamente come ID
      let responseId = raw
      try {
        const url = new URL(raw)
        const scan = url.searchParams.get('scan')
        if (scan) responseId = scan
      } catch {
        // raw non è un URL, usarlo direttamente
      }

      const getInfo = httpsCallable<{ responseId: string }, TicketInfo>(functions, 'getResponseForCheckin')
      const res = await getInfo({ responseId })
      const info = res.data

      // Verifica che il biglietto sia per il formId corretto (se passato)
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

      // Se pagamento non completato, richiede conferma manuale prima del check-in
      const paymentOk = info.paymentStatus === 'completed' || info.paymentStatus === 'none'
      if (!paymentOk) {
        setTicket(info)
        setScanState('pending_confirm')
        return
      }

      // Esegui check-in automatico
      await doCheckIn(info)
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Errore sconosciuto'
      setErrorMsg(msg)
      setScanState('error')
    }
  }

  async function doCheckIn(info: TicketInfo) {
    try {
      const checkInFn = httpsCallable<{ responseId: string }, { alreadyCheckedIn: boolean }>(functions, 'checkInResponse')
      const checkRes = await checkInFn({ responseId: info.responseId })
      setTicket({ ...info, checkInStatus: 'checked_in' })
      setScanState(checkRes.data.alreadyCheckedIn ? 'already' : 'ok')
      if (!checkRes.data.alreadyCheckedIn) setCheckinCount(c => c + 1)
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0b10] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#1a1b22]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#002068] flex items-center justify-center">
            <span className="text-white text-xs font-black">S</span>
          </div>
          <span className="font-bold text-sm text-white">Check-in Admin</span>
        </div>
        <div className="flex items-center gap-2 bg-[#002068] px-3 py-1 rounded-full">
          <Icon name="check_circle" size={14} className="text-[#8aa4ff]" />
          <span className="text-xs font-bold text-[#8aa4ff]">{checkinCount} oggi</span>
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
          <div className="relative flex-1 bg-black overflow-hidden" style={{ maxHeight: scanState === 'scanning' ? undefined : '40vh' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Overlay mirino */}
            {scanState === 'scanning' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56">
                  {/* Corners */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#fe9832] rounded-tl-sm" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#fe9832] rounded-tr-sm" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#fe9832] rounded-bl-sm" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#fe9832] rounded-br-sm" />
                  {/* Scan line animata */}
                  <div className="absolute left-2 right-2 h-0.5 bg-[#fe9832] opacity-80 animate-[scanline_2s_ease-in-out_infinite]" style={{ top: '50%' }} />
                </div>
                <p className="absolute bottom-8 text-sm text-white/70 font-medium">Inquadra il QR code del biglietto</p>
              </div>
            )}

            {/* Loading overlay */}
            {scanState === 'loading' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="w-12 h-12 border-4 border-[#fe9832] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Result panel */}
          {scanState !== 'scanning' && scanState !== 'loading' && (
            <div className="flex-1 overflow-y-auto">
              {scanState === 'ok' && ticket && (
                <ResultCard ticket={ticket} status="ok" onReset={resetScan} />
              )}
              {scanState === 'already' && ticket && (
                <ResultCard ticket={ticket} status="already" onReset={resetScan} />
              )}
              {scanState === 'pending_confirm' && ticket && (
                <ResultCard ticket={ticket} status="pending_confirm" onReset={resetScan} onConfirm={() => doCheckIn(ticket)} />
              )}
              {scanState === 'error' && (
                <ErrorCard message={errorMsg} onReset={resetScan} />
              )}
            </div>
          )}
        </>
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

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  ticket,
  status,
  onReset,
  onConfirm,
}: {
  ticket: TicketInfo
  status: 'ok' | 'already' | 'pending_confirm'
  onReset: () => void
  onConfirm?: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const config = {
    ok:              { bg: 'bg-[#1b5e20]', border: 'border-[#4caf50]', icon: 'check_circle', iconColor: 'text-[#81c784]', title: 'Ingresso autorizzato',       subtitle: 'Check-in registrato con successo' },
    already:         { bg: 'bg-[#4a3a00]', border: 'border-[#fe9832]', icon: 'warning',      iconColor: 'text-[#fe9832]', title: 'Già entrato',                 subtitle: 'Questo biglietto è già stato usato' },
    pending_confirm: { bg: 'bg-[#5a1a00]', border: 'border-[#ba1a1a]', icon: 'payments',     iconColor: 'text-[#ff6b6b]', title: 'Pagamento non completato',    subtitle: 'Conferma l\'ingresso manualmente' },
  }[status]

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  }

  const answerEntries = Object.entries(ticket.answers ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'paypal' && v !== 'in_person')
    .slice(0, 6)

  async function handleConfirm() {
    if (!onConfirm) return
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Status banner */}
      <div className={`${config.bg} border-2 ${config.border} rounded-2xl p-5 flex items-center gap-4`}>
        <Icon name={config.icon} size={48} filled className={config.iconColor} />
        <div>
          <p className="font-black text-lg text-white">{config.title}</p>
          <p className="text-sm text-white/70">{config.subtitle}</p>
        </div>
      </div>

      {/* Ticket info */}
      <div className="bg-[#1a1b22] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon name="confirmation_number" size={18} className="text-[#8aa4ff]" />
          <p className="font-bold text-[#8aa4ff] text-sm uppercase tracking-wider">{ticket.formTitle}</p>
        </div>

        <InfoRow label="ID Biglietto" value={ticket.responseId.slice(0, 12) + '…'} mono />
        <InfoRow label="Iscrizione" value={formatDate(ticket.submittedAt)} />
        {ticket.checkInAt && <InfoRow label="Check-in" value={formatDate(ticket.checkInAt)} />}

        {/* Importo pagamento (se presente) */}
        {ticket.paymentAmount != null && ticket.paymentStatus !== 'none' && (
          <div className="pt-2 border-t border-[#2a2b35]">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#747684] font-bold uppercase tracking-wider">
                {ticket.paymentStatus === 'completed' ? 'Importo pagato' : 'Totale da pagare'}
              </span>
              <span className={`text-xl font-black ${ticket.paymentStatus === 'completed' ? 'text-[#81c784]' : 'text-[#ff6b6b]'}`}>
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

      {/* Bottone conferma ingresso manuale */}
      {status === 'pending_confirm' && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full py-4 bg-[#ba1a1a] rounded-2xl font-bold text-white text-lg hover:bg-[#d32f2f] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {confirming
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Icon name="how_to_reg" size={22} />}
          Conferma ingresso
        </button>
      )}

      <button
        onClick={onReset}
        className="w-full py-4 bg-[#002068] rounded-2xl font-bold text-white text-lg hover:bg-[#003399] active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="qr_code_scanner" size={22} />
        Scansiona prossimo
      </button>
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-[#747684] flex-shrink-0">{label}</span>
      <span className={`text-sm text-white text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{value || '—'}</span>
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
