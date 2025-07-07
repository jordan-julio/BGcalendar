// app/page.tsx - Updated with fixed FCM integration
'use client';

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import NotificationBell from '@/components/NotificationBell'
import FCMTokenService from '@/lib/FCMTokenService';
import NotificationPreferences from '@/components/NotificationPreferences';

import { Event } from '@/types'
import { Calendar as CalendarIcon, Bell, TestTube, Settings, MoreVertical, X } from 'lucide-react'

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false)
  
  // Refs to prevent multiple initializations
  const swRegistered = useRef(false)
  const fcmInitialized = useRef(false)
  const eventsLoaded = useRef(false)
  const previousUserId = useRef<string | null>(null) // Track previous user for cleanup

  // Client-side only initialization
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Initialize FCM when user is available
  useEffect(() => {
    if (user && isClient && !fcmInitialized.current) {
      initializeFCM()
    }
  }, [user, isClient])

  const initializeFCM = async () => {
    if (fcmInitialized.current) return
    
    try {
      console.log('🔔 Starting FCM initialization...')
      fcmInitialized.current = true
      
      const fcmService = FCMTokenService.getInstance()
      const success = await fcmService.initializeForUser(user.id)
      
      if (success) {
        console.log('✅ FCM initialized successfully for user')
      } else {
        console.log('⚠️ FCM initialization failed')
        fcmInitialized.current = false // Reset so it can be retried
      }
    } catch (error) {
      console.error('❌ FCM initialization error:', error)
      fcmInitialized.current = false // Reset so it can be retried
    }
  }

  // Service Worker registration - ONLY ONCE
  useEffect(() => {
    if (!isClient || swRegistered.current) return
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(reg => {
          console.log('✅ Firebase SW registered:', reg.scope)
          swRegistered.current = true
        })
        .catch(err => console.error('❌ Firebase SW registration failed:', err))
    }
  }, [isClient])

  // Fetch events function
  const fetchEvents = useCallback(async () => {
    if (eventsLoaded.current) return
    
    try {
      console.log('📅 Fetching events...')
      eventsLoaded.current = true
      
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
    } catch (err) {
      console.error('💥 Error in fetchEvents:', err)
      setError('Failed to load events. Please refresh the page.')
      eventsLoaded.current = false
    } finally {
      setLoading(false)
    }
  }, [])

  // Auth and events initialization
  useEffect(() => {
    if (!isClient) return
    
    let isMounted = true
    
    const initializeApp = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!isMounted) return
        
        const currentUser = session?.user ?? null
        setUser(currentUser)
        
        // Store current user ID for cleanup
        previousUserId.current = currentUser?.id || null
        
        if (!eventsLoaded.current && currentUser != null) {
          await fetchEvents()
        } else {
          setEvents([])
          setLoading(false)
        }
      } catch (error) {
        console.error('❌ App initialization error:', error)
        setError('Failed to initialize app. Please refresh the page.')
        setLoading(false)
      }
    }

    initializeApp()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      console.log('🔐 Auth state changed:', event)
      const newUser = session?.user ?? null
      const oldUserId = previousUserId.current
      
      setUser(newUser)
      
      if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out, cleaning up FCM...')
        
        // FIXED: Clean up FCM for the previous user (not newUser which is null)
        if (oldUserId) {
          try {
            const fcmService = FCMTokenService.getInstance()
            await fcmService.cleanup(oldUserId) // Use old user ID for cleanup
            console.log('✅ FCM cleanup completed for user:', oldUserId)
          } catch (error) {
            console.error('❌ FCM cleanup error:', error)
          }
        }
        
        // Reset states
        fcmInitialized.current = false
        eventsLoaded.current = false
        setEvents([])
        
      } else if (event === 'SIGNED_IN' && newUser) {
        console.log('👋 User signed in:', newUser.id)
        
        // Reset events loading for new user
        eventsLoaded.current = false
        await fetchEvents()
      }
      
      // Update previous user ID
      previousUserId.current = newUser?.id || null
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [fetchEvents, isClient])

  // Realtime subscription
  useEffect(() => {
    if (loading) return
    
    console.log('📡 Setting up realtime subscription...')
    
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        console.log('📡 Realtime event:', payload.eventType)
        
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
  }, [loading, events.length])

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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds: [user.id],
          title: '🧪 Test Notification',
          body: 'This is a test notification from your calendar app!',
          data: {
            type: 'test',
            timestamp: new Date().toISOString()
          }
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
    if (!isClient) {
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
  }, [isClient])

  const reinitializeFCM = useCallback(async () => {
    if (!user) return
    
    try {
      fcmInitialized.current = false
      const fcmService = FCMTokenService.getInstance()
      fcmService.destroy()
      
      await initializeFCM()
      alert('FCM reinitialization completed!')
    } catch (error) {
      console.error('❌ Failed to reinitialize FCM:', error)
      alert('❌ FCM reinitialization failed. Check console for details.')
    }
  }, [user])

  const resetApp = useCallback(() => {
    eventsLoaded.current = false
    fcmInitialized.current = false
    setError(null)
    setLoading(true)
    window.location.reload()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <PWAInstallPrompt />

      {/* Mobile-optimized header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and title - responsive */}
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg flex-shrink-0">
                <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">Team Calendar</h1>
                <p className="text-xs text-gray-500 hidden sm:block">Stay synchronized with your team</p>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
              {/* Notification bell */}
              {user && isClient && (
                <div className="flex-shrink-0">
                  <NotificationBell userId={user.id} />
                </div>
              )}
              
              {/* Mobile menu button */}
              {user && isClient && (
                <div className="relative lg:hidden">
                  <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Menu options"
                  >
                    {isMobileMenuOpen ? <X className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
                  </button>
                  
                  {/* Mobile menu dropdown */}
                  {isMobileMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
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
              
              {/* Desktop test button */}
              {user && isClient && (
                <div className="hidden lg:flex items-center space-x-2">
                  <button
                    onClick={testFCMNotification}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Test FCM notification"
                  >
                    <TestTube className="h-4 w-4" />
                    <span className="hidden xl:inline">Test</span>
                  </button>
                  <button
                    onClick={() => setShowNotificationPrefs(true)}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Notification settings"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden xl:inline">Settings</span>
                  </button>
                </div>
              )}
              
              {/* Auth button */}
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
            <div className="fixed inset-0 transition-opacity z-[-1]" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 opacity-50" onClick={() => setShowNotificationPrefs(false)}></div>
            </div>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Notification Settings</h3>
                  <button
                    onClick={() => setShowNotificationPrefs(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
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
          {loading ? (
            <div className="flex flex-col justify-center items-center h-[60vh]">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
              <p className="mt-4 text-gray-500">Loading calendar...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col justify-center items-center h-[60vh] px-4">
              <div className="text-center p-6 sm:p-8 bg-red-50 rounded-lg border border-red-200 max-w-md w-full">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
                <p className="text-red-600 mb-4 text-sm">{error}</p>
                <button
                  onClick={resetApp}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Reset App
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Stats grid - responsive */}
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
                  value={user && isClient ? (
                    FCMTokenService.getInstance().isReady() ? 'Ready' : 'Setup Needed'
                  ) : 'Sign in'}
                  icon={<Bell className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 opacity-20" />}
                />
              </div>

              <Calendar events={events} user={user} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

// Mobile-optimized stat card component
function Card({
  label,
  value,
  icon
}: {
  label: string
  value: number | string
  icon: React.ReactNode
}) {
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