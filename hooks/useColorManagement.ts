// hooks/useColorManagement.ts
'use client'

import { useEffect, useState } from 'react'
import { loadCustomEventColors } from '@/lib/utils'

export function useColorManagement() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(0)

  useEffect(() => {
    // Load custom colors from localStorage on app startup
    loadCustomEventColors()
    setIsLoaded(true)
  }, [])

  const refreshColors = () => {
    // Force components to re-render with new colors
    setForceUpdate(prev => prev + 1)
  }

  return {
    isLoaded,
    refreshColors,
    forceUpdate // Use this as a dependency in components that need to re-render when colors change
  }
}