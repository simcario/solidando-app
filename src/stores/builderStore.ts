import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { FormNode, FormEdge, FieldType, FormVariable, FormAction, FieldStyle } from '../types/form'

export interface CoverData {
  title: string
  subtitle: string
  backgroundType: 'color' | 'gradient' | 'image'
  backgroundColor: string
  gradientFrom: string
  gradientTo: string
  imageUrl: string
  imagePosition: string
  imageSize?: 'cover' | 'contain' | 'auto' | 'stretch'
  imageRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y'
  imageOpacity: number
  textColor: string
}

const DEFAULT_COVER: CoverData = {
  title: '',
  subtitle: '',
  backgroundType: 'color',
  backgroundColor: '#002068',
  gradientFrom: '#002068',
  gradientTo: '#fe9832',
  imageUrl: '',
  imagePosition: 'center center',
  imageOpacity: 100,
  textColor: '#ffffff',
}

// Snapshot delle sole proprietà "undoable" (struttura + presentazione, non stato UI)
interface HistorySnapshot {
  title: string
  nodes: FormNode[]
  edges: FormEdge[]
  cover: CoverData
  formBackground: string
  formMode: 'conversational' | 'classic'
  fieldStyle: FieldStyle
  showCover: boolean
  variables: FormVariable[]
  actions: FormAction[]
}

const MAX_HISTORY = 50

interface BuilderState {
  formId: string | null
  title: string
  description: string
  nodes: FormNode[]
  edges: FormEdge[]
  selectedNodeId: string | null
  coverSelected: boolean
  isDirty: boolean
  isSaving: boolean
  savedAt: number
  cover: CoverData
  formBackground: string
  formMode: 'conversational' | 'classic'
  fieldStyle: FieldStyle
  showCover: boolean
  variables: FormVariable[]
  actions: FormAction[]

  // Undo/redo
  _past: HistorySnapshot[]
  _future: HistorySnapshot[]
  canUndo: boolean
  canRedo: boolean

  setFormId: (id: string) => void
  setTitle: (title: string) => void
  setDescription: (desc: string) => void
  setNodes: (nodes: FormNode[]) => void
  setEdges: (edges: FormEdge[]) => void
  setCover: (data: Partial<CoverData>) => void
  setFormBackground: (bg: string) => void
  setFormMode: (mode: 'conversational' | 'classic') => void
  setFieldStyle: (style: FieldStyle) => void
  setShowCover: (show: boolean) => void
  setVariables: (vars: FormVariable[]) => void
  setActions: (actions: FormAction[]) => void
  addVariable: () => void
  updateVariable: (id: string, data: Partial<FormVariable>) => void
  removeVariable: (id: string) => void
  addNode: (type: FieldType) => void
  duplicateNode: (id: string) => void
  updateNode: (id: string, data: Partial<FormNode>) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  selectCover: () => void
  reorderNodes: (nodes: FormNode[]) => void
  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setSavedAt: (ts: number) => void
  undo: () => void
  redo: () => void
  reset: () => void
}

function snapshot(s: BuilderState): HistorySnapshot {
  return {
    title: s.title,
    nodes: s.nodes,
    edges: s.edges,
    cover: s.cover,
    formBackground: s.formBackground,
    formMode: s.formMode,
    fieldStyle: s.fieldStyle,
    showCover: s.showCover,
    variables: s.variables,
    actions: s.actions,
  }
}

// Applica uno snapshot allo stato senza toccare le proprietà UI/meta
function applySnapshot(snap: HistorySnapshot): Partial<BuilderState> {
  return {
    title: snap.title,
    nodes: snap.nodes,
    edges: snap.edges,
    cover: snap.cover,
    formBackground: snap.formBackground,
    formMode: snap.formMode,
    fieldStyle: snap.fieldStyle,
    showCover: snap.showCover,
    variables: snap.variables,
    actions: snap.actions,
    isDirty: true,
  }
}

