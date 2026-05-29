import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import Icon from '../../components/ui/Icon'
import sLogo from '../../assets/s_logo.png'

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

export default function PublicTicketPage() {
  const { responseId } = useParams<{ responseId: string }>()
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!responseId) return
    const getInfo = httpsCallable<{ responseId: string }, TicketInfo>(functions, 'getPublicTicket')
    getInfo({ responseId })
      .then(res => setTicket(res.data))
      .catch(err => setError(err?.message ?? 'Biglietto non trovato'))
      .finally(() => setLoading(false))
  }, [responseId])

  useEffect(() => {
    if (!ticket || !responseId) return
    const checkinUrl = `${window.location.origin}/admin/checkin/${ticket.formId}?scan=${responseId}`
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(checkinUrl, { width: 200, margin: 1 }).then(setQrSrc)
    })
  }, [ticket, responseId])

  const isPending = ticket?.paymentStatus === 'pending'
  const isCheckedIn = ticket?.checkInStatus === 'checked_in'

  const ticketLines: { label: string; value: string }[] = []
  if (ticket) {
    const answers = (ticket.answers ?? {}) as Record<string, unknown>
    const firstVal = Object.values(answers).find(v => v && typeof v === 'string')
    if (firstVal) ticketLines.push({ label: 'Iscritto', value: String(firstVal) })
    if (ticket.paymentAmount != null && ticket.paymentAmount > 0) {
      ticketLines.push({ label: isPending ? 'Importo' : 'Pagato', value: `€ ${ticket.paymentAmount.toFixed(2)}` })
    }
  }

  async function handleDownload() {
    if (!qrSrc || !ticket || !responseId) return
    const dataUrl = await buildTicketCanvas(qrSrc, ticket.formTitle, responseId, ticketLines)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `biglietto-${responseId.slice(0, 8)}.png`
    a.click()
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={sLogo} alt="Solidando" className="h-10" />
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#747684]">Caricamento biglietto…</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-[#5a1a00] px-6 py-5 flex items-center gap-3">
              <Icon name="error" size={32} filled className="text-[#ff6b6b]" />
              <div>
                <p className="font-bold text-white">Biglietto non valido</p>
                <p className="text-sm text-white/70">{error}</p>
              </div>
            </div>
          </div>
        )}

        {ticket && !loading && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#002068] px-6 py-5">
              <p className="text-xs font-bold text-[#8aa4ff] uppercase tracking-wider">Solidando · Biglietto</p>
              <h1 className="text-xl font-bold text-white mt-1">{ticket.formTitle}</h1>
            </div>

            {/* Notch decorativo */}
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
                  <p className="text-[10px] font-mono text-[#c4c5d5] select-all">{responseId}</p>
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

            <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
              <button
                onClick={handleDownload}
                disabled={!qrSrc}
                className="w-full py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name="download" size={18} />
                Scarica biglietto (PNG)
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-[#c4c5d5] mt-6">© 2025 Solidando · La Gioia nel Dare</p>
      </div>
    </div>
  )
}
