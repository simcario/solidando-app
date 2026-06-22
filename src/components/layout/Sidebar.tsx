import { NavLink, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon'
import { logout } from '../../firebase/auth'
import { useAuthStore } from '../../stores/authStore'
import solidandoLogo from '../../assets/solidando.png'

const navItems = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/events', icon: 'event', label: 'Eventi' },
  { to: '/accounting', icon: 'account_balance_wallet', label: 'Contabilità' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside
      className={[
        'flex flex-col gap-2 h-dvh fixed left-0 top-0 z-50 bg-[#f4f3fc] border-r border-[#c4c5d5] shadow-sm w-64',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: '1rem',
      }}
    >
      <div className="mb-6 px-2 flex items-center gap-2">
        <img src={solidandoLogo} alt="Solidando" className="flex-1 min-w-0 h-auto max-h-14 object-contain object-left" />
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded-lg text-[#444653] hover:bg-[#e2e1eb] transition-colors md:hidden"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-150
              ${isActive
                ? 'bg-[#fe9832] text-[#683700] font-bold'
                : 'text-[#444653] hover:bg-[#e2e1eb] hover:translate-x-0.5'
              }`
            }
          >
            <Icon name={icon} size={20} />
            {label}
          </NavLink>
        ))}

        {profile?.role === 'admin' && (
          <NavLink
            to="/users"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-150
              ${isActive
                ? 'bg-[#fe9832] text-[#683700] font-bold'
                : 'text-[#444653] hover:bg-[#e2e1eb] hover:translate-x-0.5'
              }`
            }
          >
            <Icon name="group" size={20} />
            Utenti
          </NavLink>
        )}

        <div className="my-1 h-px bg-[#c4c5d5]" />

        <NavLink
          to="/my"
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-4 px-4 py-3 rounded-lg font-semibold text-sm transition-all duration-150
            ${isActive
              ? 'bg-[#fe9832] text-[#683700] font-bold'
              : 'text-[#444653] hover:bg-[#e2e1eb] hover:translate-x-0.5'
            }`
          }
        >
          <Icon name="person" size={20} />
          Portale Utente
        </NavLink>
      </nav>

      <div className="border-t border-[#c4c5d5] pt-3 space-y-2">
        {profile && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-[#fe9832] flex items-center justify-center text-xs font-bold text-[#683700] flex-shrink-0">
              {profile.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1a1b22] truncate">{profile.name}</p>
              <p className="text-xs text-[#444653] truncate">{profile.email}</p>
              {profile.role === 'admin' && (
                <span className="text-xs bg-[#dce1ff] text-[#002068] px-1.5 py-0.5 rounded-full font-bold">Admin</span>
              )}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2 w-full rounded-lg text-sm text-[#444653] hover:bg-[#e2e1eb] transition-colors"
        >
          <Icon name="logout" size={18} />
          Esci
        </button>
      </div>
    </aside>
  )
}
