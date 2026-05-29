import React, { useState, useEffect } from 'react'
import { useBuilderStore } from '../../../stores/builderStore'
import type { FieldStyle } from '../../../types/form'
import Icon from '../../../components/ui/Icon'
import { saveNow } from '../../../hooks/useAutosave'
import ImageUpload from '../../../components/ui/ImageUpload'
import { showToast } from '../../../components/ui/Toast'
import ImageGalleryModal from '../../../components/ui/ImageGalleryModal'

const PRESET_COLORS = [
  '#ffffff', '#f4f3fc', '#faf8ff', '#f0fdf4',
  '#fef9ec', '#fdf2f8', '#f0f9ff', '#fafafa',
]

const PRESET_GRADIENTS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#002068', '#fe9832'],
  ['#30cfd0', '#330867'],
]

type BgMode = 'none' | 'color' | 'gradient' | 'image'

// Parse the stored CSS value into component state
function parseBg(bg: string): {
  mode: BgMode
  color: string
  gradFrom: string
  gradTo: string
  gradAngle: number
  imageUrl: string
  opacity: number
} {
  if (!bg) return { mode: 'none', color: '#f4f3fc', gradFrom: '#002068', gradTo: '#fe9832', gradAngle: 135, imageUrl: '', opacity: 100 }

  // image: url("...") [+ overlay opacity encoded as meta comment]
  const imgMatch = bg.match(/^url\(["']?(.*?)["']?\)(?:\s*\/\*alpha:([\d.]+)\*\/)?$/)
  if (imgMatch) {
    return { mode: 'image', color: '#f4f3fc', gradFrom: '#002068', gradTo: '#fe9832', gradAngle: 135, imageUrl: imgMatch[1], opacity: imgMatch[2] ? parseFloat(imgMatch[2]) * 100 : 100 }
  }

  // gradient: linear-gradient(Xdeg, #from, #to) [/*alpha:N*/]
  const gradMatch = bg.match(/^linear-gradient\((\d+)deg,\s*(#[0-9a-fA-F]{6,8})\s*0%,\s*(#[0-9a-fA-F]{6,8})\s*100%\)(?:\s*\/\*alpha:([\d.]+)\*\/)?$/)
  if (gradMatch) {
    return { mode: 'gradient', color: '#f4f3fc', gradFrom: gradMatch[2], gradTo: gradMatch[3], gradAngle: parseInt(gradMatch[1]), imageUrl: '', opacity: gradMatch[4] ? parseFloat(gradMatch[4]) * 100 : 100 }
  }
  if (bg.startsWith('linear-gradient')) {
    // preset gradients that don't match exact format - keep as-is, extract colors if possible
    const simpleMatch = bg.match(/linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{3,8}).*?,\s*(#[0-9a-fA-F]{3,8})/)
    return { mode: 'gradient', color: '#f4f3fc', gradFrom: simpleMatch?.[1] ?? '#002068', gradTo: simpleMatch?.[2] ?? '#fe9832', gradAngle: 135, imageUrl: '', opacity: 100 }
  }

  // color: #hex [/*alpha:N*/]
  const colorMatch = bg.match(/^(#[0-9a-fA-F]{3,8})(?:\s*\/\*alpha:([\d.]+)\*\/)?$/)
  if (colorMatch) {
    return { mode: 'color', color: colorMatch[1], gradFrom: '#002068', gradTo: '#fe9832', gradAngle: 135, imageUrl: '', opacity: colorMatch[2] ? parseFloat(colorMatch[2]) * 100 : 100 }
  }

  return { mode: 'color', color: bg, gradFrom: '#002068', gradTo: '#fe9832', gradAngle: 135, imageUrl: '', opacity: 100 }
}

function buildBgValue(mode: BgMode, color: string, gradFrom: string, gradTo: string, gradAngle: number, imageUrl: string, opacity: number): string {
  const alphaMeta = opacity < 100 ? ` /*alpha:${(opacity / 100).toFixed(2)}*/` : ''
  if (mode === 'none') return ''
  if (mode === 'color') return `${color}${alphaMeta}`
  if (mode === 'gradient') return `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)${alphaMeta}`
  if (mode === 'image') return imageUrl ? `url("${imageUrl}")${alphaMeta}` : ''
  return ''
}

// Convert stored value to CSS style object for the canvas
export function resolveBgStyle(bg: string): React.CSSProperties {
  if (!bg) return {}
  const { mode, color, gradFrom, gradTo, gradAngle, imageUrl, opacity } = parseBg(bg)
  const alpha = opacity / 100

  if (mode === 'color') {
    // Apply opacity by converting hex to rgba
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return { backgroundColor: `rgba(${r},${g},${b},${alpha})` }
  }
  if (mode === 'gradient') {
    if (alpha < 1) {
      // Wrap gradient in a pseudo-overlay via a composed background
      return { background: `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)`, opacity: alpha }
    }
    return { background: `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)` }
  }
  if (mode === 'image') {
    return { backgroundImage: `url("${imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: alpha }
  }
  return {}
}

const FIELD_STYLE_OPTIONS: { value: FieldStyle; label: string; icon: string; preview: string }[] = [
  {
    value: 'underline',
    label: 'Sottolineato',
    icon: 'border_bottom',
    preview: 'border-b-2 border-[#c4c5d5] bg-transparent',
  },
  {
    value: 'outline',
    label: 'Contorno',
    icon: 'border_all',
    preview: 'border-2 border-[#c4c5d5] rounded-xl bg-transparent',
  },
  {
    value: 'filled',
    label: 'Riempito',
    icon: 'rectangle',
    preview: 'border-2 border-transparent rounded-xl bg-[#f4f3fc]',
  },
]

export default function FormDesignPanel() {
  const { formBackground, setFormBackground, formMode, setFormMode, fieldStyle, setFieldStyle, isSaving } = useBuilderStore()

  // Local state mirrors the stored value; synced on mount and when formBackground changes externally
  const [mode, setModeState] = useState<BgMode>('none')
  const [color, setColor] = useState('#f4f3fc')
  const [gradFrom, setGradFrom] = useState('#002068')
  const [gradTo, setGradTo] = useState('#fe9832')
  const [gradAngle, setGradAngle] = useState(135)
  const [imageUrl, setImageUrl] = useState('')
  const [opacity, setOpacity] = useState(100)
  const [showGallery, setShowGallery] = useState(false)

  useEffect(() => {
    const parsed = parseBg(formBackground)
    setModeState(parsed.mode)
    setColor(parsed.color)
    setGradFrom(parsed.gradFrom)
    setGradTo(parsed.gradTo)
    setGradAngle(parsed.gradAngle)
    setImageUrl(parsed.imageUrl)
    setOpacity(parsed.opacity)
  }, []) // only on mount to avoid overriding user edits

  function commit(overrides: Partial<{ mode: BgMode; color: string; gradFrom: string; gradTo: string; gradAngle: number; imageUrl: string; opacity: number }>) {
    const m = overrides.mode ?? mode
    const c = overrides.color ?? color
    const gf = overrides.gradFrom ?? gradFrom
    const gt = overrides.gradTo ?? gradTo
    const ga = overrides.gradAngle ?? gradAngle
    const iu = overrides.imageUrl ?? imageUrl
    const op = overrides.opacity ?? opacity
    setFormBackground(buildBgValue(m, c, gf, gt, ga, iu, op))
  }

  function handleSetMode(m: BgMode) {
    setModeState(m)
    if (m === 'none') {
      setFormBackground('')
    } else if (m === 'color') {
      commit({ mode: m })
    } else if (m === 'gradient') {
      commit({ mode: m })
    } else {
      // image: keep current imageUrl; don't clear formBackground — will commit when image is set
      if (imageUrl) commit({ mode: m })
      // if no imageUrl yet, don't write anything — wait for upload/URL input
    }
  }

  const previewStyle = (() => {
    if (mode === 'none') return {}
    if (mode === 'color') {
      const hex = color.length === 7 ? color : '#f4f3fc'
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return { backgroundColor: `rgba(${r},${g},${b},${opacity / 100})` }
    }
    if (mode === 'gradient') {
      return { background: `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)`, opacity: opacity / 100 }
    }
    if (mode === 'image' && imageUrl) {
      return { backgroundImage: `url("${imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: opacity / 100 }
    }
    return {}
  })()

  const modeLabels: Record<BgMode, string> = { none: 'Nessuno', color: 'Colore', gradient: 'Sfumatura', image: 'Immagine' }

  return (
    <div className="p-4 space-y-6 flex-1 overflow-y-auto">
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Modalità di visualizzazione</h4>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setFormMode('conversational')}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
              formMode === 'conversational'
                ? 'border-[#002068] bg-[#dce1ff]'
                : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
            }`}
          >
            <Icon name="chat_bubble" size={22} className={formMode === 'conversational' ? 'text-[#002068]' : 'text-[#747684]'} />
            <div>
              <p className={`text-xs font-bold ${formMode === 'conversational' ? 'text-[#002068]' : 'text-[#1a1b22]'}`}>Conversazionale</p>
              <p className="text-[10px] text-[#747684] leading-tight mt-0.5">Una domanda alla volta</p>
            </div>
          </button>
          <button
            onClick={() => setFormMode('classic')}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
              formMode === 'classic'
                ? 'border-[#002068] bg-[#dce1ff]'
                : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
            }`}
          >
            <Icon name="view_agenda" size={22} className={formMode === 'classic' ? 'text-[#002068]' : 'text-[#747684]'} />
            <div>
              <p className={`text-xs font-bold ${formMode === 'classic' ? 'text-[#002068]' : 'text-[#1a1b22]'}`}>Classico</p>
              <p className="text-[10px] text-[#747684] leading-tight mt-0.5">Tutti i campi visibili, pagine con interruzione</p>
            </div>
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Stile dei Campi</h4>
        <div className="grid grid-cols-3 gap-2">
          {FIELD_STYLE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFieldStyle(opt.value)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                fieldStyle === opt.value
                  ? 'border-[#002068] bg-[#dce1ff]'
                  : 'border-[#c4c5d5] hover:border-[#b5c4ff]'
              }`}
            >
              {/* Mini preview dell'input */}
              <div className={`w-full h-7 ${opt.preview}`} />
              <p className={`text-[10px] font-bold leading-tight ${fieldStyle === opt.value ? 'text-[#002068]' : 'text-[#444653]'}`}>
                {opt.label}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Sfondo del Form</h4>

        {/* Mode selector */}
        <div className="grid grid-cols-4 gap-1 bg-[#f4f3fc] p-1 rounded-xl border border-[#c4c5d5]">
          {(['none', 'color', 'gradient', 'image'] as BgMode[]).map(m => (
            <button
              key={m}
              onClick={() => handleSetMode(m)}
              className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === m ? 'bg-white text-[#002068] shadow-sm' : 'text-[#444653] hover:bg-[#e8e7f0]'
              }`}
            >
              {modeLabels[m]}
            </button>
          ))}
        </div>

        {/* ── Color ── */}
        {mode === 'color' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => { setColor(e.target.value); commit({ color: e.target.value }) }}
                className="w-10 h-10 rounded-lg cursor-pointer border border-[#c4c5d5] p-0.5"
              />
              <input
                type="text"
                value={color}
                onChange={e => { setColor(e.target.value); commit({ color: e.target.value }) }}
                className="flex-1 h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none"
                placeholder="#f4f3fc"
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => { setColor(c); commit({ color: c }) }}
                  className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-105 ${
                    color === c ? 'border-[#002068] scale-105' : 'border-[#c4c5d5]'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Gradient ── */}
        {mode === 'gradient' && (
          <div className="space-y-3">
            {/* Preset swatches */}
            <div className="grid grid-cols-4 gap-2">
              {PRESET_GRADIENTS.map(([from, to]) => {
                const g = `linear-gradient(135deg, ${from} 0%, ${to} 100%)`
                const active = gradFrom === from && gradTo === to && gradAngle === 135
                return (
                  <button
                    key={g}
                    onClick={() => { setGradFrom(from); setGradTo(to); setGradAngle(135); commit({ gradFrom: from, gradTo: to, gradAngle: 135 }) }}
                    className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-105 ${active ? 'border-[#002068] scale-105' : 'border-transparent'}`}
                    style={{ background: g }}
                    title={g}
                  />
                )
              })}
            </div>
            {/* Custom from/to */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Colori personalizzati</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs text-[#747684] whitespace-nowrap">Da</label>
                  <input type="color" value={gradFrom}
                    onChange={e => { setGradFrom(e.target.value); commit({ gradFrom: e.target.value }) }}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[#c4c5d5] p-0.5 flex-shrink-0"
                  />
                  <input type="text" value={gradFrom}
                    onChange={e => { setGradFrom(e.target.value); commit({ gradFrom: e.target.value }) }}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                    placeholder="#002068"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-xs text-[#747684] whitespace-nowrap">A</label>
                  <input type="color" value={gradTo}
                    onChange={e => { setGradTo(e.target.value); commit({ gradTo: e.target.value }) }}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-[#c4c5d5] p-0.5 flex-shrink-0"
                  />
                  <input type="text" value={gradTo}
                    onChange={e => { setGradTo(e.target.value); commit({ gradTo: e.target.value }) }}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                    placeholder="#fe9832"
                  />
                </div>
              </div>
              {/* Angle */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#747684] whitespace-nowrap w-16">Angolo {gradAngle}°</label>
                <input type="range" min={0} max={360} value={gradAngle}
                  onChange={e => { const v = parseInt(e.target.value); setGradAngle(v); commit({ gradAngle: v }) }}
                  className="flex-1 accent-[#002068]"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Image ── */}
        {mode === 'image' && (
          <div className="space-y-3">
            <ImageUpload
              path="backgrounds"
              currentUrl={imageUrl}
              onUploaded={url => {
                setImageUrl(url)
                commit({ imageUrl: url })
              }}
              onError={msg => showToast(msg, 'error')}
              label="Trascina o clicca per caricare"
            />
            <button
              onClick={() => setShowGallery(true)}
              className="w-full flex items-center justify-center gap-2 h-9 border border-[#c4c5d5] bg-[#f4f3fc] rounded-lg text-xs font-semibold text-[#444653] hover:bg-[#e8e7f0] transition-colors"
            >
              <Icon name="photo_library" size={16} />
              Scegli dalla galleria
            </button>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">oppure URL diretto</label>
              <input
                type="text"
                value={imageUrl}
                onChange={e => {
                  const url = e.target.value.trim()
                  setImageUrl(url)
                  commit({ imageUrl: url })
                }}
                className="w-full h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
                placeholder="https://..."
              />
            </div>
          </div>
        )}

        {/* ── Opacity ── (visible for all modes except none) */}
        {mode !== 'none' && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Opacità</label>
              <span className="text-xs font-mono text-[#002068]">{opacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={e => { const v = parseInt(e.target.value); setOpacity(v); commit({ opacity: v }) }}
              className="w-full accent-[#002068]"
            />
          </div>
        )}

        {/* ── Preview ── */}
        {mode !== 'none' && (
          <div className="mt-2">
            <p className="text-xs text-[#747684] mb-1.5">Anteprima</p>
            <div
              className="w-full h-16 rounded-xl border border-[#c4c5d5] overflow-hidden"
              style={previewStyle}
            />
          </div>
        )}
      </section>

      {/* Save button */}
      <div className="border-t border-[#c4c5d5] pt-4">
        <button
          onClick={() => saveNow()}
          disabled={isSaving}
          className="w-full h-11 bg-[#002068] text-white rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#003399] active:scale-95 transition-all disabled:opacity-60 text-sm"
        >
          <Icon name="save" size={18} />
          {isSaving ? 'Salvataggio...' : 'Salva Design'}
        </button>
      </div>

      {showGallery && (
        <ImageGalleryModal
          paths={['backgrounds', 'covers']}
          uploadPath="backgrounds"
          currentUrl={imageUrl}
          onSelect={url => {
            setImageUrl(url)
            commit({ imageUrl: url })
          }}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}
