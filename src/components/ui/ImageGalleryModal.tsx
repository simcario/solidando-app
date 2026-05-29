import { useEffect, useRef, useState, useCallback } from 'react'
import { listImages, uploadImage, deleteImage, type UploadPath, type StorageImage } from '../../firebase/storage'
import { useAuthStore } from '../../stores/authStore'
import Icon from './Icon'
import { showToast } from './Toast'

interface Props {
  /** Which Storage folder(s) to browse — defaults to ['covers','backgrounds'] */
  paths?: UploadPath[]
  /** Upload destination when user drops/selects a new file */
  uploadPath: UploadPath
  /** Currently selected URL (highlighted in the grid) */
  currentUrl?: string
  onSelect: (url: string) => void
  onClose: () => void
}

const PATH_LABELS: Record<UploadPath, string> = {
  covers: 'Copertine',
  backgrounds: 'Sfondi',
  logos: 'Loghi',
}

export default function ImageGalleryModal({ paths = ['covers', 'backgrounds'], uploadPath, currentUrl, onSelect, onClose }: Props) {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<UploadPath>(paths[0])
  const [images, setImages] = useState<Record<UploadPath, StorageImage[]>>({} as Record<UploadPath, StorageImage[]>)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [selected, setSelected] = useState(currentUrl ?? '')
  const [urlInput, setUrlInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const loadTab = useCallback(async (path: UploadPath) => {
    if (!user) return
    setLoading(true)
    try {
      const imgs = await listImages(path, user.uid)
      setImages(prev => ({ ...prev, [path]: imgs }))
    } catch {
      showToast('Errore nel caricamento galleria', 'error')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    paths.forEach(p => loadTab(p))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(file: File) {
    if (!user) return
    if (!file.type.startsWith('image/')) { showToast('Solo immagini (JPG, PNG, WebP, GIF)', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Dimensione massima: 5 MB', 'error'); return }
    setUploading(true)
    try {
      const { url, path: fullPath } = await uploadImage(file, uploadPath, user.uid)
      const newImg: StorageImage = { url, fullPath, name: file.name }
      setImages(prev => ({ ...prev, [uploadPath]: [newImg, ...(prev[uploadPath] ?? [])] }))
      setSelected(url)
      setActiveTab(uploadPath)
    } catch {
      showToast('Errore nel caricamento', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(img: StorageImage, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Eliminare questa immagine?')) return
    setDeleting(img.fullPath)
    try {
      await deleteImage(img.fullPath)
      setImages(prev => ({
        ...prev,
        [activeTab]: (prev[activeTab] ?? []).filter(i => i.fullPath !== img.fullPath),
      }))
      if (selected === img.url) setSelected('')
    } catch {
      showToast('Errore nella cancellazione', 'error')
    } finally {
      setDeleting(null)
    }
  }

  function handleConfirm() {
    if (!selected) return
    onSelect(selected)
    onClose()
  }

  function handleUrlConfirm() {
    const url = urlInput.trim()
    if (!url) return
    onSelect(url)
    onClose()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const currentImages = images[activeTab] ?? []
  const tabsToShow = paths.length > 1 ? paths : []

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#002068] px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Icon name="photo_library" size={22} className="text-white/80" />
            <h2 className="text-lg font-bold text-white">Galleria immagini</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <Icon name="close" size={22} />
          </button>
        </div>

        {/* Tabs */}
        {tabsToShow.length > 0 && (
          <div className="flex border-b border-[#c4c5d5] bg-[#f4f3fc] flex-shrink-0">
            {tabsToShow.map(p => (
              <button
                key={p}
                onClick={() => setActiveTab(p)}
                className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                  activeTab === p
                    ? 'border-[#002068] text-[#002068]'
                    : 'border-transparent text-[#747684] hover:text-[#002068]'
                }`}
              >
                {PATH_LABELS[p]}
              </button>
            ))}
          </div>
        )}

        {/* Upload dropzone */}
        <div
          ref={dropRef}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`mx-6 mt-4 mb-2 flex-shrink-0 flex items-center justify-center gap-3 h-14 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none text-sm font-semibold
            ${dragging ? 'border-[#002068] bg-[#dce1ff] text-[#002068]' : 'border-[#c4c5d5] bg-[#f4f3fc] text-[#444653] hover:border-[#002068] hover:bg-[#eeeef8]'}
            ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? (
            <>
              <div className="w-5 h-5 rounded-full border-2 border-[#002068] border-t-transparent animate-spin" />
              <span>Caricamento...</span>
            </>
          ) : (
            <>
              <Icon name="upload" size={20} />
              <span>Trascina o clicca per caricare una nuova immagine</span>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-2 min-h-0">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 py-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-[#e8e7f0] animate-pulse" />
              ))}
            </div>
          ) : currentImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-[#dce1ff] flex items-center justify-center">
                <Icon name="photo_library" size={32} className="text-[#b5c4ff]" />
              </div>
              <p className="text-sm font-semibold text-[#1a1b22]">Nessuna immagine ancora</p>
              <p className="text-xs text-[#747684]">Carica la prima immagine con il pulsante sopra</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 py-2">
              {currentImages.map(img => {
                const isSelected = selected === img.url
                const isDeleting = deleting === img.fullPath
                return (
                  <div
                    key={img.fullPath}
                    onClick={() => setSelected(img.url)}
                    className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group
                      ${isSelected ? 'border-[#002068] ring-2 ring-[#002068] ring-offset-1' : 'border-transparent hover:border-[#c4c5d5]'}`}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Selected checkmark */}
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-[#002068] flex items-center justify-center shadow">
                        <Icon name="check" size={14} className="text-white" />
                      </div>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={e => handleDelete(img, e)}
                      disabled={isDeleting}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
                      title="Elimina"
                    >
                      {isDeleting
                        ? <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                        : <Icon name="delete" size={13} />}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* URL input */}
        <div className="px-6 py-3 border-t border-[#c4c5d5] bg-[#f4f3fc] flex-shrink-0">
          <p className="text-xs font-semibold text-[#747684] uppercase tracking-wider mb-2">oppure incolla URL esterno</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUrlConfirm() }}
              placeholder="https://..."
              className="flex-1 h-9 px-3 bg-white border border-[#c4c5d5] rounded-lg text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
            />
            <button
              onClick={handleUrlConfirm}
              disabled={!urlInput.trim()}
              className="px-4 h-9 bg-[#fe9832] text-[#683700] rounded-lg text-sm font-bold hover:brightness-110 disabled:opacity-40 transition-all"
            >
              Usa URL
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#c4c5d5] flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-[#747684]">
            {selected ? (
              <span className="flex items-center gap-1.5">
                <Icon name="check_circle" size={14} className="text-green-600" />
                Immagine selezionata
              </span>
            ) : 'Nessuna immagine selezionata'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 border-2 border-[#c4c5d5] text-[#444653] rounded-xl font-semibold hover:bg-[#f4f3fc] transition-all text-sm"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="px-6 py-2 bg-[#002068] text-white rounded-xl font-bold text-sm hover:bg-[#003399] transition-all disabled:opacity-40"
            >
              Usa immagine
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
