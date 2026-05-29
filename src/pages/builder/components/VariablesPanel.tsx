import { useBuilderStore } from '../../../stores/builderStore'
import Icon from '../../../components/ui/Icon'

export default function VariablesPanel() {
  const { variables, addVariable, updateVariable, removeVariable } = useBuilderStore()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[#c4c5d5] bg-[#f4f3fc] flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Variabili</h3>
        <Icon name="data_object" size={18} className="text-[#c4c5d5]" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-[#747684]">
          Usa <code className="bg-[#e8e7f0] px-1 rounded">{'{{nome}}'}</code> nelle label, testi di aiuto, blocchi testo e nella cover per inserire il valore di una variabile.
        </p>

        {variables.length === 0 && (
          <div className="text-center py-8 text-[#747684] text-sm">
            Nessuna variabile definita
          </div>
        )}

        {variables.map(v => (
          <div key={v.id} className="bg-white border border-[#c4c5d5] rounded-xl p-3 space-y-2">
            {/* Riga nome + elimina */}
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Nome</label>
                <input
                  value={v.name}
                  onChange={e => updateVariable(v.id, { name: e.target.value.replace(/\s+/g, '_') })}
                  className="w-full h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  placeholder="nome_variabile"
                />
              </div>
              <button
                onClick={() => removeVariable(v.id)}
                className="mt-5 p-1.5 text-[#747684] hover:text-[#ba1a1a] transition-colors"
                title="Elimina variabile"
              >
                <Icon name="delete" size={16} />
              </button>
            </div>

            {/* Valore + unità */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Valore</label>
                <input
                  type="number"
                  value={v.value}
                  onChange={e => updateVariable(v.id, { value: Number(e.target.value) })}
                  className="w-full h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
                />
              </div>
              <div className="w-20 space-y-1">
                <label className="text-[10px] font-bold text-[#747684] uppercase tracking-wider">Unità</label>
                <input
                  value={v.unit ?? ''}
                  onChange={e => updateVariable(v.id, { unit: e.target.value || undefined })}
                  className="w-full h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  placeholder="€"
                />
              </div>
            </div>

            {/* Tag anteprima */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-[#747684]">Usa come:</span>
              <code className="text-[10px] bg-[#dce1ff] text-[#002068] px-1.5 py-0.5 rounded font-mono">
                {`{{${v.name}}}`}
              </code>
              <span className="text-[10px] text-[#747684]">→</span>
              <span className="text-[10px] font-semibold text-[#1a1b22]">
                {v.value}{v.unit ? ` ${v.unit}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-[#c4c5d5] bg-[#faf8ff] flex-shrink-0">
        <button
          onClick={addVariable}
          className="w-full h-10 border-2 border-dashed border-[#c4c5d5] rounded-xl flex items-center justify-center gap-2 text-sm font-semibold text-[#444653] hover:border-[#002068] hover:text-[#002068] transition-all"
        >
          <Icon name="add" size={18} />
          Aggiungi variabile
        </button>
      </div>
    </div>
  )
}
