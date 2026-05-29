import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'

type Platform = 'android' | 'ios' | null

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return null
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

// Stored so the prompt can be triggered later
let _deferredPrompt: { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null = null

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<Platform>(null)
  const [showIOSSteps, setShowIOSSteps] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (sessionStorage.getItem('pwa-install-dismissed')) return

    const p = detectPlatform()
    setPlatform(p)

    if (p === 'android') {
      // Chrome fires beforeinstallprompt — capture it and show our banner
      const handler = (e: Event) => {
        e.preventDefault()
        _deferredPrompt = e as unknown as typeof _deferredPrompt
        setShow(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }

    if (p === 'ios') {
      // iOS Safari: show manual instructions after a short delay
      const t = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    sessionStorage.setItem('pwa-install-dismissed', '1')
    setShow(false)
  }

  async function handleInstall() {
    if (!_deferredPrompt) return
    _deferredPrompt.prompt()
    const { outcome } = await _deferredPrompt.userChoice
    _deferredPrompt = null
    if (outcome === 'accepted') setShow(false)
    else dismiss()
  }

  if (!show) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9998] px-4 pb-safe"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-[#e8e7f0] overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <img src="/s_logo.png" alt="Solidando" className="w-12 h-12 rounded-xl flex-shrink-0 object-contain" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#1a1b22] text-sm">Installa Solidando</p>
            <p className="text-xs text-[#747684] mt-0.5">
              {platform === 'ios'
                ? 'Aggiungi alla schermata Home per un\'esperienza completa offline'
                : 'Installa l\'app per accedere più velocemente, anche offline'}
            </p>
          </div>
          <button onClick={dismiss} className="p-1 text-[#aaa] hover:text-[#444653] flex-shrink-0 -mt-0.5">
            <Icon name="close" size={18} />
          </button>
        </div>

        {platform === 'android' && (
          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={dismiss}
              className="flex-1 py-2 text-sm font-semibold text-[#444653] border border-[#c4c5d5] rounded-xl hover:bg-[#f4f3fc] transition-colors"
            >
              Adesso no
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 py-2 text-sm font-bold text-white bg-[#002068] rounded-xl hover:bg-[#001550] transition-colors"
            >
              Installa
            </button>
          </div>
        )}

        {platform === 'ios' && (
          <div className="px-4 pb-4">
            {!showIOSSteps ? (
              <div className="flex gap-2">
                <button
                  onClick={dismiss}
                  className="flex-1 py-2 text-sm font-semibold text-[#444653] border border-[#c4c5d5] rounded-xl hover:bg-[#f4f3fc] transition-colors"
                >
                  Adesso no
                </button>
                <button
                  onClick={() => setShowIOSSteps(true)}
                  className="flex-1 py-2 text-sm font-bold text-white bg-[#002068] rounded-xl hover:bg-[#001550] transition-colors"
                >
                  Come si fa?
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <ol className="text-xs text-[#444653] space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#002068] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>Tocca l'icona <strong>Condividi</strong> <span className="inline-block align-middle text-[#002068]">⬆</span> nella barra di Safari</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#002068] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>Scorri e seleziona <strong>"Aggiungi a schermata Home"</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#002068] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>Tocca <strong>"Aggiungi"</strong> in alto a destra</span>
                  </li>
                </ol>
                <button
                  onClick={dismiss}
                  className="w-full mt-2 py-2 text-sm font-semibold text-[#444653] border border-[#c4c5d5] rounded-xl hover:bg-[#f4f3fc] transition-colors"
                >
                  Ho capito
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
