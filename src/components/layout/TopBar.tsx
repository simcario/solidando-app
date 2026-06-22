import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import NotificationPanel from '../notifications/NotificationPanel'
import { logout } from '../../firebase/auth'
import type { DeviceType } from '../../hooks/useDeviceType'

// Iniettato da vite.config.ts — cambia ad ogni build
declare const __BUILD_TIME__: string
const BUILD_LABEL = (() => {
  try {
    const d = new Date(__BUILD_TIME__)
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
})()

interface TopBarProps {
  title?: string
  onMenuClick?: () => void
  deviceType?: DeviceType
}

// ── Dropdown menu hamburger (tablet) ─────────────────────────────────────────

interface MenuItemProps {
  icon: string
  label: string
  sublabel?: string
  onClick: () => void
  accent?: boolean
  danger?: boolean
}

function MenuItem({ icon, label, sublabel, onClick, accent, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-4 py-3 text-left rounded-xl transition-colors
        ${danger  ? 'text-red-600 hover:bg-red-50' :
          accent  ? 'text-[#002068] hover:bg-[#dce1ff]' :
                    'text-[#1a1b22] hover:bg-[#e8e7f0]'}`}
    >
      <Icon name={icon} size={20} filled={!!accent} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight ${danger ? 'text-red-600' : ''}`}>{label}</p>
        {sublabel && <p className="text-xs text-[#747684] mt-0.5">{sublabel}</p>}
      </div>
    </button>
  )
}

function TabletHamburgerMenu({ onClose }: { onClose: () => void }) {
  const { profile, user } = useAuthStore()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function go(path: string) {
    navigate(path)
    onClose()
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="absolute left-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-[#e2e1eb] z-50 overflow-hidden"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}
    >
      {/* Profilo utente */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#eeedf6] bg-[#faf8ff]">
        <div className="w-10 h-10 rounded-full bg-[#fe9832] flex items-center justify-center text-base font-bold text-[#683700] flex-shrink-0">
          {profile?.name?.charAt(0).toUpperCase() ?? 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#1a1b22] truncate">{profile?.name}</p>
          <p className="text-xs text-[#747684] truncate">{profile?.email ?? user?.email}</p>
        </div>
        {isAdmin && (
          <span className="text-xs bg-[#dce1ff] text-[#002068] px-2 py-0.5 rounded-full font-bold flex-shrink-0">Admin</span>
        )}
      </div>

      {/* Sezione Admin */}
      {isAdmin && (
        <div className="px-2 pt-2 pb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#747684] px-2 pb-1">Area Admin</p>
          <MenuItem
            icon="admin_panel_settings"
            label="Dashboard Admin"
            sublabel="Utenti, ruoli e configurazione"
            onClick={() => go('/users')}
            accent
          />
          <MenuItem
            icon="qr_code_scanner"
            label="Check-in Scanner"
            sublabel="Scansione QR biglietti"
            onClick={() => go('/admin/checkin')}
            accent
          />
        </div>
      )}

      <div className={isAdmin ? 'mx-4 border-t border-[#eeedf6]' : ''} />

      {/* Voci comuni */}
      <div className="px-2 py-2">
        {isAdmin && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#747684] px-2 pb-1 pt-1">Generale</p>
        )}
        <MenuItem
          icon="person"
          label="Portale Utente"
          sublabel="I tuoi biglietti e iscrizioni"
          onClick={() => go('/my')}
        />
      </div>

      {/* Logout */}
      <div className="px-2 pb-2 border-t border-[#eeedf6]">
        <MenuItem
          icon="logout"
          label="Esci"
          onClick={handleLogout}
          danger
        />
      </div>

      {/* Build stamp */}
      <div className="px-4 py-2 border-t border-[#eeedf6] bg-[#faf8ff] flex items-center gap-1.5">
        <Icon name="build_circle" size={13} className="text-[#aaa]" />
        <span className="text-[10px] text-[#aaa] font-mono">Build {BUILD_LABEL}</span>
      </div>
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export default function TopBar({ title, onMenuClick, deviceType = 'desktop' }: TopBarProps) {
  const { profile, user } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const [search, setSearch] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [showTabletMenu, setShowTabletMenu] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const isMobile = deviceType === 'mobile'
  const isTablet = deviceType === 'tablet'

  return (
    <header
      className="flex justify-between items-center w-full sticky top-0 z-40 bg-[#faf8ff] border-b border-[#c4c5d5] shadow-sm"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: '0.75rem',
        paddingLeft: isTablet ? '1.25rem' : '1rem',
        paddingRight: isTablet ? '1.25rem' : '1rem',
      }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger: mobile → drawer, tablet → dropdown */}
        {(isMobile || isTablet) && (
          <div className={`relative flex-shrink-0 ${isTablet ? '' : '-ml-1'}`}>
            <button
              onClick={isMobile ? onMenuClick : () => setShowTabletMenu(v => !v)}
              className="p-2 text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors"
              aria-label="Menu"
            >
              <Icon name={showTabletMenu ? 'close' : 'menu'} size={22} />
            </button>

            {isTablet && showTabletMenu && (
              <TabletHamburgerMenu onClose={() => setShowTabletMenu(false)} />
            )}
          </div>
        )}

        {title ? (
          <h1 className={`font-bold text-[#1a1b22] truncate ${isTablet ? 'text-xl' : 'text-lg md:text-xl'}`}>
            {title}
          </h1>
        ) : (
          <div className={`relative ${isTablet ? 'w-full max-w-sm' : 'w-full max-w-md'}`}>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#747684]">
              <Icon name="search" size={18} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`w-full pl-10 pr-4 bg-[#eeedf6] rounded-full border-none focus:ring-2 focus:ring-[#002068] focus:bg-white text-sm outline-none transition-all ${isTablet ? 'py-2.5' : 'py-2'}`}
              placeholder="Cerca form o eventi..."
            />
          </div>
        )}
      </div>

      <div className={`flex items-center flex-shrink-0 ${isTablet ? 'gap-2' : 'gap-1 md:gap-3'}`}>
        {/* Build chip — tablet e desktop, discreto */}
        {!isMobile && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#eeedf6] text-[#aaa] text-[10px] font-mono select-none">
            <Icon name="build_circle" size={12} className="text-[#aaa]" />
            {BUILD_LABEL}
          </span>
        )}

        {/* Workspace button — solo desktop */}
        {!isMobile && !isTablet && (
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-[#002068] hover:bg-[#e8e7f0] rounded-lg transition-colors">
            <Icon name="swap_horiz" size={18} />
            Workspace
          </button>
        )}

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className={`text-[#444653] hover:bg-[#e8e7f0] rounded-full transition-colors relative ${isTablet ? 'p-2.5' : 'p-2'}`}
            aria-label="Notifiche"
          >
            <Icon name="notifications" size={isTablet ? 22 : 20} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && user && (
            <NotificationPanel
              uid={user.uid}
              onClose={() => setShowNotifications(false)}
            />
          )}
        </div>

        {/* Help — solo desktop */}
        {!isMobile && !isTablet && (
          <button className="p-2 text-[#444653] hover:bg-[#e8e7f0] rounded-full transition-colors">
            <Icon name="help" size={20} />
          </button>
        )}

        {/* Avatar — desktop e mobile (tablet lo mostra nel dropdown) */}
        {!isTablet && (
          <div className="w-9 h-9 rounded-full bg-[#fe9832] flex items-center justify-center text-sm font-bold text-[#683700] border-2 border-white cursor-pointer flex-shrink-0">
            {profile?.name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
        )}
      </div>
    </header>
  )
}
