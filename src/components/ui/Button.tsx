import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Icon from './Icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  iconFilled?: boolean
  children?: ReactNode
  loading?: boolean
}

const variantStyles = {
  primary: 'bg-[#fe9832] text-[#683700] hover:brightness-105 shadow-sm active:scale-95',
  secondary: 'bg-[#002068] text-white hover:bg-[#003399] active:scale-95',
  ghost: 'border border-[#c4c5d5] text-[#444653] hover:bg-[#eeedf6] active:scale-95',
  danger: 'bg-[#ffdad6] text-[#93000a] hover:bg-[#ba1a1a] hover:text-white active:scale-95',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs gap-1',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconFilled,
  children,
  loading,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center font-semibold rounded-lg
        transition-all duration-150 select-none
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <Icon name={icon} filled={iconFilled} size={size === 'sm' ? 16 : 20} />
      ) : null}
      {children}
    </button>
  )
}
