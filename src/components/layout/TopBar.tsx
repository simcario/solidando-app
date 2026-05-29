import { useState, useRef } from 'react'
import Icon from '../ui/Icon'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import NotificationPanel from '../notifications/NotificationPanel'

interface TopBarProps {
  title?: string
  onMenuClick?: () => void
}

export default function TopBar({ title, onMenuClick }: TopBarProps) {
  const { profile, user } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const [search, setSearch] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  return (
    <header className="flex justify-between items-center w-full px-4 md:px-6 py-3 sticky top-0 z-40 bg-[#faf8ff] border-b border-[#c4c5d5] shadow-sm" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Hamburger — visibile solo su mobile */}
        <button
          onClick={onMenuClick}
          className="p-2 -ml-1 text-[#444653] hover:bg-[#e8e7f0] rounded-lg transition-colors md:hidden flex-shrink-0"
          aria-label="Apri menu"
        >
          <Icon name="menu" size={22} />
        </button>

        {title ? (
          <h1 className="text-lg md:text-xl font-bold text-[#1a1b22] truncate">{title}</h1>
        ) : (
          <div className="relative w-full max-w-md">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#747684]">
              <Icon name="search" size={18} />
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#eeedf6] rounded-full border-none focus:ring-2 focus:ring-[#002068] focus:bg-white text-sm outline-none transition-all"
              placeholder="Cerca form o eventi..."
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-3 flex-shrink-0">
        <button className="hidden md:flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-[#002068] hover:bg-[#e8e7f0] rounded-lg transition-colors">
          <Icon name="swap_horiz" size={18} />
          Workspace
        </button>

        {/* Notification bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="p-2 text-[#444653] hover:bg-[#e8e7f0] rounded-full transition-colors relative"
            aria-label="Notifiche"
          >
            <Icon name="notifications" size={20} />
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

        <button className="hidden md:flex p-2 text-[#444653] hover:bg-[#e8e7f0] rounded-full transition-colors">
          <Icon name="help" size={20} />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#fe9832] flex items-center justify-center text-sm font-bold text-[#683700] border-2 border-white cursor-pointer flex-shrink-0">
          {profile?.name?.charAt(0).toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  )
}
