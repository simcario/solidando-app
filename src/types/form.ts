export interface FormVariable {
  id: string
  name: string        // nome breve usato come {{nome}} nei template
  value: number       // valore statico di default
  unit?: string       // es. "€", "kg", "%"
}

export type FieldType =
  | 'short_text' | 'long_text' | 'number' | 'email' | 'phone'
  | 'date' | 'time' | 'dropdown' | 'radio' | 'checkbox'
  | 'slider' | 'rating' | 'file_upload' | 'signature' | 'matrix'
  | 'hidden' | 'rich_text' | 'divider' | 'html' | 'payment' | 'end_screen'
  | 'page_break' | 'survey'

export type FormulaOp = '*' | '+' | '-' | '/'

export interface FormulaConfig {
  fieldId: string       // id del campo numero sorgente
  op: FormulaOp
  variableId: string    // id della FormVariable
}

export interface PaymentFormulaTerm {
  fieldId: string
  op: FormulaOp
  variableId: string
}

export interface PaymentFormulaConfig {
  terms: PaymentFormulaTerm[]
  combineOp: '+' | '-'  // come sommare i termini tra loro
}

export interface FormNode {
  id: string
  type: FieldType
  properties: {
    label: string
    placeholder?: string
    helpText?: string
    required?: boolean
    defaultValue?: unknown
    options?: { label: string; value: string; openText?: boolean }[]
    // survey block
    surveyRows?: { id: string; label: string }[]
    surveyColumns?: { value: string; label: string }[]
    min?: number
    max?: number
    maxLength?: number
    regex?: string
    amount?: number
    currency?: string
    readOnly?: boolean
    formula?: FormulaConfig
    paypalClientId?: string
    paymentFormula?: FormulaConfig | PaymentFormulaConfig
    payInPersonEnabled?: boolean
    // end_screen properties
    message?: string
    backgroundType?: 'color' | 'gradient' | 'image'
    backgroundColor?: string
    gradientFrom?: string
    gradientTo?: string
    backgroundImageUrl?: string
    backgroundImagePosition?: string
    backgroundImageSize?: 'cover' | 'contain' | 'auto' | 'stretch'
    backgroundImageRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y'
    backgroundImageOpacity?: number
    textColor?: string
    buttonLabel?: string
    buttonUrl?: string
    autoSubmit?: boolean
  }
  validations?: Record<string, unknown>
  logic?: {
    conditions?: LogicCondition[]
    jumpTo?: string
  }
  position: number
}

export interface LogicCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'
  value: unknown
  action: 'jump' | 'show' | 'hide'
  target: string
}

export interface FormEdge {
  id: string
  source: string
  target: string
  condition?: LogicCondition
}

export type FieldStyle = 'underline' | 'outline' | 'filled'

export interface FormTheme {
  primaryColor: string
  font: string
  radius?: string
  background?: string
  fieldStyle?: FieldStyle
  logo?: string
  customCss?: string
}

export interface FormSettings {
  mode: 'classic' | 'conversational' | 'wizard'
  requireAuth?: boolean
  password?: string
  expiresAt?: string
  maxSubmissions?: number
  thankYouMessage?: string
  redirectUrl?: string
}

export interface FormCover {
  title: string
  subtitle: string
  backgroundType: 'color' | 'gradient' | 'image'
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  imageUrl: string
  imagePosition?: string
  imageSize?: 'cover' | 'contain' | 'auto' | 'stretch'
  imageRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y'
  imageOpacity?: number
  textColor: string
}

export interface Form {
  id: string
  title: string
  description: string
  createdBy: string
  workspaceId: string
  published: boolean
  slug: string
  theme: FormTheme
  settings: FormSettings
  nodes: FormNode[]
  edges: FormEdge[]
  cover?: FormCover
  showCover?: boolean
  variables?: FormVariable[]
  actions?: FormAction[]
  version: number
  createdAt: { toDate: () => Date } | null
  updatedAt: { toDate: () => Date } | null
  _responseCount?: number
}

export interface Response {
  id: string
  formId: string
  answers: Record<string, unknown>
  submittedAt: { toDate: () => Date } | null
  duration: number
  device: string
  browser: string
  location: string | null
  score: number
  paymentStatus: 'pending' | 'completed' | 'failed' | 'none'
  paymentAmount?: number | null
  paypalOrderId?: string
  paymentMethod?: 'paypal' | 'in_person' | null
  checkInStatus: 'not_checked_in' | 'checked_in'
  checkInAt?: { toDate: () => Date } | null
  userId?: string | null
  eventId?: string | null
  attendeeCount?: number
  checkInAttendeeCount?: number
  receiptNumber?: string
  receiptVoided?: boolean
  receiptVoidedAt?: { toDate: () => Date } | null
  receiptVoidedNumber?: string
}

// ─── Form actions (triggered on submit) ──────────────────────────────────────

export type FormActionType = 'send_email' | 'webhook' | 'notify_submitter'

export interface EmailActionConfig {
  to: string[]           // indirizzi fissi destinatari
  subject: string        // template con {{campo}}
  body: string           // template HTML/testo con {{campo}}
  replyTo?: string
}

export interface WebhookActionConfig {
  url: string
  method: 'POST' | 'GET'
  headers?: Record<string, string>
}

