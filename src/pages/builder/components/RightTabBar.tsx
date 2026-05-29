import { useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { useBuilderStore } from '../../../stores/builderStore'
import { saveNow } from '../../../hooks/useAutosave'
import { showToast } from '../../../components/ui/Toast'
import FormDesignPanel from './FormDesignPanel'
import CoverInspector from './CoverInspector'
import EndScreenInspector from './EndScreenInspector'
import VariablesPanel from './VariablesPanel'
import ActionsPanel from './ActionsPanel'
import type { FormulaOp } from '../../../types/form'

// ─── Inspector panel ────────────────────────────────────────────────────────

function InspectorPanel() {
  const { nodes, selectedNodeId, coverSelected, updateNode, isSaving } = useBuilderStore()
  const node = nodes.find(n => n.id === selectedNodeId)

  const panelTitle = coverSelected
    ? 'Schermata iniziale'
    : node?.type === 'end_screen'
      ? 'Schermata finale'
      : node?.type === 'page_break'
        ? 'Interruzione di pagina'
        : node
          ? 'Impostazioni Blocco'
          : 'Design Form'

  const panelIcon = coverSelected ? 'image' : node ? 'tune' : 'palette'

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-4 border-b border-[#c4c5d5] bg-[#f4f3fc] flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-bold text-[#002068] uppercase tracking-wider">{panelTitle}</h3>
        <Icon name={panelIcon} size={18} className="text-[#c4c5d5]" />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {coverSelected ? (
          <CoverInspector />
        ) : !node ? (
          <FormDesignPanel />
        ) : node.type === 'end_screen' ? (
          <EndScreenInspector node={node} />
        ) : (
          <div className="p-4 space-y-6 overflow-y-auto flex-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Label</label>
              <input
                value={node.properties.label}
                onChange={e => updateNode(node.id, { properties: { ...node.properties, label: e.target.value } })}
                className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
            </div>

            {!['divider', 'rich_text', 'rating', 'checkbox', 'radio', 'dropdown', 'survey', 'page_break'].includes(node.type) && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Placeholder</label>
                <input
                  value={node.properties.placeholder ?? ''}
                  onChange={e => updateNode(node.id, { properties: { ...node.properties, placeholder: e.target.value } })}
                  className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Testo di aiuto</label>
              <input
                value={node.properties.helpText ?? ''}
                onChange={e => updateNode(node.id, { properties: { ...node.properties, helpText: e.target.value } })}
                className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                placeholder="Suggerimento per l'utente..."
              />
            </div>

            {['radio', 'checkbox', 'dropdown'].includes(node.type) && (
              <OptionsEditor node={node} />
            )}

            {node.type === 'survey' && (
              <SurveyEditor node={node} />
            )}

            {['number', 'slider'].includes(node.type) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Min</label>
                  <input
                    type="number"
                    value={node.properties.min ?? ''}
                    onChange={e => updateNode(node.id, { properties: { ...node.properties, min: +e.target.value } })}
                    className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Max</label>
                  <input
                    type="number"
                    value={node.properties.max ?? ''}
                    onChange={e => updateNode(node.id, { properties: { ...node.properties, max: +e.target.value } })}
                    className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {node.type === 'number' && (
              <FormulaEditor node={node} />
            )}

            {node.type === 'payment' && (
              <PaymentEditor node={node} />
            )}

            <div className="p-4 bg-[#f4f3fc] rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Comportamento</h4>
              <ToggleRow
                label="Obbligatoria"
                value={!!node.properties.required}
                onChange={v => updateNode(node.id, { properties: { ...node.properties, required: v } })}
              />
            </div>

            <LogicEditor node={node} />
          </div>
        )}
      </div>

      {node && (
        <div className="p-4 border-t border-[#c4c5d5] bg-[#faf8ff] flex-shrink-0">
          <button
            onClick={() => saveNow()}
            disabled={isSaving}
            className="w-full h-11 bg-[#002068] text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#003399] active:scale-95 transition-all disabled:opacity-60 text-sm"
          >
            <Icon name="save" size={18} />
            {isSaving ? 'Salvataggio...' : 'Salva Cambiamenti'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Preview panel ───────────────────────────────────────────────────────────

function PreviewPanel({ formId, activeTab }: { formId: string; activeTab: 'design' | 'logic' }) {
  const [manualKey, setManualKey] = useState(0)
  const { savedAt } = useBuilderStore()
  const publicUrl = `${window.location.origin}/f/${formId}`
  const previewUrl = `/preview/${formId}?mode=${activeTab}`
  const iframeKey = `${savedAt}-${manualKey}`

  function handleCopyLink() {
    navigator.clipboard.writeText(publicUrl).then(
      () => showToast('Link copiato negli appunti!', 'success'),
      () => showToast('Impossibile copiare il link', 'error'),
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Link pubblico */}
      <div className="px-4 py-3 border-b border-[#c4c5d5] bg-white flex-shrink-0">
        <p className="text-xs font-semibold text-[#747684] uppercase tracking-wide mb-1.5">Link pubblico</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 px-3 py-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg">
            <span className="text-xs text-[#444653] truncate block font-mono">{publicUrl}</span>
          </div>
          <button
            onClick={handleCopyLink}
            title="Copia link"
            className="flex-shrink-0 p-2 bg-[#002068] text-white rounded-lg hover:bg-[#003399] transition-colors"
          >
            <Icon name="content_copy" size={16} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-b border-[#c4c5d5] bg-white flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => setManualKey(k => k + 1)}
          title="Ricarica anteprima"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors border border-[#c4c5d5]"
        >
          <Icon name="refresh" size={15} /> Ricarica
        </button>
        <button
          onClick={() => window.open(`/preview/${formId}`, '_blank', 'noopener,noreferrer')}
          title="Apri in nuova finestra"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors border border-[#c4c5d5]"
        >
          <Icon name="open_in_new" size={15} /> Apri
        </button>
      </div>

      {/* Smartphone mockup */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center py-6 px-4">
        <div className="relative">
          <div
            className="relative bg-[#1a1b22] rounded-[40px] p-[10px]"
            style={{ width: 260, boxShadow: '0 0 0 2px #3a3b48, 0 20px 60px rgba(0,0,0,0.35)' }}
          >
            {/* Notch */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-20 h-6 bg-[#1a1b22] rounded-b-2xl z-10 flex items-center justify-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2e2f3c]" />
              <div className="w-10 h-1.5 rounded-full bg-[#2e2f3c]" />
            </div>
            {/* Screen */}
            <div className="rounded-[32px] overflow-hidden bg-white" style={{ height: 500 }}>
              <iframe
                key={iframeKey}
                src={previewUrl}
                className="border-none"
                title="Form preview"
                style={{ width: '150%', height: '150%', transform: 'scale(0.667)', transformOrigin: '0 0' }}
              />
            </div>
            {/* Home bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-24 h-1 bg-[#3a3b48] rounded-full" />
            </div>
          </div>
          {/* Side buttons */}
          <div className="absolute -left-[5px] top-20 w-[5px] h-8 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -left-[5px] top-32 w-[5px] h-12 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -left-[5px] top-48 w-[5px] h-12 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -right-[5px] top-28 w-[5px] h-16 bg-[#2e2f3c] rounded-r-sm" />
        </div>
      </div>
    </div>
  )
}

// ─── Right tab bar ────────────────────────────────────────────────────────────

type RightPanel = 'inspector' | 'variables' | 'actions' | 'preview'

interface Props {
  formId: string
  activeTab: 'design' | 'logic'
}

export default function RightTabBar({ formId, activeTab }: Props) {
  const [activePanel, setActivePanel] = useState<RightPanel | null>('inspector')

  function toggle(panel: RightPanel) {
    setActivePanel(prev => (prev === panel ? null : panel))
  }

  const panelWidth = activePanel === 'preview' ? 'w-[310px]' : 'w-80'

  return (
    <div className="flex h-full shrink-0">
      {/* Panel */}
      <aside
        className={`bg-[#faf8ff] border-l border-[#c4c5d5] flex flex-col h-full overflow-hidden shrink-0 transition-all duration-200 ${
          activePanel ? panelWidth : 'w-0 border-l-0'
        }`}
      >
        {activePanel === 'inspector' && <InspectorPanel />}
        {activePanel === 'variables' && <VariablesPanel />}
        {activePanel === 'actions' && <ActionsPanel />}
        {activePanel === 'preview' && <PreviewPanel formId={formId} activeTab={activeTab} />}
      </aside>

      {/* Tab rail */}
      <div className="w-12 bg-[#f4f3fc] border-l border-[#c4c5d5] flex flex-col items-center pt-3 gap-1 z-30 shrink-0">
        <TabButton
          icon="tune"
          label="Inspector"
          active={activePanel === 'inspector'}
          onClick={() => toggle('inspector')}
        />
        <TabButton
          icon="data_object"
          label="Variabili"
          active={activePanel === 'variables'}
          onClick={() => toggle('variables')}
        />
        <TabButton
          icon="bolt"
          label="Azioni"
          active={activePanel === 'actions'}
          onClick={() => toggle('actions')}
        />
        <TabButton
          icon="smartphone"
          label="Anteprima"
          active={activePanel === 'preview'}
          onClick={() => toggle('preview')}
        />
      </div>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TabButton({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
        active
          ? 'bg-[#002068] text-white shadow-sm'
          : 'text-[#444653] hover:bg-[#e8e7f0]'
      }`}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}

function OptionsEditor({ node }: { node: ReturnType<typeof useBuilderStore.getState>['nodes'][0] }) {
  const { updateNode } = useBuilderStore()
  const options = node.properties.options ?? [{ label: 'Opzione 1', value: '1' }]

  function addOption() {
    updateNode(node.id, {
      properties: {
        ...node.properties,
        options: [...options, { label: `Opzione ${options.length + 1}`, value: String(options.length + 1) }],
      },
    })
  }

  function updateOption(index: number, label: string) {
    const newOptions = options.map((o, i) => i === index ? { ...o, label, value: label.toLowerCase() } : o)
    updateNode(node.id, { properties: { ...node.properties, options: newOptions } })
  }

  function toggleOpenText(index: number) {
    const newOptions = options.map((o, i) => i === index ? { ...o, openText: !o.openText } : o)
    updateNode(node.id, { properties: { ...node.properties, options: newOptions } })
  }

  function removeOption(index: number) {
    updateNode(node.id, { properties: { ...node.properties, options: options.filter((_, i) => i !== index) } })
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Opzioni</label>
      {options.map((opt, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2">
            <input
              value={opt.label}
              onChange={e => updateOption(i, e.target.value)}
              className="flex-1 h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            />
            <button
              onClick={() => toggleOpenText(i)}
              title={opt.openText ? 'Rimuovi campo testo libero' : 'Aggiungi campo testo libero'}
              className={`p-2 rounded-lg border transition-colors ${opt.openText ? 'bg-[#002068] text-white border-[#002068]' : 'text-[#747684] border-[#c4c5d5] hover:border-[#002068] hover:text-[#002068]'}`}
            >
              <Icon name="edit_note" size={16} />
            </button>
            <button onClick={() => removeOption(i)} className="p-2 text-[#444653] hover:text-[#ba1a1a] transition-colors">
              <Icon name="close" size={16} />
            </button>
          </div>
          {opt.openText && (
            <p className="text-[10px] text-[#747684] pl-1 flex items-center gap-1">
              <Icon name="subdirectory_arrow_right" size={12} /> Campo testo libero attivo su questa opzione
            </p>
          )}
        </div>
      ))}
      <button onClick={addOption} className="flex items-center gap-1 text-sm font-semibold text-[#002068] hover:underline">
        <Icon name="add" size={16} /> Aggiungi opzione
      </button>
    </div>
  )
}

function SurveyEditor({ node }: { node: ReturnType<typeof useBuilderStore.getState>['nodes'][0] }) {
  const { updateNode } = useBuilderStore()
  const rows = node.properties.surveyRows ?? [{ id: '1', label: 'Affermazione 1' }]
  const columns = node.properties.surveyColumns ?? [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
    { value: '4', label: '4' },
    { value: '5', label: '5' },
  ]

  function addRow() {
    const newId = String(Date.now())
    updateNode(node.id, { properties: { ...node.properties, surveyRows: [...rows, { id: newId, label: `Affermazione ${rows.length + 1}` }] } })
  }

  function updateRow(index: number, label: string) {
    const updated = rows.map((r, i) => i === index ? { ...r, label } : r)
    updateNode(node.id, { properties: { ...node.properties, surveyRows: updated } })
  }

  function removeRow(index: number) {
    updateNode(node.id, { properties: { ...node.properties, surveyRows: rows.filter((_, i) => i !== index) } })
  }

  function updateColumn(index: number, label: string) {
    const updated = columns.map((c, i) => i === index ? { ...c, label, value: label || String(i + 1) } : c)
    updateNode(node.id, { properties: { ...node.properties, surveyColumns: updated } })
  }

  function addColumn() {
    updateNode(node.id, { properties: { ...node.properties, surveyColumns: [...columns, { value: String(columns.length + 1), label: String(columns.length + 1) }] } })
  }

  function removeColumn(index: number) {
    updateNode(node.id, { properties: { ...node.properties, surveyColumns: columns.filter((_, i) => i !== index) } })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Righe (affermazioni)</label>
        {rows.map((row, i) => (
          <div key={row.id} className="flex gap-2">
            <input
              value={row.label}
              onChange={e => updateRow(i, e.target.value)}
              className="flex-1 h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            />
            <button onClick={() => removeRow(i)} className="p-2 text-[#444653] hover:text-[#ba1a1a] transition-colors">
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        <button onClick={addRow} className="flex items-center gap-1 text-sm font-semibold text-[#002068] hover:underline">
          <Icon name="add" size={16} /> Aggiungi riga
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Colonne (valori scala)</label>
        <div className="flex flex-wrap gap-2">
          {columns.map((col, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={col.label}
                onChange={e => updateColumn(i, e.target.value)}
                className="w-16 h-9 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm text-center focus:ring-1 focus:ring-[#002068] focus:outline-none"
              />
              {columns.length > 2 && (
                <button onClick={() => removeColumn(i)} className="text-[#444653] hover:text-[#ba1a1a] transition-colors">
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        {columns.length < 7 && (
          <button onClick={addColumn} className="flex items-center gap-1 text-sm font-semibold text-[#002068] hover:underline">
            <Icon name="add" size={16} /> Aggiungi colonna
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Logic editor ─────────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'uguale a',
  not_equals: 'diverso da',
  contains: 'contiene',
  greater_than: 'maggiore di',
  less_than: 'minore di',
}

function LogicEditor({ node }: { node: ReturnType<typeof useBuilderStore.getState>['nodes'][0] }) {
  const { nodes, updateNode } = useBuilderStore()
  const conditions = node.logic?.conditions ?? []

  const otherNodes = nodes.filter(n => n.id !== node.id)
  // nodes that can be used as jump target: all nodes after this one + a special "end" value
  const jumpTargets = nodes.filter(n => n.id !== node.id)

  function addRule() {
    const newCondition = {
      field: node.id,
      operator: 'equals' as const,
      value: '',
      action: 'jump' as const,
      target: jumpTargets[0]?.id ?? '',
    }
    updateNode(node.id, {
      logic: { ...node.logic, conditions: [...conditions, newCondition] },
    })
  }

  function updateRule(index: number, patch: Partial<typeof conditions[0]>) {
    const updated = conditions.map((c, i) => i === index ? { ...c, ...patch } : c)
    updateNode(node.id, { logic: { ...node.logic, conditions: updated } })
  }

  function removeRule(index: number) {
    const updated = conditions.filter((_, i) => i !== index)
    updateNode(node.id, { logic: { ...node.logic, conditions: updated } })
  }

  const hasOptions = ['radio', 'dropdown', 'checkbox'].includes(node.type)
  const options = node.properties.options ?? []

  return (
    <div className="border-t border-[#c4c5d5] pt-4 space-y-3">
      <h4 className="text-xs font-bold text-[#444653] uppercase tracking-wider">Logica e Salti</h4>

      {conditions.length === 0 ? (
        <div className="bg-[#f4f3fc] border border-[#c4c5d5] p-3 rounded-xl">
          <p className="text-xs text-[#747684] mb-3">Nessuna regola. Aggiungi una condizione per saltare a un blocco specifico.</p>
          <button
            onClick={addRule}
            disabled={otherNodes.length === 0}
            className="w-full py-2 border border-dashed border-[#c4c5d5] bg-white rounded-lg text-sm flex items-center justify-center gap-1.5 text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-colors disabled:opacity-40"
          >
            <Icon name="add" size={16} /> Aggiungi regola
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {conditions.map((cond, i) => (
            <div key={i} className="bg-[#f4f3fc] border border-[#c4c5d5] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-[#002068] uppercase tracking-wider">Regola {i + 1}</span>
                <button onClick={() => removeRule(i)} className="text-[#747684] hover:text-[#ba1a1a] transition-colors">
                  <Icon name="close" size={15} />
                </button>
              </div>

              {/* SE [campo] */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">SE il campo</label>
                <select
                  value={cond.field}
                  onChange={e => updateRule(i, { field: e.target.value })}
                  className="w-full h-8 px-2 bg-white border border-[#c4c5d5] rounded-lg text-xs focus:ring-1 focus:ring-[#002068] focus:outline-none"
                >
                  {nodes.filter(n => n.id !== node.id || true).map(n => (
                    <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
                  ))}
                </select>
              </div>

              {/* Operatore */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">È</label>
                <select
                  value={cond.operator}
                  onChange={e => updateRule(i, { operator: e.target.value as typeof cond.operator })}
                  className="w-full h-8 px-2 bg-white border border-[#c4c5d5] rounded-lg text-xs focus:ring-1 focus:ring-[#002068] focus:outline-none"
                >
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Valore */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Valore</label>
                {hasOptions && cond.field === node.id ? (
                  <select
                    value={String(cond.value)}
                    onChange={e => updateRule(i, { value: e.target.value })}
                    className="w-full h-8 px-2 bg-white border border-[#c4c5d5] rounded-lg text-xs focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  >
                    <option value="">— seleziona —</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    value={String(cond.value)}
                    onChange={e => updateRule(i, { value: e.target.value })}
                    placeholder="es. sì, 18, Milano..."
                    className="w-full h-8 px-2 bg-white border border-[#c4c5d5] rounded-lg text-xs focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  />
                )}
              </div>

              {/* ALLORA salta a */}
              <div className="space-y-1 pt-1 border-t border-[#c4c5d5]">
                <label className="text-[10px] font-bold text-[#002068] uppercase tracking-wider">→ Salta a</label>
                <select
                  value={cond.target}
                  onChange={e => updateRule(i, { target: e.target.value })}
                  className="w-full h-8 px-2 bg-white border border-[#002068] rounded-lg text-xs focus:ring-1 focus:ring-[#002068] focus:outline-none"
                >
                  <option value="">— seleziona blocco —</option>
                  {jumpTargets.map(n => (
                    <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
                  ))}
                  <option value="__end__">Fine del form (invia)</option>
                </select>
              </div>
            </div>
          ))}

          <button
            onClick={addRule}
            className="w-full py-2 border border-dashed border-[#c4c5d5] bg-white rounded-lg text-xs flex items-center justify-center gap-1.5 text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-colors"
          >
            <Icon name="add" size={14} /> Aggiungi altra regola
          </button>
        </div>
      )}
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#1a1b22]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full relative transition-colors ${value ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

const OP_LABELS: Record<FormulaOp, string> = { '*': '×', '+': '+', '-': '−', '/': '÷' }

function PaymentEditor({ node }: { node: ReturnType<typeof useBuilderStore.getState>['nodes'][0] }) {
  const { nodes, variables, updateNode } = useBuilderStore()
  const formula = node.properties.paymentFormula
  const currency = node.properties.currency ?? 'EUR'
  const payInPersonEnabled = node.properties.payInPersonEnabled ?? false

  const numericNodes = nodes.filter(n => n.id !== node.id && n.type === 'number')

  function setFormula(patch: Partial<NonNullable<typeof formula>>) {
    const base = formula ?? { fieldId: '', op: '*' as FormulaOp, variableId: '' }
    updateNode(node.id, { properties: { ...node.properties, paymentFormula: { ...base, ...patch } } })
  }

  function clearFormula() {
    const { paymentFormula: _pf, ...rest } = node.properties
    updateNode(node.id, { properties: rest })
  }

  return (
    <div className="space-y-4">
      {/* PayPal */}
      <div className="p-4 bg-[#f4f3fc] rounded-xl space-y-3 border border-[#c4c5d5]">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider flex items-center gap-1.5">
          <Icon name="payments" size={15} />
          PayPal
        </h4>
        <p className="text-[10px] text-[#747684]">Le credenziali PayPal (Client ID e Secret) si configurano nelle <span className="font-semibold text-[#002068]">Impostazioni → PayPal</span>.</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Valuta</label>
            <select
              value={currency}
              onChange={e => updateNode(node.id, { properties: { ...node.properties, currency: e.target.value } })}
              className="w-full h-9 px-2 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            >
              <option value="EUR">EUR €</option>
              <option value="USD">USD $</option>
              <option value="GBP">GBP £</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Importo fisso</label>
            <input
              type="number"
              value={node.properties.amount ?? ''}
              onChange={e => updateNode(node.id, { properties: { ...node.properties, amount: +e.target.value } })}
              placeholder="0.00"
              className="w-full h-9 px-3 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Formula importo */}
      <div className="p-4 bg-[#f4f3fc] rounded-xl space-y-3 border border-[#c4c5d5]">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider flex items-center gap-1.5">
          <Icon name="calculate" size={15} />
          Formula importo
        </h4>
        <p className="text-[10px] text-[#747684]">Calcola l'importo da un campo × variabile. Sovrascrive l'importo fisso.</p>
        {!formula ? (
          <button
            onClick={() => setFormula({ fieldId: numericNodes[0]?.id ?? '', op: '*', variableId: variables[0]?.id ?? '' })}
            className="w-full py-2 border border-dashed border-[#c4c5d5] bg-white rounded-lg text-sm text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon name="add" size={16} /> Aggiungi formula
          </button>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Campo numero</label>
              <select
                value={formula.fieldId}
                onChange={e => setFormula({ fieldId: e.target.value })}
                className="w-full h-9 px-2 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
              >
                <option value="">— seleziona campo —</option>
                {numericNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Operazione</label>
              <div className="flex gap-1">
                {(['*', '+', '-', '/'] as FormulaOp[]).map(op => (
                  <button
                    key={op}
                    onClick={() => setFormula({ op })}
                    className={`flex-1 h-9 rounded-lg text-sm font-bold border transition-all ${
                      formula.op === op
                        ? 'bg-[#002068] text-white border-[#002068]'
                        : 'bg-white text-[#444653] border-[#c4c5d5] hover:border-[#002068]'
                    }`}
                  >
                    {OP_LABELS[op]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Variabile</label>
              <select
                value={formula.variableId}
                onChange={e => setFormula({ variableId: e.target.value })}
                className="w-full h-9 px-2 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
              >
                <option value="">— seleziona variabile —</option>
                {variables.map(v => (
                  <option key={v.id} value={v.id}>{v.name} = {v.value}{v.unit ? ` ${v.unit}` : ''}</option>
                ))}
              </select>
            </div>
            {formula.fieldId && formula.variableId && (() => {
              const srcNode = nodes.find(n => n.id === formula.fieldId)
              const variable = variables.find(v => v.id === formula.variableId)
              if (!srcNode || !variable) return null
              return (
                <div className="bg-white border border-[#b5c4ff] rounded-lg px-3 py-2 text-xs text-[#002068] font-mono">
                  {srcNode.properties.label || 'campo'} {OP_LABELS[formula.op]} {variable.name}({variable.value})
                  {variable.unit ? ` ${variable.unit}` : ''}
                </div>
              )
            })()}
            <button
              onClick={clearFormula}
              className="text-xs text-[#747684] hover:text-[#ba1a1a] flex items-center gap-1 transition-colors"
            >
              <Icon name="close" size={14} /> Rimuovi formula
            </button>
          </div>
        )}
      </div>

      {/* Pago di persona */}
      <div className="p-4 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
        <ToggleRow
          label="Abilita «Pagherò di persona»"
          value={payInPersonEnabled}
          onChange={v => updateNode(node.id, { properties: { ...node.properties, payInPersonEnabled: v } })}
        />
        <p className="text-[10px] text-[#747684] mt-2">
          Mostra l'opzione "Pagherò di persona" durante la compilazione
        </p>
      </div>
    </div>
  )
}

function FormulaEditor({ node }: { node: ReturnType<typeof useBuilderStore.getState>['nodes'][0] }) {
  const { nodes, variables, updateNode } = useBuilderStore()
  const formula = node.properties.formula
  const readOnly = !!node.properties.readOnly

  // campi numero disponibili come sorgente (esclude se stesso)
  const numericNodes = nodes.filter(n => n.id !== node.id && n.type === 'number')

  function setFormula(patch: Partial<NonNullable<typeof formula>>) {
    const base = formula ?? { fieldId: '', op: '*' as FormulaOp, variableId: '' }
    updateNode(node.id, { properties: { ...node.properties, formula: { ...base, ...patch } } })
  }

  function clearFormula() {
    const { formula: _f, readOnly: _r, ...rest } = node.properties
    updateNode(node.id, { properties: rest })
  }

  return (
    <div className="p-4 bg-[#f4f3fc] rounded-xl space-y-3 border border-[#c4c5d5]">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider flex items-center gap-1.5">
          <Icon name="calculate" size={15} />
          Formula di calcolo
        </h4>
        <ToggleRow
          label="Sola lettura"
          value={readOnly}
          onChange={v => updateNode(node.id, { properties: { ...node.properties, readOnly: v } })}
        />
      </div>

      {!formula ? (
        <button
          onClick={() => setFormula({ fieldId: numericNodes[0]?.id ?? '', op: '*', variableId: variables[0]?.id ?? '' })}
          className="w-full py-2 border border-dashed border-[#c4c5d5] bg-white rounded-lg text-sm text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="add" size={16} /> Aggiungi formula
        </button>
      ) : (
        <div className="space-y-2">
          {/* Campo sorgente */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Campo numero</label>
            <select
              value={formula.fieldId}
              onChange={e => setFormula({ fieldId: e.target.value })}
              className="w-full h-9 px-2 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            >
              <option value="">— seleziona campo —</option>
              {numericNodes.map(n => (
                <option key={n.id} value={n.id}>{n.properties.label || n.id}</option>
              ))}
            </select>
          </div>

          {/* Operatore */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Operazione</label>
            <div className="flex gap-1">
              {(['*', '+', '-', '/'] as FormulaOp[]).map(op => (
                <button
                  key={op}
                  onClick={() => setFormula({ op })}
                  className={`flex-1 h-9 rounded-lg text-sm font-bold border transition-all ${
                    formula.op === op
                      ? 'bg-[#002068] text-white border-[#002068]'
                      : 'bg-white text-[#444653] border-[#c4c5d5] hover:border-[#002068]'
                  }`}
                >
                  {OP_LABELS[op]}
                </button>
              ))}
            </div>
          </div>

          {/* Variabile */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Variabile</label>
            <select
              value={formula.variableId}
              onChange={e => setFormula({ variableId: e.target.value })}
              className="w-full h-9 px-2 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
            >
              <option value="">— seleziona variabile —</option>
              {variables.map(v => (
                <option key={v.id} value={v.id}>{v.name} = {v.value}{v.unit ? ` ${v.unit}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Anteprima formula */}
          {formula.fieldId && formula.variableId && (() => {
            const srcNode = nodes.find(n => n.id === formula.fieldId)
            const variable = variables.find(v => v.id === formula.variableId)
            if (!srcNode || !variable) return null
            return (
              <div className="bg-white border border-[#b5c4ff] rounded-lg px-3 py-2 text-xs text-[#002068] font-mono">
                {srcNode.properties.label || 'campo'} {OP_LABELS[formula.op]} {variable.name}({variable.value})
                {variable.unit ? ` ${variable.unit}` : ''}
              </div>
            )
          })()}

          <button
            onClick={clearFormula}
            className="text-xs text-[#747684] hover:text-[#ba1a1a] flex items-center gap-1 transition-colors"
          >
            <Icon name="close" size={14} /> Rimuovi formula
          </button>
        </div>
      )}
    </div>
  )
}
