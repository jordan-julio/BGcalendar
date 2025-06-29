// hooks/usePWAInstall.ts
'use client'

import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PWAInstallState {
  isInstallable: boolean
  isInstalled: boolean
  isIOS: boolean
  showPrompt: boolean
  install: () => Promise<void>
  dismiss: () => void
  canInstall: boolean
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  // Check if app is already installed
  const checkIfInstalled = useCallback(() => {
    const standalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator).standalone ||
      document.referrer.includes('android-app://') ||
      localStorage.getItem('pwa-installed') === 'true'
    
    setIsInstalled(standalone)
    return standalone
  }, [])

  // Check if user has dismissed recently
  const hasBeenRecentlyDismissed = useCallback(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (!dismissed) return false
    
    const dismissedDate = new Date(dismissed)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    return dismissedDate > threeDaysAgo
  }, [])

  // Detect platform and setup listeners
  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Check installation status
    const installed = checkIfInstalled()
    
    if (installed) {
      setShowPrompt(false)
      return
    }

    // Don't show if recently dismissed
    if (hasBeenRecentlyDismissed()) {
      return
    }

    // Listen for beforeinstallprompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const promptEvent = e as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      
      // Show prompt after a short delay to not be too aggressive
      setTimeout(() => {
        if (!checkIfInstalled()) {
          setShowPrompt(true)
        }
      }, 3000)
    }

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      localStorage.setItem('pwa-installed', 'true')
      console.log('PWA was installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // For iOS or browsers without beforeinstallprompt, show manual prompt
    if (iOS) {
      setTimeout(() => {
        if (!checkIfInstalled()) {
          setShowPrompt(true)
        }
      }, 2000)
    } else {
      // Fallback for browsers that don't fire beforeinstallprompt
      setTimeout(() => {
        if (!deferredPrompt && !checkIfInstalled()) {
          setShowPrompt(true)
        }
      }, 5000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [deferredPrompt, checkIfInstalled, hasBeenRecentlyDismissed, isIOS])

  // Install function
  const install = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const choiceResult = await deferredPrompt.userChoice
        
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt')
          setIsInstalled(true)
          localStorage.setItem('pwa-installed', 'true')
        } else {
          console.log('User dismissed the install prompt')
        }
        
        setDeferredPrompt(null)
        setShowPrompt(false)
      } catch (error) {
        console.error('Error during PWA installation:', error)
      }
    } else {
      // For iOS or manual installation, just close the prompt
      setShowPrompt(false)
      // Don't mark as dismissed for iOS since they might still want to install manually
      if (!isIOS) {
        localStorage.setItem('pwa-install-dismissed', new Date().toISOString())
      }
    }
  }, [deferredPrompt, isIOS])

  // Dismiss function
  const dismiss = useCallback(() => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString())
    
    if (deferredPrompt) {
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  return {
    isInstallable: Boolean(deferredPrompt) || isIOS,
    isInstalled,
    isIOS,
    showPrompt,
    install,
    dismiss,
    canInstall: !isInstalled && (Boolean(deferredPrompt) || isIOS)
  }
}