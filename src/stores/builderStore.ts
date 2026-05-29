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
  updateNode: (id: string, data: Partial<FormNode>) => void
  removeNode: (id: string) => void
  selectNode: (id: string | null) => void
  selectCover: () => void
  reorderNodes: (nodes: FormNode[]) => void
  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setSavedAt: (ts: number) => void
  reset: () => void
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

  setFormId: (id) => set({ formId: id }),
  setTitle: (title) => set({ title, isDirty: true }),
  setDescription: (description) => set({ description, isDirty: true }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setCover: (data) => set(s => ({ cover: { ...s.cover, ...data }, isDirty: true })),
  setFormBackground: (formBackground) => set({ formBackground, isDirty: true }),
  setFormMode: (formMode) => set({ formMode, isDirty: true }),
  setFieldStyle: (fieldStyle) => set({ fieldStyle, isDirty: true }),
  setShowCover: (showCover) => set({ showCover, isDirty: true }),
  setVariables: (variables) => set({ variables, isDirty: true }),
  setActions: (actions) => set({ actions }),
  addVariable: () => set(s => ({
    variables: [...s.variables, { id: nanoid(), name: 'nuova_var', value: 0 }],
    isDirty: true,
  })),
  updateVariable: (id, data) => set(s => ({
    variables: s.variables.map(v => v.id === id ? { ...v, ...data } : v),
    isDirty: true,
  })),
  removeVariable: (id) => set(s => ({
    variables: s.variables.filter(v => v.id !== id),
    isDirty: true,
  })),

  addNode: (type) => {
    const { nodes } = get()
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
    set({ nodes: [...nodes, newNode], selectedNodeId: newNode.id, isDirty: true })
  },

  updateNode: (id, data) => {
    const { nodes } = get()
    set({
      nodes: nodes.map(n => n.id === id ? { ...n, ...data, properties: { ...n.properties, ...(data.properties ?? {}) } } : n),
      isDirty: true,
    })
  },

  removeNode: (id) => {
    const { nodes, selectedNodeId } = get()
    set({
      nodes: nodes.filter(n => n.id !== id).map((n, i) => ({ ...n, position: i })),
      selectedNodeId: selectedNodeId === id ? null : selectedNodeId,
      isDirty: true,
    })
  },

  selectNode: (id) => set({ selectedNodeId: id, coverSelected: false }),
  selectCover: () => set({ coverSelected: true, selectedNodeId: null }),

  reorderNodes: (nodes) => set({
    nodes: nodes.map((n, i) => ({ ...n, position: i })),
    isDirty: true,
  }),

  setDirty: (isDirty) => set({ isDirty }),
  setSaving: (isSaving) => set({ isSaving }),
  setSavedAt: (savedAt) => set({ savedAt }),

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
  }),
}))
