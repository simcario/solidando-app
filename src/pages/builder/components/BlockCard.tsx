import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Icon from '../../../components/ui/Icon'
import { useBuilderStore } from '../../../stores/builderStore'
import type { FormNode } from '../../../types/form'
import { resolveTemplate } from '../../../utils/resolveTemplate'

const FIELD_ICONS: Record<string, string> = {
  short_text: 'short_text', long_text: 'notes', email: 'mail', number: 'pin',
  phone: 'phone', date: 'calendar_month', time: 'schedule', dropdown: 'arrow_drop_down_circle',
  radio: 'radio_button_checked', checkbox: 'checklist', slider: 'linear_scale',
  rating: 'star', file_upload: 'upload_file', payment: 'payments',
  rich_text: 'text_fields', divider: 'horizontal_rule', hidden: 'visibility_off',
  end_screen: 'celebration', page_break: 'insert_page_break',
}

interface Props {
  node: FormNode
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
}

export default function BlockCard({ node, isSelected, onClick }: Props) {
  const { removeNode, duplicateNode, variables, nodes } = useBuilderStore()
  const label = resolveTemplate(node.properties.label, variables, nodes)
  const helpText = node.properties.helpText
    ? resolveTemplate(node.properties.helpText, variables, nodes)
    : undefined
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`
        bg-white rounded-xl border-2 transition-all group relative
        ${isSelected ? 'border-[#002068] shadow-lg' : 'border-[#c4c5d5] hover:border-[#b5c4ff]'}
      `}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#002068] rounded-l-xl" />}

      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1"
      >
        <Icon name="drag_indicator" size={20} className="text-[#747684] hover:text-[#002068]" />
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded ${isSelected ? 'bg-[#dce1ff] text-[#002068]' : 'bg-[#e8e7f0] text-[#444653]'}`}>
              Q{node.position + 1}
            </span>
            <span className="text-xs text-[#747684] flex items-center gap-1">
              <Icon name={FIELD_ICONS[node.type] ?? 'help'} size={14} />
              {node.type.replace('_', ' ')}
            </span>
          </div>
          {isSelected && (
            <div className="flex gap-1">
              <button
                onClick={e => { e.stopPropagation(); removeNode(node.id) }}
                className="p-1.5 text-[#444653] hover:text-[#ba1a1a] hover:bg-[#ffdad6] rounded transition-colors"
              >
                <Icon name="delete" size={16} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); duplicateNode(node.id) }}
                className="p-1.5 text-[#444653] hover:bg-[#e8e7f0] rounded transition-colors"
                title="Duplica campo"
              >
                <Icon name="content_copy" size={16} />
              </button>
            </div>
          )}
        </div>

        <p className="text-lg font-semibold text-[#1a1b22] mb-1">
          {label || 'Domanda senza titolo'}
        </p>
        {helpText && (
          <p className="text-xs text-[#747684] mb-3">{helpText}</p>
        )}

        <FieldPreview node={node} />

        {isSelected && (
          <div className="mt-4 pt-4 border-t border-[#c4c5d5] flex gap-4 items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className={`w-10 h-5 rounded-full relative transition-colors ${node.properties.required ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${node.properties.required ? 'left-5' : 'left-0.5'}`} />
              </div>
              <span className="text-xs text-[#444653]">Obbligatoria</span>
            </label>
            <div className="h-4 w-px bg-[#c4c5d5]" />
            <button className="flex items-center gap-1 text-sm font-semibold text-[#002068]">
              <Icon name="add_link" size={16} />
              Logica di salto
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function FieldPreview({ node }: { node: FormNode }) {
  const { type, properties } = node

  if (type === 'end_screen') {
    const bgType = properties.backgroundType ?? 'color'
    const bg = bgType === 'gradient'
      ? `linear-gradient(135deg, ${properties.gradientFrom ?? '#002068'}, ${properties.gradientTo ?? '#fe9832'})`
      : bgType === 'image' && properties.backgroundImageUrl
        ? `url(${properties.backgroundImageUrl}) center/cover`
        : (properties.backgroundColor ?? '#002068')
    const textColor = properties.textColor ?? '#ffffff'
    const rawMessage = properties.message || '<p>Grazie per aver compilato il form!</p>'
    return (
      <div
        className="rounded-lg p-4 flex flex-col items-center gap-2 text-center min-h-[80px] justify-center"
        style={{ background: bg, color: textColor }}
      >
        <Icon name="celebration" size={20} className="opacity-80" />
        <div
          className="text-xs font-semibold leading-snug line-clamp-2 [&_*]:text-inherit [&_h2]:font-black"
          style={{ color: textColor }}
          dangerouslySetInnerHTML={{ __html: rawMessage }}
        />
        {properties.buttonLabel && (
          <span className="text-xs px-3 py-1 rounded-full font-bold mt-1" style={{ background: 'rgba(255,255,255,0.2)', color: textColor }}>
            {properties.buttonLabel}
          </span>
        )}
      </div>
    )
  }
  if (type === 'page_break') return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t-2 border-dashed border-[#b5c4ff]" />
      <span className="text-xs font-bold text-[#002068] bg-[#dce1ff] px-2 py-0.5 rounded-full flex items-center gap-1">
        <Icon name="insert_page_break" size={12} />
        Pagina successiva
      </span>
      <div className="flex-1 border-t-2 border-dashed border-[#b5c4ff]" />
    </div>
  )
  if (type === 'divider') return <hr className="border-[#c4c5d5]" />
  if (type === 'rating') return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(i => <Icon key={i} name="star" size={24} className={i <= 3 ? 'text-[#fe9832]' : 'text-[#c4c5d5]'} />)}
    </div>
  )
  if (['radio', 'dropdown'].includes(type)) return (
    <div className="space-y-1.5">
      {(properties.options ?? [{ label: 'Opzione 1', value: '1' }, { label: 'Opzione 2', value: '2' }]).slice(0, 3).map(opt => (
        <div key={opt.value} className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-[#c4c5d5]" />
          <span className="text-sm text-[#444653]">{opt.label}</span>
        </div>
      ))}
    </div>
  )
  if (type === 'checkbox') return (
    <div className="space-y-1.5">
      {(properties.options ?? [{ label: 'Opzione 1', value: '1' }, { label: 'Opzione 2', value: '2' }]).slice(0, 3).map(opt => (
        <div key={opt.value} className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border-2 border-[#c4c5d5]" />
          <span className="text-sm text-[#444653]">{opt.label}</span>
        </div>
      ))}
    </div>
  )
  if (type === 'survey') {
    const rows = properties.surveyRows ?? [{ id: '1', label: 'Affermazione 1' }, { id: '2', label: 'Affermazione 2' }]
    const cols = properties.surveyColumns ?? [{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }, { value: '5', label: '5' }]
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left font-normal text-[#747684] pb-1 pr-2 w-1/2"></th>
              {cols.map(c => <th key={c.value} className="text-center font-semibold text-[#444653] pb-1 px-1">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 3).map(row => (
              <tr key={row.id} className="border-t border-[#e8e7f0]">
                <td className="py-1 pr-2 text-[#444653] truncate max-w-[80px]">{row.label}</td>
                {cols.map(c => (
                  <td key={c.value} className="text-center py-1 px-1">
                    <div className="w-3 h-3 rounded-full border border-[#c4c5d5] mx-auto" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (type === 'payment') {
    const currency = properties.currency ?? 'EUR'
    const amount = properties.amount
    const formula = properties.paymentFormula
    const termCount = formula ? ('terms' in formula ? formula.terms.length : 1) : 0
    const hasFormula = termCount > 0
    const payInPerson = !!properties.payInPersonEnabled

    const amountLabel = hasFormula
      ? termCount > 1 ? `Formula (${termCount} termini)` : 'Importo calcolato'
      : amount
        ? new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount)
        : 'Importo non impostato'

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-[#dce1ff] rounded-lg">
          <Icon name="payments" size={16} className="text-[#002068]" />
          <span className="text-sm font-bold text-[#002068]">{amountLabel}</span>
          {hasFormula && <Icon name="calculate" size={14} className="text-[#444653]" />}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 bg-[#e8f0fb] text-[#003087] rounded font-semibold">PayPal (config. in Impostazioni)</span>
          {payInPerson && (
            <span className="text-xs px-2 py-1 bg-[#e8f0fb] text-[#002068] rounded font-semibold">Di persona ✓</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-11 w-full bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg flex items-center px-4 text-sm text-[#747684]">
      {properties.placeholder || 'Risposta utente...'}
    </div>
  )
}
