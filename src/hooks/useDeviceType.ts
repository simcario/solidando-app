import { useState, useEffect } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

function getDeviceType(width: number): DeviceType {
  if (width < 768) return 'mobile'
  if (width < 1400) return 'tablet'   // copre iPad Pro 12.9" landscape (1366px)
  return 'desktop'
}

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>(() =>
    getDeviceType(window.innerWidth)
  )

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      setDeviceType(getDeviceType(window.innerWidth))
    })
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  return deviceType
}
