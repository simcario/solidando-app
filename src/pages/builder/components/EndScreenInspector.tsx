import { useRef, useState } from 'react'
import { useBuilderStore } from '../../../stores/builderStore'
import { useAuthStore } from '../../../stores/authStore'
import Icon from '../../../components/ui/Icon'
import { showToast } from '../../../components/ui/Toast'
import { uploadImage } from '../../../firebase/storage'
import type { FormNode } from '../../../types/form'
import EndScreenMessageEditor from './EndScreenMessageEditor'
import ImageGalleryModal from '../../../components/ui/ImageGalleryModal'

interface Props {
  node: FormNode
}

export default function EndScreenInspector({ node }: Props) {
  const { updateNode, variables, nodes } = useBuilderStore()
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const p = node.properties

  function set(patch: Partial<FormNode['properties']>) {
    updateNode(node.id, { properties: { ...p, ...patch } })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { showToast('Solo immagini (JPG, PNG, WebP)', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Dimensione massima: 5 MB', 'error'); return }
    setUploading(true)
    try {
      const { url } = await uploadImage(file, 'covers', user.uid)
      set({ backgroundImageUrl: url })
    } catch {
      showToast('Errore nel caricamento', 'error')
    } finally {
      setUploading(false)
    }
  }

  const bgType = p.backgroundType ?? 'color'

  const previewBgStyle: React.CSSProperties = bgType === 'gradient'
    ? { background: `linear-gradient(135deg, ${p.gradientFrom ?? '#002068'}, ${p.gradientTo ?? '#fe9832'})` }
    : bgType === 'image' && p.backgroundImageUrl
      ? {
          backgroundImage: `url(${p.backgroundImageUrl})`,
          backgroundSize: p.backgroundImageSize === 'stretch' ? '100% 100%' : (p.backgroundImageSize ?? 'cover'),
          backgroundPosition: p.backgroundImagePosition ?? 'center center',
          backgroundRepeat: p.backgroundImageRepeat ?? 'no-repeat',
        }
      : { backgroundColor: p.backgroundColor ?? '#002068' }

  const textColor = p.textColor ?? '#ffffff'
  const rawMessage = p.message || '<p>Grazie per aver compilato il form!</p>'
  const imageOpacity = p.backgroundImageOpacity ?? 100

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Live preview */}
      <div
        className="mx-4 mt-4 rounded-xl overflow-hidden relative flex flex-col items-center justify-center gap-3 text-center p-6 min-h-[160px]"
        style={previewBgStyle}
      >
        {bgType === 'image' && p.backgroundImageUrl && (
          <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 1 - imageOpacity / 100 }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <Icon name="celebration" size={32} className="opacity-80" />
          <div
            className="end-screen-content text-sm leading-snug max-w-full"
            style={{ color: textColor }}
            dangerouslySetInnerHTML={{ __html: rawMessage }}
          />
          {p.buttonLabel && (
            <span className="text-xs px-4 py-1.5 rounded-full font-bold" style={{ background: 'rgba(255,255,255,0.2)', color: textColor }}>
              {p.buttonLabel}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Messaggio */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Messaggio</label>
          <EndScreenMessageEditor
            value={p.message ?? ''}
            onChange={html => set({ message: html })}
            variables={variables}
            fieldTokens={nodes
              .filter(n => n.id !== node.id && !['divider', 'end_screen', 'rich_text', 'page_break'].includes(n.type))
              .map(n => ({ token: `{{${n.id}}}`, label: `{{${n.properties.label || n.id}}}` }))}
          />
        </div>

        {/* Tipo sfondo */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Tipo di sfondo</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['color', 'gradient', 'image'] as const).map(t => (
              <button
                key={t}
                onClick={() => set({ backgroundType: t })}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  bgType === t ? 'bg-[#002068] text-white' : 'bg-[#f4f3fc] text-[#444653] hover:bg-[#e8e7f0]'
                }`}
              >
                {t === 'color' ? 'Colore' : t === 'gradient' ? 'Sfumatura' : 'Immagine'}
              </button>
            ))}
          </div>
        </div>

        {bgType === 'color' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Colore sfondo</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={p.backgroundColor ?? '#002068'}
                onChange={e => set({ backgroundColor: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border border-[#c4c5d5]"
              />
              <input
                value={p.backgroundColor ?? '#002068'}
                onChange={e => set({ backgroundColor: e.target.value })}
                className="flex-1 h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
            </div>
          </div>
        )}

        {bgType === 'gradient' && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Sfumatura</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-[#747684]">Colore iniziale</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={p.gradientFrom ?? '#002068'}
                    onChange={e => set({ gradientFrom: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-[#c4c5d5]"
                  />
                  <input
                    value={p.gradientFrom ?? '#002068'}
                    onChange={e => set({ gradientFrom: e.target.value })}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[#747684]">Colore finale</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={p.gradientTo ?? '#fe9832'}
                    onChange={e => set({ gradientTo: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-[#c4c5d5]"
                  />
                  <input
                    value={p.gradientTo ?? '#fe9832'}
                    onChange={e => set({ gradientTo: e.target.value })}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {bgType === 'image' && (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Immagine di sfondo</label>

            {/* URL + upload */}
            <div className="flex gap-2">
              <input
                value={p.backgroundImageUrl ?? ''}
                onChange={e => set({ backgroundImageUrl: e.target.value })}
                placeholder="https://..."
                className="flex-1 h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
              <button
                onClick={() => setShowGallery(true)}
                className="flex items-center gap-1.5 px-3 h-10 bg-[#f4f3fc] border border-[#c4c5d5] text-[#444653] rounded-lg text-xs font-semibold hover:bg-[#e8e7f0] transition-colors"
                title="Apri galleria"
              >
                <Icon name="photo_library" size={16} />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 h-10 bg-[#002068] text-white rounded-lg text-xs font-semibold hover:bg-[#003399] disabled:opacity-50 transition-colors"
              >
                {uploading
                  ? <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                  : <Icon name="upload" size={14} />}
                {uploading ? '...' : 'Carica'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Dimensione */}
            <div className="space-y-1">
              <label className="text-xs text-[#747684]">Dimensione</label>
              <select
                value={p.backgroundImageSize ?? 'cover'}
                onChange={e => set({ backgroundImageSize: e.target.value as 'cover' | 'contain' | 'auto' | 'stretch' })}
                className="w-full h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none cursor-pointer"
              >
                <option value="cover">Copri (cover)</option>
                <option value="stretch">Stira (stretch)</option>
                <option value="contain">Adatta (contain)</option>
                <option value="auto">Originale (auto)</option>
              </select>
            </div>

            {/* Posizione */}
            <div className="space-y-1">
              <label className="text-xs text-[#747684]">Posizione</label>
              <select
                value={p.backgroundImagePosition ?? 'center center'}
                onChange={e => set({ backgroundImagePosition: e.target.value })}
                className="w-full h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none cursor-pointer"
              >
                <option value="center center">Centro</option>
                <option value="top center">Alto centro</option>
                <option value="bottom center">Basso centro</option>
                <option value="center left">Centro sinistra</option>
                <option value="center right">Centro destra</option>
                <option value="top left">Alto sinistra</option>
                <option value="top right">Alto destra</option>
                <option value="bottom left">Basso sinistra</option>
                <option value="bottom right">Basso destra</option>
              </select>
            </div>

            {/* Ripetizione */}
            <div className="space-y-1">
              <label className="text-xs text-[#747684]">Ripetizione</label>
              <select
                value={p.backgroundImageRepeat ?? 'no-repeat'}
                onChange={e => set({ backgroundImageRepeat: e.target.value as 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' })}
                className="w-full h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none cursor-pointer"
              >
                <option value="no-repeat">Nessuna</option>
                <option value="repeat">Ripeti</option>
                <option value="repeat-x">Ripeti orizzontale</option>
                <option value="repeat-y">Ripeti verticale</option>
              </select>
            </div>

            {/* Opacità */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs text-[#747684]">Opacità immagine</label>
                <span className="text-xs font-mono text-[#444653]">{imageOpacity}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={imageOpacity}
                onChange={e => set({ backgroundImageOpacity: Number(e.target.value) })}
                className="w-full accent-[#002068] cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Colore testo */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Colore testo</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={p.textColor ?? '#ffffff'}
              onChange={e => set({ textColor: e.target.value })}
              className="w-10 h-10 rounded cursor-pointer border border-[#c4c5d5]"
            />
            <input
              value={p.textColor ?? '#ffffff'}
              onChange={e => set({ textColor: e.target.value })}
              className="flex-1 h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
          </div>
        </div>

        {/* Bottone opzionale */}
        <div className="space-y-2 p-3 bg-[#f4f3fc] rounded-xl">
          <p className="text-xs font-bold text-[#002068] uppercase tracking-wider">Bottone (opzionale)</p>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Etichetta</label>
            <input
              value={p.buttonLabel ?? ''}
              onChange={e => set({ buttonLabel: e.target.value })}
              placeholder="Torna al sito"
              className="w-full h-10 px-3 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">URL destinazione</label>
            <input
              value={p.buttonUrl ?? ''}
              onChange={e => set({ buttonUrl: e.target.value })}
              placeholder="https://..."
              className="w-full h-10 px-3 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {showGallery && (
        <ImageGalleryModal
          paths={['covers', 'backgrounds']}
          uploadPath="covers"
          currentUrl={p.backgroundImageUrl}
          onSelect={url => set({ backgroundImageUrl: url })}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}
