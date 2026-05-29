import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { useAuthStore } from '../../stores/authStore'
import { getForms, createForm, deleteForm, duplicateForm } from '../../firebase/forms'
import { getRecentResponsesByForms, getResponseCountsByUser, getResponseCountsByForms } from '../../firebase/responses'
import type { Form, Response } from '../../types/form'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'Pochi secondi fa'
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ore fa`
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(date)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function resolveWorkspaceId(profile: ReturnType<typeof useAuthStore.getState>['profile']): string {
  if (!profile) return 'default'
  return profile.workspaceIds?.[0] || profile.uid
}

export default function DashboardPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const workspaceId = resolveWorkspaceId(profile)

  const [forms, setForms] = useState<Form[]>([])
  const [recentResponses, setRecentResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingForm, setCreatingForm] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const loadedForms = await getForms(workspaceId, isAdmin ? undefined : user.uid, isAdmin).catch(() => [] as Form[])

      const [counts, recent] = await Promise.all([
        isAdmin
          ? getResponseCountsByForms(loadedForms.map(f => f.id)).catch(() => ({} as Record<string, number>))
          : getResponseCountsByUser(user.uid).catch(() => ({} as Record<string, number>)),
        loadedForms.length > 0
          ? getRecentResponsesByForms(loadedForms.map(f => f.id), 5).catch(() => [] as Response[])
          : Promise.resolve([] as Response[]),
      ])

      setForms(loadedForms.map(f => ({ ...f, _responseCount: counts[f.id] ?? 0 })))
      setRecentResponses(recent)
      setLoading(false)
    })()
  }, [user, workspaceId, isAdmin])

  // ── KPI derivati dai dati reali ───────────────────────────────────────────
  const totalResponses = forms.reduce((sum, f) => sum + (f._responseCount ?? 0), 0)
  const publishedForms = forms.filter(f => f.published).length
  const completionRate = forms.length > 0 ? Math.round((publishedForms / forms.length) * 100) : 0
  const totalForms = forms.length

  const kpiCards = [
    {
      key: 'forms',
      label: 'Form Totali',
      value: String(totalForms),
      sub: `${publishedForms} pubblicati`,
      icon: 'dynamic_form',
    },
    {
      key: 'responses',
      label: 'Risposte Totali',
      value: totalResponses > 999 ? `${(totalResponses / 1000).toFixed(1)}k` : String(totalResponses),
      sub: recentResponses.length > 0 ? `Ultima: ${relativeTime(recentResponses[0].submittedAt?.toDate?.() ?? new Date(0))}` : 'Nessuna risposta',
      icon: 'inbox',
    },
    {
      key: 'completion',
      label: 'Form Pubblicati',
      value: `${completionRate}%`,
      sub: `${publishedForms} di ${totalForms}`,
      icon: 'task_alt',
    },
  ]

  async function handleNewForm() {
    if (!user) return
    setCreatingForm(true)
    try {
      const id = await createForm(workspaceId, user.uid)
      navigate(`/builder/${id}`)
    } finally {
      setCreatingForm(false)
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Eliminare questo form?')) return
    await deleteForm(id)
    setForms(f => f.filter(x => x.id !== id))
  }

  async function handleDuplicate(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!user) return
    const newId = await duplicateForm(id, user.uid)
    const form = await import('../../firebase/forms').then(m => m.getForm(newId))
    if (form) setForms(f => [form, ...f])
  }

  return (
    <AppLayout>
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-[#002068] leading-tight">
            Bentornato, {profile?.name?.split(' ')[0] ?? 'utente'}
          </h1>
          <p className="text-sm md:text-lg text-[#444653] mt-1">Ecco cosa è successo nei tuoi form.</p>
        </div>
        <button
          onClick={handleNewForm}
          disabled={creatingForm}
          className="hidden sm:flex items-center gap-3 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-60"
        >
          <Icon name="add_circle" filled size={22} />
          <span className="uppercase tracking-wider text-sm">Nuovo Form</span>
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-8 md:mb-12">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-5 md:p-8 rounded-xl border border-[#c4c5d5] animate-pulse h-24 md:h-32" />
          ))
        ) : (
          kpiCards.map(({ key, label, value, sub, icon }) => (
            <div key={key} className="bg-white p-4 md:p-8 rounded-xl border border-[#c4c5d5] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 md:p-4 opacity-10 group-hover:scale-110 transition-transform">
                <Icon name={icon} size={48} className="md:hidden" />
                <Icon name={icon} size={64} className="hidden md:block" />
              </div>
              <p className="text-[10px] md:text-xs font-semibold tracking-wider text-[#444653] mb-1 md:mb-2 uppercase">{label}</p>
              <div className="flex items-baseline gap-2 mb-0.5 md:mb-1">
                <span className="text-2xl md:text-4xl font-black text-[#002068]">{value}</span>
              </div>
              <p className="text-[10px] md:text-xs text-[#747684] truncate">{sub}</p>
            </div>
          ))
        )}
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* Recent Forms */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-[#1a1b22]">Form Recenti</h3>
            <button
              onClick={() => navigate('/forms')}
              className="text-sm font-semibold text-[#002068] hover:underline"
            >
              Vedi tutti
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="bg-white rounded-xl border border-[#c4c5d5] animate-pulse h-48" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <div className="bg-white rounded-xl border-2 border-dashed border-[#c4c5d5] p-12 flex flex-col items-center justify-center text-center">
              <Icon name="dynamic_form" size={48} className="text-[#c4c5d5] mb-4" />
              <p className="text-[#444653] font-medium mb-4">Nessun form ancora.</p>
              <button onClick={handleNewForm} className="px-5 py-2.5 bg-[#fe9832] text-[#683700] rounded-lg font-bold text-sm">
                Crea il primo form
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {forms.slice(0, 4).map(form => (
                <FormCard
                  key={form.id}
                  form={form}
                  onEdit={() => navigate(`/builder/${form.id}`)}
                  onDelete={e => handleDelete(form.id, e)}
                  onDuplicate={e => handleDuplicate(form.id, e)}
                  onViewResponses={() => navigate(`/responses/${form.id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          {/* Form status breakdown */}
          {!loading && forms.length > 0 && (
            <div className="bg-white border border-[#c4c5d5] rounded-xl p-5 shadow-sm">
              <h4 className="text-sm font-bold text-[#1a1b22] mb-4">Stato Form</h4>
              <div className="space-y-3">
                <StatusRow
                  label="Pubblicati"
                  count={publishedForms}
                  total={totalForms}
                  color="bg-[#4caf50]"
                />
                <StatusRow
                  label="Bozze"
                  count={totalForms - publishedForms}
                  total={totalForms}
                  color="bg-[#c4c5d5]"
                />
              </div>
              <div className="mt-4 pt-4 border-t border-[#e8e7f0] flex justify-between text-xs text-[#747684]">
                <span>{totalForms} form totali</span>
                <span>{totalResponses} risposte totali</span>
              </div>
            </div>
          )}

          {/* Activity feed — dati reali */}
          <div className="bg-[#002068] text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h4 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-3">Attività Recente</h4>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-4 bg-white/10 rounded animate-pulse" />
                  ))}
                </div>
              ) : recentResponses.length === 0 ? (
                <p className="text-xs opacity-60">Nessuna risposta ricevuta ancora.</p>
              ) : (
                <ul className="space-y-2">
                  {recentResponses.map(r => {
                    const form = forms.find(f => f.id === r.formId)
                    const date = r.submittedAt?.toDate?.()
                    return (
                      <li key={r.id} className="text-xs flex gap-2 items-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#fe9832] mt-1.5 flex-shrink-0" />
                        <span>
                          Nuova risposta in{' '}
                          <span className="font-bold">"{form?.title ?? r.formId}"</span>
                          {date ? ` · ${relativeTime(date)}` : ''}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <Icon name="history" size={120} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      <button
        onClick={handleNewForm}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#fe9832] text-[#683700] shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-50 md:hidden" style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Icon name="add" filled size={28} />
      </button>
    </AppLayout>
  )
}

// ─── Status row ───────────────────────────────────────────────────────────────

function StatusRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs text-[#444653] mb-1">
        <span>{label}</span>
        <span className="font-semibold">{count}</span>
      </div>
      <div className="h-2 bg-[#e8e7f0] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Form Card ────────────────────────────────────────────────────────────────

function FormCard({
  form, onEdit, onDelete, onDuplicate, onViewResponses
}: {
  form: Form
  onEdit: () => void
  onDelete: (e: React.MouseEvent) => void
  onDuplicate: (e: React.MouseEvent) => void
  onViewResponses: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      onClick={onEdit}
      className="bg-white rounded-xl border border-[#c4c5d5] hover:border-[#002068] transition-all group cursor-pointer relative"
    >
      <div className="h-24 md:h-32 w-full bg-gradient-to-br from-[#dce1ff] to-[#f4f3fc] rounded-t-xl relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <Icon name="dynamic_form" size={64} className="text-[#002068]" />
        </div>
        <div className="absolute top-2 right-2">
          <Badge variant={form.published ? 'success' : 'neutral'} dot>
            {form.published ? 'Attivo' : 'Draft'}
          </Badge>
        </div>
      </div>

      <div className="p-4">
        <h4 className="font-bold text-[#1a1b22] group-hover:text-[#002068] transition-colors line-clamp-1">{form.title}</h4>
        <p className="text-xs text-[#444653] mt-1">
          {form._responseCount ?? 0} risposte ·{' '}
          {form.updatedAt?.toDate ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(form.updatedAt.toDate()) : '—'}
        </p>
        <div className="flex items-center justify-between border-t border-[#c4c5d5] pt-3 mt-3">
          <button
            onClick={e => { e.stopPropagation(); onViewResponses() }}
            className="text-xs font-semibold text-[#002068] hover:underline"
          >
            Vedi risposte
          </button>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
              className="p-1 text-[#444653] hover:text-[#002068] rounded transition-colors"
            >
              <Icon name="more_vert" size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 w-40 bg-white rounded-xl border border-[#c4c5d5] shadow-xl z-20 overflow-hidden">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#f4f3fc]">
                  <Icon name="edit" size={16} /> Modifica
                </button>
                <button onClick={e => { onDuplicate(e); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#f4f3fc]">
                  <Icon name="content_copy" size={16} /> Duplica
                </button>
                <button onClick={e => { onDelete(e); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-[#ffdad6] text-[#ba1a1a]">
                  <Icon name="delete" size={16} /> Elimina
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

