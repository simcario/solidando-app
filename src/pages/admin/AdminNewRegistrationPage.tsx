import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import { getEvent } from '../../firebase/events'
import { getForm } from '../../firebase/forms'
import { submitResponse } from '../../firebase/responses'
import { getEventBookedCount } from '../../firebase/events'
import { useAuthStore } from '../../stores/authStore'
import type { SolidandoEvent, Form, FormNode, FormVariable } from '../../types/form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAnswerEmpty(node: FormNode, answers: Record<string, unknown>): boolean {
  if (['divider', 'end_screen', 'page_break', 'rich_text', 'html', 'payment'].includes(node.type)) return false
  const val = answers[node.id]
  if (val === undefined || val === null || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && !Array.isArray(val) && 'selected' in (val as object)) {
    return ((val as { selected: string[] }).selected ?? []).length === 0
  }
  if (typeof val === 'object' && !Array.isArray(val) && 'value' in (val as object)) {
    return !(val as { value: string }).value
  }
  if (node.type === 'survey') {
    const rows = node.properties.surveyRows ?? []
    if (rows.length === 0) return false
    const rowAnswers = (val as Record<string, string>) ?? {}
    return rows.some(r => !rowAnswers[r.id])
  }
  return false
}

function evaluateLogic(node: FormNode, currentAnswers: Record<string, unknown>): string | null {
  const conditions = node.logic?.conditions ?? []
  for (const cond of conditions) {
    let answer = currentAnswers[cond.field]
    if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && 'value' in answer) {
      answer = (answer as { value: string }).value
    }
    if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && 'selected' in answer) {
      answer = (answer as { selected: string[] }).selected.join(',')
    }
    const val = cond.value
    let match = false
    switch (cond.operator) {
      case 'equals':       match = String(answer ?? '') === String(val); break
      case 'not_equals':   match = String(answer ?? '') !== String(val); break
      case 'contains':     match = String(answer ?? '').toLowerCase().includes(String(val).toLowerCase()); break
      case 'greater_than': match = Number(answer) > Number(val); break
      case 'less_than':    match = Number(answer) < Number(val); break
    }
    if (match) return cond.target
  }
  return null
}

function applyOp(a: number, op: '*' | '+' | '-' | '/', b: number): number {
  switch (op) {
    case '*': return a * b
    case '+': return a + b
    case '-': return a - b
    case '/': return b !== 0 ? a / b : 0
    default: return 0
  }
}

function resolvePaymentAmount(
  node: FormNode,
  variables: FormVariable[],
  nodes: FormNode[],
  answers: Record<string, unknown>,
): number | null {
  const formula = node.properties.paymentFormula
  if (!formula) return node.properties.amount ?? null

  if ('terms' in formula) {
    if (!formula.terms || formula.terms.length === 0) return node.properties.amount ?? null
    const termResults = formula.terms.map(term => {
      if (!term.fieldId || !term.variableId) return null
      const variable = variables.find(v => v.id === term.variableId)
      if (!variable) return null
      const rawAnswer = answers[term.fieldId]
      const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
      return applyOp(fieldVal, term.op, variable.value)
    })
    if (termResults.some(r => r === null)) return node.properties.amount ?? null
    return (termResults as number[]).reduce((acc, val) => applyOp(acc, formula.combineOp, val), 0)
  }

  // legacy single-term
  if (!formula.fieldId || !formula.variableId) return node.properties.amount ?? null
  const srcNode = nodes.find(n => n.id === formula.fieldId)
  const variable = variables.find(v => v.id === formula.variableId)
  if (!srcNode || !variable) return node.properties.amount ?? null
  const rawAnswer = answers[formula.fieldId]
  const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
  return applyOp(fieldVal, formula.op, variable.value)
}

