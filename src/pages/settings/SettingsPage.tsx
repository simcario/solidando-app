import { useEffect, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import ImageUpload from '../../components/ui/ImageUpload'
import { useAuthStore } from '../../stores/authStore'
import { getWorkspaceSettings, saveSmtpConfig, savePaypalConfig, saveBrandingConfig, saveEmailTemplates } from '../../firebase/workspace'
import { showToast } from '../../components/ui/Toast'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '../../firebase/config'
import type { SmtpConfig, PaypalConfig, WorkspaceEmailTemplates, EmailTemplate } from '../../types/form'
import NotificationsAdminPanel from '../../components/notifications/NotificationsAdminPanel'

function resolveWorkspaceId(profile: ReturnType<typeof useAuthStore.getState>['profile']): string {
  if (!profile) return ''
  return profile.workspaceIds?.[0] || profile.uid
}

const DEFAULT_SMTP: SmtpConfig = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromName: '',
  fromEmail: '',
}

const DEFAULT_PAYPAL: PaypalConfig = {
  clientId: '',
  clientSecret: '',
  sandbox: true,
}

const DEFAULT_EMAIL_TEMPLATES: WorkspaceEmailTemplates = {
  adminNotification: {
    subject: 'Nuova risposta: {{form_title}}',
    body: '<p>Hai ricevuto una nuova risposta al form <strong>{{form_title}}</strong>.</p>\n<p>ID risposta: {{response_id}}</p>\n<p>{{all_answers}}</p>',
  },
  submitterConfirmation: {
    subject: 'Conferma iscrizione: {{form_title}}',
    body: '<p>Grazie per aver compilato il form <strong>{{form_title}}</strong>!</p>\n<p>ID risposta: {{response_id}}</p>\n<p>Puoi visualizzare il tuo biglietto qui: <a href="{{ticket_url}}">{{ticket_url}}</a></p>',
  },
}

type Tab = 'profilo' | 'integrazioni' | 'branding' | 'notifiche' | 'avanzate'

const TABS: { id: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'profilo', label: 'Profilo', icon: 'person' },
  { id: 'integrazioni', label: 'Integrazioni', icon: 'cable' },
  { id: 'branding', label: 'Branding', icon: 'palette' },
  { id: 'notifiche', label: 'Notifiche', icon: 'notifications_active', adminOnly: true },
  { id: 'avanzate', label: 'Avanzate', icon: 'settings' },
]

