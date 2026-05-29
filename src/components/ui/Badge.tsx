import type { ReactNode } from 'react'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

const styles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-[#dce1ff] text-[#002068]',
  neutral: 'bg-[#e8e7f0] text-[#444653]',
}

const dotColors: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  info: 'bg-[#002068]',
  neutral: 'bg-[#747684]',
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  dot?: boolean
}

export default function Badge({ variant = 'neutral', children, dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${styles[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  )
}