export interface NotifySubmitterConfig {
  emailFieldId: string   // id del campo email nel form
  subject: string
  body: string
}

export interface FormAction {
  id: string
  type: FormActionType
  enabled: boolean
  config: EmailActionConfig | WebhookActionConfig | NotifySubmitterConfig
}

// ─── Email templates (stored in workspace_settings) ───────────────────────────

export interface EmailTemplate {
  subject: string
  body: string    // HTML supportato, con variabili {{campo}}
}

export interface WorkspaceEmailTemplates {
  /** Notifica all'admin con i dati della risposta */
  adminNotification?: EmailTemplate
  /** Email di conferma al compilatore */
  submitterConfirmation?: EmailTemplate
}

// ─── Fiscal config (stored in workspace_settings) ────────────────────────────

export interface FiscalConfig {
  organizationName: string     // Ragione sociale / nome associazione
  fiscalCode: string           // Codice fiscale o P.IVA
  address: string              // Via, numero civico
  city: string                 // Città
  postalCode: string           // CAP
  province: string             // Sigla provincia
  phone?: string
  email?: string
  website?: string
  vatNumber?: string           // Partita IVA (se diversa da CF)
  notes?: string               // Note a piè ricevuta (es. "Ente del Terzo Settore")
}

// ─── PayPal config (stored in workspace_settings, secret never sent to client) ─

export interface PaypalConfig {
  clientId: string
  clientSecret: string
  sandbox: boolean
}

// ─── SMTP config (stored in workspace_settings) ───────────────────────────────

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean        // true = TLS porta 465
  user: string
  password: string
  fromName: string
  fromEmail: string
}

export interface UserProfile {
  uid: string
  name: string
  email: string
  avatar: string | null
  createdAt: unknown
  plan: 'free' | 'pro' | 'enterprise'
  workspaceIds: string[]
  role: 'admin' | 'user'
}

// ─── Accounting ───────────────────────────────────────────────────────────────

export type ExpenseCategory = 'venue' | 'catering' | 'marketing' | 'staff' | 'equipment' | 'other'

export interface AccountingExpense {
  id: string
  eventId: string
  description: string
  invoiceNumber?: string    // numero fattura o ricevuta
  amount: number            // importo in EUR
  category: ExpenseCategory
  date: string              // ISO date "2026-06-11"
  notes?: string
  createdAt: { toDate: () => Date } | null
}

export type ManualIncomeMethod = 'cash' | 'bank_transfer' | 'paypal' | 'stripe' | 'other'

export interface ManualIncome {
  id: string
  eventId: string
  description: string
  amount: number
  method: ManualIncomeMethod
  date: string              // ISO date
  notes?: string
  createdAt: { toDate: () => Date } | null
}

// Entrata non legata a un evento (fondo cassa, contributo generale, ecc.)
export interface WorkspaceIncome {
  id: string
  workspaceId: string
  description: string
  amount: number
  method: ManualIncomeMethod
  date: string              // ISO date
  notes?: string
  createdAt: { toDate: () => Date } | null
}

// ─── Cassa (Cash Register) ────────────────────────────────────────────────────

export interface CassaItem {
  id: string
  label: string
  price: number        // 0 = importo libero
  currency: string     // 'EUR'
  imageUrl?: string    // URL immagine/icona
  emoji?: string       // emoji alternativa all'immagine
  color?: string       // colore sfondo tasto (hex)
  sortOrder?: number
}

export interface CassaTransaction {
  id: string
  eventId: string
  workspaceId: string
  items: CassaTransactionItem[]
  total: number
  method: ManualIncomeMethod
  note?: string
  operatorName?: string
  date: string              // ISO date
  createdAt: { toDate: () => Date } | null
}

export interface CassaTransactionItem {
  cassaItemId: string | 'custom'
  label: string
  price: number
  qty: number
  subtotal: number
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type EventStatus = 'draft' | 'published' | 'closed' | 'cancelled'

export type TicketType = {
  id: string
  label: string        // es. "Adulto", "Bambino", "Early Bird"
  price: number        // 0 = gratuito
  currency: string     // 'EUR'
  capacity: number | null  // null = illimitato per tipo
}

export interface SolidandoEvent {
  id: string
  title: string
  description: string
  location: string
  locationUrl?: string   // URL Google Maps personalizzato (se assente si genera da location)
  startDate: string      // ISO date string, es. "2025-11-24"
  startTime: string      // "HH:mm"
  endDate?: string
  endTime?: string
  imageUrl?: string
  status: EventStatus
  totalCapacity: number | null   // null = illimitato
  ticketTypes: TicketType[]
  formId?: string        // form iscrizione collegato
  attendeeFieldId?: string   // legacy: singolo campo numero persone
  attendeeFieldIds?: string[] // multi-campo: somma più campi numero (es. adulti + bambini)
  ctaLabel?: string      // testo bottone CTA sulla pagina pubblica
  receiptDescription?: string  // dicitura causale nelle ricevute fiscali
  workspaceId: string
  createdBy: string
  closesAt?: string      // ISO datetime — chiusura automatica iscrizioni
  cassaItems?: CassaItem[]  // articoli configurati per la cassa
  createdAt: { toDate: () => Date } | null
  updatedAt: { toDate: () => Date } | null
  // computed/cached
  _bookedCount?: number
}
