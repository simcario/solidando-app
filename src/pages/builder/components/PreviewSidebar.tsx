import { useState } from 'react'
import Icon from '../../../components/ui/Icon'
import { showToast } from '../../../components/ui/Toast'

interface PreviewSidebarProps {
  formId: string
  open: boolean
  onClose: () => void
}

export default function PreviewSidebar({ formId, open, onClose }: PreviewSidebarProps) {
  const [iframeKey, setIframeKey] = useState(0)

  const previewUrl = `/preview/${formId}`
  const publicUrl = `${window.location.origin}/f/${formId}`

  function handleRefresh() {
    setIframeKey(k => k + 1)
  }

  function handleOpenWindow() {
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      showToast('Link copiato negli appunti!', 'success')
    }).catch(() => {
      showToast('Impossibile copiare il link', 'error')
    })
  }

  if (!open) return null

  return (
    <aside className="flex flex-col w-[340px] flex-shrink-0 bg-[#faf8ff] border-l border-[#c4c5d5] h-full overflow-hidden">
      {/* Header sidebar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#c4c5d5] bg-white flex-shrink-0">
        <span className="text-sm font-bold text-[#1a1b22]">Anteprima</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            title="Ricarica anteprima"
            className="p-1.5 text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors"
          >
            <Icon name="refresh" size={18} />
          </button>
          <button
            onClick={handleOpenWindow}
            title="Apri in nuova finestra"
            className="p-1.5 text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors"
          >
            <Icon name="open_in_new" size={18} />
          </button>
          <button
            onClick={onClose}
            title="Chiudi anteprima"
            className="p-1.5 text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      {/* Link pubblico */}
      <div className="px-4 py-3 border-b border-[#c4c5d5] bg-white flex-shrink-0">
        <p className="text-xs font-semibold text-[#747684] uppercase tracking-wide mb-1.5">Link pubblico</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 px-3 py-2 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg">
            <span className="text-xs text-[#444653] truncate block font-mono">{publicUrl}</span>
          </div>
          <button
            onClick={handleCopyLink}
            title="Copia link"
            className="flex-shrink-0 p-2 bg-[#002068] text-white rounded-lg hover:bg-[#003399] transition-colors"
          >
            <Icon name="content_copy" size={16} />
          </button>
        </div>
      </div>

      {/* Smartphone mockup */}
      <div className="flex-1 overflow-y-auto flex items-start justify-center py-6 px-4">
        <div className="relative">
          {/* Phone frame */}
          <div
            className="relative bg-[#1a1b22] rounded-[40px] p-[10px]"
            style={{
              width: 270,
              boxShadow: '0 0 0 2px #3a3b48, 0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            {/* Notch */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-20 h-6 bg-[#1a1b22] rounded-b-2xl z-10 flex items-center justify-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2e2f3c]" />
              <div className="w-10 h-1.5 rounded-full bg-[#2e2f3c]" />
            </div>

            {/* Screen */}
            <div
              className="rounded-[32px] overflow-hidden bg-white"
              style={{ height: 520 }}
            >
              <iframe
                key={iframeKey}
                src={previewUrl}
                className="w-full h-full border-none"
                title="Form preview"
                // Scala il contenuto come se fosse mobile (375px viewport)
                style={{ transform: 'scale(0.667)', transformOrigin: '0 0', width: '150%', height: '150%' }}
              />
            </div>

            {/* Home bar */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-24 h-1 bg-[#3a3b48] rounded-full" />
            </div>
          </div>

          {/* Side buttons */}
          <div className="absolute -left-[5px] top-20 w-[5px] h-8 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -left-[5px] top-32 w-[5px] h-12 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -left-[5px] top-48 w-[5px] h-12 bg-[#2e2f3c] rounded-l-sm" />
          <div className="absolute -right-[5px] top-28 w-[5px] h-16 bg-[#2e2f3c] rounded-r-sm" />
        </div>
      </div>
    </aside>
  )
}
