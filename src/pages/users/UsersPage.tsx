import { useEffect, useMemo, useState } from 'react'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import { getAllUsers, setUserRole } from '../../firebase/auth'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../components/ui/Toast'
import type { UserProfile } from '../../types/form'

export default function UsersPage() {
  const { user } = useAuthStore()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getAllUsers().then(u => {
      setUsers(u.sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1
        if (b.role === 'admin' && a.role !== 'admin') return 1
        return a.name.localeCompare(b.name)
      }))
      setLoading(false)
    })
  }, [])

  async function toggleRole(profile: UserProfile) {
    if (profile.uid === user?.uid) {
      showToast('Non puoi modificare il tuo stesso ruolo', 'error')
      return
    }
    const newRole = profile.role === 'admin' ? 'user' : 'admin'
    setUpdating(profile.uid)
    try {
      await setUserRole(profile.uid, newRole)
      setUsers(prev => prev.map(u => u.uid === profile.uid ? { ...u, role: newRole } : u))
      showToast(`${profile.name} è ora ${newRole === 'admin' ? 'Admin' : 'Utente'}`, 'success')
    } catch {
      showToast('Errore durante l\'aggiornamento del ruolo', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [users, query])

  const admins = filtered.filter(u => u.role === 'admin')
  const regularUsers = filtered.filter(u => u.role !== 'admin')
  const isFiltering = query.trim().length > 0

  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-4xl font-black text-[#002068]">Utenti</h1>
        <p className="text-[#444653] mt-1">Gestisci i ruoli e gli accessi della community</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-[#002068] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard icon="group" label="Totale utenti" value={users.length} color="blue" />
            <StatCard icon="shield" label="Admin" value={users.filter(u => u.role === 'admin').length} color="orange" />
            <StatCard icon="person" label="Utenti" value={users.filter(u => u.role !== 'admin').length} color="purple" />
          </div>

          {/* Search */}
          <div className="relative">
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747684] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cerca per nome o email…"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#c4c5d5] bg-white text-sm text-[#1a1b22] placeholder:text-[#9a9baa] focus:outline-none focus:ring-2 focus:ring-[#002068]/30 focus:border-[#002068] transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#747684] hover:text-[#1a1b22] transition-colors"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          {isFiltering && filtered.length === 0 ? (
            <div className="text-center py-12 text-[#747684] text-sm">
              <Icon name="search_off" size={32} className="mx-auto mb-2 opacity-40" />
              Nessun utente trovato per &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {/* Admins */}
              {admins.length > 0 && (
                <section>
                  <h2 className="text-sm font-bold text-[#444653] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Icon name="shield" size={16} className="text-[#fe9832]" />
                    Amministratori ({admins.length})
                  </h2>
                  <div className="space-y-2">
                    {admins.map(u => (
                      <UserRow key={u.uid} profile={u} currentUid={user?.uid} onToggle={toggleRole} updating={updating} query={query} />
                    ))}
                  </div>
                </section>
              )}

              {/* Users */}
              {(!isFiltering || regularUsers.length > 0) && (
                <section>
                  <h2 className="text-sm font-bold text-[#444653] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Icon name="person" size={16} className="text-[#002068]" />
                    Utenti ({regularUsers.length})
                  </h2>
                  {regularUsers.length === 0 ? (
                    <div className="text-center py-8 text-[#747684] text-sm">Nessun utente registrato</div>
                  ) : (
                    <div className="space-y-2">
                      {regularUsers.map(u => (
                        <UserRow key={u.uid} profile={u} currentUid={user?.uid} onToggle={toggleRole} updating={updating} query={query} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </AppLayout>
  )
}

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#ffe58a] text-[#1a1b22] rounded-sm px-0.5">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  )
}

function UserRow({
  profile,
  currentUid,
  onToggle,
  updating,
  query,
}: {
  profile: UserProfile
  currentUid?: string
  onToggle: (p: UserProfile) => void
  updating: string | null
  query: string
}) {
  const isMe = profile.uid === currentUid
  const isAdmin = profile.role === 'admin'
  const isUpdating = updating === profile.uid

  return (
    <div className="flex items-center gap-4 bg-white border border-[#c4c5d5] rounded-xl px-5 py-4 hover:shadow-sm transition-shadow">
      {/* Avatar */}
      {profile.avatar ? (
        <img src={profile.avatar} alt={profile.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
          isAdmin ? 'bg-[#ffdcc2] text-[#8f4e00]' : 'bg-[#dce1ff] text-[#002068]'
        }`}>
          {profile.name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-[#1a1b22]">{highlight(profile.name, query)}</p>
          {isMe && <span className="text-xs bg-[#f4f3fc] text-[#747684] px-2 py-0.5 rounded-full">Tu</span>}
          {isAdmin && (
            <span className="text-xs bg-[#ffdcc2] text-[#8f4e00] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Icon name="shield" size={11} />
              Admin
            </span>
          )}
        </div>
        <p className="text-sm text-[#747684] truncate">{highlight(profile.email, query)}</p>
      </div>

      {/* Toggle role */}
      {!isMe && (
        <button
          onClick={() => onToggle(profile)}
          disabled={isUpdating}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-60 ${
            isAdmin
              ? 'bg-[#ffdad6] text-[#93000a] hover:bg-[#ffb3ae]'
              : 'bg-[#dce1ff] text-[#002068] hover:bg-[#b5c4ff]'
          }`}
        >
          {isUpdating ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icon name={isAdmin ? 'remove_moderator' : 'add_moderator'} size={16} />
          )}
          {isAdmin ? 'Rimuovi Admin' : 'Rendi Admin'}
        </button>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: 'blue' | 'orange' | 'purple' }) {
  const colors = {
    blue: 'bg-[#dce1ff] text-[#002068]',
    orange: 'bg-[#ffdcc2] text-[#8f4e00]',
    purple: 'bg-[#f4f3fc] text-[#444653]',
  }
  return (
    <div className="bg-white border border-[#c4c5d5] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon name={icon} size={18} />
      </div>
      <p className="text-2xl font-black text-[#1a1b22]">{value}</p>
      <p className="text-xs text-[#747684] font-medium mt-0.5">{label}</p>
    </div>
  )
}
