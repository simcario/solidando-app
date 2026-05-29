import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/layout/AppLayout'
import Icon from '../../components/ui/Icon'
import Badge from '../../components/ui/Badge'
import { getForms, createForm, deleteForm, duplicateForm, publishForm } from '../../firebase/forms'
import { getResponseCountsByUser, getResponseCountsByForms } from '../../firebase/responses'
import { useAuthStore } from '../../stores/authStore'
import type { Form } from '../../types/form'

function resolveWorkspaceId(profile: ReturnType<typeof useAuthStore.getState>['profile']): string {
  if (!profile) return 'default'
  return profile.workspaceIds?.[0] || profile.uid
}

export default function FormsListPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const workspaceId = resolveWorkspaceId(profile)
  const isAdmin = profile?.role === 'admin'
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return
    getForms(workspaceId, isAdmin ? undefined : user.uid, isAdmin).then(async f => {
      const counts = isAdmin
        ? await getResponseCountsByForms(f.map(x => x.id))
        : await getResponseCountsByUser(user.uid)
      const withCounts = f.map(form => ({ ...form, _responseCount: counts[form.id] ?? 0 }))
      setForms(withCounts)
      setLoading(false)
    })
  }, [user, workspaceId, isAdmin])

  async function handleCreate() {
    if (!user) return
    setCreating(true)
    try {
      const id = await createForm(workspaceId, user.uid)
      navigate(`/builder/${id}`)
    } finally {
      setCreating(false)
    }
  }

  const filtered = forms.filter(f => f.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 md:mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-[#002068]">I tuoi Form</h1>
          <p className="text-sm text-[#444653] mt-1">{forms.length} form nel workspace</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="hidden sm:flex items-center gap-2 px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition-all active:scale-95"
        >
          <Icon name="add_circle" filled size={22} />
          <span className="uppercase tracking-wider text-sm">Nuovo Form</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4 md:mb-6 max-w-md">
        <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#747684]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white rounded-xl border border-[#c4c5d5] text-sm focus:ring-2 focus:ring-[#002068] focus:outline-none"
          placeholder="Cerca form..."
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {[1,2,3].map(i => <div key={i} className="h-40 md:h-48 bg-white rounded-xl border border-[#c4c5d5] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Icon name="dynamic_form" size={72} className="text-[#c4c5d5] mb-4" />
          <h3 className="text-xl font-bold text-[#1a1b22] mb-2">Nessun form trovato</h3>
          <p className="text-[#444653] mb-6">Crea il tuo primo form drag & drop</p>
          <button onClick={handleCreate} className="px-6 py-3 bg-[#fe9832] text-[#683700] rounded-xl font-bold">
            Crea Form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
          {filtered.map(form => (
            <FormRow
              key={form.id}
              form={form}
              onEdit={() => navigate(`/builder/${form.id}`)}
              onDelete={async () => { if (confirm('Eliminare?')) { await deleteForm(form.id); setForms(f => f.filter(x => x.id !== form.id)) } }}
              onDuplicate={async () => {
                if (!user) return
                const newId = await duplicateForm(form.id, user.uid)
                const f = await import('../../firebase/forms').then(m => m.getForm(newId))
                if (f) setForms(prev => [f, ...prev])
              }}
              onTogglePublish={async () => {
                await publishForm(form.id, !form.published)
                setForms(prev => prev.map(f => f.id === form.id ? { ...f, published: !f.published } : f))
              }}
              onViewResponses={() => navigate(`/responses/${form.id}`)}
            />
          ))}
        </div>
      )}
      {/* Mobile FAB */}
      <button
        onClick={handleCreate}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#fe9832] text-[#683700] shadow-2xl flex items-center justify-center active:scale-95 transition-transform z-50 sm:hidden" style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Icon name="add" filled size={28} />
      </button>
    </AppLayout>
  )
}

function FormRow({ form, onEdit, onDelete, onDuplicate, onTogglePublish, onViewResponses }: {
  form: Form
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onTogglePublish: () => void
  onViewResponses: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const publicUrl = `${window.location.origin}/f/${form.id}`

  function openPublic(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(publicUrl, '_blank')
  }

  function copyLink(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-white rounded-xl border border-[#c4c5d5] hover:border-[#002068] transition-all group relative">
      <div
        onClick={onEdit}
        className="h-24 md:h-32 bg-gradient-to-br from-[#dce1ff] to-[#f4f3fc] rounded-t-xl relative overflow-hidden cursor-pointer"
      >
        <Icon name="dynamic_form" size={80} className="absolute -bottom-2 -right-2 text-[#002068] opacity-10" />
        <div className="absolute top-3 right-3">
          <Badge variant={form.published ? 'success' : 'neutral'} dot>
            {form.published ? 'Pubblicato' : 'Draft'}
          </Badge>
        </div>
        <div className="absolute top-3 left-3 flex gap-1">
          <button
            onClick={openPublic}
            className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center text-[#002068] shadow-sm transition-colors"
            title="Apri link pubblico"
          >
            <Icon name="open_in_new" size={14} />
          </button>
          <button
            onClick={copyLink}
            className="w-7 h-7 rounded-lg bg-white/80 hover:bg-white flex items-center justify-center text-[#002068] shadow-sm transition-colors"
            title={copied ? 'Copiato!' : 'Copia link'}
          >
            <Icon name={copied ? 'check' : 'link'} size={14} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h4 onClick={onEdit} className="font-bold text-[#1a1b22] cursor-pointer hover:text-[#002068] transition-colors line-clamp-1 mb-1">
          {form.title || 'Untitled Form'}
        </h4>
        <p className="text-xs text-[#444653]">
          {form.nodes?.length ?? 0} domande ·{' '}
          {form.updatedAt?.toDate
            ? new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' }).format(form.updatedAt.toDate())
            : 'Oggi'}
        </p>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#e8e7f0]">
          <button
            onClick={onViewResponses}
            className="text-xs font-semibold text-[#002068] hover:underline"
          >
            {form._responseCount ?? 0} risposte
          </button>

          <div className="relative">
            <button
              onClick={() => setMenu(!menu)}
              className="p-1.5 text-[#444653] hover:text-[#002068] rounded transition-colors"
            >
              <Icon name="more_vert" size={18} />
            </button>
            {menu && (
              <div className="absolute right-0 top-8 w-44 bg-white rounded-xl border border-[#c4c5d5] shadow-xl z-20 overflow-hidden">
                <button onClick={() => { setMenu(false); onEdit() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[#f4f3fc] text-left">
                  <Icon name="edit" size={16} /> Modifica
                </button>
                <button onClick={() => { setMenu(false); onTogglePublish() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[#f4f3fc] text-left">
                  <Icon name={form.published ? 'unpublished' : 'publish'} size={16} />
                  {form.published ? 'Togli pubblicazione' : 'Pubblica'}
                </button>
                <button onClick={() => { setMenu(false); onDuplicate() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[#f4f3fc] text-left">
                  <Icon name="content_copy" size={16} /> Duplica
                </button>
                <hr className="border-[#e8e7f0]" />
                <button onClick={() => { setMenu(false); onDelete() }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[#ffdad6] text-[#ba1a1a] text-left">
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
