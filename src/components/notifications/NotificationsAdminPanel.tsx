import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { db, app } from '../../firebase/config'
import { showToast } from '../ui/Toast'
import Icon from '../ui/Icon'

interface FormOption { id: string; title: string }
interface EventOption { id: string; title: string }

export default function NotificationsAdminPanel() {
  const [forms, setForms] = useState<FormOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [threadType, setThreadType] = useState<'all' | 'form' | 'event'>('all')
  const [threadId, setThreadId] = useState('')
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState<number | null>(null)

  useEffect(() => {
    getDocs(collection(db, 'forms')).then(snap => {
      setForms(snap.docs.map(d => ({ id: d.id, title: d.data().title ?? d.id })))
    })
    getDocs(query(collection(db, 'events'), where('status', '==', 'published'))).then(snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, title: d.data().title ?? d.id })))
    })
  }, [])

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      showToast('Titolo e messaggio sono obbligatori', 'error')
      return
    }
    if ((threadType === 'form' || threadType === 'event') && !threadId) {
      showToast('Seleziona un form o evento target', 'error')
      return
    }

    setSending(true)
    setLastResult(null)
    try {
      const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'sendNotification')
      const res = await fn({
        title: title.trim(),
        body: body.trim(),
        threadType: threadType === 'all' ? undefined : threadType,
        threadId: threadType === 'all' ? undefined : threadId,
        url: url.trim() || undefined,
      })
      const sent = (res.data as { sent: number }).sent
      setLastResult(sent)
      showToast(`Notifica inviata a ${sent} utenti`, 'success')
      setTitle('')
      setBody('')
      setUrl('')
    } catch (err: unknown) {
      showToast(`Errore: ${(err as Error).message}`, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-[#444653] mb-1">Destinatari</label>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'form', 'event'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setThreadType(t); setThreadId('') }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${threadType === t ? 'bg-[#002068] text-white border-[#002068]' : 'bg-white text-[#444653] border-[#c4c5d5] hover:bg-[#f0eff8]'}`}
            >
              {t === 'all' ? 'Tutti gli utenti' : t === 'form' ? 'Iscritti a form' : 'Iscritti a evento'}
            </button>
          ))}
        </div>
      </div>

      {threadType === 'form' && (
        <div>
          <label className="block text-xs font-semibold text-[#444653] mb-1">Form target</label>
          <select
            value={threadId}
            onChange={e => setThreadId(e.target.value)}
            className="w-full border border-[#c4c5d5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002068]"
          >
            <option value="">Seleziona un form…</option>
            {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </div>
      )}

      {threadType === 'event' && (
        <div>
          <label className="block text-xs font-semibold text-[#444653] mb-1">Evento target</label>
          <select
            value={threadId}
            onChange={e => setThreadId(e.target.value)}
            className="w-full border border-[#c4c5d5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002068]"
          >
            <option value="">Seleziona un evento…</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-[#444653] mb-1">Titolo notifica</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Es. Aggiornamento importante"
          className="w-full border border-[#c4c5d5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002068]"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#444653] mb-1">Messaggio</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          placeholder="Testo della notifica…"
          className="w-full border border-[#c4c5d5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002068] resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#444653] mb-1">Link (opzionale)</label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="/my, /events/xxx, …"
          className="w-full border border-[#c4c5d5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#002068]"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-[#002068] text-white text-sm font-semibold rounded-lg hover:bg-[#001550] disabled:opacity-50 transition-colors"
        >
          <Icon name="send" size={16} />
          {sending ? 'Invio…' : 'Invia notifica'}
        </button>
        {lastResult !== null && (
          <span className="text-sm text-green-600 font-medium">Inviato a {lastResult} utenti</span>
        )}
      </div>
    </div>
  )
}
