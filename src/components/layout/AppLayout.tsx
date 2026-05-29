import { useState } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

interface AppLayoutProps {
  children: ReactNode
  topBarTitle?: string
}

export default function AppLayout({ children, topBarTitle }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-dvh bg-[#faf8ff] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 md:ml-64 overflow-hidden min-w-0">
        <TopBar title={topBarTitle} onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-8"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
