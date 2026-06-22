import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { getForm } from '../../firebase/forms'
import { useBuilderStore } from '../../stores/builderStore'
import { useAutosave, saveNow } from '../../hooks/useAutosave'
import { resolveBgStyle } from './components/FormDesignPanel'
import Icon from '../../components/ui/Icon'
import BlockCard from './components/BlockCard'
import CoverBlock from './components/CoverBlock'
import LeftTabBar from './components/LeftTabBar'
import RightTabBar from './components/RightTabBar'
import type { FieldType } from '../../types/form'

export default function BuilderPage() {
  const { formId } = useParams<{ formId: string }>()
  const navigate = useNavigate()
  const {
    title, setFormId, setTitle,
    nodes, selectedNodeId, selectNode, reorderNodes,
    addNode, isDirty, isSaving, formBackground,
    undo, redo, canUndo, canRedo,
  } = useBuilderStore()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'design' | 'logic'>('design')
  const [publishing, setPublishing] = useState(false)
  const [leftPanel, setLeftPanel] = useState<'components' | null>('components')

  useAutosave()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (!formId) return
    setFormId(formId)
    getForm(formId).then(form => {
      if (!form) { navigate('/forms'); return }
      // Carica senza history: setNodes/setEdges/setTitle usati qui non devono creare snapshot
      const store = useBuilderStore.getState()
      store.setNodes(form.nodes)
      store.setEdges(form.edges)
      // Imposta le altre proprietà direttamente per non inquinare la history
      useBuilderStore.setState({
        title: form.title,
        description: form.description,
        cover: form.cover ? { ...useBuilderStore.getState().cover, ...form.cover } : useBuilderStore.getState().cover,
        showCover: form.showCover ?? false,
        formBackground: form.theme?.background ?? '',
        fieldStyle: (form.theme?.fieldStyle ?? 'underline') as import('../../types/form').FieldStyle,
        formMode: form.settings?.mode === 'classic' ? 'classic' : 'conversational',
        variables: form.variables ?? [],
        actions: form.actions ?? [],
        isDirty: false,
        _past: [],
        _future: [],
        canUndo: false,
        canRedo: false,
      })
      setLoading(false)
    })
    return () => useBuilderStore.getState().reset()
  }, [formId])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = nodes.findIndex(n => n.id === active.id)
      const newIndex = nodes.findIndex(n => n.id === over.id)
      reorderNodes(arrayMove(nodes, oldIndex, newIndex))
    }
  }

  // Scorciatoie Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      // Non intercettare dentro input/textarea/contenteditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useBuilderStore.getState().undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        useBuilderStore.getState().redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function handlePublish() {
    const { publishForm } = await import('../../firebase/forms')
    setPublishing(true)
    try {
      await publishForm(formId!, true)
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#faf8ff]">
        <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#f4f3fc] overflow-hidden">
      {/* Top Header */}
      <header className="bg-[#faf8ff] border-b border-[#c4c5d5] shadow-sm flex justify-between items-center px-6 py-3 z-40 flex-shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('/dashboard')} className="p-2 text-[#444653] hover:bg-[#e8e7f0] rounded-full transition-colors">
            <Icon name="arrow_back" size={20} />
          </button>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="text-xl font-bold text-[#1a1b22] bg-transparent border-none focus:outline-none focus:ring-0 w-72"
            placeholder="Titolo form..."
          />
          <div className="flex items-center gap-1.5 min-w-[90px]">
            {isSaving ? (
              <span className="text-xs text-[#747684] flex items-center gap-1">
                <span className="w-3 h-3 border-2 border-[#747684] border-t-transparent rounded-full animate-spin" />
                Salvataggio...
              </span>
            ) : isDirty ? (
              <span className="text-xs text-[#fe9832] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#fe9832]" />
                Modifiche non salvate
              </span>
            ) : (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <Icon name="check_circle" size={14} />
                Salvato
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tabs */}
          <div className="flex bg-[#eeedf6] border border-[#c4c5d5] p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('design')}
              className={`flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'design' ? 'bg-white text-[#002068] shadow-sm' : 'text-[#444653] hover:bg-[#e8e7f0]'
              }`}
            >
              <Icon name="palette" size={18} /> Design
            </button>
            <button
              onClick={() => setActiveTab('logic')}
              className={`flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'logic' ? 'bg-white text-[#002068] shadow-sm' : 'text-[#444653] hover:bg-[#e8e7f0]'
              }`}
            >
              <Icon name="account_tree" size={18} /> Logica
            </button>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1 border border-[#c4c5d5] rounded-lg overflow-hidden">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Annulla (Ctrl+Z)"
              className="flex items-center px-3 py-2 text-[#444653] hover:bg-[#e8e7f0] transition-all disabled:opacity-30 disabled:cursor-not-allowed border-r border-[#c4c5d5]"
            >
              <Icon name="undo" size={18} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Ripeti (Ctrl+Y)"
              className="flex items-center px-3 py-2 text-[#444653] hover:bg-[#e8e7f0] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon name="redo" size={18} />
            </button>
          </div>

          <button
            onClick={() => saveNow()}
            disabled={isSaving || !isDirty}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#c4c5d5] rounded-lg text-sm font-semibold text-[#444653] hover:bg-[#e8e7f0] transition-all disabled:opacity-40"
          >
            <Icon name="save" size={18} />
            Salva
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] active:scale-95 transition-all disabled:opacity-60"
          >
            <Icon name="publish" size={18} />
            {publishing ? 'Pubblicazione...' : 'Pubblica'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left tab bar + Componenti */}
        <LeftTabBar
          activePanel={leftPanel}
          onToggle={panel => setLeftPanel(prev => prev === panel ? null : panel)}
          onAdd={(type: FieldType) => addNode(type)}
        />

        {/* Canvas */}
        <main
          className="flex-1 overflow-y-auto p-8 transition-all duration-500"
          style={resolveBgStyle(formBackground)}
          onClick={() => selectNode(null)}
        >
          <div className="max-w-3xl mx-auto space-y-4">
            <CoverBlock />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={nodes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                {nodes.map(node => (
                  <BlockCard
                    key={node.id}
                    node={node}
                    isSelected={selectedNodeId === node.id}
                    onClick={e => { e.stopPropagation(); selectNode(node.id) }}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <button
              onClick={e => { e.stopPropagation(); addNode('short_text') }}
              className="w-full py-8 border-2 border-dashed border-[#c4c5d5] rounded-xl flex flex-col items-center justify-center opacity-50 hover:opacity-100 hover:border-[#002068] transition-all bg-white/50 group"
            >
              <Icon name="add_circle" size={32} className="text-[#002068] mb-1 group-hover:scale-110 transition-transform" />
              <p className="text-sm font-semibold text-[#002068]">Trascina o clicca per aggiungere un blocco</p>
            </button>
          </div>
        </main>

        {/* Right tab bar + Inspector + Preview */}
        <RightTabBar formId={formId!} activeTab={activeTab} />
      </div>
    </div>
  )
}
