import { useRef, useState } from 'react'
import { useBuilderStore } from '../../../stores/builderStore'
import { useAuthStore } from '../../../stores/authStore'
import Icon from '../../../components/ui/Icon'
import { showToast } from '../../../components/ui/Toast'
import { uploadImage } from '../../../firebase/storage'
import { saveNow } from '../../../hooks/useAutosave'
import ImageGalleryModal from '../../../components/ui/ImageGalleryModal'

export default function CoverInspector() {
  const { cover, setCover, showCover, setShowCover, title, isSaving } = useBuilderStore()
  const { user } = useAuthStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showGallery, setShowGallery] = useState(false)

  const bgType = cover.backgroundType ?? 'color'

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { showToast('Solo immagini (JPG, PNG, WebP)', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Dimensione massima: 5 MB', 'error'); return }
    setUploading(true)
    try {
      const { url } = await uploadImage(file, 'covers', user.uid)
      setCover({ imageUrl: url })
    } catch {
      showToast('Errore nel caricamento', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Attiva/disattiva */}
        <div className="flex items-center justify-between p-3 bg-[#f4f3fc] rounded-xl border border-[#c4c5d5]">
          <div>
            <p className="text-sm font-semibold text-[#1a1b22]">Schermata iniziale</p>
            <p className="text-xs text-[#747684] mt-0.5">Mostra prima del form</p>
          </div>
          <button
            onClick={() => setShowCover(!showCover)}
            className={`w-11 h-6 rounded-full relative transition-colors ${showCover ? 'bg-[#fe9832]' : 'bg-[#c4c5d5]'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${showCover ? 'left-5' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Testo */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Testo</h4>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Titolo</label>
            <input
              value={cover.title || title}
              onChange={e => setCover({ title: e.target.value })}
              placeholder="Titolo della copertina..."
              className="w-full h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
            <p className="text-[10px] text-[#747684]">Se vuoto usa il titolo del form</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Sottotitolo</label>
            <textarea
              value={cover.subtitle}
              onChange={e => setCover({ subtitle: e.target.value })}
              placeholder="Descrizione o sottotitolo..."
              rows={2}
              className="w-full px-3 py-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#444653] uppercase tracking-wider">Colore testo</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={cover.textColor}
                onChange={e => setCover({ textColor: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border border-[#c4c5d5]"
              />
              <input
                value={cover.textColor}
                onChange={e => setCover({ textColor: e.target.value })}
                className="flex-1 h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Sfondo */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-[#002068] uppercase tracking-wider">Sfondo</h4>

          <div className="grid grid-cols-3 gap-1.5">
            {(['color', 'gradient', 'image'] as const).map(t => (
              <button
                key={t}
                onClick={() => setCover({ backgroundType: t })}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  bgType === t ? 'bg-[#002068] text-white' : 'bg-[#f4f3fc] text-[#444653] hover:bg-[#e8e7f0]'
                }`}
              >
                {t === 'color' ? 'Colore' : t === 'gradient' ? 'Sfumatura' : 'Immagine'}
              </button>
            ))}
          </div>

          {bgType === 'color' && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={cover.backgroundColor}
                onChange={e => setCover({ backgroundColor: e.target.value })}
                className="w-10 h-10 rounded cursor-pointer border border-[#c4c5d5]"
              />
              <input
                value={cover.backgroundColor}
                onChange={e => setCover({ backgroundColor: e.target.value })}
                className="flex-1 h-10 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm font-mono focus:ring-2 focus:ring-[#002068] focus:outline-none"
              />
            </div>
          )}

          {bgType === 'gradient' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs text-[#747684]">Colore iniziale</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={cover.gradientFrom}
                    onChange={e => setCover({ gradientFrom: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-[#c4c5d5]"
                  />
                  <input
                    value={cover.gradientFrom}
                    onChange={e => setCover({ gradientFrom: e.target.value })}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[#747684]">Colore finale</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={cover.gradientTo}
                    onChange={e => setCover({ gradientTo: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border border-[#c4c5d5]"
                  />
                  <input
                    value={cover.gradientTo}
                    onChange={e => setCover({ gradientTo: e.target.value })}
                    className="flex-1 h-8 px-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded text-xs font-mono focus:ring-1 focus:ring-[#002068] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {bgType === 'image' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={cover.imageUrl}
                  onChange={e => setCover({ imageUrl: e.target.value })}
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

              <div className="space-y-1">
                <label className="text-xs text-[#747684]">Dimensione</label>
                <select
                  value={cover.imageSize ?? 'cover'}
                  onChange={e => setCover({ imageSize: e.target.value as 'cover' | 'contain' | 'auto' | 'stretch' })}
                  className="w-full h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none cursor-pointer"
                >
                  <option value="cover">Copri (cover)</option>
                  <option value="stretch">Stira (stretch)</option>
                  <option value="contain">Adatta (contain)</option>
                  <option value="auto">Originale (auto)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#747684]">Posizione</label>
                <select
                  value={cover.imagePosition ?? 'center center'}
                  onChange={e => setCover({ imagePosition: e.target.value })}
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

              <div className="space-y-1">
                <label className="text-xs text-[#747684]">Ripetizione</label>
                <select
                  value={cover.imageRepeat ?? 'no-repeat'}
                  onChange={e => setCover({ imageRepeat: e.target.value as 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y' })}
                  className="w-full h-9 px-3 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none cursor-pointer"
                >
                  <option value="no-repeat">Nessuna</option>
                  <option value="repeat">Ripeti</option>
                  <option value="repeat-x">Ripeti orizzontale</option>
                  <option value="repeat-y">Ripeti verticale</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-[#747684]">Opacità immagine</label>
                  <span className="text-xs font-mono text-[#444653]">{cover.imageOpacity ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={cover.imageOpacity ?? 100}
                  onChange={e => setCover({ imageOpacity: Number(e.target.value) })}
                  className="w-full accent-[#002068] cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>

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

      {showGallery && (
        <ImageGalleryModal
          paths={['covers', 'backgrounds']}
          uploadPath="covers"
          currentUrl={cover.imageUrl}
          onSelect={url => setCover({ imageUrl: url })}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}
