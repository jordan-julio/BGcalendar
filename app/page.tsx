/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import NotificationBell from '@/components/NotificationBell'
import FCMTokenService from '@/lib/FCMTokenService';
import NotificationPreferences from '@/components/NotificationPreferences';
import { useColorManagement } from '@/hooks/useColorManagement'

import { Event } from '@/types'
import { Calendar as CalendarIcon, Bell, TestTube, Settings, MoreVertical, X, Palette } from 'lucide-react'
import ColorManagementModal from '@/components/ColorManagementModal';

// Centralized loading state management
interface LoadingState {
  mounted: boolean
  auth: boolean
  events: boolean
  fcm: boolean
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false)
  const [showColorManagement, setShowColorManagement] = useState(false)
  
  // Centralized loading state
  const [loadingState, setLoadingState] = useState<LoadingState>({
    mounted: false,
    auth: false,
    events: false,
    fcm: false
  })
  
  const { refreshColors, forceUpdate } = useColorManagement();
  
  // Refs to prevent multiple initializations
  const swRegistered = useRef(false)
  const previousUserId = useRef<string | null>(null)
  const initializationStarted = useRef(false)
  const retryCount = useRef(0)
  const maxRetries = 3

  // Helper function to update loading state
  const updateLoadingState = useCallback((updates: Partial<LoadingState>) => {
    setLoadingState(prev => ({ ...prev, ...updates }))
  }, [])

  // Check if we should show loading
  const shouldShowLoading = loadingState.mounted && 
    (!loadingState.auth || (user && !loadingState.events))

  // *** CRITICAL: Handle hydration properly ***
  useEffect(() => {
    console.log('🚀 Component mounting...')
    updateLoadingState({ mounted: true })
  }, [updateLoadingState])

  // Service Worker Registration (run once after mount)
  useEffect(() => {
    if (!loadingState.mounted || swRegistered.current) return
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('✅ Combined SW registered:', reg.scope)
          swRegistered.current = true
        })
        .catch(err => console.error('❌ SW registration failed:', err))
    }
  }, [loadingState.mounted])

  // Robust auth initialization with retry logic
  const initializeAuth = useCallback(async (): Promise<any> => {
    console.log(`🔐 Attempting auth initialization (attempt ${retryCount.current + 1}/${maxRetries})...`)
    
    try {
      // First, let's check if Supabase is properly configured
      if (!supabase) {
        throw new Error('Supabase client is not initialized')
      }

      // Try to get the session first (this is often more reliable)
      console.log('🔍 Getting current session...')
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.warn('⚠️ Session error (trying getUser):', sessionError.message)
        // If session fails, try getUser as fallback
        const { data: userData, error: userError } = await supabase.auth.getUser()
        
        if (userError) {
          console.error('❌ Both session and user fetch failed:', userError.message)
          throw userError
        }
        
        console.log('✅ Auth via getUser successful')
        return userData.user
      }
      
      console.log('✅ Auth via getSession successful')
      return sessionData.session?.user || null
      
    } catch (error: any) {
      console.error(`❌ Auth initialization attempt ${retryCount.current + 1} failed:`, error)
      
      // If this wasn't the last retry, increment and try again
      if (retryCount.current < maxRetries - 1) {
        retryCount.current++
        console.log(`🔄 Retrying auth initialization in 1 second...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        return initializeAuth()
      }
      
      // All retries exhausted
      console.error('💥 All auth initialization attempts failed')
      throw new Error(`Auth initialization failed after ${maxRetries} attempts: ${error.message}`)
    }
  }, [])

  // Fetch events function
  const fetchEvents = useCallback(async () => {
    if (!user || loadingState.events) return
    
    console.log('📅 Fetching events for user:', user.id)
    
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true })
        
      if (error) {
        console.error('❌ Error fetching events:', error)
        throw error
      }
      
      console.log(`✅ Successfully fetched ${data?.length || 0} events`)
      setEvents(data || [])
      setError(null)
    } catch (err: any) {
      console.error('💥 Error in fetchEvents:', err)
      setError(`Failed to load events: ${err.message}`)
    } finally {
      updateLoadingState({ events: true })
    }
  }, [user, loadingState.events, updateLoadingState])

  // FCM Initialization
  const initializeFCM = useCallback(async () => {
    if (!user || loadingState.fcm || !loadingState.mounted) return
    
    console.log('🔔 Starting FCM initialization for user:', user.id)
    
    try {
      const fcmService = FCMTokenService.getInstance()
      const success = await fcmService.initializeForUser(user.id)
      console.log(success ? '✅ FCM initialized successfully' : '⚠️ FCM initialization failed')
    } catch (error) {
      console.error('❌ FCM initialization error:', error)
    } finally {
      updateLoadingState({ fcm: true })
    }
  }, [user, loadingState.fcm, loadingState.mounted, updateLoadingState])

  // Main initialization effect - runs once after mount
  useEffect(() => {
    if (!loadingState.mounted || initializationStarted.current) return
    
    initializationStarted.current = true
    let isMounted = true
    
    const initializeApp = async () => {
      try {
        console.log('🚀 Starting app initialization...')
        
        // Reset retry count for this initialization
        retryCount.current = 0
        
        // Get current user with retry logic
        const currentUser = await initializeAuth()
        
        if (!isMounted) return
        
        console.log('🔐 Current user:', currentUser?.id || 'none')
        setUser(currentUser)
        previousUserId.current = currentUser?.id || null
        
        // Mark auth as loaded
        updateLoadingState({ auth: true })
        
        // If no user, mark everything as loaded
        if (!currentUser) {
          console.log('👤 No user found, skipping data loading')
          updateLoadingState({ events: true, fcm: true })
          return
        }
        
        // User exists, continue with data loading
        console.log('👤 User authenticated, ready for data loading...')
        
      } catch (error: any) {
        console.error('❌ App initialization error:', error)
        
        // Set a more specific error message
        const errorMessage = error.message.includes('fetch') 
          ? 'Network connection failed. Please check your internet connection and try again.'
          : error.message.includes('Invalid API key')
          ? 'Authentication configuration error. Please contact support.'
          : `Initialization failed: ${error.message}`
        
        setError(errorMessage)
        
        // Mark auth as loaded even on error so we don't get stuck in loading
        updateLoadingState({ auth: true, events: true, fcm: true })
      }
    }

    initializeApp()

    // Set up auth state listener with better error handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      console.log('🔐 Auth state changed:', event, session?.user?.id || 'no user')
      
      try {
        const newUser = session?.user ?? null
        const oldUserId = previousUserId.current
        
        setUser(newUser)
        
        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out, resetting state...')
          
          // Clean up FCM for the previous user
          if (oldUserId) {
            try {
              const fcmService = FCMTokenService.getInstance()
              await fcmService.cleanup(oldUserId)
              console.log('✅ FCM cleanup completed')
            } catch (error) {
              console.error('❌ FCM cleanup error:', error)
            }
          }
          
          // Reset all state
          setEvents([])
          setError(null)
          updateLoadingState({ events: true, fcm: true })
          
        } else if (event === 'SIGNED_IN' && newUser) {
          console.log('👋 User signed in:', newUser.id)
          
          // Reset loading states for new user
          updateLoadingState({ events: false, fcm: false })
          setError(null)
        }
        
        // Update previous user ID
        previousUserId.current = newUser?.id || null
        
      } catch (error: any) {
        console.error('❌ Error in auth state change handler:', error)
        setError(`Authentication error: ${error.message}`)
      }
    })

    return () => {
      console.log('🧹 Cleaning up main effect...')
      isMounted = false
      subscription.unsubscribe()
    }
  }, [loadingState.mounted, updateLoadingState, initializeAuth])

  // Fetch events when user is available and auth is loaded
  useEffect(() => {
    if (loadingState.auth && user && !loadingState.events) {
      console.log('📅 Auth loaded and user available, fetching events...')
      fetchEvents()
    }
  }, [loadingState.auth, user, loadingState.events, fetchEvents])

  // Initialize FCM when everything else is ready
  useEffect(() => {
    if (loadingState.auth && loadingState.events && user && !loadingState.fcm) {
      console.log('🔔 Dependencies ready, initializing FCM...')
      initializeFCM()
    }
  }, [loadingState.auth, loadingState.events, user, loadingState.fcm, initializeFCM])

  // Realtime subscription - only after everything is loaded
  useEffect(() => {
    if (!user || !loadingState.auth || !loadingState.events) return
    
    console.log('📡 Setting up realtime subscription for user:', user.id)
    
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'events'
      }, payload => {
        console.log(
          '📡 Realtime event:',
          payload.eventType,
          (payload.new && 'id' in payload.new ? payload.new.id : undefined) ||
            (payload.old && 'id' in payload.old ? payload.old.id : undefined)
        )
        
        try {
          if (payload.eventType === 'INSERT') {
            setEvents(prev => [...prev, payload.new as Event])
          } else if (payload.eventType === 'UPDATE') {
            setEvents(prev => prev.map(e => e.id === payload.new.id ? payload.new as Event : e))
          } else if (payload.eventType === 'DELETE') {
            setEvents(prev => prev.filter(e => e.id !== payload.old.id))
          }
        } catch (error) {
          console.error('❌ Error handling realtime event:', error)
        }
      })
      .subscribe(status => {
        console.log('📡 Realtime status:', status)
      })

    return () => {
      console.log('📡 Cleaning up realtime subscription')
      channel.unsubscribe()
    }
  }, [user, loadingState.auth, loadingState.events])

  // Emergency timeout - more generous but with better messaging
  useEffect(() => {
    if (!loadingState.mounted) return
    
    const emergencyTimeout = setTimeout(() => {
      if (!loadingState.auth || (user && !loadingState.events)) {
        console.log('🚨 EMERGENCY: Forcing incomplete states to complete after 8 seconds')
        console.log('Current state:', loadingState)
        
        // Force all states to complete
        updateLoadingState({ auth: true, events: true, fcm: true })
        
        if (!error) {
          setError('Loading is taking longer than expected. The app may not function properly. Try refreshing the page.')
        }
      }
    }, 8000) // Increased to 8 seconds to allow for retries
    
    return () => clearTimeout(emergencyTimeout)
  }, [loadingState, user, error, updateLoadingState])

  // Debug logging
  useEffect(() => {
    console.log('📊 State update:', {
      mounted: loadingState.mounted,
      auth: loadingState.auth,
      events: loadingState.events,
      fcm: loadingState.fcm,
      user: !!user,
      shouldShowLoading,
      eventsCount: events.length,
      error: !!error
    })
  }, [loadingState, user, shouldShowLoading, events.length, error])

  // Manual retry function
  const retryInitialization = useCallback(() => {
    console.log('🔄 Manual retry requested...')
    setError(null)
    retryCount.current = 0
    initializationStarted.current = false
    updateLoadingState({ 
      auth: false, 
      events: false, 
      fcm: false 
    })
  }, [updateLoadingState])

  // Debug functions
  const testFCMNotification = useCallback(async () => {
    if (!user) {
      alert('Please sign in first to test notifications')
      return
    }

    try {
      console.log('🚀 Testing FCM notification...')
      
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [user.id],
          title: '🧪 Test Notification',
          body: 'This is a test notification from your calendar app!',
          data: { type: 'test', timestamp: new Date().toISOString() }
        })
      })

      const result = await response.json()
      
      if (response.ok) {
        console.log('✅ Test notification sent:', result)
        alert(`✅ Test notification sent successfully!\n\nSuccess: ${result.successCount || 0}\nFailed: ${result.failureCount || 0}`)
      } else {
        console.error('❌ Failed to send test notification:', result)
        alert(`❌ Failed to send test notification: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('❌ Error sending test notification:', error)
      alert('❌ Error sending test notification. Check console for details.')
    }
  }, [user])

  const checkFCMStatus = useCallback(() => {
    if (!loadingState.mounted) {
      alert('Client not ready yet')
      return
    }
    
    const fcmService = FCMTokenService.getInstance()
    const permission = Notification.permission
    const hasToken = fcmService.getCurrentToken() !== null
    const isReady = fcmService.isReady()
    
    alert(`🔔 FCM Status Report:
    
Permission: ${permission}
Has Token: ${hasToken}
FCM Ready: ${isReady}
Service Worker: ${'serviceWorker' in navigator}
Notifications API: ${'Notification' in window}
Current Token: ${fcmService.getCurrentToken()?.substring(0, 20) || 'None'}...`)
  }, [loadingState.mounted])

  const reinitializeFCM = useCallback(async () => {
    if (!user) return
    
    try {
      updateLoadingState({ fcm: false })
      const fcmService = FCMTokenService.getInstance()
      fcmService.destroy()
      
      await initializeFCM()
      alert('FCM reinitialization completed!')
    } catch (error) {
      console.error('❌ Failed to reinitialize FCM:', error)
      alert('❌ FCM reinitialization failed. Check console for details.')
    }
  }, [user, initializeFCM, updateLoadingState])

  const resetApp = useCallback(() => {
    console.log('🔄 Resetting app...')
    window.location.reload()
  }, [])

  // *** HYDRATION SAFE: Don't render anything until mounted ***
  if (!loadingState.mounted) {
    return null // Return null during SSR to avoid hydration mismatch
  }

  // *** NOW SAFE: All content is client-side only ***
  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading calendar...</p>
          
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 text-xs text-gray-500 space-y-1">
              <div>Mounted: {loadingState.mounted ? '✅' : '⏳'}</div>
              <div>Auth: {loadingState.auth ? '✅' : '⏳'} (Retry: {retryCount.current + 1})</div>
              <div>Events: {loadingState.events ? '✅' : '⏳'}</div>
              <div>FCM: {loadingState.fcm ? '✅' : '⏳'}</div>
              <div>User: {user ? `${user.id.substring(0, 8)}...` : 'none'}</div>
            </div>
          )}
          
          {/* Manual retry button */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 space-x-2">
              <button
                onClick={retryInitialization}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
              >
                Retry Init
              </button>
              <button
                onClick={resetApp}
                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
              >
                Force Reset
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-6 bg-red-50 rounded-lg border border-red-200 max-w-md">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
          <p className="text-red-600 mb-4 text-sm">{error}</p>
          <div className="space-x-2">
            <button
              onClick={retryInitialization}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Retry
            </button>
            <button
              onClick={resetApp}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Reset App
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main app content (rest of component unchanged)
  return (
    <div className="min-h-screen bg-gray-50">
      <PWAInstallPrompt />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg flex-shrink-0">
                <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">Team Calendar</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Stay synchronized with your team</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
              {user && loadingState.mounted && (
                <div className="flex-shrink-0">
                  <NotificationBell userId={user.id} />
                </div>
              )}
              
              {user && loadingState.mounted && (
                <div className="relative lg:hidden">
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    {isMobileMenuOpen ? <X className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
                  </button>
                  
                  {isMobileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                      <button
                        onClick={() => { setShowColorManagement(true); setIsMobileMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Palette className="h-4 w-4 text-indigo-600" />
                        Manage Colors
                      </button>
                      <button
                        onClick={() => { testFCMNotification(); setIsMobileMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <TestTube className="h-4 w-4 text-green-600" />
                        Test FCM Notification
                      </button>
                      <button
                        onClick={() => { checkFCMStatus(); setIsMobileMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4 text-blue-600" />
                        Check FCM Status
                      </button>
                      <button
                        onClick={() => { reinitializeFCM(); setIsMobileMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4 text-orange-600" />
                        Reinitialize FCM
                      </button>
                      <button
                        onClick={() => { setShowNotificationPrefs(true); setIsMobileMenuOpen(false); }}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Bell className="h-4 w-4 text-purple-600" />
                        Notification Settings
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {user && loadingState.mounted && (
                <div className="hidden lg:flex items-center space-x-2">
                  <button
                    onClick={testFCMNotification}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <TestTube className="h-4 w-4" />
                    <span className="hidden xl:inline">Test</span>
                  </button>
                  <button
                    onClick={() => setShowNotificationPrefs(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden xl:inline">Settings</span>
                  </button>
                  <button
                    onClick={() => setShowColorManagement(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Manage event colors"
                  >
                    <Palette className="h-4 w-4" />
                    <span className="hidden xl:inline">Colors</span>
                  </button>
                </div>
              )}
              
              <div className="flex-shrink-0">
                <AuthButton user={user} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Click outside to close mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 lg:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Notification Preferences Modal */}
      {showNotificationPrefs && user && (
        <div className="fixed inset-0 z-999 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity z-[-1]">
              <div className="absolute inset-0 bg-gray-500 opacity-50" onClick={() => setShowNotificationPrefs(false)}></div>
            </div>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
                  <button onClick={() => setShowNotificationPrefs(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-6 w-6" />
                  </button>
                </div>
                <NotificationPreferences userId={user.id} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <Card
              label="Total Events"
              value={events.length}
              icon={<CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 opacity-20" />}
            />
            <Card
              label="This Month"
              value={events.filter(e => {
                const d = new Date(e.start_date)
                const n = new Date()
                return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
              }).length}
              icon={<CalendarIcon className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 opacity-20" />}
            />
            <Card
              label="Next 24h"
              value={events.filter(e => {
                const eventDate = new Date(e.start_date)
                const now = new Date()
                const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
                return eventDate >= now && eventDate <= next24Hours
              }).length}
              icon={<Bell className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500 opacity-20" />}
            />
            <Card
              label="FCM Status"
              value={user && loadingState.mounted ? (
                FCMTokenService.getInstance().isReady() ? 'Ready' : 'Setup Needed'
              ) : 'Sign in'}
              icon={<Bell className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 opacity-20" />}
            />
          </div>

          <Calendar events={events} user={user} key={forceUpdate} />
        </div>
      </main>
      
      {showColorManagement && (
        <ColorManagementModal
          events={events}
          onClose={() => setShowColorManagement(false)}
          onColorsChanged={() => {
            refreshColors()
            // Force re-render of calendar
            setEvents([...events])
          }}
        />
      )}
    </div>
  )
}

// Card component (unchanged)
function Card({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg sm:rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-lg sm:text-2xl font-semibold text-gray-900 truncate">
            {typeof value === 'string' && value.length > 8 ? 
              <span className="text-sm sm:text-lg">{value}</span> : 
              value
            }
          </p>
        </div>
        <div className="flex-shrink-0 ml-2">
          {icon}
        </div>
      </div>
    </div>
  )
}