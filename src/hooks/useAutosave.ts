import { useEffect, useRef } from 'react'
import { useBuilderStore } from '../stores/builderStore'
import { updateFormNodes, updateForm } from '../firebase/forms'
import { showToast } from '../components/ui/Toast'
import type { FormCover } from '../types/form'
import { deleteField } from 'firebase/firestore'

function sanitize(obj: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v ?? ''])
  )
}

function buildPayload(params: {
  title: string
  description: string
  formBackground: string
  formMode: 'conversational' | 'classic'
  fieldStyle: ReturnType<typeof useBuilderStore.getState>['fieldStyle']
  cover: ReturnType<typeof useBuilderStore.getState>['cover']
  showCover: boolean
  variables: ReturnType<typeof useBuilderStore.getState>['variables']
}) {
  const { title, description, formBackground, formMode, fieldStyle, cover, showCover, variables } = params
  const payload: Record<string, unknown> = {
    title,
    description,
    'theme.primaryColor': '#002068',
    'theme.font': 'Plus Jakarta Sans',
    'theme.fieldStyle': fieldStyle,
    'settings.mode': formMode,
    cover: sanitize(cover) as unknown as FormCover,
    showCover,
    variables,
  }
  payload['theme.background'] = formBackground || deleteField()
  return payload
}

export function useAutosave() {
  const { formId, title, description, nodes, edges, cover, formBackground, formMode, fieldStyle, showCover, variables, isDirty, setSaving, setDirty, setSavedAt } = useBuilderStore()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDirty || !formId) return
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await updateForm(formId, buildPayload({ title, description, formBackground, formMode, fieldStyle, cover, showCover, variables }))
        await updateFormNodes(formId, nodes, edges)
        setDirty(false)
        setSavedAt(Date.now())
        showToast('Form salvato', 'success')
      } catch (e) {
        console.error('Autosave failed', e)
        showToast('Errore nel salvataggio', 'error')
      } finally {
        setSaving(false)
      }
    }, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isDirty, formId, title, description, nodes, edges, cover, formBackground, formMode, fieldStyle, showCover, variables, setSaving, setDirty])
}

export async function saveNow(signal?: AbortSignal): Promise<void> {
  const { formId, title, description, nodes, edges, cover, formBackground, formMode, fieldStyle, showCover, variables, setSaving, setDirty, setSavedAt } = useBuilderStore.getState()
  if (!formId) return
  setSaving(true)
  try {
    await updateForm(formId, buildPayload({ title, description, formBackground, formMode, fieldStyle, cover, showCover, variables }))
    await updateFormNodes(formId, nodes, edges)
    if (!signal?.aborted) {
      setDirty(false)
      setSavedAt(Date.now())
      showToast('Form salvato', 'success')
    }
  } catch (e) {
    console.error('Save failed', e)
    showToast('Errore nel salvataggio', 'error')
  } finally {
    setSaving(false)
  }
}
