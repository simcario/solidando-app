import { useBuilderStore } from '../../../stores/builderStore'
import Icon from '../../../components/ui/Icon'
import { resolveTemplate } from '../../../utils/resolveTemplate'

export default function CoverBlock() {
  const { cover, showCover, setShowCover, title, variables, nodes, coverSelected, selectCover, selectNode } = useBuilderStore()
  const resolvedTitle = resolveTemplate(cover.title || title, variables, nodes)
  const resolvedSubtitle = resolveTemplate(cover.subtitle, variables, nodes)

  const bgStyle = resolveBg(cover)

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    selectCover()
  }

  return (
    <div
      className={`rounded-xl overflow-hidden border shadow-sm relative cursor-pointer transition-all ${
        coverSelected ? 'border-[#002068] ring-2 ring-[#002068]' : 'border-[#c4c5d5] hover:border-[#002068]/40'
      }`}
      onClick={handleClick}
    >
      {/* Toggle on/off */}
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={e => { e.stopPropagation(); setShowCover(!showCover); selectCover() }}
          title={showCover ? 'Nascondi copertina' : 'Mostra copertina'}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-black/30 backdrop-blur-sm text-white rounded-lg text-xs font-semibold hover:bg-black/50 transition-all"
        >
          <Icon name={showCover ? 'visibility_off' : 'visibility'} size={14} />
          {showCover ? 'Nascondi' : 'Attiva'}
        </button>
      </div>

      {showCover ? (
        /* ── Anteprima copertina ── */
        <div className="relative min-h-48 flex flex-col justify-end p-8" style={bgStyle}>
          {cover.backgroundType === 'image' && cover.imageUrl && (
            <div
              className="absolute inset-0 bg-white pointer-events-none"
              style={{ opacity: 1 - (cover.imageOpacity ?? 100) / 100 }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

          <div className="relative z-10 space-y-1">
            <h1 className="text-2xl font-bold" style={{ color: cover.textColor }}>
              {resolvedTitle || <span className="opacity-40 italic text-lg">Titolo della copertina</span>}
            </h1>
            {(cover.subtitle || !resolvedTitle) && (
              <p className="text-base" style={{ color: cover.textColor, opacity: 0.8 }}>
                {resolvedSubtitle || <span className="opacity-40 italic text-sm">Sottotitolo</span>}
              </p>
            )}
          </div>

          {coverSelected && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="bg-[#002068]/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5">
                <Icon name="tune" size={13} />
                Modifica nella barra laterale
              </span>
            </div>
          )}
        </div>
      ) : (
        /* ── Copertina disattivata ── */
        <div
          className="bg-white p-6 flex items-center gap-4 min-h-24"
          onClick={e => { e.stopPropagation(); selectNode(null) }}
        >
          <div className="w-10 h-10 bg-[#dce1ff] rounded-full flex items-center justify-center flex-shrink-0">
            <Icon name="image" size={22} className="text-[#002068]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#002068]">{title || 'Untitled Form'}</h2>
            <p className="text-[#747684] text-xs mt-0.5">Clicca "Attiva" per aggiungere una schermata iniziale</p>
          </div>
        </div>
      )}
    </div>
  )
}

function resolveBg(cover: ReturnType<typeof useBuilderStore.getState>['cover']): React.CSSProperties {
  if (cover.backgroundType === 'gradient') {
    return { background: `linear-gradient(135deg, ${cover.gradientFrom}, ${cover.gradientTo})` }
  }
  if (cover.backgroundType === 'image' && cover.imageUrl) {
    return {
      backgroundImage: `url(${cover.imageUrl})`,
      backgroundSize: 'cover',
      backgroundPosition: cover.imagePosition ?? 'center center',
    }
  }
  return { backgroundColor: cover.backgroundColor }
}
