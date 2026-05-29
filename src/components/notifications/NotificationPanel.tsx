import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'
import { useNotificationStore, type AppNotification } from '../../stores/notificationStore'
import Icon from '../ui/Icon'

interface Props {
  uid: string
  onClose: () => void
}

export default function NotificationPanel({ uid, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationStore()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleNotificationClick(n: AppNotification) {
    markRead(n.id)
    if (n.url) navigate(n.url)
    onClose()
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-xl border border-[#e8e7f0] overflow-hidden z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e7f0]">
        <span className="font-semibold text-[#1a1b22] text-sm">Notifiche</span>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead(uid)}
            className="text-xs text-[#002068] hover:underline font-medium"
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      {/* List */}
      <div className="divide-y divide-[#f0eff8] max-h-[380px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[#747684]">
            <Icon name="notifications_none" size={32} />
            <span className="text-sm">Nessuna notifica</span>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[#f5f4fd] transition-colors ${!n.read ? 'bg-[#f0f3ff]' : ''}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <span className={`w-2 h-2 rounded-full inline-block ${!n.read ? 'bg-[#002068]' : 'bg-transparent'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1b22] truncate">{n.title}</p>
                <p className="text-xs text-[#747684] line-clamp-2 mt-0.5">{n.body}</p>
                {n.createdAt && (
                  <p className="text-xs text-[#aaa] mt-1">
                    {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true, locale: it })}
                  </p>
                )}
              </div>
              <Icon name={threadIcon(n.threadType)} size={16} className="text-[#aaa] flex-shrink-0 mt-1" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function threadIcon(type?: string) {
  if (type === 'event') return 'event'
  if (type === 'response') return 'assignment_turned_in'
  return 'description'
}
