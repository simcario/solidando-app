import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'
import { httpsCallable } from 'firebase/functions'
import { getForm } from '../../firebase/forms'
import { submitResponse, updateResponsePaymentStatus } from '../../firebase/responses'
import { getWorkspaceSettings } from '../../firebase/workspace'
import { getEventByFormId, getEventBookedCount } from '../../firebase/events'
import { functions } from '../../firebase/config'
import Icon from '../../components/ui/Icon'
import { resolveTemplate } from '../../utils/resolveTemplate'
import { resolveBgStyle } from '../builder/components/FormDesignPanel'
import type { Form, FormNode, FormVariable, SolidandoEvent } from '../../types/form'

// ─── Formula resolver ─────────────────────────────────────────────────────────

function resolvePaymentAmount(
  node: FormNode,
  variables: FormVariable[],
  nodes: FormNode[],
  answers: Record<string, unknown>,
): number | null {
  const formula = node.properties.paymentFormula
  if (!formula || !formula.fieldId || !formula.variableId) {
    return node.properties.amount ?? null
  }
  const srcNode = nodes.find(n => n.id === formula.fieldId)
  const variable = variables.find(v => v.id === formula.variableId)
  if (!srcNode || !variable) return node.properties.amount ?? null

  const rawAnswer = answers[formula.fieldId]
  const fieldVal = rawAnswer !== undefined && rawAnswer !== '' ? Number(rawAnswer) : 0
  const varVal = variable.value

  switch (formula.op) {
    case '*': return fieldVal * varVal
    case '+': return fieldVal + varVal
    case '-': return fieldVal - varVal
    case '/': return varVal !== 0 ? fieldVal / varVal : 0
    default: return null
  }
}

// ─── Required field check ─────────────────────────────────────────────────────