export const useBuilderStore = create<BuilderState>((set, get) => ({
  formId: null,
  title: 'Untitled Form',
  description: '',
  nodes: [],
  edges: [],
  selectedNodeId: null,
  coverSelected: false,
  isDirty: false,
  isSaving: false,
  savedAt: 0,
  cover: { ...DEFAULT_COVER },
  formBackground: '',
  formMode: 'conversational' as const,
  fieldStyle: 'underline' as FieldStyle,
  showCover: false,
  variables: [],
  actions: [],
  _past: [],
  _future: [],
  canUndo: false,
  canRedo: false,

  setFormId: (id) => set({ formId: id }),

  // Titolo: con history
  setTitle: (title) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      title,
      isDirty: true,
    }))
  },

  setDescription: (description) => set({ description, isDirty: true }),
  // setNodes usato solo al caricamento iniziale — senza history
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  setCover: (data) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      cover: { ...s.cover, ...data },
      isDirty: true,
    }))
  },

  setFormBackground: (formBackground) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      formBackground,
      isDirty: true,
    }))
  },

  setFormMode: (formMode) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      formMode,
      isDirty: true,
    }))
  },

  setFieldStyle: (fieldStyle) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      fieldStyle,
      isDirty: true,
    }))
  },

  setShowCover: (showCover) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      showCover,
      isDirty: true,
    }))
  },

  setVariables: (variables) => set({ variables, isDirty: true }),
  setActions: (actions) => set({ actions }),

  addVariable: () => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      variables: [...s.variables, { id: nanoid(), name: 'nuova_var', value: 0 }],
      isDirty: true,
    }))
  },

  updateVariable: (id, data) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      variables: s.variables.map(v => v.id === id ? { ...v, ...data } : v),
      isDirty: true,
    }))
  },

  removeVariable: (id) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      variables: s.variables.filter(v => v.id !== id),
      isDirty: true,
    }))
  },

  addNode: (type) => {
    const { nodes } = get()
    const current = snapshot(get())
    const endScreenDefaults = type === 'end_screen' ? {
      label: 'Schermata finale',
      message: 'Grazie per aver compilato il form!\n\nAbbiamo ricevuto le tue risposte.',
      backgroundType: 'gradient' as const,
      gradientFrom: '#002068',
      gradientTo: '#fe9832',
      textColor: '#ffffff',
      buttonLabel: 'Invia',
    } : {}
    const pageBreakDefaults = type === 'page_break' ? {
      label: `Pagina ${nodes.length + 1}`,
      helpText: '',
    } : {}
    const surveyDefaults = type === 'survey' ? {
      surveyRows: [
        { id: '1', label: 'Affermazione 1' },
        { id: '2', label: 'Affermazione 2' },
        { id: '3', label: 'Affermazione 3' },
      ],
      surveyColumns: [
        { value: '1', label: 'Per niente' },
        { value: '2', label: 'Poco' },
        { value: '3', label: 'Abbastanza' },
        { value: '4', label: 'Molto' },
        { value: '5', label: 'Moltissimo' },
      ],
    } : {}
    const newNode: FormNode = {
      id: nanoid(),
      type,
      properties: {
        label: `Domanda ${nodes.length + 1}`,
        placeholder: '',
        required: false,
        ...endScreenDefaults,
        ...pageBreakDefaults,
        ...surveyDefaults,
      },
      position: nodes.length,
    }
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      nodes: [...nodes, newNode],
      selectedNodeId: newNode.id,
      isDirty: true,
    }))
  },

  duplicateNode: (id) => {
    const { nodes } = get()
    const current = snapshot(get())
    const idx = nodes.findIndex(n => n.id === id)
    if (idx === -1) return
    const original = nodes[idx]
    const clone: FormNode = {
      ...JSON.parse(JSON.stringify(original)),
      id: nanoid(),
      position: original.position + 1,
    }
    const updated = [
      ...nodes.slice(0, idx + 1),
      clone,
      ...nodes.slice(idx + 1),
    ].map((n, i) => ({ ...n, position: i }))
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      nodes: updated,
      selectedNodeId: clone.id,
      isDirty: true,
    }))
  },

  updateNode: (id, data) => {
    const { nodes } = get()
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      nodes: nodes.map(n => n.id === id ? { ...n, ...data, properties: { ...n.properties, ...(data.properties ?? {}) } } : n),
      isDirty: true,
    }))
  },

  removeNode: (id) => {
    const { nodes, selectedNodeId } = get()
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      nodes: nodes.filter(n => n.id !== id).map((n, i) => ({ ...n, position: i })),
      selectedNodeId: selectedNodeId === id ? null : selectedNodeId,
      isDirty: true,
    }))
  },

  selectNode: (id) => set({ selectedNodeId: id, coverSelected: false }),
  selectCover: () => set({ coverSelected: true, selectedNodeId: null }),

  reorderNodes: (nodes) => {
    const current = snapshot(get())
    set((s: BuilderState) => ({
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: [],
      canUndo: true,
      canRedo: false,
      nodes: nodes.map((n, i) => ({ ...n, position: i })),
      isDirty: true,
    }))
  },

  setDirty: (isDirty) => set({ isDirty }),
  setSaving: (isSaving) => set({ isSaving }),
  setSavedAt: (savedAt) => set({ savedAt }),

  undo: () => {
    const { _past } = get()
    if (_past.length === 0) return
    const prev = _past[_past.length - 1]
    const current = snapshot(get())
    set((s: BuilderState) => ({
      ...applySnapshot(prev),
      _past: s._past.slice(0, -1),
      _future: [current, ...s._future].slice(0, MAX_HISTORY),
      canUndo: s._past.length > 1,
      canRedo: true,
    }))
  },

  redo: () => {
    const { _future } = get()
    if (_future.length === 0) return
    const next = _future[0]
    const current = snapshot(get())
    set((s: BuilderState) => ({
      ...applySnapshot(next),
      _past: [...s._past, current].slice(-MAX_HISTORY),
      _future: s._future.slice(1),
      canUndo: true,
      canRedo: s._future.length > 1,
    }))
  },

  reset: () => set({
    formId: null,
    title: 'Untitled Form',
    description: '',
    nodes: [],
    edges: [],
    selectedNodeId: null,
    coverSelected: false,
    isDirty: false,
    isSaving: false,
    savedAt: 0,
    cover: { ...DEFAULT_COVER },
    formBackground: '',
    formMode: 'conversational' as const,
    fieldStyle: 'underline' as FieldStyle,
    showCover: false,
    variables: [],
    actions: [],
    _past: [],
    _future: [],
    canUndo: false,
    canRedo: false,
  }),
}))


