import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Icon from '../ui/Icon'
import { showToast } from '../ui/Toast'

export default function UpdatePrompt() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [visible, setVisible] = useState(false)
  const [updating, setUpdating] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg || intervalRef.current) return
      // Controlla aggiornamenti ogni 60s
      intervalRef.current = setInterval(() => {
        reg.update().catch(() => {})
      }, 60_000)
    },
    onOfflineReady() {
      // SW installato per la prima volta — nessun banner necessario
    },
  })

  useEffect(() => {
    if (needRefresh) setVisible(true)
  }, [needRefresh])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function handleUpdate() {
    setUpdating(true)
    showToast('Aggiornamento in corso…', 'info')

    // Ricarica quando il nuovo SW prende il controllo (skipWaiting fatto)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    }, { once: true })

    await new Promise(r => setTimeout(r, 400))
    updateServiceWorker(true)

    // Fallback se controllerchange non arriva entro 4s
    setTimeout(() => window.location.reload(), 4000)
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] px-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-md mx-auto bg-[#002068] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
            <Icon name="system_update" size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Aggiornamento disponibile</p>
            <p className="text-xs text-white/70 mt-0.5">Nuova versione pronta — ricarica per applicarla</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!updating && (
              <button
                onClick={() => setVisible(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Chiudi"
              >
                <Icon name="close" size={18} />
              </button>
            )}
            <button
              onClick={handleUpdate}
              disabled={updating}
              className="px-4 py-2 bg-[#fe9832] text-[#683700] rounded-xl text-sm font-bold hover:bg-[#ffa84d] transition-colors active:scale-95 disabled:opacity-60 flex items-center gap-1.5"
            >
              {updating
                ? <><Icon name="refresh" size={16} className="animate-spin" />Ricarico…</>
                : 'Ricarica'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
