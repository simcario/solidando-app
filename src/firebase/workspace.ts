import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import type { SmtpConfig, FormAction, PaypalConfig, WorkspaceEmailTemplates, FiscalConfig } from '../types/form'

// ─── Workspace settings ───────────────────────────────────────────────────────

export interface BrandingConfig {
  appName?: string
  logoUrl?: string
  primaryColor?: string
}

export interface WorkspaceSettings {
  smtp?: SmtpConfig
  paypal?: PaypalConfig
  branding?: BrandingConfig
  emailTemplates?: WorkspaceEmailTemplates
  fiscal?: FiscalConfig
  updatedAt?: unknown
}

const settingsRef = (workspaceId: string) =>
  doc(db, 'workspace_settings', workspaceId)

export async function getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const snap = await getDoc(settingsRef(workspaceId))
  return snap.exists() ? (snap.data() as WorkspaceSettings) : {}
}

export async function savePaypalConfig(workspaceId: string, paypal: PaypalConfig) {
  const ref = settingsRef(workspaceId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { paypal, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, { paypal, updatedAt: serverTimestamp() })
  }
}

export async function saveBrandingConfig(workspaceId: string, branding: BrandingConfig) {
  const ref = settingsRef(workspaceId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { branding, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, { branding, updatedAt: serverTimestamp() })
  }
}

export async function saveSmtpConfig(workspaceId: string, smtp: SmtpConfig) {
  const ref = settingsRef(workspaceId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { smtp, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, { smtp, updatedAt: serverTimestamp() })
  }
}

export async function saveEmailTemplates(workspaceId: string, emailTemplates: WorkspaceEmailTemplates) {
  const ref = settingsRef(workspaceId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { emailTemplates, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, { emailTemplates, updatedAt: serverTimestamp() })
  }
}

export async function saveFiscalConfig(workspaceId: string, fiscal: FiscalConfig) {
  const ref = settingsRef(workspaceId)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await updateDoc(ref, { fiscal, updatedAt: serverTimestamp() })
  } else {
    await setDoc(ref, { fiscal, updatedAt: serverTimestamp() })
  }
}

// ─── Form actions (stored on the form doc itself) ─────────────────────────────

import { updateForm } from './forms'

export async function saveFormActions(formId: string, actions: FormAction[]) {
  await updateForm(formId, { actions })
}
