import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoaded } = useAuthStore()

  // Still resolving auth state or profile fetch in progress
  if (loading || (user && !profileLoaded)) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#faf8ff]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#444653] font-medium">Caricamento...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Profile failed to load after all retries — show reload prompt
  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#faf8ff]">
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <p className="text-sm text-[#444653] font-medium">Impossibile caricare il profilo.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-[#002068] text-white rounded-lg text-sm font-bold hover:bg-[#003399] transition-colors"
          >
            Riprova
          </button>
        </div>
      </div>
    )
  }

  // Non-admin or missing role — go to portal
  // profile.role may be undefined for documents created before the field was added
  if (!profile.role || profile.role !== 'admin') return <Navigate to="/my" replace />

  return <>{children}</>
}
