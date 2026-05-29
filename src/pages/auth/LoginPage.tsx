import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginWithGoogle } from '../../firebase/auth'
import { doc, getDoc, getDocFromServer, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuthStore } from '../../stores/authStore'
import type { UserProfile } from '../../types/form'
import solidandoLogo from '../../assets/solidando.png'
import sLogo from '../../assets/s_logo.png'

function getContextMessage(from: string): string | null {
  if (from.startsWith('/f/')) return 'Per compilare questo modulo devi prima accedere al tuo account.'
  if (from.startsWith('/e/')) return 'Per visualizzare questo evento devi prima accedere al tuo account.'
  return null
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/my'
  const contextMessage = getContextMessage(from)
  const { setProfile } = useAuthStore()

  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogle() {
    setError('')
    setGoogleLoading(true)
    try {
      const firebaseUser = await loginWithGoogle()

      // Force token propagation before any Firestore call
      await firebaseUser.getIdToken(true)

      const ref = doc(db, 'users', firebaseUser.uid)
      const snap = await getDocFromServer(ref)

      if (!snap.exists()) {
        // New user — write doc. Role defaults to 'user'.
        // The very first admin must be set manually from Firebase console
        // or promoted by another admin via /users page.
        await setDoc(ref, {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName ?? 'Utente',
          email: firebaseUser.email,
          avatar: firebaseUser.photoURL ?? null,
          createdAt: serverTimestamp(),
          plan: 'free',
          workspaceIds: [firebaseUser.uid],
          role: 'user',
        })
        // Re-read to get server timestamps populated
        const fresh = await getDoc(ref)
        setProfile(fresh.data() as UserProfile)
      } else {
        setProfile(snap.data() as UserProfile)
      }

      navigate(from, { replace: true })
    } catch (err: unknown) {
      console.error('Google login error:', err)
      const msg = (err as { message?: string })?.message ?? String(err)
      setError(msg)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#faf8ff] flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#002068] flex-col justify-between p-12">
        <div>
          <img src={solidandoLogo} alt="Solidando" className="h-16 brightness-0 invert" />
          <p className="text-[#b5c4ff] mt-3 font-medium text-lg">Portale della community</p>
        </div>

        <div className="flex flex-col items-center gap-8">
          <img src={sLogo} alt="" className="w-48 opacity-20" />
          <div className="space-y-6 w-full">
            {[
              { icon: 'assignment_turned_in', title: 'I tuoi form', desc: 'Accedi ai moduli a cui sei iscritto' },
              { icon: 'event', title: 'I tuoi eventi', desc: 'Visualizza gli eventi della community' },
              { icon: 'verified_user', title: 'Accesso sicuro', desc: 'I tuoi dati sono al sicuro con noi' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#003399] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#8aa4ff]" style={{ fontSize: '20px' }}>{icon}</span>
                </div>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-[#b5c4ff]">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-[#747684]">© 2025 Solidando · La Gioia nel Dare</p>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 px-2">
            <img src={solidandoLogo} alt="Solidando" className="w-full" />
          </div>

          {contextMessage && (
            <div className="mb-6 p-4 bg-[#e8e7f4] border border-[#c4c5d5] rounded-xl flex items-start gap-3">
              <span className="material-symbols-outlined text-[#002068] shrink-0" style={{ fontSize: '20px' }}>info</span>
              <p className="text-sm text-[#333448] leading-relaxed">{contextMessage}</p>
            </div>
          )}

          <h2 className="text-2xl font-bold text-[#1a1b22] mb-1">Accedi o registrati</h2>
          <p className="text-[#444653] mb-8">
            Usa il tuo account Google per entrare nel portale.
            Se è la prima volta, il tuo account verrà creato automaticamente.
          </p>

          <button
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-[#c4c5d5] rounded-xl hover:border-[#002068] hover:bg-[#f4f3fc] transition-all font-semibold text-[#1a1b22] shadow-sm disabled:opacity-60"
          >
            {googleLoading ? (
              <span className="w-5 h-5 border-2 border-[#002068] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {googleLoading ? 'Apertura Google...' : 'Continua con Google'}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-[#ffdad6] border border-[#ba1a1a] rounded-lg text-sm text-[#93000a] break-all">
              {error}
            </div>
          )}

          <p className="text-center text-xs text-[#747684] mt-8">
            Accedendo accetti i termini di utilizzo della piattaforma Solidando.
          </p>
        </div>
      </div>
    </div>
  )
}
