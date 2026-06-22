import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from '../ui/Icon'
import solidandoLogo from '../../assets/solidando.png'

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/events', icon: 'event', label: 'Eventi' },
  { to: '/accounting', icon: 'account_balance_wallet', label: 'Contabilità' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

interface TooltipProps {
  label: string
  children: ReactNode
}

function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div
      className="relative flex justify-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-[#1a1b22] text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#1a1b22]" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SidebarTablet() {
  return (
    <aside
      className="flex flex-col items-center h-dvh fixed left-0 top-0 z-50 bg-[#f4f3fc] border-r border-[#c4c5d5] shadow-sm"
      style={{
        width: 72,
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      {/* Logo */}
      <div className="mb-5 px-1 flex items-center justify-center w-full">
        <img
          src={solidandoLogo}
          alt="Solidando"
          className="w-10 h-10 object-contain"
        />
      </div>

      {/* Nav — solo sezioni principali; utenti/portale/admin nel dropdown hamburger */}
      <nav className="flex-1 flex flex-col items-center gap-1 w-full px-2">
        {navItems.map(({ to, icon, label }) => (
          <Tooltip key={to} label={label}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full gap-0.5 py-2.5 transition-all duration-150
                ${isActive
                  ? 'bg-[#fe9832] text-[#683700]'
                  : 'text-[#444653] hover:bg-[#e2e1eb]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={icon} size={22} filled={isActive} />
                  {isActive && (
                    <span className="text-[10px] font-bold leading-tight truncate max-w-[56px] text-center">
                      {label}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </Tooltip>
        ))}
      </nav>
    </aside>
  )
}
