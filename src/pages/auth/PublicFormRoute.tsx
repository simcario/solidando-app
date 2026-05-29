import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function PublicFormRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#faf8ff]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#444653] font-medium">Caricamento...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
