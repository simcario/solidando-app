import { useEffect, useState } from 'react'
import Icon from './Icon'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(t)
  }, [duration, onClose])

  const styles: Record<ToastType, string> = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-[#ba1a1a] text-white',
    info: 'bg-[#002068] text-white',
  }

  const icons: Record<ToastType, string> = {
    success: 'check_circle',
    error: 'error',
    info: 'info',
  }

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg text-sm font-semibold transition-all duration-300 ${styles[type]} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <Icon name={icons[type]} size={18} />
      {message}
    </div>
  )
}

// ── Singleton store ──────────────────────────────────────────────────────────

type ToastItem = { id: number; message: string; type: ToastType; duration?: number }

let _listeners: Array<(toasts: ToastItem[]) => void> = []
let _toasts: ToastItem[] = []
let _nextId = 0

function notify() {
  _listeners.forEach(fn => fn([..._toasts]))
}

export function showToast(message: string, type: ToastType = 'success', duration = 3000) {
  const id = _nextId++
  _toasts = [..._toasts, { id, message, type, duration }]
  notify()
}

export function useToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    _listeners.push(setToasts)
    return () => { _listeners = _listeners.filter(fn => fn !== setToasts) }
  }, [])

  function remove(id: number) {
    _toasts = _toasts.filter(t => t.id !== id)
    notify()
  }

  return { toasts, remove }
}

export function ToastContainer() {
  const { toasts, remove } = useToastContainer()
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} duration={t.duration} onClose={() => remove(t.id)} />
      ))}
    </div>
  )
}