function isAnswerEmpty(node: FormNode, answers: Record<string, unknown>): boolean {
  if (node.type === 'divider' || node.type === 'end_screen' || node.type === 'page_break') return false
  const val = answers[node.id]
  if (val === undefined || val === null || val === '') return true
  if (Array.isArray(val) && val.length === 0) return true
  // checkbox with openText shape
  if (typeof val === 'object' && !Array.isArray(val) && 'selected' in (val as object)) {
    return ((val as { selected: string[] }).selected ?? []).length === 0
  }
  // radio with openText shape
  if (typeof val === 'object' && !Array.isArray(val) && 'value' in (val as object)) {
    return !(val as { value: string }).value
  }
  // survey: check all rows answered
  if (node.type === 'survey') {
    const rows = node.properties.surveyRows ?? []
    if (rows.length === 0) return false
    const rowAnswers = (val as Record<string, string>) ?? {}
    return rows.some(r => !rowAnswers[r.id])
  }
  return false
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FormPreviewPage() {
  const { formId } = useParams<{ formId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isDesignMode = searchParams.get('mode') === 'design'
  const [form, setForm] = useState<Form | null>(null)
  const [showCoverScreen, setShowCoverScreen] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<false | 'required' | 'email'>(false)
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null)
  const [paypalWorkspaceId, setPaypalWorkspaceId] = useState<string>('')
  const [paypalSandbox, setPaypalSandbox] = useState<boolean>(true)
  const [responseId, setResponseId] = useState<string | null>(null)
  const pendingPaypalOrderRef = useRef<string | null>(null)
  const [linkedEvent, setLinkedEvent] = useState<SolidandoEvent | null>(null)
  const [capacityFull, setCapacityFull] = useState(false)

  useEffect(() => {
    if (!formId) return
    getForm(formId).then(async f => {
      setForm(f)
      setLoading(false)
      if (!f?.showCover) setShowCoverScreen(false)
      if (f?.workspaceId) {
        getWorkspaceSettings(f.workspaceId).then(async ws => {
          if (ws.paypal?.clientId) {
            setPaypalClientId(ws.paypal.clientId)
            setPaypalWorkspaceId(f.workspaceId)
            setPaypalSandbox(ws.paypal.sandbox ?? true)
          } else if (f.createdBy) {
            // fallback per form vecchi con workspaceId: 'default'
            const wsFallback = await getWorkspaceSettings(f.createdBy)
            if (wsFallback.paypal?.clientId) {
              setPaypalClientId(wsFallback.paypal.clientId)
              setPaypalWorkspaceId(f.createdBy)
              setPaypalSandbox(wsFallback.paypal.sandbox ?? true)
            }
          }
        })
      }
      // Carica evento collegato per controllo capienza
      const ev = await getEventByFormId(formId)
      if (ev) {
        setLinkedEvent(ev)
        if (ev.totalCapacity !== null) {
          const booked = await getEventBookedCount(formId, ev.attendeeFieldId)
          if (booked >= ev.totalCapacity) setCapacityFull(true)
        }
      }
    })
  }, [formId])

  const nodes = form?.nodes ?? []
  const variables = form?.variables ?? []
  const formMode = form?.settings?.mode === 'classic' ? 'classic' : 'conversational'
  const fieldStyle: FieldStyleType = (form?.theme?.fieldStyle as FieldStyleType) ?? 'underline'
  const currentNode = nodes[currentIndex]
  const progress = nodes.length > 0 ? ((currentIndex + 1) / nodes.length) * 100 : 0

  // ── Classic mode: split nodes into pages separated by page_break ──
  const classicPages: FormNode[][] = (() => {
    if (formMode !== 'classic') return []
    const pages: FormNode[][] = []
    let current: FormNode[] = []
    for (const node of nodes) {
      if (node.type === 'page_break') {
        pages.push(current)
        current = []
      } else {
        current.push(node)
      }
    }
    if (current.length > 0) pages.push(current)
    return pages
  })()
  const [classicPageIndex, setClassicPageIndex] = useState(0)
  const [classicErrors, setClassicErrors] = useState<Record<string, string>>({})
  const currentClassicPage = classicPages[classicPageIndex] ?? []
  const classicProgress = classicPages.length > 1 ? ((classicPageIndex + 1) / classicPages.length) * 100 : 100

  function handleAnswer(value: unknown) {
    if (!currentNode) return
    setValidationError(false)
    setAnswers(a => ({ ...a, [currentNode.id]: value }))
  }

  async function handleNext() {
    if (!currentNode) return
    if (currentNode.type === 'payment') return  // payment advances via onPaymentComplete

    if (!isDesignMode && currentNode.properties.required && isAnswerEmpty(currentNode, answers)) {
      setValidationError('required')
      return
    }

    if (!isDesignMode && currentNode.type === 'email') {
      const val = String(answers[currentNode.id] ?? '').trim()
      if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        setValidationError('email')
        return
      }
    }

    setValidationError(false)
    advance()
  }

  function evaluateLogic(node: FormNode, currentAnswers: Record<string, unknown>): string | null {
    const conditions = node.logic?.conditions ?? []
    for (const cond of conditions) {
      let answer = currentAnswers[cond.field]
      // normalize radio openText shape → plain value string
      if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && 'value' in answer) {
        answer = (answer as { value: string }).value
      }
      // normalize checkbox openText shape → comma-joined selected values
      if (typeof answer === 'object' && answer !== null && !Array.isArray(answer) && 'selected' in answer) {
        answer = (answer as { selected: string[] }).selected.join(',')
      }
      const val = cond.value
      let match = false
      switch (cond.operator) {
        case 'equals':      match = String(answer ?? '') === String(val); break
        case 'not_equals':  match = String(answer ?? '') !== String(val); break
        case 'contains':    match = String(answer ?? '').toLowerCase().includes(String(val).toLowerCase()); break
        case 'greater_than': match = Number(answer) > Number(val); break
        case 'less_than':    match = Number(answer) < Number(val); break
      }
      if (match) return cond.target
    }
    return null
  }

  function advance(overrideAnswers?: Record<string, unknown>) {
    if (!currentNode) return
    const effectiveAnswers = overrideAnswers ?? answers
    const target = evaluateLogic(currentNode, effectiveAnswers)
    if (target === '__end__') {
      handleSubmit(effectiveAnswers)
      return
    }
    if (target) {
      const targetIndex = nodes.findIndex(n => n.id === target)
      if (targetIndex !== -1) {
        setCurrentIndex(targetIndex)
        return
      }
    }
    if (currentIndex < nodes.length - 1) {
      setCurrentIndex(i => i + 1)
    } else {
      handleSubmit(effectiveAnswers)
    }
  }

  async function handlePaymentComplete(method: 'paypal' | 'in_person', nodeId: string) {
    const updatedAnswers = { ...answers, [nodeId]: method }
    setAnswers(updatedAnswers)

    if (formMode === 'classic') {
      // In modalità classica usa handleClassicNext ma con le risposte aggiornate
      // Se siamo sull'ultima pagina → submit, altrimenti avanza
      if (classicPageIndex < classicPages.length - 1) {
        setClassicErrors({})
        setClassicPageIndex(i => i + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        handleSubmit(updatedAnswers)
      }
    } else {
      // Modalità conversazionale: usa l'indice del nodo payment, non currentIndex
      const nodeIndex = nodes.findIndex(n => n.id === nodeId)
      const paymentNode = nodes[nodeIndex]
      if (!paymentNode) return
      const target = evaluateLogic(paymentNode, updatedAnswers)
      if (target === '__end__') {
        handleSubmit(updatedAnswers)
      } else if (target) {
        const targetIndex = nodes.findIndex(n => n.id === target)
        if (targetIndex !== -1) setCurrentIndex(targetIndex)
        else handleSubmit(updatedAnswers)
      } else if (nodeIndex < nodes.length - 1) {
        setCurrentIndex(nodeIndex + 1)
      } else {
        handleSubmit(updatedAnswers)
      }
    }
  }

  async function handleSubmit(effectiveAnswers?: Record<string, unknown>) {
    if (!formId || submitting) return
    const ans = effectiveAnswers ?? answers
    setSubmitting(true)
    try {
      // Controllo capienza in tempo reale prima di salvare
      if (linkedEvent?.totalCapacity !== null && linkedEvent?.totalCapacity !== undefined) {
        const requestedSpots = linkedEvent.attendeeFieldId
          ? Math.max(1, Number(ans[linkedEvent.attendeeFieldId] ?? 1) || 1)
          : 1
        const booked = await getEventBookedCount(formId, linkedEvent.attendeeFieldId)
        if (booked + requestedSpots > linkedEvent.totalCapacity) {
          setCapacityFull(true)
          return
        }
      }

      const paymentNode = form?.nodes?.find(n => n.type === 'payment') ?? null
      const hasPaymentNode = paymentNode !== null
      const paypalPaid = Object.values(ans).includes('paypal')
      const initialStatus = hasPaymentNode
        ? (paypalPaid ? 'completed' : 'pending')
        : 'none'
      const paymentAmount = paymentNode
        ? resolvePaymentAmount(paymentNode, form?.variables ?? [], form?.nodes ?? [], ans)
        : null
      const newResponseId = await submitResponse(
        formId, ans,
        initialStatus as 'pending' | 'completed' | 'none',
        paymentAmount,
        linkedEvent?.id ?? null,
        linkedEvent?.attendeeFieldId ?? null,
      )
      setResponseId(newResponseId)

      if (paypalPaid && pendingPaypalOrderRef.current) {
        await updateResponsePaymentStatus(newResponseId, 'completed', pendingPaypalOrderRef.current)
      }

      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  function handleClassicNext() {
    const errors: Record<string, string> = {}
    for (const node of currentClassicPage) {
      if (!isDesignMode && node.properties.required && isAnswerEmpty(node, answers)) {
        errors[node.id] = 'required'
      } else if (!isDesignMode && node.type === 'email') {
        const val = String(answers[node.id] ?? '').trim()
        if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          errors[node.id] = 'email'
        }
      }
    }
    if (Object.keys(errors).length > 0) {
      setClassicErrors(errors)
      return
    }
    setClassicErrors({})
    if (classicPageIndex < classicPages.length - 1) {
      setClassicPageIndex(i => i + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      handleSubmit()
    }
  }

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#faf8ff]">
        <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#faf8ff] gap-4" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Icon name="error" size={64} className="text-[#c4c5d5]" />
        <p className="text-[#444653] font-medium">Form non trovato</p>
        <button onClick={() => navigate('/')} className="px-5 py-2.5 bg-[#002068] text-white rounded-lg font-bold text-sm">
          Torna alla Home
        </button>
      </div>
    )
  }

  if (capacityFull && !submitted) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#faf8ff] gap-5 px-6 text-center" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-20 h-20 rounded-full bg-[#ffe9e9] flex items-center justify-center">
          <Icon name="event_busy" size={40} className="text-[#ba1a1a]" />
        </div>
        <h1 className="text-2xl font-black text-[#002068]">Posti esauriti</h1>
        <p className="text-[#444653] max-w-xs">
          Spiacenti, non ci sono più posti disponibili per questo evento.
        </p>
        <button onClick={() => navigate(-1)} className="mt-2 px-6 py-3 bg-[#002068] text-white rounded-xl font-bold text-sm">
          Torna indietro
        </button>
      </div>
    )
  }

  if (submitted) {
    const paymentNode = form.nodes?.find(n => n.type === 'payment') ?? null
    const paymentAmount = paymentNode
      ? resolvePaymentAmount(paymentNode, form.variables ?? [], form.nodes ?? [], answers)
      : null
    return (
      <ConfirmationScreen
        formTitle={form.title}
        responseId={responseId}
        formId={formId ?? ''}
        answers={answers}
        nodes={form.nodes ?? []}
        paymentAmount={paymentAmount}
        attendeeFieldId={linkedEvent?.attendeeFieldId ?? null}
      />
    )
  }

  // ── Classic mode ─────────────────────────────────────────────────────────────
  if (formMode === 'classic') {
    const endScreenNode = nodes.find(n => n.type === 'end_screen')
    return (
      <div className="min-h-screen flex flex-col items-center" style={{ backgroundColor: '#faf8ff', ...resolveBgStyle(form?.theme?.background ?? '') }}>
        <div className="w-full max-w-2xl flex flex-col flex-1 md:shadow-xl md:shadow-black/10">
        <header
          className="sticky top-0 z-40 bg-white border-b border-[#c4c5d5] px-6 flex justify-between items-center"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#002068] flex items-center justify-center">
              <span className="text-white text-xs font-black">S</span>
            </div>
            <span className="font-bold text-[#002068]">Solidando</span>
          </div>
          <button onClick={() => navigate(-1)} className="p-2 text-[#444653] hover:bg-[#f4f3fc] rounded-full transition-colors">
            <Icon name="close" size={20} />
          </button>
        </header>

        {classicPages.length > 1 && (
          <div className="h-1 bg-[#e8e7f0]">
            <div className="h-full bg-[#fe9832] transition-all duration-500" style={{ width: `${classicProgress}%` }} />
          </div>
        )}

        <div className="flex-1 px-6 py-10 bg-white">
          <div className="w-full max-w-2xl mx-auto space-y-8">
            {classicPages.length > 1 && (
              <p className="text-xs font-semibold text-[#747684] uppercase tracking-wider">
                Pagina {classicPageIndex + 1} di {classicPages.length}
              </p>
            )}
            {currentClassicPage.map(node => {
              if (node.type === 'end_screen' || node.type === 'divider') return null
              return (
                <div key={node.id} className="space-y-3">
                  <label className="block">
                    <span className="text-xl font-bold text-[#1a1b22]">
                      {node.properties.label}
                      {node.properties.required && <span className="text-[#ba1a1a] ml-1">*</span>}
                    </span>
                    {node.properties.helpText && (
                      <p className="text-sm text-[#747684] mt-1">{node.properties.helpText}</p>
                    )}
                  </label>
                  <QuestionField
                    node={node}
                    value={answers[node.id]}
                    onChange={v => { setClassicErrors(e => { const next = { ...e }; delete next[node.id]; return next }); setAnswers(a => ({ ...a, [node.id]: v })) }}
                    onPaymentComplete={(method) => handlePaymentComplete(method, node.id)}
                    onPaypalOrderId={(orderId) => { pendingPaypalOrderRef.current = orderId }}
                    variables={variables}
                    nodes={nodes}
                    answers={answers}
                    isLastStep={classicPageIndex === classicPages.length - 1}
                    workspaceId={paypalWorkspaceId}
                    paypalClientId={paypalClientId}
                    paypalSandbox={paypalSandbox}
                    fieldStyle={fieldStyle}
                  />
                  {classicErrors[node.id] && (
                    <div className="flex items-center gap-2 text-[#ba1a1a] text-sm font-medium">
                      <Icon name="error" size={16} />
                      {classicErrors[node.id] === 'email'
                        ? 'Inserisci un indirizzo email valido.'
                        : 'Questo campo è obbligatorio.'}
                    </div>
                  )}
                </div>
              )
            })}

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#e8e7f0]">
              <button
                onClick={() => { setClassicErrors({}); setClassicPageIndex(i => Math.max(0, i - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                disabled={classicPageIndex === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-bold hover:bg-[#f4f3fc] disabled:opacity-40 transition-all shrink-0"
              >
                <Icon name="arrow_back" size={18} />
                <span className="hidden sm:inline">Indietro</span>
              </button>
              <button
                onClick={handleClassicNext}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#fe9832] text-[#683700] rounded-xl font-bold hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
              >
                {submitting ? (
                  <span className="w-4 h-4 border-2 border-[#683700] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name={classicPageIndex < classicPages.length - 1 ? 'arrow_forward' : 'send'} size={20} />
                )}
                {classicPageIndex < classicPages.length - 1 ? 'Pagina successiva' : 'Invia'}
              </button>
            </div>
          </div>
        </div>

        {endScreenNode && submitted === false && (
          <footer className="border-t border-[#c4c5d5] px-6 py-3 flex justify-center bg-white">
            <span className="text-xs text-[#c4c5d5]">Powered by Solidando</span>
          </footer>
        )}
        </div>
      </div>
    )
  }

  // ── Cover / Start Screen (fullscreen) ──────────────────────────────────────
  if (showCoverScreen && form.showCover && form.cover) {
    return (
      <CoverScreen
        cover={form.cover}
        onStart={() => setShowCoverScreen(false)}
        onClose={() => navigate(-1)}
      />
    )
  }

  // ── End Screen: fullscreen, no header/footer ────────────────────────────────
  if (currentNode?.type === 'end_screen') {
    return (
      <EndScreenBlock
        node={currentNode}
        variables={variables}
        nodes={nodes}
        answers={answers}
        submitting={submitting}
        onContinue={() => {
          if (currentIndex < nodes.length - 1) advance()
          else handleSubmit()
        }}
      />
    )
  }

  const formBg = form?.theme?.background ?? ''

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ backgroundColor: '#faf8ff', ...resolveBgStyle(formBg) }}>
      <div className="w-full max-w-2xl flex flex-col flex-1 md:shadow-xl md:shadow-black/10">
      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-white border-b border-[#c4c5d5] px-6 flex justify-between items-center"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#002068] flex items-center justify-center">
            <span className="text-white text-xs font-black">S</span>
          </div>
          <span className="font-bold text-[#002068]">Solidando</span>
        </div>
        <button onClick={() => navigate(-1)} className="p-2 text-[#444653] hover:bg-[#f4f3fc] rounded-full transition-colors">
          <Icon name="close" size={20} />
        </button>
      </header>

      {/* Progress */}
      <div className="h-1 bg-[#e8e7f0]">
        <div
          className="h-full bg-[#fe9832] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-2xl">
          {nodes.length === 0 ? (
            <div className="text-center">
              <Icon name="dynamic_form" size={64} className="text-[#c4c5d5] mx-auto mb-4" />
              <p className="text-[#444653] font-medium">Questo form non ha ancora domande</p>
            </div>
          ) : currentNode ? (
            currentNode.type === 'page_break' ? (
              /* ── Page Break ── */
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 flex flex-col items-center gap-8">
                <div className="w-full flex items-center gap-4">
                  <div className="flex-1 border-t-2 border-dashed border-[#b5c4ff]" />
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#dce1ff] text-[#002068] rounded-full font-bold text-sm">
                    <Icon name="insert_page_break" size={18} />
                    Interruzione di pagina
                  </div>
                  <div className="flex-1 border-t-2 border-dashed border-[#b5c4ff]" />
                </div>
                {currentNode.properties.label && currentNode.properties.label !== `Domanda ${currentNode.position + 1}` && (
                  <h2 className="text-3xl font-black text-[#002068] text-center">{currentNode.properties.label}</h2>
                )}
                {currentNode.properties.helpText && (
                  <p className="text-lg text-[#444653] text-center">{currentNode.properties.helpText}</p>
                )}
                <button
                  onClick={() => advance()}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#002068] text-white rounded-xl font-bold text-lg hover:bg-[#003399] active:scale-95 transition-all"
                >
                  Pagina successiva
                  <Icon name="arrow_forward" size={22} />
                </button>
              </div>
            ) : currentNode.type === 'divider' ? (
              /* ── Divider: full-page break ── */
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 text-center space-y-6">
                {currentNode.properties.label && currentNode.properties.label !== `Domanda ${currentNode.position + 1}` && (
                  <h2 className="text-3xl font-black text-[#002068]">{currentNode.properties.label}</h2>
                )}
                {currentNode.properties.helpText && (
                  <p className="text-lg text-[#444653]">{currentNode.properties.helpText}</p>
                )}
                <button
                  onClick={() => advance()}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#002068] text-white rounded-xl font-bold text-lg hover:bg-[#003399] active:scale-95 transition-all"
                >
                  Avanti
                  <Icon name="arrow_forward" size={22} />
                </button>
              </div>
            ) : (
              /* ── Normal question ── */
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center gap-3 mb-6">
                  <span className="flex items-center gap-1 text-sm font-bold text-[#002068]">
                    <span>{currentIndex + 1}</span>
                    <Icon name="arrow_right_alt" size={18} />
                  </span>
                </div>

                <h2 className="text-3xl font-bold text-[#1a1b22] mb-3">
                  {currentNode.properties.label}
                  {currentNode.properties.required && <span className="text-[#ba1a1a] ml-1">*</span>}
                </h2>

                {currentNode.properties.helpText && (
                  <p className="text-[#444653] mb-6">{currentNode.properties.helpText}</p>
                )}

                <QuestionField
                  node={currentNode}
                  value={answers[currentNode.id]}
                  onChange={handleAnswer}
                  onPaymentComplete={(method) => handlePaymentComplete(method, currentNode.id)}
                  onPaypalOrderId={(orderId) => { pendingPaypalOrderRef.current = orderId }}
                  variables={variables}
                  nodes={nodes}
                  answers={answers}
                  isLastStep={currentIndex === nodes.length - 1}
                  workspaceId={paypalWorkspaceId}
                  paypalClientId={paypalClientId}
                  paypalSandbox={paypalSandbox}
                  fieldStyle={fieldStyle}
                />

                {/* Validation warning */}
                {validationError && (
                  <div className="mt-4 flex items-center gap-2 text-[#ba1a1a] text-sm font-medium">
                    <Icon name="error" size={18} />
                    {validationError === 'email'
                      ? 'Inserisci un indirizzo email valido.'
                      : 'Questo campo è obbligatorio. Compila la risposta prima di continuare.'}
                  </div>
                )}

                {currentNode.type !== 'payment' && (
                  <div className="flex items-center gap-4 mt-8">
                    <button
                      onClick={handleNext}
                      disabled={submitting}
                      className="flex items-center gap-2 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold hover:brightness-105 active:scale-95 transition-all disabled:opacity-60"
                    >
                      {submitting ? (
                        <span className="w-4 h-4 border-2 border-[#683700] border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="check" size={20} />
                      )}
                      {currentIndex < nodes.length - 1 ? 'Continua' : 'Invia'}
                    </button>
                    <span className="text-xs text-[#747684]">
                      Passaggio {currentIndex + 1} di {nodes.length}
                    </span>
                  </div>
                )}
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* Footer nav */}
      <footer
        className="sticky bottom-0 bg-white border-t border-[#c4c5d5] px-6 flex items-center justify-between"
        style={{ paddingTop: '0.75rem', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#fe9832]" />
          <span className="text-xs text-[#444653]">{Math.round(progress)}% completato</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setValidationError(false); setCurrentIndex(i => Math.max(0, i - 1)) }}
            disabled={currentIndex === 0}
            className="p-2 rounded-full border border-[#c4c5d5] text-[#444653] hover:bg-[#f4f3fc] disabled:opacity-40 transition-colors"
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex >= nodes.length - 1 || submitting}
            className="p-2 rounded-full border border-[#c4c5d5] text-[#444653] hover:bg-[#f4f3fc] disabled:opacity-40 transition-colors"
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      </footer>
      </div>
    </div>
  )
}

// ─── Cover / Start Screen ─────────────────────────────────────────────────────

interface CoverScreenProps {
  cover: Form['cover']
  onStart: () => void
  onClose: () => void
}

function CoverScreen({ cover, onStart, onClose }: CoverScreenProps) {
  if (!cover) return null
  const bgStyle = resolveCoverBg(cover)
  const textColor = cover.textColor || '#ffffff'

  return (
    <div
      className="fixed inset-0 flex flex-col animate-in fade-in duration-500"
      style={bgStyle}
    >
      {/* Overlay gradient per leggibilità */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40 pointer-events-none" />

      {/* Close button */}
      <div className="absolute right-4 z-10" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
        <button
          onClick={onClose}
          className="p-2 rounded-full transition-all"
          style={{ background: 'rgba(0,0,0,0.25)', color: textColor }}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      {/* Content centrato */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
        <h1
          className="text-4xl md:text-6xl font-black leading-tight max-w-3xl"
          style={{ color: textColor }}
        >
          {cover.title}
        </h1>
        {cover.subtitle && (
          <p
            className="text-lg md:text-2xl max-w-xl leading-relaxed"
            style={{ color: textColor, opacity: 0.85 }}
          >
            {cover.subtitle}
          </p>
        )}
        <button
          onClick={onStart}
          className="mt-4 inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-xl active:scale-95 transition-all shadow-lg"
          style={{ background: 'rgba(255,255,255,0.2)', color: textColor, backdropFilter: 'blur(8px)', border: `2px solid rgba(255,255,255,0.35)` }}
        >
          Inizia
          <Icon name="arrow_forward" size={24} />
        </button>
      </div>

      {/* Logo bottom */}
      <div className="relative z-10 pb-6 flex justify-center">
        <div className="flex items-center gap-2" style={{ color: textColor, opacity: 0.5 }}>
          <div className="w-6 h-6 rounded-full bg-current flex items-center justify-center">
            <span className="text-white text-xs font-black" style={{ color: 'inherit', mixBlendMode: 'difference' }}>S</span>
          </div>
          <span className="text-sm font-bold">Solidando</span>
        </div>
      </div>
    </div>
  )
}

function resolveBgSize(size: string | undefined): string {
  return size === 'stretch' ? '100% 100%' : (size ?? 'cover')
}

function resolveCoverBg(cover: NonNullable<Form['cover']>): React.CSSProperties {
  if (cover.backgroundType === 'gradient') {
    return { background: `linear-gradient(135deg, ${cover.gradientFrom}, ${cover.gradientTo})` }
  }
  if (cover.backgroundType === 'image' && cover.imageUrl) {
    return {
      backgroundImage: `url(${cover.imageUrl})`,
      backgroundSize: resolveBgSize(cover.imageSize),
      backgroundPosition: cover.imagePosition ?? 'center center',
      backgroundRepeat: cover.imageRepeat ?? 'no-repeat',
    }
  }
  return { backgroundColor: cover.backgroundColor }
}

// ─── Question field ───────────────────────────────────────────────────────────

type FieldStyleType = 'underline' | 'outline' | 'filled'

function resolveFieldInputClass(fieldStyle: FieldStyleType, base = ''): string {
  if (fieldStyle === 'outline') return `${base} border-2 border-[#c4c5d5] rounded-xl px-4 focus:border-[#002068] focus:outline-none bg-transparent transition-colors`
  if (fieldStyle === 'filled') return `${base} border-2 border-transparent rounded-xl px-4 bg-[#f4f3fc] focus:border-[#002068] focus:outline-none transition-colors`
  // underline (default)
  return `${base} border-b-2 border-[#c4c5d5] focus:border-[#002068] focus:outline-none bg-transparent transition-colors`
}

interface QFProps {
  node: FormNode
  value: unknown
  onChange: (v: unknown) => void
  onPaymentComplete: (method: 'paypal' | 'in_person') => void
  onPaypalOrderId: (orderId: string) => void
  variables: FormVariable[]
  nodes: FormNode[]
  answers: Record<string, unknown>
  isLastStep: boolean
  workspaceId: string
  paypalClientId: string | null
  paypalSandbox: boolean
  fieldStyle: FieldStyleType
}

function QuestionField({ node, value, onChange, onPaymentComplete, onPaypalOrderId, variables, nodes, answers, isLastStep, workspaceId, paypalClientId, paypalSandbox, fieldStyle }: QFProps) {
  const { type, properties } = node

  if (['radio', 'dropdown'].includes(type)) {
    const opts = properties.options ?? []
    // value shape: string (no openText) or { value: string; openTextValue?: string }
    const hasAnyOpenText = opts.some(o => o.openText)
    const selectedValue = hasAnyOpenText && typeof value === 'object' && value !== null
      ? (value as { value: string; openTextValue?: string }).value
      : value as string
    const openTextValue = hasAnyOpenText && typeof value === 'object' && value !== null
      ? (value as { value: string; openTextValue?: string }).openTextValue ?? ''
      : ''

    function selectOpt(v: string) {
      if (!hasAnyOpenText) { onChange(v); return }
      onChange({ value: v, openTextValue: selectedValue === v ? openTextValue : '' })
    }
    function setOpenText(text: string) {
      onChange({ value: selectedValue, openTextValue: text })
    }

    return (
      <div className="space-y-3">
        {opts.map(opt => (
          <div key={opt.value}>
            <button
              onClick={() => selectOpt(opt.value)}
              className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all ${
                selectedValue === opt.value ? 'border-[#002068] bg-[#dce1ff]' : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${selectedValue === opt.value ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'}`}>
                {selectedValue === opt.value && <div className="w-full h-full rounded-full bg-white scale-50" />}
              </div>
              <span className="font-medium text-[#1a1b22]">{opt.label}</span>
            </button>
            {opt.openText && selectedValue === opt.value && (
              <input
                autoFocus
                value={openTextValue}
                onChange={e => setOpenText(e.target.value)}
                placeholder="Specifica..."
                className="mt-2 w-full h-11 px-4 border-2 border-[#002068] rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#b5c4ff]"
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
    // value shape: string[] (no openText) or { selected: string[]; openTexts?: Record<string, string> }
    const selected: string[] = hasAnyOpenText && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { selected: string[]; openTexts?: Record<string, string> }).selected ?? []
      : (value as string[]) ?? []
    const openTexts: Record<string, string> = hasAnyOpenText && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as { selected: string[]; openTexts?: Record<string, string> }).openTexts ?? {}
      : {}

    function toggle(v: string) {
      const newSelected = selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]
      if (!hasAnyOpenText) { onChange(newSelected); return }
      const newTexts = { ...openTexts }
      if (!newSelected.includes(v)) delete newTexts[v]
      onChange({ selected: newSelected, openTexts: newTexts })
    }
    function setOpenText(v: string, text: string) {
      onChange({ selected, openTexts: { ...openTexts, [v]: text } })
    }

    return (
      <div className="space-y-3">
        {opts.map(opt => (
          <div key={opt.value}>
            <button
              onClick={() => toggle(opt.value)}
              className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-all ${
                selected.includes(opt.value) ? 'border-[#002068] bg-[#dce1ff]' : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                selected.includes(opt.value) ? 'border-[#002068] bg-[#002068]' : 'border-[#c4c5d5]'
              }`}>
                {selected.includes(opt.value) && <Icon name="check" size={14} className="text-white" />}
              </div>
              <span className="font-medium text-[#1a1b22]">{opt.label}</span>
            </button>
            {opt.openText && selected.includes(opt.value) && (
              <input
                autoFocus
                value={openTexts[opt.value] ?? ''}
                onChange={e => setOpenText(opt.value, e.target.value)}
                placeholder="Specifica..."
                className="mt-2 w-full h-11 px-4 border-2 border-[#002068] rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#b5c4ff]"
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
    const answers = (value as Record<string, string>) ?? {}
    function selectCell(rowId: string, colValue: string) {
      onChange({ ...answers, [rowId]: colValue })
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left pb-3 pr-4 text-sm font-normal text-[#747684] min-w-[120px]"></th>
              {cols.map(col => (
                <th key={col.value} className="text-center pb-3 px-2 text-sm font-semibold text-[#444653] min-w-[48px]">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id} className={ri % 2 === 0 ? 'bg-transparent' : 'bg-[#f4f3fc]'}>
                <td className="py-3 pr-4 text-sm font-medium text-[#1a1b22]">{row.label}</td>
                {cols.map(col => (
                  <td key={col.value} className="text-center py-3 px-2">
                    <button
                      onClick={() => selectCell(row.id, col.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all mx-auto flex items-center justify-center ${
                        answers[row.id] === col.value
                          ? 'border-[#002068] bg-[#002068]'
                          : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
                      }`}
                    >
                      {answers[row.id] === col.value && <div className="w-3 h-3 rounded-full bg-white" />}
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
      <div className="flex gap-2">
        {[1,2,3,4,5].map(i => (
          <button key={i} onClick={() => onChange(i)} className="transition-transform hover:scale-110">
            <Icon name="star" size={40} filled={i <= num} className={i <= num ? 'text-[#fe9832]' : 'text-[#c4c5d5]'} />
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
        className={resolveFieldInputClass(fieldStyle, 'w-full py-3 resize-none text-lg text-[#1a1b22]')}
        placeholder={properties.placeholder ?? 'Scrivi qui...'}
        rows={4}
      />
    )
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        className={resolveFieldInputClass(fieldStyle, 'h-14 text-lg text-[#1a1b22]')}
      />
    )
  }

  if (type === 'payment') {
    return (
      <PaymentField
        node={node}
        onComplete={onPaymentComplete}
        onPaypalOrderId={onPaypalOrderId}
        variables={variables}
        nodes={nodes}
        answers={answers}
        isLastStep={isLastStep}
        workspaceId={workspaceId}
        paypalClientId={paypalClientId}
        paypalSandbox={paypalSandbox}
      />
    )
  }

  return (
    <input
      type={type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'phone' ? 'tel' : 'text'}
      value={String(value ?? '')}
      onChange={e => onChange(e.target.value)}
      className={resolveFieldInputClass(fieldStyle, 'w-full h-14 text-xl text-[#1a1b22]')}
      placeholder={properties.placeholder ?? 'Scrivi la tua risposta...'}
    />
  )
}

// ─── Payment field ────────────────────────────────────────────────────────────

interface PaymentFieldProps {
  node: FormNode
  onComplete: (method: 'paypal' | 'in_person') => void
  onPaypalOrderId: (orderId: string) => void
  variables: FormVariable[]
  nodes: FormNode[]
  answers: Record<string, unknown>
  isLastStep: boolean
  workspaceId: string
  paypalClientId: string | null
  paypalSandbox: boolean
}

// PayPal EU fee: 3.49% + €0.35 fixed — gross = net / (1 - 0.0349) + 0.35
function calcPaypalGross(net: number): number {
  return Math.round(((net + 0.35) / (1 - 0.0349)) * 100) / 100
}

function PaymentField({ node, onComplete, onPaypalOrderId, variables, nodes, answers, isLastStep, workspaceId, paypalClientId, paypalSandbox }: PaymentFieldProps) {
  const amount = resolvePaymentAmount(node, variables, nodes, answers)
  const currency = node.properties.currency ?? 'EUR'
  const payInPersonEnabled = node.properties.payInPersonEnabled ?? false
  const [paypalDone, setPaypalDone] = useState(false)
  const capturedRef = useRef(false)
  const inPersonRef = useRef(false)

  const grossAmount = amount !== null ? calcPaypalGross(amount) : null
  const fmt = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(n)
  const formattedNet = amount !== null ? fmt(amount) : null
  const formattedGross = grossAmount !== null ? fmt(grossAmount) : null

  if (paypalDone) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="p-6 bg-[#e6f4ea] border-2 border-[#4caf50] rounded-2xl flex flex-col items-center gap-3 text-center">
          <Icon name="check_circle" size={48} filled className="text-[#388e3c]" />
          <div>
            <p className="font-black text-lg text-[#1b5e20]">Pagamento completato!</p>
            {formattedNet && (
              <p className="text-sm text-[#2e7d32] mt-1">{formattedNet} ricevuto tramite PayPal</p>
            )}
          </div>
        </div>
        <button
          onClick={() => onComplete('paypal')}
          className="flex items-center gap-2 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold hover:brightness-105 active:scale-95 transition-all"
        >
          <Icon name={isLastStep ? 'send' : 'arrow_forward'} size={20} />
          {isLastStep ? 'Invia iscrizione' : 'Continua'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Amount display */}
      {formattedNet && (
        <div className="p-5 bg-[#dce1ff] rounded-2xl text-center">
          <p className="text-sm text-[#444653] font-medium mb-1">Importo da pagare</p>
          <p className="text-4xl font-black text-[#002068]">{formattedNet}</p>
          {grossAmount !== null && amount !== null && grossAmount !== amount && (
            <p className="text-xs text-[#747684] mt-2">
              Con PayPal: {formattedGross} (include commissioni 3.49% + €0.35)
            </p>
          )}
        </div>
      )}

      <p className="text-sm font-semibold text-[#747684] uppercase tracking-wider">Scegli come pagare</p>

      {/* PayPal buttons via SDK */}
      {paypalClientId ? (
        <div className="rounded-xl overflow-hidden border-2 border-[#c4c5d5] p-4 bg-white">
          <p className="text-xs text-[#747684] mb-3 font-medium">Carta di credito, debito o conto PayPal</p>
          <PayPalScriptProvider key={`${paypalClientId}-${paypalSandbox}`} options={{ clientId: paypalClientId, currency, intent: 'capture' }}>
            <PayPalButtons
              style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
              createOrder={(_data, actions) =>
                actions.order.create({
                  intent: 'CAPTURE',
                  purchase_units: [{
                    amount: {
                      currency_code: currency,
                      value: grossAmount !== null ? grossAmount.toFixed(2) : '0.00',
                    },
                  }],
                })
              }
              onApprove={async (data) => {
                if (capturedRef.current) return
                capturedRef.current = true
                try {
                  const capture = httpsCallable(functions, 'capturePaypalOrder')
                  await capture({ orderID: data.orderID, workspaceId })
                  onPaypalOrderId(data.orderID)
                  setPaypalDone(true)
                } catch (err) {
                  capturedRef.current = false
                  console.error('PayPal capture error', err)
                  alert('Errore durante la conferma del pagamento. Riprova o contatta l\'organizzatore.')
                }
              }}
            />
          </PayPalScriptProvider>
        </div>
      ) : (
        <div className="w-full flex items-center gap-4 p-4 border-2 border-dashed border-[#c4c5d5] rounded-xl opacity-50">
          <Icon name="payments" size={20} className="text-[#747684]" />
          <p className="text-sm text-[#747684]">PayPal non configurato</p>
        </div>
      )}

      {/* Pay in person — advances immediately on click */}
      {payInPersonEnabled && (
        <button
          type="button"
          onClick={() => {
            if (inPersonRef.current) return
            inPersonRef.current = true
            onComplete('in_person')
          }}
          className="relative z-10 w-full flex items-center gap-4 p-4 border-2 border-[#c4c5d5] hover:border-[#002068] rounded-xl text-left transition-all group"
        >
          <div className="w-10 h-10 rounded-full bg-[#f4f3fc] group-hover:bg-[#dce1ff] flex items-center justify-center flex-shrink-0 transition-colors pointer-events-none">
            <Icon name="handshake" size={20} className="text-[#444653] group-hover:text-[#002068]" />
          </div>
          <div className="pointer-events-none">
            <p className="font-bold text-[#1a1b22]">Pagherò di persona</p>
            <p className="text-xs text-[#747684]">Pagamento in contanti o POS all'evento</p>
          </div>
          <Icon name="arrow_forward" size={18} className="ml-auto text-[#c4c5d5] group-hover:text-[#002068] transition-colors pointer-events-none" />
        </button>
      )}
    </div>
  )
}

// ─── End Screen block ─────────────────────────────────────────────────────────

interface EndScreenBlockProps {
  node: FormNode
  variables: FormVariable[]
  nodes: FormNode[]
  answers: Record<string, unknown>
  submitting: boolean
  onContinue: () => void
}

function EndScreenBlock({ node, variables, nodes, answers, submitting, onContinue }: EndScreenBlockProps) {
  const p = node.properties
  const bgType = p.backgroundType ?? 'color'
  const autoSubmitFiredRef = useRef(false)

  useEffect(() => {
    if (p.autoSubmit && !autoSubmitFiredRef.current) {
      autoSubmitFiredRef.current = true
      onContinue()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bgStyle: React.CSSProperties = bgType === 'gradient'
    ? { background: `linear-gradient(135deg, ${p.gradientFrom ?? '#002068'}, ${p.gradientTo ?? '#fe9832'})` }
    : bgType === 'image' && p.backgroundImageUrl
      ? {
          backgroundImage: `url(${p.backgroundImageUrl})`,
          backgroundSize: resolveBgSize(p.backgroundImageSize),
          backgroundPosition: p.backgroundImagePosition ?? 'center center',
          backgroundRepeat: p.backgroundImageRepeat ?? 'no-repeat',
        }
      : { backgroundColor: p.backgroundColor ?? '#002068' }

  const textColor = p.textColor ?? '#ffffff'
  const rawMessage = p.message || '<p>Grazie per aver compilato il form!</p>'
  const resolvedHtml = resolveTemplate(rawMessage, variables, nodes, answers)
  const buttonUrl = p.buttonUrl
  const imageOpacity = p.backgroundImageOpacity ?? 100

  function handleClick() {
    if (buttonUrl) {
      window.location.href = buttonUrl
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center animate-in fade-in duration-500"
      style={bgStyle}
    >
      {/* Overlay opacità immagine */}
      {bgType === 'image' && p.backgroundImageUrl && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{ opacity: 1 - imageOpacity / 100 }}
        />
      )}
      {/* Overlay gradient leggibilità */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-8 text-center max-w-2xl">
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
          {submitting
            ? <span className="w-10 h-10 border-4 border-current border-t-transparent rounded-full animate-spin" style={{ color: textColor }} />
            : <Icon name="celebration" size={44} />}
        </div>
        <div
          className="end-screen-content text-xl md:text-2xl leading-relaxed"
          style={{ color: textColor }}
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
        {buttonUrl && (
        <button
          onClick={handleClick}
          disabled={submitting}
          className="flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-xl active:scale-95 transition-all disabled:opacity-60 shadow-lg"
          style={{ background: 'rgba(255,255,255,0.2)', color: textColor, backdropFilter: 'blur(8px)', border: '2px solid rgba(255,255,255,0.35)' }}
        >
          <Icon name="open_in_new" size={24} />
          {p.buttonLabel || 'Torna al sito'}
        </button>
        )}
      </div>
    </div>
  )
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

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

    // background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    // header bar
    ctx.fillStyle = '#002068'
    ctx.fillRect(0, 0, W, 80)
    ctx.fillStyle = '#8aa4ff'
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText('SOLIDANDO · BIGLIETTO', 20, 24)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${formTitle.length > 32 ? 16 : 20}px sans-serif`
    const titleTrunc = formTitle.length > 42 ? formTitle.slice(0, 42) + '…' : formTitle
    ctx.fillText(titleTrunc, 20, 60)

    // QR
    const qrImg = new Image()
    qrImg.src = qrSrc
    qrImg.onload = () => {
      const qrSize = 160
      const qrX = (W - qrSize) / 2
      ctx.drawImage(qrImg, qrX, 90, qrSize, qrSize)

      // dashed separator
      if (infoH > 0) {
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#e8e7f0'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(20, 262); ctx.lineTo(W - 20, 262)
        ctx.stroke()
        ctx.setLineDash([])

        // info lines
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

      // response ID at bottom
      ctx.fillStyle = '#c4c5d5'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(responseId, W / 2, H - 12)

      resolve(canvas.toDataURL('image/png'))
    }
  })
}

function ConfirmationScreen({
  formTitle,
  responseId,
  formId,
  answers,
  nodes,
  paymentAmount,
  attendeeFieldId,
}: {
  formTitle: string
  responseId: string | null
  formId: string
  answers: Record<string, unknown>
  nodes: FormNode[]
  paymentAmount: number | null
  attendeeFieldId?: string | null
}) {
  const checkinUrl = responseId
    ? `${window.location.origin}/admin/checkin/${formId}?scan=${responseId}`
    : null

  const [qrSrc, setQrSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!checkinUrl) return
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(checkinUrl, { width: 200, margin: 1 }).then(setQrSrc)
    })
  }, [checkinUrl])

  // Ricava le info da mostrare nel biglietto
  const ticketLines: { label: string; value: string }[] = []

  // Nome: primo campo di testo/short_text/name compilato
  const nameNode = nodes.find(n =>
    ['short_text', 'name', 'text', 'email'].includes(n.type) && answers[n.id]
  )
  if (nameNode && answers[nameNode.id]) {
    ticketLines.push({ label: nameNode.properties.label || 'Nome', value: String(answers[nameNode.id]) })
  }

  // Numero partecipanti
  if (attendeeFieldId && answers[attendeeFieldId]) {
    const count = Number(answers[attendeeFieldId])
    if (!isNaN(count) && count > 0) {
      ticketLines.push({ label: 'Partecipanti', value: String(count) })
    }
  }

  // Importo
  if (paymentAmount != null && paymentAmount > 0) {
    ticketLines.push({ label: 'Importo', value: `€ ${paymentAmount.toFixed(2)}` })
  }

  async function downloadTicket() {
    if (!qrSrc || !responseId) return
    const dataUrl = await buildTicketCanvas(qrSrc, formTitle, responseId, ticketLines)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `biglietto-${responseId.slice(0, 8)}.png`
    a.click()
  }

  async function handleShare() {
    if (!responseId || !checkinUrl) return
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Biglietto: ${formTitle}`,
          text: `Il tuo biglietto per "${formTitle}". Codice: ${responseId}`,
          url: checkinUrl,
        })
      } catch { /* annullato */ }
    } else {
      await navigator.clipboard.writeText(checkinUrl)
      alert('Link biglietto copiato negli appunti!')
    }
  }

  return (
    <div
      className="min-h-screen bg-[#faf8ff] flex flex-col items-center justify-center px-6"
      style={{ paddingTop: 'max(2.5rem, env(safe-area-inset-top) + 1rem)', paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom) + 1rem)' }}
    >
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-[#dce1ff] flex items-center justify-center mx-auto mb-6">
          <Icon name="check_circle" size={48} filled className="text-[#002068]" />
        </div>
        <h1 className="text-3xl font-black text-[#002068] mb-2">Iscrizione Confermata!</h1>
        <p className="text-[#444653] mb-8">
          Grazie per aver compilato "{formTitle}". Riceverai una email di conferma a breve.
        </p>

        {/* Ticket */}
        <div className="bg-white rounded-2xl border-2 border-[#c4c5d5] overflow-hidden shadow-lg mb-8">
          <div className="bg-[#002068] px-6 py-4 text-left">
            <p className="text-xs font-bold text-[#8aa4ff] uppercase tracking-wider">Solidando · Biglietto</p>
            <h3 className="text-xl font-bold text-white mt-1">{formTitle}</h3>
          </div>
          <div className="relative h-0">
            <div className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-[#faf8ff] border-2 border-[#c4c5d5]" />
            <div className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-[#faf8ff] border-2 border-[#c4c5d5]" />
          </div>

          <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-3">
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
              <div className="px-6 py-4 space-y-2">
                {ticketLines.map(line => (
                  <div key={line.label} className="flex items-center justify-between text-sm">
                    <span className="text-[#747684]">{line.label}</span>
                    <span className="font-bold text-[#1a1b22]">{line.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={downloadTicket}
            disabled={!responseId || !qrSrc}
            className="w-full py-3 bg-[#002068] text-white rounded-xl font-bold hover:bg-[#003399] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="download" size={20} />
            Scarica biglietto (PNG)
          </button>
          <button
            onClick={handleShare}
            disabled={!responseId}
            className="w-full py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Icon name="share" size={20} />
            Condividi link biglietto
          </button>
          <button
            onClick={() => window.location.href = '/my'}
            className="w-full py-3 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-bold hover:bg-[#f4f3fc] transition-all"
          >
            Torna alla Home
          </button>
        </div>
      </div>
    </div>
  )
}
