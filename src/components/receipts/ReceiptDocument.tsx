import type { FiscalConfig } from '../../types/form'

export interface ReceiptData {
  receiptNumber: string        // es. "0042/2026"
  receiptDate: string          // ISO date "2026-06-09"
  recipientName: string        // Nome e cognome
  recipientEmail?: string
  amount: number
  currency: string             // 'EUR'
  eventTitle: string           // Causale
  receiptDescription?: string  // Dicitura personalizzata (sostituisce il prefisso hardcoded)
  eventDate?: string           // Data evento (opzionale)
  paymentMethod: string        // 'PayPal' | 'Contanti' | ecc.
  paypalOrderId?: string
}

interface Props {
  fiscal: FiscalConfig
  receipt: ReceiptData
  /** Se true rende il documento compatto per anteprima inline */
  compact?: boolean
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount)
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
}

export default function ReceiptDocument({ fiscal, receipt, compact = false }: Props) {
  const scale = compact ? 'text-[11px]' : 'text-sm'

  return (
    <div
      className={`bg-white font-sans ${scale}`}
      style={{ maxWidth: compact ? '100%' : 720, margin: '0 auto' }}
    >
      {/* Header banda */}
      <div style={{ background: '#002068', padding: compact ? '20px 24px 16px' : '28px 36px 22px', borderRadius: '12px 12px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <p style={{ color: '#8aa4ff', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' }}>
              RICEVUTA
            </p>
            <h1 style={{ color: '#ffffff', fontSize: compact ? 16 : 20, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>
              {fiscal.organizationName}
            </h1>
            {fiscal.vatNumber && (
              <p style={{ color: '#b0c4ff', fontSize: 11, margin: '4px 0 0', fontFamily: 'monospace' }}>
                P.IVA {fiscal.vatNumber}
              </p>
            )}
            <p style={{ color: '#b0c4ff', fontSize: 11, margin: '2px 0 0', fontFamily: 'monospace' }}>
              C.F. {fiscal.fiscalCode}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#fe9832', fontSize: compact ? 13 : 15, fontWeight: 900, margin: 0, fontFamily: 'monospace' }}>
              {receipt.receiptNumber}
            </p>
            <p style={{ color: '#b0c4ff', fontSize: 11, margin: '4px 0 0' }}>
              {fmtDate(receipt.receiptDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ border: '1px solid #e0e0e0', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: compact ? '20px 24px' : '28px 36px' }}>

        {/* Dati emittente e destinatario */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Emittente */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.5, margin: '0 0 6px' }}>
              Emittente
            </p>
            <p style={{ fontWeight: 700, color: '#1a1b22', margin: '0 0 2px' }}>{fiscal.organizationName}</p>
            <p style={{ color: '#444653', margin: '0 0 2px' }}>{fiscal.address}</p>
            <p style={{ color: '#444653', margin: '0 0 2px' }}>{fiscal.postalCode} {fiscal.city} ({fiscal.province})</p>
            {fiscal.phone && <p style={{ color: '#444653', margin: '0 0 2px' }}>Tel. {fiscal.phone}</p>}
            {fiscal.email && <p style={{ color: '#444653', margin: 0 }}>{fiscal.email}</p>}
          </div>

          {/* Destinatario */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.5, margin: '0 0 6px' }}>
              Destinatario
            </p>
            <p style={{ fontWeight: 700, color: '#1a1b22', margin: '0 0 2px' }}>{receipt.recipientName}</p>
            {receipt.recipientEmail && (
              <p style={{ color: '#444653', margin: 0 }}>{receipt.recipientEmail}</p>
            )}
          </div>
        </div>

        {/* Divisore */}
        <div style={{ height: 1, background: '#e8e7f0', marginBottom: 24 }} />

        {/* Dettaglio importo */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#f4f3fc' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.2, borderBottom: '2px solid #e8e7f0' }}>
                Descrizione / Causale
              </th>
              {receipt.eventDate && (
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.2, borderBottom: '2px solid #e8e7f0' }}>
                  Data evento
                </th>
              )}
              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.2, borderBottom: '2px solid #e8e7f0' }}>
                Importo
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px 14px', color: '#1a1b22', fontWeight: 600, borderBottom: '1px solid #e8e7f0' }}>
                {receipt.receiptDescription ?? `Contributo liberale per raccolta fondi occasionale ${receipt.eventTitle}`}
              </td>
              {receipt.eventDate && (
                <td style={{ padding: '12px 14px', textAlign: 'center', color: '#444653', borderBottom: '1px solid #e8e7f0' }}>
                  {fmtDate(receipt.eventDate)}
                </td>
              )}
              <td style={{ padding: '12px 14px', textAlign: 'right', color: '#1a1b22', fontWeight: 700, fontFamily: 'monospace', borderBottom: '1px solid #e8e7f0' }}>
                {fmt(receipt.amount, receipt.currency)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ background: '#002068' }}>
              <td colSpan={receipt.eventDate ? 2 : 1} style={{ padding: '12px 14px', color: '#8aa4ff', fontWeight: 700, fontSize: 12 }}>
                TOTALE PAGATO
              </td>
              <td style={{ padding: '12px 14px', textAlign: 'right', color: '#ffffff', fontWeight: 900, fontSize: compact ? 15 : 18, fontFamily: 'monospace' }}>
                {fmt(receipt.amount, receipt.currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Metodo di pagamento */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 16px', background: '#f4f3fc', borderRadius: 8, border: '1px solid #e8e7f0' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 3px' }}>Metodo di pagamento</p>
            <p style={{ fontWeight: 700, color: '#1a1b22', margin: 0 }}>{receipt.paymentMethod}</p>
          </div>
          {receipt.paypalOrderId && (
            <div style={{ padding: '10px 16px', background: '#f4f3fc', borderRadius: 8, border: '1px solid #e8e7f0' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#747684', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 3px' }}>ID transazione PayPal</p>
              <p style={{ fontWeight: 600, color: '#444653', margin: 0, fontFamily: 'monospace', fontSize: 11 }}>{receipt.paypalOrderId}</p>
            </div>
          )}
        </div>

        {/* Note */}
        {fiscal.notes && (
          <div style={{ padding: '12px 16px', background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe082', marginBottom: 16 }}>
            <p style={{ fontSize: 11, color: '#7a5800', margin: 0, lineHeight: 1.6 }}>{fiscal.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e8e7f0', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ fontSize: 10, color: '#c4c5d5', margin: 0 }}>
            Ricevuta generata elettronicamente — {receipt.receiptNumber}
          </p>
          {fiscal.website && (
            <p style={{ fontSize: 10, color: '#747684', margin: 0 }}>{fiscal.website}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Genera il markup HTML inline usato nelle email (no React, plain HTML string) */
export function buildReceiptEmailHtml(fiscal: FiscalConfig, receipt: ReceiptData): string {
  function fmt(amount: number, currency: string) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount)
  }
  function fmtDate(iso: string) {
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
  }

  return `
<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <!-- Header -->
  <div style="background:#002068;padding:28px 36px 22px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <p style="color:#8aa4ff;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px">RICEVUTA</p>
        <h1 style="color:#ffffff;font-size:20px;font-weight:900;margin:0">${fiscal.organizationName}</h1>
        ${fiscal.vatNumber ? `<p style="color:#b0c4ff;font-size:11px;margin:4px 0 0;font-family:monospace">P.IVA ${fiscal.vatNumber}</p>` : ''}
        <p style="color:#b0c4ff;font-size:11px;margin:2px 0 0;font-family:monospace">C.F. ${fiscal.fiscalCode}</p>
      </td>
      <td style="text-align:right;vertical-align:top">
        <p style="color:#fe9832;font-size:15px;font-weight:900;margin:0;font-family:monospace">${receipt.receiptNumber}</p>
        <p style="color:#b0c4ff;font-size:11px;margin:4px 0 0">${fmtDate(receipt.receiptDate)}</p>
      </td>
    </tr></table>
  </div>

  <!-- Body -->
  <div style="padding:28px 36px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px">

    <!-- Emittente / Destinatario -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
      <td width="50%" style="vertical-align:top;padding-right:12px">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 6px">Emittente</p>
        <p style="font-weight:700;color:#1a1b22;margin:0 0 2px">${fiscal.organizationName}</p>
        <p style="color:#444653;margin:0 0 2px">${fiscal.address}</p>
        <p style="color:#444653;margin:0 0 2px">${fiscal.postalCode} ${fiscal.city} (${fiscal.province})</p>
        ${fiscal.phone ? `<p style="color:#444653;margin:0 0 2px">Tel. ${fiscal.phone}</p>` : ''}
        ${fiscal.email ? `<p style="color:#444653;margin:0">${fiscal.email}</p>` : ''}
      </td>
      <td width="50%" style="vertical-align:top;padding-left:12px">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 6px">Destinatario</p>
        <p style="font-weight:700;color:#1a1b22;margin:0 0 2px">${receipt.recipientName}</p>
        ${receipt.recipientEmail ? `<p style="color:#444653;margin:0">${receipt.recipientEmail}</p>` : ''}
      </td>
    </tr></table>

    <hr style="border:none;border-top:1px solid #e8e7f0;margin:0 0 24px">

    <!-- Tabella importo -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-collapse:collapse">
      <thead>
        <tr style="background:#f4f3fc">
          <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Descrizione / Causale</th>
          ${receipt.eventDate ? `<th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Data evento</th>` : ''}
          <th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;border-bottom:2px solid #e8e7f0">Importo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:12px 14px;color:#1a1b22;font-weight:600;border-bottom:1px solid #e8e7f0">${receipt.receiptDescription ?? `Contributo liberale per raccolta fondi occasionale ${receipt.eventTitle}`}</td>
          ${receipt.eventDate ? `<td style="padding:12px 14px;text-align:center;color:#444653;border-bottom:1px solid #e8e7f0">${fmtDate(receipt.eventDate)}</td>` : ''}
          <td style="padding:12px 14px;text-align:right;color:#1a1b22;font-weight:700;font-family:monospace;border-bottom:1px solid #e8e7f0">${fmt(receipt.amount, receipt.currency)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="background:#002068">
          <td ${receipt.eventDate ? 'colspan="2"' : ''} style="padding:12px 14px;color:#8aa4ff;font-weight:700;font-size:12px">TOTALE PAGATO</td>
          <td style="padding:12px 14px;text-align:right;color:#ffffff;font-weight:900;font-size:18px;font-family:monospace">${fmt(receipt.amount, receipt.currency)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Metodo pagamento -->
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
      <td style="padding:10px 16px;background:#f4f3fc;border-radius:8px;border:1px solid #e8e7f0">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 3px">Metodo di pagamento</p>
        <p style="font-weight:700;color:#1a1b22;margin:0">${receipt.paymentMethod}</p>
      </td>
      ${receipt.paypalOrderId ? `
      <td width="16"></td>
      <td style="padding:10px 16px;background:#f4f3fc;border-radius:8px;border:1px solid #e8e7f0">
        <p style="font-size:10px;font-weight:700;color:#747684;text-transform:uppercase;letter-spacing:1.2px;margin:0 0 3px">ID transazione PayPal</p>
        <p style="font-weight:600;color:#444653;margin:0;font-family:monospace;font-size:11px">${receipt.paypalOrderId}</p>
      </td>` : ''}
    </tr></table>

    ${fiscal.notes ? `
    <div style="padding:12px 16px;background:#fffbe6;border-radius:8px;border:1px solid #ffe082;margin-bottom:16px">
      <p style="font-size:11px;color:#7a5800;margin:0;line-height:1.6">${fiscal.notes}</p>
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top:1px solid #e8e7f0;padding-top:16px">
      <p style="font-size:10px;color:#c4c5d5;margin:0">Ricevuta generata elettronicamente · ${receipt.receiptNumber}</p>
    </div>
  </div>
</div>`
}
