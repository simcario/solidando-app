import { useState } from 'react'
import { nanoid } from 'nanoid'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../../firebase/config'
import Icon from '../../../components/ui/Icon'
import { showToast } from '../../../components/ui/Toast'
import { saveFormActions } from '../../../firebase/workspace'
import { useBuilderStore } from '../../../stores/builderStore'
import { useAuthStore } from '../../../stores/authStore'
import type { FormAction, EmailActionConfig, WebhookActionConfig, NotifySubmitterConfig } from '../../../types/form'

function resolveWorkspaceId(profile: ReturnType<typeof useAuthStore.getState>['profile']): string {
  if (!profile) return ''
  return profile.workspaceIds?.[0] || profile.uid
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultConfig(type: FormAction['type']): FormAction['config'] {
  if (type === 'send_email') {
    return { to: [], subject: 'Nuova risposta: {{form_title}}', body: '', replyTo: '' } as EmailActionConfig
  }
  if (type === 'webhook') {
    return { url: '', method: 'POST', headers: {} } as WebhookActionConfig
  }
  return { emailFieldId: '', subject: 'Conferma iscrizione', body: '' } as NotifySubmitterConfig
}

const ACTION_LABELS: Record<FormAction['type'], { icon: string; label: string; desc: string }> = {
  send_email: { icon: 'mail', label: 'Invia email', desc: 'Email a indirizzi fissi con i dati della risposta' },
  webhook: { icon: 'webhook', label: 'Webhook HTTP', desc: 'POST/GET dei dati a un URL esterno' },
  notify_submitter: { icon: 'mark_email_read', label: 'Notifica compilatore', desc: 'Email automatica al campo email del form' },
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function ActionsPanel() {
  const { formId, actions, setActions, nodes } = useBuilderStore()
  const { profile } = useAuthStore()
  const workspaceId = resolveWorkspaceId(profile)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)

  const emailNodes = nodes.filter(n => n.type === 'email')

  function addAction(type: FormAction['type']) {
    const newAction: FormAction = {
      id: nanoid(),
      type,
      enabled: true,
      config: defaultConfig(type),
    }
    setActions([...actions, newAction])
    setExpandedId(newAction.id)
  }

  function updateAction(id: string, patch: Partial<FormAction>) {
    setActions(actions.map(a => a.id === id ? { ...a, ...patch } : a))
  }

  function updateConfig(id: string, patch: Partial<FormAction['config']>) {
    setActions(actions.map(a => a.id === id ? { ...a, config: { ...a.config, ...patch } } : a))
  }

  function removeAction(id: string) {
    setActions(actions.filter(a => a.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function handleSave() {
    if (!formId) return
    setSaving(true)
    try {
      await saveFormActions(formId, actions)
      showToast('Azioni salvate', 'success')
    } catch {
      showToast('Errore nel salvataggio', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestEmail(action: FormAction) {
    if (!workspaceId) return
    setTestingId(action.id)
    try {
      const fns = getFunctions(app, 'europe-west1')
      const sendTestEmail = httpsCallable(fns, 'sendTestEmail')
      const config = action.config as EmailActionConfig | NotifySubmitterConfig
      const to = action.type === 'send_email'
        ? (config as EmailActionConfig).to?.[0] ?? ''
        : ''
      const result = await sendTestEmail({
        workspaceId,
        actionType: action.type,
        subject: config.subject,
        body: config.body,
        to: to || undefined,
      })
      const data = result.data as { to: string }
      showToast(`Email di test inviata a ${data.to}`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore invio test'
      showToast(msg, 'error')
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[#c4c5d5] bg-[#f4f3fc] flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Azioni all'invio</h3>
        <Icon name="bolt" size={18} className="text-[#c4c5d5]" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Existing actions */}
        {actions.length === 0 && (
          <div className="text-center py-8">
            <Icon name="bolt" size={40} className="text-[#c4c5d5] mx-auto mb-3" />
            <p className="text-sm text-[#747684] font-medium">Nessuna azione configurata</p>
            <p className="text-xs text-[#c4c5d5] mt-1">Aggiungi un'azione per automatizzare l'invio</p>
          </div>
        )}

        {actions.map(action => {
          const meta = ACTION_LABELS[action.type]
          const isOpen = expandedId === action.id
          return (
            <div key={action.id} className="bg-white border border-[#c4c5d5] rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-3 p-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${action.enabled ? 'bg-[#dce1ff]' : 'bg-[#f4f3fc]'}`}>
                  <Icon name={meta.icon} size={16} className={action.enabled ? 'text-[#002068]' : 'text-[#c4c5d5]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#1a1b22] truncate">{meta.label}</p>
                  <p className="text-xs text-[#747684] truncate">{meta.desc}</p>
                </div>
                {/* Toggle enabled */}
                <button
                  onClick={() => updateAction(action.id, { enabled: !action.enabled })}
                  className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${action.enabled ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${action.enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
                {(action.type === 'send_email' || action.type === 'notify_submitter') && (
                  <button
                    onClick={() => handleTestEmail(action)}
                    disabled={testingId === action.id}
                    title="Invia email di test con dati mock"
                    className="p-1 text-[#747684] hover:text-[#002068] transition-colors disabled:opacity-40"
                  >
                    <Icon name={testingId === action.id ? 'hourglass_empty' : 'send'} size={16} />
                  </button>
                )}
                <button
                  onClick={() => setExpandedId(isOpen ? null : action.id)}
                  className="p-1 text-[#747684] hover:text-[#002068] transition-colors"
                >
                  <Icon name={isOpen ? 'expand_less' : 'expand_more'} size={20} />
                </button>
                <button
                  onClick={() => removeAction(action.id)}
                  className="p-1 text-[#747684] hover:text-[#ba1a1a] transition-colors"
                >
                  <Icon name="delete" size={16} />
                </button>
              </div>

              {/* Config editor */}
              {isOpen && (
                <div className="border-t border-[#e8e7f0] p-3 space-y-3 bg-[#faf8ff]">
                  {action.type === 'send_email' && (
                    <EmailConfig
                      config={action.config as EmailActionConfig}
                      onChange={patch => updateConfig(action.id, patch)}
                    />
                  )}
                  {action.type === 'webhook' && (
                    <WebhookConfig
                      config={action.config as WebhookActionConfig}
                      onChange={patch => updateConfig(action.id, patch)}
                    />
                  )}
                  {action.type === 'notify_submitter' && (
                    <NotifySubmitterConfigEditor
                      config={action.config as NotifySubmitterConfig}
                      emailNodes={emailNodes}
                      onChange={patch => updateConfig(action.id, patch)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add action */}
        {(() => {
          const usedTypes = new Set(actions.map(a => a.type))
          const availableEntries = (Object.entries(ACTION_LABELS) as [FormAction['type'], typeof ACTION_LABELS[FormAction['type']]][]).filter(([type]) => !usedTypes.has(type))
          if (availableEntries.length === 0) return null
          return (
            <div className="space-y-2">
              <p className="text-xs font-bold text-[#747684] uppercase tracking-wider">Aggiungi azione</p>
              {availableEntries.map(([type, meta]) => (
                <button
                  key={type}
                  onClick={() => addAction(type)}
                  className="w-full flex items-center gap-3 p-3 border border-dashed border-[#c4c5d5] rounded-xl hover:border-[#002068] hover:bg-[#f4f3fc] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#f4f3fc] group-hover:bg-[#dce1ff] flex items-center justify-center flex-shrink-0 transition-colors">
                    <Icon name={meta.icon} size={16} className="text-[#444653] group-hover:text-[#002068]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-[#1a1b22]">{meta.label}</p>
                    <p className="text-xs text-[#747684]">{meta.desc}</p>
                  </div>
                  <Icon name="add" size={18} className="ml-auto text-[#c4c5d5] group-hover:text-[#002068] transition-colors" />
                </button>
              ))}
            </div>
          )
        })()}

        {/* Hint about template variables */}
        <div className="p-3 bg-[#dce1ff] bg-opacity-40 border border-[#b5c4ff] rounded-xl">
          <p className="text-xs font-semibold text-[#002068] mb-1">Variabili template</p>
          <p className="text-xs text-[#444653] mb-1.5">
            Risposte: <code className="bg-white px-1 rounded">{'{{id_campo}}'}</code> o <code className="bg-white px-1 rounded">{'{{label_campo}}'}</code>
          </p>
          <p className="text-xs text-[#444653] mb-1">
            Di sistema: <code className="bg-white px-1 rounded">{'{{form_title}}'}</code> · <code className="bg-white px-1 rounded">{'{{nome_compilatore}}'}</code> · <code className="bg-white px-1 rounded">{'{{response_id}}'}</code>
          </p>
          <p className="text-xs text-[#444653]">
            <code className="bg-white px-1 rounded">{'{{ticket_url}}'}</code> · <code className="bg-white px-1 rounded">{'{{my_portal_url}}'}</code>
          </p>
          <p className="text-[10px] text-[#747684] mt-1.5">Se il corpo è vuoto, viene usata la tabella risposte automatica.</p>
        </div>
      </div>

      <div className="p-4 border-t border-[#c4c5d5] bg-[#faf8ff] flex-shrink-0">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-11 bg-[#002068] text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#003399] active:scale-95 transition-all disabled:opacity-60 text-sm"
        >
          <Icon name="save" size={18} />
          {saving ? 'Salvataggio...' : 'Salva Azioni'}
        </button>
      </div>
    </div>
  )
}

// ─── Config sub-editors ───────────────────────────────────────────────────────

function EmailConfig({ config, onChange }: { config: EmailActionConfig; onChange: (p: Partial<EmailActionConfig>) => void }) {
  const [toInput, setToInput] = useState('')

  function addTo() {
    const email = toInput.trim()
    if (!email || config.to.includes(email)) return
    onChange({ to: [...config.to, email] })
    setToInput('')
  }

  return (
    <div className="space-y-3">
      <Field label="Destinatari">
        <div className="flex gap-2">
          <input
            type="email"
            value={toInput}
            onChange={e => setToInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTo())}
            placeholder="email@esempio.it"
            className={inputCls}
          />
          <button onClick={addTo} className="px-3 py-2 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors">
            <Icon name="add" size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {config.to.map(email => (
            <span key={email} className="flex items-center gap-1 px-2 py-0.5 bg-[#dce1ff] text-[#002068] text-xs rounded-full font-medium">
              {email}
              <button onClick={() => onChange({ to: config.to.filter(e => e !== email) })} className="hover:text-[#ba1a1a]">
                <Icon name="close" size={12} />
              </button>
            </span>
          ))}
        </div>
      </Field>
      <Field label="Oggetto">
        <input value={config.subject} onChange={e => onChange({ subject: e.target.value })} className={inputCls} placeholder="Nuova risposta: {{nome}}" />
      </Field>
      <Field label="Reply-To (opzionale)">
        <input type="email" value={config.replyTo ?? ''} onChange={e => onChange({ replyTo: e.target.value })} className={inputCls} placeholder="risposta@esempio.it" />
      </Field>
      <Field label="Corpo email (HTML supportato)">
        <textarea
          value={config.body}
          onChange={e => onChange({ body: e.target.value })}
          rows={5}
          className={`${inputCls} resize-y font-mono text-xs`}
          placeholder={'<p>Ciao, hai ricevuto una nuova risposta:</p>\n<p>Nome: {{nome}}</p>'}
        />
      </Field>
    </div>
  )
}

function WebhookConfig({ config, onChange }: { config: WebhookActionConfig; onChange: (p: Partial<WebhookActionConfig>) => void }) {
  return (
    <div className="space-y-3">
      <Field label="URL">
        <input value={config.url} onChange={e => onChange({ url: e.target.value })} className={inputCls} placeholder="https://..." />
      </Field>
      <Field label="Metodo">
        <div className="flex gap-2">
          {(['POST', 'GET'] as const).map(m => (
            <button
              key={m}
              onClick={() => onChange({ method: m })}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${config.method === m ? 'bg-[#002068] text-white border-[#002068]' : 'bg-white text-[#444653] border-[#c4c5d5] hover:border-[#002068]'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

function NotifySubmitterConfigEditor({
  config, emailNodes, onChange,
}: {
  config: NotifySubmitterConfig
  emailNodes: { id: string; properties: { label: string } }[]
  onChange: (p: Partial<NotifySubmitterConfig>) => void
}) {
  return (
    <div className="space-y-3">
      <Field label="Campo email del compilatore">
        <select value={config.emailFieldId} onChange={e => onChange({ emailFieldId: e.target.value })} className={inputCls}>
          <option value="">— seleziona campo email —</option>
          {emailNodes.map(n => (
            <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
          ))}
        </select>
        {emailNodes.length === 0 && (
          <p className="text-xs text-[#ba1a1a] mt-1">Aggiungi un campo "Email" al form per usare questa azione.</p>
        )}
      </Field>
      <Field label="Oggetto">
        <input value={config.subject} onChange={e => onChange({ subject: e.target.value })} className={inputCls} placeholder="Conferma iscrizione" />
      </Field>
      <Field label="Corpo (lascia vuoto per tabella automatica)">
        <textarea
          value={config.body}
          onChange={e => onChange({ body: e.target.value })}
          rows={4}
          className={`${inputCls} resize-y font-mono text-xs`}
          placeholder="<p>Grazie {{nome}}, ci vediamo all'evento!</p>"
        />
        <p className="text-[10px] text-[#747684] leading-relaxed">
          Variabili: <code>{'{{form_title}}'}</code> · <code>{'{{ticket_url}}'}</code> · <code>{'{{my_portal_url}}'}</code> · <code>{'{{response_id}}'}</code> · <code>{'{{label_campo}}'}</code>
        </p>
      </Field>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full h-9 px-3 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
