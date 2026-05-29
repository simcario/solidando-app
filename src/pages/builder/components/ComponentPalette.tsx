import Icon from '../../../components/ui/Icon'
import type { FieldType } from '../../../types/form'

const COMPONENTS: { type: FieldType; icon: string; label: string }[] = [
  { type: 'short_text', icon: 'short_text', label: 'Short Text' },
  { type: 'long_text', icon: 'notes', label: 'Long Text' },
  { type: 'email', icon: 'mail', label: 'Email' },
  { type: 'number', icon: 'pin', label: 'Number' },
  { type: 'phone', icon: 'phone', label: 'Phone' },
  { type: 'date', icon: 'calendar_month', label: 'Date' },
  { type: 'time', icon: 'schedule', label: 'Time' },
  { type: 'dropdown', icon: 'arrow_drop_down_circle', label: 'Dropdown' },
  { type: 'radio', icon: 'radio_button_checked', label: 'Radio' },
  { type: 'checkbox', icon: 'checklist', label: 'Checkbox' },
  { type: 'survey', icon: 'ballot', label: 'Sondaggio' },
  { type: 'slider', icon: 'linear_scale', label: 'Slider' },
  { type: 'rating', icon: 'star', label: 'Rating' },
  { type: 'file_upload', icon: 'upload_file', label: 'File Upload' },
  { type: 'payment', icon: 'payments', label: 'Payment' },
  { type: 'rich_text', icon: 'text_fields', label: 'Rich Text' },
  { type: 'divider', icon: 'horizontal_rule', label: 'Divider' },
  { type: 'page_break', icon: 'insert_page_break', label: 'Page Break' },
]

interface Props {
  onAdd: (type: FieldType) => void
}

export default function ComponentPalette({ onAdd }: Props) {
  return (
    <aside className="bg-[#f4f3fc] border-r border-[#c4c5d5] flex flex-col h-full w-64 shrink-0 z-30 overflow-y-auto">
      <div className="p-4 border-b border-[#c4c5d5]">
        <h2 className="text-xs font-bold text-[#444653] uppercase tracking-wider">Aggiungi Componenti</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          {COMPONENTS.map(({ type, icon, label }) => (
            <button
              key={type}
              onClick={() => onAdd(type)}
              className="flex flex-col items-center justify-center p-3 bg-white border border-[#c4c5d5] rounded-lg cursor-pointer hover:border-[#002068] hover:shadow-sm transition-all group"
            >
              <Icon name={icon} size={22} className="text-[#002068] group-hover:scale-110 transition-transform mb-1" />
              <span className="text-xs text-[#444653] text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
