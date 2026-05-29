import type { InputHTMLAttributes } from 'react'
import Icon from './Icon'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: string
  hint?: string
}

export default function Input({ label, error, icon, hint, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-[#444653] tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#747684]">
            <Icon name={icon} size={18} />
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full h-12 px-4 bg-[#f4f3fc] border border-[#c4c5d5] rounded-lg
            text-[#1a1b22] text-sm placeholder-[#747684]
            focus:outline-none focus:ring-2 focus:ring-[#002068] focus:bg-white focus:border-[#002068]
            transition-all duration-150
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-[#ba1a1a] focus:ring-[#ba1a1a]' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {hint && !error && <p className="text-xs text-[#747684]">{hint}</p>}
      {error && <p className="text-xs text-[#ba1a1a]">{error}</p>}
    </div>
  )
}
