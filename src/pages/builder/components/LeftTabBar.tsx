import Icon from '../../../components/ui/Icon'
import type { FieldType } from '../../../types/form'

const INPUT_COMPONENTS: { type: FieldType; icon: string; label: string }[] = [
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
]

const STRUCTURE_COMPONENTS: { type: FieldType; icon: string; label: string }[] = [
  { type: 'page_break', icon: 'insert_page_break', label: 'Interruzione' },
  { type: 'end_screen', icon: 'celebration', label: 'End Screen' },
]

interface Props {
  activePanel: 'components' | null
  onToggle: (panel: 'components') => void
  onAdd: (type: FieldType) => void
}

export default function LeftTabBar({ activePanel, onToggle, onAdd }: Props) {
  const open = activePanel === 'components'

  return (
    <div className="flex h-full shrink-0">
      {/* Tab rail */}
      <div className="w-12 bg-[#f4f3fc] border-r border-[#c4c5d5] flex flex-col items-center pt-3 gap-1 z-30 shrink-0">
        <TabButton
          icon="widgets"
          label="Componenti"
          active={open}
          onClick={() => onToggle('components')}
        />
      </div>

      {/* Panel */}
      <aside
        className={`bg-[#f4f3fc] border-r border-[#c4c5d5] flex flex-col h-full overflow-y-auto shrink-0 transition-all duration-200 ${
          open ? 'w-60' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="p-4 border-b border-[#c4c5d5] flex-shrink-0">
          <h2 className="text-xs font-bold text-[#444653] uppercase tracking-wider">Componenti</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {INPUT_COMPONENTS.map(({ type, icon, label }) => (
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

          <div>
            <p className="text-xs font-bold text-[#444653] uppercase tracking-wider mb-2">Struttura</p>
            <div className="grid grid-cols-2 gap-2">
              {STRUCTURE_COMPONENTS.map(({ type, icon, label }) => (
                <button
                  key={type}
                  onClick={() => onAdd(type)}
                  className="flex flex-col items-center justify-center p-3 bg-white border border-[#fe9832] rounded-lg cursor-pointer hover:border-[#002068] hover:shadow-sm transition-all group"
                >
                  <Icon name={icon} size={22} className="text-[#fe9832] group-hover:scale-110 transition-transform mb-1" />
                  <span className="text-xs text-[#444653] text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

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
