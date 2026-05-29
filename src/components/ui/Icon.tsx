interface IconProps {
  name: string
  className?: string
  filled?: boolean
  size?: number
}

export default function Icon({ name, className = '', filled = false, size }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
        fontSize: size ? `${size}px` : undefined,
      }}
    >
      {name}
    </span>
  )
}
