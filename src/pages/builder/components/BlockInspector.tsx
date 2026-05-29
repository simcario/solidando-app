import { useBuilderStore } from '../../../stores/builderStore'
import Icon from '../../../components/ui/Icon'
import FormDesignPanel from './FormDesignPanel'
import { saveNow } from '../../../hooks/useAutosave'
import EndScreenInspector from './EndScreenInspector'

export default function BlockInspector() {
  const { nodes, selectedNodeId, updateNode, isSaving } = useBuilderStore()
  const node = nodes.find(n => n.id === selectedNodeId)

  return (
    <aside className="bg-[#faf8ff] border-l border-[#c4c5d5] w-80 h-full overflow-y-auto shrink-0 flex flex-col">
      <div className="p-4 border-b border-[#c4c5d5] bg-[#f4f3fc] flex items-center justify-between">
        <h3 className="text-xs font-bold text-[#002068] uppercase tracking-wider">
          {node ? 'Impostazioni Blocco' : 'Design Form'}
        </h3>
        <Icon name={node ? 'tune' : 'palette'} size={18} className="text-[#c4c5d5]" />
      </div>

      {!node ? (
        <FormDesignPanel />
      ) : node.type === 'end_screen' ? (
        <EndScreenInspector node={node} />
      ) : (
        <div className="p-4 space-y-6 flex-1">
          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Label</label>
            <input
              value={node.properties.label}
              onChange={e => updateNode(node.id, { properties: { ...node.properties, label: e.target.value } })}
              className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
          </div>

          {/* Placeholder */}
          {!['divider', 'rich_text', 'rating', 'checkbox', 'radio', 'dropdown', 'page_break'].includes(node.type) && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Placeholder</label>
              <input
                value={node.properties.placeholder ?? ''}
                onChange={e => updateNode(node.id, { properties: { ...node.properties, placeholder: e.target.value } })}
                className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
            </div>
          )}

          {/* Help Text */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Testo di aiuto</label>
            <input
              value={node.properties.helpText ?? ''}
              onChange={e => updateNode(node.id, { properties: { ...node.properties, helpText: e.target.value } })}
              className="w-full h-11 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              placeholder="Suggerimento per l'utente..."
            />
          </div>

          {/* Options for radio/checkbox/dropdown */}
          {['radio', 'checkbox', 'dropdown'].includes(node.type) && (
            <OptionsEditor node={node} />
          )}

          {/* Min/Max for number/slider */}
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

          {/* Toggles */}
          <div className="p-4 bg-[#f4f3fc] rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Comportamento</h4>
            <ToggleRow
              label="Obbligatoria"
              value={!!node.properties.required}
              onChange={v => updateNode(node.id, { properties: { ...node.properties, required: v } })}
            />
          </div>

          {/* Logic Section */}
          <div className="border-t border-[#c4c5d5] pt-4">
            <h4 className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-3">Logica e Salti</h4>
            <div className="bg-[#dce1ff] bg-opacity-20 border border-[#b5c4ff] border-opacity-30 p-4 rounded-xl">
              <p className="text-xs text-[#444653] mb-3">Configura regole condizionali per questo blocco</p>
              <button className="w-full py-2 border border-[#c4c5d5] bg-white rounded-lg text-sm text-left px-3 flex items-center justify-between text-[#444653] hover:border-[#002068] transition-colors">
                <span className="font-semibold">Aggiungi regola</span>
                <Icon name="chevron_right" size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Button — solo quando un blocco è selezionato */}
      {node && (
        <div className="p-4 border-t border-[#c4c5d5] bg-[#faf8ff]">
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
    </aside>
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

  function removeOption(index: number) {
    updateNode(node.id, { properties: { ...node.properties, options: options.filter((_, i) => i !== index) } })
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Opzioni</label>
      {options.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={opt.label}
            onChange={e => updateOption(i, e.target.value)}
            className="flex-1 h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
          />
          <button onClick={() => removeOption(i)} className="p-2 text-[#444653] hover:text-[#ba1a1a] transition-colors">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button onClick={addOption} className="flex items-center gap-1 text-sm font-semibold text-[#002068] hover:underline">
        <Icon name="add" size={16} /> Aggiungi opzione
      </button>
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
