import { useRef, useState, useCallback } from 'react'
import { uploadImage, type UploadPath } from '../../firebase/storage'
import { useAuthStore } from '../../stores/authStore'
import Icon from './Icon'

interface Props {
  path: UploadPath
  currentUrl?: string
  onUploaded: (url: string) => void
  onError?: (msg: string) => void
  label?: string
  /** max file size in bytes, default 5 MB */
  maxBytes?: number
}

const MAX_BYTES_DEFAULT = 5 * 1024 * 1024
const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif'

export default function ImageUpload({
  path,
  currentUrl,
  onUploaded,
  onError,
  label = 'Carica immagine',
  maxBytes = MAX_BYTES_DEFAULT,
}: Props) {
  const { user } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      if (!user) { onError?.('Devi essere autenticato'); return }
      if (!file.type.startsWith('image/')) { onError?.('Solo immagini (JPG, PNG, WebP, GIF)'); return }
      if (file.size > maxBytes) {
        onError?.(`Dimensione massima: ${Math.round(maxBytes / 1024 / 1024)} MB`)
        return
      }

      setProgress(0)
      try {
        const { url } = await uploadImage(file, path, user.uid, pct => setProgress(pct))
        onUploaded(url)
      } catch {
        onError?.('Errore durante il caricamento')
      } finally {
        setProgress(null)
      }
    },
    [user, path, maxBytes, onUploaded, onError],
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const uploading = progress !== null

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none
          ${dragging ? 'border-[#002068] bg-[#dce1ff]' : 'border-[#c4c5d5] bg-[#f4f3fc] hover:border-[#002068] hover:bg-[#eeeef8]'}
          ${uploading ? 'pointer-events-none opacity-70' : ''}
          ${currentUrl ? 'h-32' : 'h-24'}`}
      >
        {currentUrl && !uploading ? (
          <img
            src={currentUrl}
            alt="preview"
            className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-30"
          />
        ) : null}

        <div className="relative z-10 flex flex-col items-center gap-1 pointer-events-none">
          {uploading ? (
            <>
              <div className="w-8 h-8 rounded-full border-2 border-[#002068] border-t-transparent animate-spin" />
              <span className="text-xs text-[#002068] font-semibold">{progress}%</span>
            </>
          ) : (
            <>
              <Icon name="upload" size={22} className="text-[#444653]" />
              <span className="text-xs font-semibold text-[#444653]">{label}</span>
              <span className="text-[10px] text-[#747684]">JPG · PNG · WebP · GIF — max {Math.round(maxBytes / 1024 / 1024)} MB</span>
            </>
          )}
        </div>

        {/* Progress bar */}
        {uploading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#c4c5d5] rounded-b-xl overflow-hidden">
            <div
              className="h-full bg-[#002068] transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={onInputChange}
      />

      {/* Current URL preview & clear */}
      {currentUrl && !uploading && (
        <div className="flex items-center gap-2 bg-[#f4f3fc] rounded-lg px-3 py-2 border border-[#c4c5d5]">
          <Icon name="image" size={16} className="text-[#002068] shrink-0" />
          <span className="flex-1 text-xs text-[#444653] truncate">{currentUrl}</span>
          <button
            onClick={() => onUploaded('')}
            title="Rimuovi immagine"
            className="shrink-0 text-[#747684] hover:text-red-500 transition-colors"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