// Restituisce i nodi che sarebbero attraversati seguendo la logica di salto
function getVisibleNodeIds(allNodes: FormNode[], answers: Record<string, unknown>): Set<string> {
  const visible = new Set<string>()
  let i = 0
  while (i < allNodes.length) {
    const node = allNodes[i]
    if (node.type === 'end_screen') break
    visible.add(node.id)
    const target = evaluateLogic(node, answers)
    if (target === '__end__') break
    if (target) {
      const targetIdx = allNodes.findIndex(n => n.id === target)
      if (targetIdx !== -1) { i = targetIdx; continue }
    }
    i++
  }
  return visible
}

type PaymentStatus = 'none' | 'completed' | 'pending'
type PaymentStatusOrNull = PaymentStatus | null

// ─── Field renderer ───────────────────────────────────────────────────────────

function FieldInput({
  node,
  value,
  onChange,
  error,
}: {
  node: FormNode
  value: unknown
  onChange: (v: unknown) => void
  error?: string
}) {
  const { type, properties } = node
  const inputCls = 'w-full px-4 py-3 border-2 border-[#c4c5d5] rounded-xl focus:border-[#002068] focus:outline-none bg-white text-[#1a1b22] text-sm transition-colors'

  if (['radio', 'dropdown'].includes(type)) {
    const opts = properties.options ?? []
    const hasAnyOpenText = opts.some(o => o.openText)
    const selectedValue = hasAnyOpenText && typeof value === 'object' && value !== null
      ? (value as { value: string; openTextValue?: string }).value
      : value as string
    const openTextValue = hasAnyOpenText && typeof value === 'object' && value !== null
      ? (value as { value: string; openTextValue?: string }).openTextValue ?? ''
      : ''

    return (
      <div className="space-y-2">
        {opts.map(opt => (
          <div key={opt.value}>
            <button
              type="button"
              onClick={() => {
                if (!hasAnyOpenText) { onChange(opt.value); return }
                onChange({ value: opt.value, openTextValue: selectedValue === opt.value ? openTextValue : '' })
              }}
              className={`w-full flex items-center gap-3 p-3.5 border-2 rounded-xl text-left transition-all text-sm ${
                selectedValue === opt.value
                  ? 'border-[#002068] bg-[#dce1ff]'
                  : 'border-[#c4c5d5] hover:border-[#b5c4ff] bg-white'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selectedValue === opt.value ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'}`}>
                {selectedValue === opt.value && <div className="w-full h-full rounded-full bg-white scale-50" />}
              </div>
              <span className="font-medium">{opt.label}</span>
            </button>
            {opt.openText && selectedValue === opt.value && (
              <input
                value={openTextValue}
                onChange={e => onChange({ value: selectedValue, openTextValue: e.target.value })}
                placeholder="Specifica..."
                className="mt-1.5 w-full px-4 py-2.5 border-2 border-[#002068] rounded-xl text-sm bg-white focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'checkbox') {
    const opts = properties.options ?? []
    const hasAnyOpenText = opts.some(o => o.openText)
    const selected: string[] = hasAnyOpenText && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { selected: string[] }).selected ?? []
      : (value as string[]) ?? []
    const openTexts: Record<string, string> = hasAnyOpenText && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { selected: string[]; openTexts?: Record<string, string> }).openTexts ?? {}
      : {}

    return (
      <div className="space-y-2">
        {opts.map(opt => (
          <div key={opt.value}>
            <button
              type="button"
              onClick={() => {
                const newSelected = selected.includes(opt.value)
                  ? selected.filter(s => s !== opt.value)
                  : [...selected, opt.value]
                if (!hasAnyOpenText) { onChange(newSelected); return }
                const newTexts = { ...openTexts }
                if (!newSelected.includes(opt.value)) delete newTexts[opt.value]
                onChange({ selected: newSelected, openTexts: newTexts })
              }}
              className={`w-full flex items-center gap-3 p-3.5 border-2 rounded-xl text-left transition-all text-sm ${
                selected.includes(opt.value)
                  ? 'border-[#002068] bg-[#dce1ff]'
                  : 'border-[#c4c5d5] hover:border-[#b5c4ff] bg-white'
              }`}
            >
              <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                selected.includes(opt.value) ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'
              }`}>
                {selected.includes(opt.value) && <Icon name="check" size={12} className="text-white" />}
              </div>
              <span className="font-medium">{opt.label}</span>
            </button>
            {opt.openText && selected.includes(opt.value) && (
              <input
                value={openTexts[opt.value] ?? ''}
                onChange={e => onChange({ selected, openTexts: { ...openTexts, [opt.value]: e.target.value } })}
                placeholder="Specifica..."
                className="mt-1.5 w-full px-4 py-2.5 border-2 border-[#002068] rounded-xl text-sm bg-white focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'survey') {
    const rows = properties.surveyRows ?? []
    const cols = properties.surveyColumns ?? [
      { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
      { value: '4', label: '4' }, { value: '5', label: '5' },
    ]
    const rowAnswers = (value as Record<string, string>) ?? {}
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left pb-2 pr-4 text-xs font-semibold text-[#747684] min-w-[120px]"></th>
              {cols.map(col => (
                <th key={col.value} className="text-center pb-2 px-2 text-xs font-semibold text-[#444653] min-w-[40px]">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id} className={ri % 2 === 0 ? '' : 'bg-[#f4f3fc]'}>
                <td className="py-2.5 pr-4 text-sm font-medium text-[#1a1b22]">{row.label}</td>
                {cols.map(col => (
                  <td key={col.value} className="text-center py-2.5 px-2">
                    <button
                      type="button"
                      onClick={() => onChange({ ...rowAnswers, [row.id]: col.value })}
                      className={`w-7 h-7 rounded-full border-2 transition-all mx-auto flex items-center justify-center ${
                        rowAnswers[row.id] === col.value
                          ? 'border-[#002068] bg-[#002068]'
                          : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
                      }`}
                    >
                      {rowAnswers[row.id] === col.value && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'rating') {
    const num = (value as number) ?? 0
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(i => (
          <button key={i} type="button" onClick={() => onChange(i)} className="transition-transform hover:scale-110">
            <Icon name="star" size={32} filled={i <= num} className={i <= num ? 'text-[#fe9832]' : 'text-[#c4c5d5]'} />
          </button>
        ))}
      </div>
    )
  }

  if (type === 'long_text') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className={`${inputCls} resize-none`}
        placeholder={properties.placeholder ?? 'Scrivi qui...'}
      />
    )
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    )
  }

  if (type === 'time') {
    return (
      <input
        type="time"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
      />
    )
  }

  if (type === 'slider') {
    const min = properties.min ?? 0
    const max = properties.max ?? 100
    const num = (value as number) ?? min
    return (
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={num}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-sm font-bold text-[#002068] min-w-[40px] text-right">{num}</span>
      </div>
    )
  }

  // default: text/email/number/phone
  const inputType =
    type === 'email' ? 'email' :
    type === 'number' ? 'number' :
    type === 'phone' ? 'tel' : 'text'

  return (
    <input
      type={inputType}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      className={`${inputCls} ${error ? 'border-[#ba1a1a]' : ''}`}
      placeholder={properties.placeholder ?? ''}
      min={type === 'number' ? properties.min : undefined}
      max={type === 'number' ? properties.max : undefined}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const SKIPPED_TYPES = new Set(['divider', 'end_screen', 'page_break', 'rich_text', 'html', 'hidden', 'payment'])

export default function AdminNewRegistrationPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [event, setEvent] = useState<SolidandoEvent | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusOrNull>(null)
  const [paymentStatusError, setPaymentStatusError] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [capacityWarning, setCapacityWarning] = useState(false)
  const [sendConfirmationEmail, setSendConfirmationEmail] = useState(true)

  useEffect(() => {
    if (!eventId) return
    getEvent(eventId).then(async ev => {
      setEvent(ev)
      if (ev?.formId) {
        const f = await getForm(ev.formId)
        setForm(f)
      }
      setLoading(false)
    })
  }, [eventId])

  // detect payment node in form to show payment section
  const paymentNode = form?.nodes?.find(n => n.type === 'payment') ?? null
  const hasPaymentNode = !!paymentNode

  // Calcola l'importo dalla formula del form (aggiornato al cambiare delle risposte)
  const computedPaymentAmount = useMemo(() => {
    if (!paymentNode || !form) return null
    return resolvePaymentAmount(paymentNode, form.variables ?? [], form.nodes ?? [], answers)
  }, [paymentNode, form, answers])

  // Nodi visibili secondo la logica di salto del form
  const visibleNodeIds = useMemo(() => {
    if (!form) return new Set<string>()
    return getVisibleNodeIds(form.nodes ?? [], answers)
  }, [form, answers])

  const visibleNodes = (form?.nodes ?? []).filter(n => !SKIPPED_TYPES.has(n.type) && visibleNodeIds.has(n.id))

  function setAnswer(nodeId: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [nodeId]: value }))
    if (errors[nodeId]) setErrors(prev => { const e = { ...prev }; delete e[nodeId]; return e })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!event?.formId || !form) return

    // Validate required fields
    const newErrors: Record<string, string> = {}
    for (const node of visibleNodes) {
      if (node.properties.required && isAnswerEmpty(node, answers)) {
        newErrors[node.id] = 'Campo obbligatorio'
      } else if (node.type === 'email') {
        const val = String(answers[node.id] ?? '').trim()
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          newErrors[node.id] = 'Email non valida'
        }
      }
    }
    // Validate payment status if form has payment node
    if (hasPaymentNode && paymentStatus === null) {
      setPaymentStatusError(true)
      if (Object.keys(newErrors).length === 0) {
        document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      setPaymentStatusError(false)
    }
    if (Object.keys(newErrors).length > 0 || (hasPaymentNode && paymentStatus === null)) {
      setErrors(newErrors)
      if (Object.keys(newErrors).length > 0) {
        const firstErrorId = Object.keys(newErrors)[0]
        document.getElementById(`field-${firstErrorId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }

    // Capacity check
    if (event.totalCapacity !== null && event.totalCapacity !== undefined) {
      const activeIds = (event.attendeeFieldIds && event.attendeeFieldIds.length > 0)
        ? event.attendeeFieldIds
        : event.attendeeFieldId ? [event.attendeeFieldId] : []
      const requestedSpots = activeIds.length > 0
        ? Math.max(1, activeIds.reduce((s, fid) => s + (Number(answers[fid] ?? 0) || 0), 0))
        : 1
      const booked = await getEventBookedCount(event.formId, event.attendeeFieldId, event.attendeeFieldIds)
      if (booked + requestedSpots > event.totalCapacity) {
        setCapacityWarning(true)
        return
      }
    }

    setSubmitting(true)
    try {
      // Usa l'importo dalla formula del form; fallback all'input manuale se non c'è formula
      const amt = computedPaymentAmount ?? (paymentAmount ? parseFloat(paymentAmount) : null)
      const status: PaymentStatus = hasPaymentNode ? (paymentStatus as PaymentStatus) : 'none'
      await submitResponse(
        event.formId,
        answers,
        status,
        amt && amt > 0 ? amt : null,
        event.id,
        event.attendeeFieldId ?? null,
        null,
        event.attendeeFieldIds ?? null,
        !sendConfirmationEmail,
      )
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    )
  }

  if (!event) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Icon name="event_busy" size={64} className="text-[#c4c5d5]" />
          <p className="text-[#444653]">Evento non trovato.</p>
          <button onClick={() => navigate('/events')} className="text-[#002068] font-bold hover:underline">
            Torna agli eventi
          </button>
        </div>
      </AppLayout>
    )
  }

  if (!event.formId || !form) {
    return (
      <AppLayout>
        <div className="mb-6">
          <button
            onClick={() => navigate(`/events/${eventId}`)}
            className="flex items-center gap-1.5 text-sm font-semibold text-[#747684] hover:text-[#002068] transition-colors"
          >
            <Icon name="arrow_back" size={16} />
            {event.title}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#ffdcc2] flex items-center justify-center">
            <Icon name="link_off" size={32} className="text-[#fe9832]" />
          </div>
          <div>
            <p className="font-bold text-[#1a1b22] mb-1">Nessun form collegato</p>
            <p className="text-sm text-[#747684]">
              Collega un form di iscrizione nelle impostazioni evento per aggiungere iscrizioni manualmente.
            </p>
          </div>
          <button
            onClick={() => navigate(`/events/${eventId}`)}
            className="px-5 py-2.5 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-all"
          >
            Vai alle impostazioni evento
          </button>
        </div>
      </AppLayout>
    )
  }

  if (done) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto py-16 flex flex-col items-center gap-6 text-center px-4">
          <div className="w-20 h-20 rounded-full bg-[#e6f9ee] flex items-center justify-center">
            <Icon name="check_circle" size={48} className="text-[#1a6b3a]" filled />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#002068] mb-2">Iscrizione aggiunta!</h2>
            <p className="text-[#444653]">La nuova iscrizione è stata salvata correttamente.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button
              onClick={() => { setDone(false); setAnswers({}); setPaymentStatus(null); setPaymentStatusError(false); setPaymentAmount(''); setCapacityWarning(false); setSendConfirmationEmail(true) }}
              className="flex-1 py-3 border-2 border-[#002068] text-[#002068] rounded-xl font-bold text-sm hover:bg-[#dce1ff] transition-all flex items-center justify-center gap-2"
            >
              <Icon name="person_add" size={18} />
              Altra iscrizione
            </button>
            <button
              onClick={() => navigate(`/events/${eventId}`)}
              className="flex-1 py-3 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-all flex items-center justify-center gap-2"
            >
              <Icon name="arrow_back" size={18} />
              Torna all'evento
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      {/* Back + header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(`/events/${eventId}`)}
          className="flex items-center gap-1.5 text-sm font-semibold text-[#747684] hover:text-[#002068] transition-colors mb-4"
        >
          <Icon name="arrow_back" size={16} />
          {event.title}
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#002068] flex items-center justify-center shrink-0">
            <Icon name="person_add" size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#002068]">Nuova Iscrizione</h1>
            <p className="text-sm text-[#747684]">Inserisci manualmente i dati del partecipante</p>
          </div>
        </div>
      </div>

      {/* Capacity warning */}
      {capacityWarning && (
        <div className="mb-4 flex items-start gap-3 p-4 bg-[#ffe9e9] border border-[#ba1a1a] rounded-xl text-[#ba1a1a] text-sm font-semibold">
          <Icon name="event_busy" size={18} className="shrink-0 mt-0.5" />
          <span>Posti esauriti — non è possibile aggiungere ulteriori iscrizioni.</span>
        </div>
      )}

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} noValidate>
          {/* Form fields */}
          <div className="bg-white rounded-xl border border-[#c4c5d5] divide-y divide-[#e8e7f0] mb-4">
            {visibleNodes.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-[#747684]">
                Il form non contiene campi compilabili.
              </div>
            )}
            {visibleNodes.map((node, idx) => (
              <div key={node.id} id={`field-${node.id}`} className="px-5 py-5">
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-xs font-bold text-[#747684] w-5 shrink-0">{idx + 1}.</span>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-[#1a1b22]">
                      {node.properties.label || node.type}
                      {node.properties.required && <span className="text-[#ba1a1a] ml-1">*</span>}
                    </label>
                    {node.properties.helpText && (
                      <p className="text-xs text-[#747684] mt-0.5">{node.properties.helpText}</p>
                    )}
                  </div>
                </div>
                <div className={idx > 0 ? '' : ''}>
                  <FieldInput
                    node={node}
                    value={answers[node.id]}
                    onChange={v => setAnswer(node.id, v)}
                    error={errors[node.id]}
                  />
                </div>
                {errors[node.id] && (
                  <p className="mt-1.5 text-xs font-semibold text-[#ba1a1a] flex items-center gap-1">
                    <Icon name="error" size={13} />
                    {errors[node.id]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Payment section */}
          {hasPaymentNode && (
            <div
              id="payment-section"
              className={`bg-white rounded-xl border p-5 mb-4 ${paymentStatusError ? 'border-[#ba1a1a]' : 'border-[#c4c5d5]'}`}
            >
              <h3 className="font-bold text-[#002068] flex items-center gap-2 mb-1">
                <Icon name="payments" size={18} />
                Pagamento
                <span className="text-[#ba1a1a] ml-0.5">*</span>
              </h3>
              <p className="text-xs text-[#747684] mb-4">Specifica lo stato del pagamento per questa iscrizione.</p>
              <div className="space-y-3">
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'none' as const, label: 'Gratuito', icon: 'money_off', desc: 'Nessun pagamento' },
                      { value: 'pending' as const, label: 'In attesa', icon: 'hourglass_empty', desc: 'Da incassare' },
                      { value: 'completed' as const, label: 'Pagato', icon: 'check_circle', desc: 'Già incassato' },
                    ]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setPaymentStatus(opt.value); setPaymentStatusError(false) }}
                        className={`flex flex-col items-center gap-1 py-3.5 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                          paymentStatus === opt.value
                            ? 'border-[#002068] bg-[#dce1ff] text-[#002068]'
                            : paymentStatusError
                              ? 'border-[#ba1a1a] text-[#444653] hover:border-[#002068]'
                              : 'border-[#c4c5d5] text-[#444653] hover:border-[#b5c4ff]'
                        }`}
                      >
                        <Icon name={opt.icon} size={20} />
                        <span>{opt.label}</span>
                        <span className="font-normal text-[10px] opacity-70">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                  {paymentStatusError && (
                    <p className="mt-2 text-xs font-semibold text-[#ba1a1a] flex items-center gap-1">
                      <Icon name="error" size={13} />
                      Seleziona lo stato del pagamento
                    </p>
                  )}
                </div>
                {paymentStatus !== null && paymentStatus !== 'none' && (
                  <div>
                    <label className="block text-xs font-bold text-[#444653] uppercase tracking-wider mb-1.5">
                      Importo (€)
                    </label>
                    {computedPaymentAmount !== null ? (
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#f4f3fc] border-2 border-[#002068] rounded-xl">
                        <Icon name="calculate" size={16} className="text-[#002068] shrink-0" />
                        <span className="font-bold text-[#002068] text-sm">
                          {computedPaymentAmount.toFixed(2)} €
                        </span>
                        <span className="text-xs text-[#747684] ml-auto">calcolato dalla formula del form</span>
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 border-2 border-[#c4c5d5] rounded-xl focus:border-[#002068] focus:outline-none bg-white text-sm"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin note + email toggle */}
          <div className="bg-[#f4f3fc] border border-[#c4c5d5] rounded-xl mb-6 divide-y divide-[#e8e7f0]">
            <div className="flex items-start gap-2 px-4 py-3 text-xs text-[#444653]">
              <Icon name="admin_panel_settings" size={15} className="shrink-0 mt-0.5 text-[#002068]" />
              <span>Iscrizione manuale da admin — registrata a nome di <strong>{user?.displayName || user?.email}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setSendConfirmationEmail(v => !v)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#e8e7f0] transition-colors rounded-b-xl"
            >
              <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${sendConfirmationEmail ? 'bg-[#002068]' : 'bg-[#c4c5d5]'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${sendConfirmationEmail ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#1a1b22]">Invia email di conferma all'iscritto</p>
                <p className="text-[10px] text-[#747684]">
                  {sendConfirmationEmail
                    ? 'Verrà inviata la conferma iscrizione all\'indirizzo email inserito nel form'
                    : 'Nessuna email di conferma verrà inviata all\'iscritto'}
                </p>
              </div>
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || capacityWarning}
            className="w-full py-4 bg-[#002068] text-white rounded-xl font-bold text-base hover:bg-[#003399] transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
          >
            {submitting
              ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Icon name="person_add" size={20} />}
            {submitting ? 'Salvataggio...' : 'Aggiungi iscrizione'}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}
