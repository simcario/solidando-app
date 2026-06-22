import { useState } from 'react'
import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import SidebarTablet from './SidebarTablet'
import TopBar from './TopBar'
import { useDeviceType } from '../../hooks/useDeviceType'

interface AppLayoutProps {
  children: ReactNode
  topBarTitle?: string
}

export default function AppLayout({ children, topBarTitle }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const deviceType = useDeviceType()

  // Tablet: rail compatta 72px; Desktop: sidebar piena 256px; Mobile: sidebar drawer
  const contentMargin =
    deviceType === 'desktop' ? 'ml-64' :
    deviceType === 'tablet'  ? 'ml-[72px]' :
    ''

  return (
    <div className="flex h-dvh bg-[#faf8ff] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && deviceType === 'mobile' && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {deviceType === 'tablet' ? (
        <SidebarTablet />
      ) : (
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      <div className={`flex flex-col flex-1 ${contentMargin} overflow-hidden min-w-0`}>
        <TopBar
          title={topBarTitle}
          onMenuClick={() => setSidebarOpen(true)}
          deviceType={deviceType}
        />
        <main
          className={`flex-1 overflow-y-auto ${
            deviceType === 'tablet' ? 'p-5' : 'p-4 md:p-8'
          }`}
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