export default function SettingsPage() {
  const { profile } = useAuthStore()
  const workspaceId = resolveWorkspaceId(profile)

  const [activeTab, setActiveTab] = useState<Tab>('profilo')

  const [smtp, setSmtp] = useState<SmtpConfig>(DEFAULT_SMTP)
  const [loadingSmtp, setLoadingSmtp] = useState(true)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [paypal, setPaypal] = useState<PaypalConfig>(DEFAULT_PAYPAL)
  const [savingPaypal, setSavingPaypal] = useState(false)
  const [showPaypalSecret, setShowPaypalSecret] = useState(false)

  // Email templates state
  const [emailTemplates, setEmailTemplates] = useState<WorkspaceEmailTemplates>(DEFAULT_EMAIL_TEMPLATES)
  const [savingTemplates, setSavingTemplates] = useState(false)
  const [testingTemplate, setTestingTemplate] = useState<keyof WorkspaceEmailTemplates | null>(null)

  // Branding state
  const [appName, setAppName] = useState('Solidando')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#002068')
  const [savingBranding, setSavingBranding] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (!workspaceId) {
      setLoadingSmtp(false)
      return
    }
    setLoadingSmtp(true)
    getWorkspaceSettings(workspaceId).then(ws => {
      if (ws.smtp) setSmtp(ws.smtp)
      if (ws.paypal) setPaypal(ws.paypal)
      if (ws.branding?.appName) setAppName(ws.branding.appName)
      if (ws.branding?.logoUrl) setLogoUrl(ws.branding.logoUrl)
      if (ws.branding?.primaryColor) setPrimaryColor(ws.branding.primaryColor)
      if (ws.emailTemplates) {
        setEmailTemplates(t => ({
          adminNotification: ws.emailTemplates?.adminNotification ?? t.adminNotification,
          submitterConfirmation: ws.emailTemplates?.submitterConfirmation ?? t.submitterConfirmation,
        }))
      }
      setLoadingSmtp(false)
    })
  }, [workspaceId, profile])

  function patchSmtp(patch: Partial<SmtpConfig>) {
    setSmtp(s => ({ ...s, ...patch }))
  }

  async function handleSaveSmtp() {
    if (!workspaceId) return
    setSavingSmtp(true)
    try {
      await saveSmtpConfig(workspaceId, smtp)
      showToast('Configurazione SMTP salvata', 'success')
    } catch {
      showToast('Errore nel salvataggio SMTP', 'error')
    } finally {
      setSavingSmtp(false)
    }
  }

  async function handleTestSmtp() {
    setTestingSmtp(true)
    try {
      const functions = getFunctions(app, 'europe-west1')
      const testSmtp = httpsCallable(functions, 'testSmtp')
      await testSmtp({ smtp })
      showToast('Connessione SMTP riuscita!', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore SMTP'
      showToast(msg, 'error')
    } finally {
      setTestingSmtp(false)
    }
  }

  async function handleSavePaypal() {
    if (!workspaceId) return
    setSavingPaypal(true)
    try {
      await savePaypalConfig(workspaceId, paypal)
      showToast('Configurazione PayPal salvata', 'success')
    } catch {
      showToast('Errore nel salvataggio PayPal', 'error')
    } finally {
      setSavingPaypal(false)
    }
  }

  async function handleSaveEmailTemplates() {
    if (!workspaceId) return
    setSavingTemplates(true)
    try {
      await saveEmailTemplates(workspaceId, emailTemplates)
      showToast('Template email salvati', 'success')
    } catch {
      showToast('Errore nel salvataggio template', 'error')
    } finally {
      setSavingTemplates(false)
    }
  }

  function patchTemplate(key: keyof WorkspaceEmailTemplates, patch: Partial<EmailTemplate>) {
    setEmailTemplates(t => ({ ...t, [key]: { ...t[key], ...patch } }))
  }

  async function handleTestTemplate(key: keyof WorkspaceEmailTemplates) {
    if (!workspaceId) return
    setTestingTemplate(key)
    try {
      const functions = getFunctions(app, 'europe-west1')
      const sendTestEmail = httpsCallable(functions, 'sendTestEmail')
      const tpl = emailTemplates[key]!
      const result = await sendTestEmail({
        workspaceId,
        actionType: key,
        subject: tpl.subject,
        body: tpl.body,
      })
      const data = result.data as { to: string }
      showToast(`Email di test inviata a ${data.to}`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore invio test'
      showToast(msg, 'error')
    } finally {
      setTestingTemplate(null)
    }
  }

  async function handleSaveBranding() {
    if (!workspaceId) return
    setSavingBranding(true)
    try {
      await saveBrandingConfig(workspaceId, { appName, logoUrl: logoUrl || undefined, primaryColor })
      showToast('Branding salvato', 'success')
    } catch {
      showToast('Errore nel salvataggio branding', 'error')
    } finally {
      setSavingBranding(false)
    }
  }

  const visibleTabs = TABS.filter(t => !t.adminOnly || profile?.role === 'admin')

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-4xl font-black text-[#002068]">Impostazioni</h1>
        <p className="text-[#444653] mt-1">Gestisci profilo, workspace e preferenze</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-[#c4c5d5] overflow-x-auto">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-[#002068] text-[#002068]'
                : 'border-transparent text-[#747684] hover:text-[#1a1b22] hover:border-[#c4c5d5]'
            }`}
          >
            <Icon name={tab.icon} size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl">
        {/* ── PROFILO ── */}
        {activeTab === 'profilo' && (
          <div className="space-y-6">
            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-4 flex items-center gap-2">
                <Icon name="person" size={20} className="text-[#002068]" />
                Profilo Utente
              </h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[#fe9832] flex items-center justify-center text-2xl font-black text-[#683700]">
                  {profile?.name?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-[#1a1b22]">{profile?.name}</p>
                  <p className="text-sm text-[#444653]">{profile?.email}</p>
                  <span className="text-xs bg-[#dce1ff] text-[#002068] px-2 py-0.5 rounded-full font-semibold capitalize">
                    {profile?.plan ?? 'free'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input defaultValue={profile?.name ?? ''} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input defaultValue={profile?.email ?? ''} disabled className="w-full h-11 px-4 bg-[#e8e7f0] border border-[#c4c5d5] rounded-lg text-sm text-[#444653]" />
                </div>
              </div>
              <button className="mt-4 px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors">
                Salva modifiche
              </button>
            </section>

            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-4 flex items-center gap-2">
                <Icon name="corporate_fare" size={20} className="text-[#002068]" />
                Workspace
              </h2>
              <div className="flex items-center justify-between p-4 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
                <div>
                  <p className="font-bold text-[#1a1b22]">Workspace Principale</p>
                  <p className="text-sm text-[#444653]">1 membro · Piano Free</p>
                </div>
                <button className="text-sm font-semibold text-[#002068] hover:underline">Gestisci</button>
              </div>
            </section>
          </div>
        )}

        {/* ── INTEGRAZIONI ── */}
        {activeTab === 'integrazioni' && (
          <div className="space-y-6">
            {/* SMTP */}
            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-1 flex items-center gap-2">
                <Icon name="mail" size={20} className="text-[#002068]" />
                Configurazione SMTP
              </h2>
              <p className="text-sm text-[#747684] mb-5">
                Usata per inviare email dalle azioni del form. Le credenziali sono cifrate in Firestore e mai esposte al client.
              </p>

              {loadingSmtp ? (
                <div className="flex items-center gap-2 text-sm text-[#747684]">
                  <div className="w-4 h-4 border-2 border-[#002068] border-t-transparent rounded-full animate-spin" />
                  Caricamento configurazione...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className={labelCls}>Host SMTP</label>
                      <input value={smtp.host} onChange={e => patchSmtp({ host: e.target.value })} placeholder="smtp.gmail.com" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Porta</label>
                      <input type="number" value={smtp.port} onChange={e => patchSmtp({ port: +e.target.value })} className={inputCls} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#f4f3fc] rounded-lg border border-[#c4c5d5]">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1b22]">TLS / SSL (porta 465)</p>
                      <p className="text-xs text-[#747684]">Disabilita per STARTTLS (porta 587)</p>
                    </div>
                    <button onClick={() => patchSmtp({ secure: !smtp.secure })} className={`w-11 h-6 rounded-full relative transition-colors ${smtp.secure ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${smtp.secure ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelCls}>Utente SMTP</label>
                      <input value={smtp.user} onChange={e => patchSmtp({ user: e.target.value })} placeholder="user@esempio.it" autoComplete="off" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Password</label>
                      <div className="relative">
                        <input type={showPassword ? 'text' : 'password'} value={smtp.password} onChange={e => patchSmtp({ password: e.target.value })} placeholder="••••••••" autoComplete="new-password" className={`${inputCls} pr-10`} />
                        <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#747684] hover:text-[#002068] transition-colors">
                          <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={18} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={labelCls}>Nome mittente</label>
                      <input value={smtp.fromName} onChange={e => patchSmtp({ fromName: e.target.value })} placeholder="Solidando" className={inputCls} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelCls}>Email mittente</label>
                      <input type="email" value={smtp.fromEmail} onChange={e => patchSmtp({ fromEmail: e.target.value })} placeholder="noreply@esempio.it" className={inputCls} />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={handleSaveSmtp} disabled={savingSmtp} className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors disabled:opacity-60">
                      <Icon name="save" size={16} />
                      {savingSmtp ? 'Salvataggio...' : 'Salva SMTP'}
                    </button>
                    <button onClick={handleTestSmtp} disabled={testingSmtp || !smtp.host || !smtp.user || !smtp.password} className="flex items-center gap-2 px-5 py-2.5 border border-[#c4c5d5] text-[#444653] rounded-lg text-sm font-bold hover:bg-[#f4f3fc] transition-colors disabled:opacity-40">
                      {testingSmtp ? <span className="w-4 h-4 border-2 border-[#444653] border-t-transparent rounded-full animate-spin" /> : <Icon name="send" size={16} />}
                      {testingSmtp ? 'Test in corso...' : 'Testa connessione'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* PayPal */}
            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-1 flex items-center gap-2">
                <Icon name="payments" size={20} className="text-[#002068]" />
                Configurazione PayPal
              </h2>
              <p className="text-sm text-[#747684] mb-5">
                Credenziali per ricevere pagamenti nei form. Il Client Secret viene usato solo lato server e non viene mai esposto al browser.
              </p>

              {loadingSmtp ? (
                <div className="flex items-center gap-2 text-sm text-[#747684]">
                  <div className="w-4 h-4 border-2 border-[#002068] border-t-transparent rounded-full animate-spin" />
                  Caricamento configurazione...
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-[#f4f3fc] rounded-lg border border-[#c4c5d5]">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1b22]">Modalità Sandbox</p>
                      <p className="text-xs text-[#747684]">Attiva per test; disattiva per pagamenti reali</p>
                    </div>
                    <button onClick={() => setPaypal(p => ({ ...p, sandbox: !p.sandbox }))} className={`w-11 h-6 rounded-full relative transition-colors ${paypal.sandbox ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${paypal.sandbox ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className={labelCls}>Client ID</label>
                    <input value={paypal.clientId} onChange={e => setPaypal(p => ({ ...p, clientId: e.target.value }))} placeholder="AcTucDzr..." autoComplete="off" className={inputCls} />
                  </div>

                  <div className="space-y-1">
                    <label className={labelCls}>Client Secret</label>
                    <div className="relative">
                      <input type={showPaypalSecret ? 'text' : 'password'} value={paypal.clientSecret} onChange={e => setPaypal(p => ({ ...p, clientSecret: e.target.value }))} placeholder="••••••••" autoComplete="new-password" className={`${inputCls} pr-10`} />
                      <button type="button" onClick={() => setShowPaypalSecret(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#747684] hover:text-[#002068] transition-colors">
                        <Icon name={showPaypalSecret ? 'visibility_off' : 'visibility'} size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button onClick={handleSavePaypal} disabled={savingPaypal} className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors disabled:opacity-60">
                      <Icon name="save" size={16} />
                      {savingPaypal ? 'Salvataggio...' : 'Salva PayPal'}
                    </button>
                  </div>
                </div>
              )}
            </section>
            {/* Email Templates */}
            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-1 flex items-center gap-2">
                <Icon name="edit_note" size={20} className="text-[#002068]" />
                Template Email
              </h2>
              <p className="text-sm text-[#747684] mb-5">
                Personalizza l'oggetto e il corpo delle email automatiche inviate dal sistema. Supportano HTML e variabili <code className="text-xs bg-[#f4f3fc] px-1 rounded">{'{{campo}}'}</code>.
              </p>

              {loadingSmtp ? (
                <div className="flex items-center gap-2 text-sm text-[#747684]">
                  <div className="w-4 h-4 border-2 border-[#002068] border-t-transparent rounded-full animate-spin" />
                  Caricamento template...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Notifica admin */}
                  <EmailTemplateEditor
                    title="Notifica admin (Send Email)"
                    description="Email inviata agli amministratori quando arriva una nuova risposta."
                    value={emailTemplates.adminNotification!}
                    onChange={patch => patchTemplate('adminNotification', patch)}
                    onTest={() => handleTestTemplate('adminNotification')}
                    testing={testingTemplate === 'adminNotification'}
                    variables={[
                      { token: '{{form_title}}', desc: 'Titolo del form' },
                      { token: '{{response_id}}', desc: 'ID risposta' },
                      { token: '{{all_answers}}', desc: 'Tabella HTML con tutte le risposte' },
                      { token: '{{id_campo}}', desc: 'Valore di un campo specifico' },
                      { token: '{{label_campo}}', desc: 'Alternativa con label del campo' },
                    ]}
                  />

                  {/* Conferma compilatore */}
                  <EmailTemplateEditor
                    title="Conferma compilatore (Notify Submitter)"
                    description="Email inviata al compilatore dopo l'invio del form."
                    value={emailTemplates.submitterConfirmation!}
                    onChange={patch => patchTemplate('submitterConfirmation', patch)}
                    onTest={() => handleTestTemplate('submitterConfirmation')}
                    testing={testingTemplate === 'submitterConfirmation'}
                    variables={[
                      { token: '{{form_title}}', desc: 'Titolo del form' },
                      { token: '{{response_id}}', desc: 'ID risposta' },
                      { token: '{{ticket_url}}', desc: 'Link diretto al biglietto' },
                      { token: '{{my_portal_url}}', desc: 'Link al portale utente' },
                      { token: '{{id_campo}}', desc: 'Valore di un campo specifico' },
                      { token: '{{label_campo}}', desc: 'Alternativa con label del campo' },
                    ]}
                  />

                  <div className="pt-2">
                    <button
                      onClick={handleSaveEmailTemplates}
                      disabled={savingTemplates}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors disabled:opacity-60"
                    >
                      {savingTemplates ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="save" size={16} />
                      )}
                      {savingTemplates ? 'Salvataggio...' : 'Salva template'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── BRANDING ── */}
        {activeTab === 'branding' && (
          <div className="space-y-6">
            {/* App identity */}
            <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
              <h2 className="text-lg font-bold text-[#1a1b22] mb-1 flex items-center gap-2">
                <Icon name="badge" size={20} className="text-[#002068]" />
                Identità Applicazione
              </h2>
              <p className="text-sm text-[#747684] mb-5">Nome, logo e colori visualizzati nell'app e nella PWA.</p>

              <div className="space-y-5">
                <div className="space-y-1">
                  <label className={labelCls}>Nome applicazione</label>
                  <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Solidando" className={inputCls} />
                </div>

                <div className="space-y-1">
                  <label className={labelCls}>Logo workspace</label>
                  <ImageUpload
                    path="logos"
                    currentUrl={logoUrl}
                    onUploaded={setLogoUrl}
                    onError={msg => showToast(msg, 'error')}
                    label="Carica logo"
                  />
                  {logoUrl && (
                    <div className="mt-3 flex items-center gap-4 p-3 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
                      <img src={logoUrl} alt="Logo" className="h-10 object-contain" />
                      <span className="text-xs text-[#747684]">Anteprima logo</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className={labelCls}>Colore primario</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      className="w-11 h-11 rounded-lg border border-[#c4c5d5] cursor-pointer p-1 bg-[#f4f3fc]"
                    />
                    <input
                      value={primaryColor}
                      onChange={e => setPrimaryColor(e.target.value)}
                      placeholder="#002068"
                      className={`${inputCls} font-mono`}
                    />
                    <div
                      className="w-11 h-11 rounded-lg border border-[#c4c5d5] shrink-0"
                      style={{ backgroundColor: primaryColor }}
                    />
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {['#002068', '#1a6b3a', '#8f4e00', '#ba1a1a', '#6b21a8', '#0f766e'].map(color => (
                      <button
                        key={color}
                        onClick={() => setPrimaryColor(color)}
                        className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110"
                        style={{ backgroundColor: color, borderColor: primaryColor === color ? '#1a1b22' : 'transparent' }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveBranding}
                    disabled={savingBranding}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors disabled:opacity-60"
                  >
                    {savingBranding ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="save" size={16} />
                    )}
                    Salva branding
                  </button>
                </div>
              </div>
            </section>

          </div>
        )}

        {/* ── NOTIFICHE (admin only) ── */}
        {activeTab === 'notifiche' && profile?.role === 'admin' && (
          <section className="bg-white rounded-xl border border-[#c4c5d5] p-6">
            <h2 className="text-lg font-bold text-[#1a1b22] mb-1 flex items-center gap-2">
              <Icon name="notifications_active" size={20} className="text-[#002068]" />
              Invia Notifiche
            </h2>
            <p className="text-sm text-[#747684] mb-5">
              Invia notifiche push e in-app agli utenti iscritti a un form, a un evento o a tutti.
            </p>
            <NotificationsAdminPanel />
          </section>
        )}

        {/* ── AVANZATE ── */}
        {activeTab === 'avanzate' && (
          <section className="bg-white rounded-xl border border-[#ba1a1a] border-opacity-30 p-6">
            <h2 className="text-lg font-bold text-[#ba1a1a] mb-4 flex items-center gap-2">
              <Icon name="warning" size={20} />
              Zona Pericolosa
            </h2>
            <p className="text-sm text-[#444653] mb-4">Queste azioni sono irreversibili. Procedi con cautela.</p>
            <button className="px-5 py-2.5 border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-sm font-bold hover:bg-[#ffdad6] transition-colors">
              Elimina Account
            </button>
          </section>
        )}
      </div>
    </AppLayout>
  )
}

// ─── EmailTemplateEditor ──────────────────────────────────────────────────────

interface VariableHint { token: string; desc: string }

function EmailTemplateEditor({
  title, description, value, onChange, onTest, testing, variables,
}: {
  title: string
  description: string
  value: EmailTemplate
  onChange: (patch: Partial<EmailTemplate>) => void
  onTest?: () => void
  testing?: boolean
  variables: VariableHint[]
}) {
  const [showVars, setShowVars] = useState(false)

  return (
    <div className="space-y-3 border border-[#e8e7f0] rounded-xl p-4 bg-[#faf8ff]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#1a1b22]">{title}</p>
          <p className="text-xs text-[#747684] mt-0.5">{description}</p>
        </div>
        {onTest && (
          <button
            onClick={onTest}
            disabled={testing}
            title="Invia email di test con dati mock"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#c4c5d5] text-[#444653] rounded-lg text-xs font-semibold hover:bg-white hover:border-[#002068] hover:text-[#002068] transition-all disabled:opacity-40 shrink-0"
          >
            {testing
              ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Icon name="send" size={14} />
            }
            {testing ? 'Invio...' : 'Testa'}
          </button>
        )}
      </div>

      <div className="space-y-1">
        <label className={labelCls}>Oggetto</label>
        <input
          value={value.subject}
          onChange={e => onChange({ subject: e.target.value })}
          className={inputCls}
          placeholder="Oggetto email..."
        />
      </div>

      <div className="space-y-1">
        <label className={labelCls}>Corpo (HTML supportato)</label>
        <textarea
          value={value.body}
          onChange={e => onChange({ body: e.target.value })}
          rows={6}
          className="w-full px-4 py-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none resize-y"
          placeholder="<p>Testo email...</p>"
        />
      </div>

      {/* Variabili disponibili */}
      <div>
        <button
          onClick={() => setShowVars(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#002068] hover:underline"
        >
          <Icon name={showVars ? 'expand_less' : 'expand_more'} size={14} />
          Variabili disponibili
        </button>
        {showVars && (
          <div className="mt-2 grid grid-cols-1 gap-1.5">
            {variables.map(v => (
              <div key={v.token} className="flex items-center gap-2">
                <code className="text-xs bg-white border border-[#c4c5d5] px-2 py-0.5 rounded font-mono text-[#002068] shrink-0">
                  {v.token}
                </code>
                <span className="text-xs text-[#747684]">{v.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const labelCls = 'text-xs font-semibold text-[#444653] uppercase tracking-wider block mb-1.5'
const inputCls = 'w-full h-11 px-4 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none'
