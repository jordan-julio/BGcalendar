/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import NotificationBell from '@/components/NotificationBell'

import { Event } from '@/types'
import { Calendar as CalendarIcon, Bell } from 'lucide-react'
import { NotificationService } from '@/lib/NotificationService'

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Refs to prevent multiple initializations
  const swRegistered = useRef(false)
  const notificationSetup = useRef(false)
  const eventsLoaded = useRef(false)
  const notificationService = useRef<NotificationService | null>(null)

  // Initialize notification service once
  if (!notificationService.current) {
    notificationService.current = NotificationService.getInstance()
  }

  // Service Worker registration - ONLY ONCE
  useEffect(() => {
    if (swRegistered.current) return
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('✅ SW registered once:', reg.scope)
          swRegistered.current = true
        })
        .catch(err => console.error('❌ SW registration failed:', err))
    }
  }, []) // Empty dependency array - run only once

  // Fetch events function with debouncing
  const fetchEvents = useCallback(async () => {
    if (eventsLoaded.current) return // Prevent multiple calls
    
    try {
      console.log('📅 Fetching events (once)...')
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
      eventsLoaded.current = false // Allow retry
    } finally {
      setLoading(false)
    }
  }, [])

  // Setup notifications for user - with prevention of multiple calls
  const setupNotificationsForUser = useCallback(async (userId: string) => {
    if (notificationSetup.current || !notificationService.current) return
    
    try {
      console.log('🔔 Setting up notifications once for user:', userId)
      notificationSetup.current = true
      
      const success = await notificationService.current.setupNotifications(userId)
      if (success) {
        console.log('✅ Notifications setup successfully')
      } else {
        console.log('⚠️ Notification setup failed - permission denied')
      }
    } catch (error) {
      console.error('❌ Error setting up notifications:', error)
      notificationSetup.current = false // Allow retry
    }
  }, [])

  // Auth and events initialization - ONLY ONCE
  useEffect(() => {
    let isMounted = true
    
    const initializeApp = async () => {
      try {
        // Get initial session
        const { data: { session } } = await supabase.auth.getSession()
        if (!isMounted) return
        
        const currentUser = session?.user ?? null
        setUser(currentUser)
        
        // Setup notifications for authenticated user
        if (currentUser && !notificationSetup.current) {
          await setupNotificationsForUser(currentUser.id)
        }
        
        // Fetch events only once
        if (!eventsLoaded.current) {
          await fetchEvents()
        }
      } catch (error) {
        console.error('❌ App initialization error:', error)
        setError('Failed to initialize app. Please refresh the page.')
        setLoading(false)
      }
    }

    initializeApp()

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      console.log('🔐 Auth state changed:', event)
      const newUser = session?.user ?? null
      setUser(newUser)
      
      if (event === 'SIGNED_IN' && newUser && !notificationSetup.current) {
        await setupNotificationsForUser(newUser.id)
      } else if (event === 'SIGNED_OUT') {
        notificationSetup.current = false
        notificationService.current?.destroy()
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [fetchEvents, setupNotificationsForUser]) // Dependencies are stable functions

  // Realtime subscription - separate effect to avoid loops
  useEffect(() => {
    if (!events.length && loading) return // Wait for initial load
    
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
  }, [loading]) // Only depends on loading state

  // Page visibility handler - debounced
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    
    const handleVisibilityChange = () => {
      if (!document.hidden && user && notificationService.current) {
        // Debounce to prevent spam
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          console.log('👁️ Page visible, checking notifications...')
          notificationService.current?.checkAndSendNotifications(user.id)
        }, 1000)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearTimeout(timeoutId)
    }
  }, [user])

  // Manual test functions - only for development
  const testNotification = useCallback(async () => {
    if (!notificationService.current) return
    try {
      await notificationService.current.testNotification()
      console.log('✅ Test notification sent')
    } catch (error) {
      console.error('❌ Failed to send test notification:', error)
    }
  }, [])

  const triggerNotificationCheck = useCallback(async () => {
    if (!user || !notificationService.current) return
    try {
      await notificationService.current.triggerNotificationCheck()
      console.log('✅ Notification check triggered')
    } catch (error) {
      console.error('❌ Failed to trigger notification check:', error)
    }
  }, [user])

  const resetApp = useCallback(() => {
    // Reset all refs to allow re-initialization
    eventsLoaded.current = false
    notificationSetup.current = false
    setError(null)
    setLoading(true)
    window.location.reload()
  }, [])

  return (
    <div className="min-h-screen">
      <PWAInstallPrompt />

      <header className="sticky top-0 z-40 glass-effect border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl bg-white mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <CalendarIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Team Calendar</h1>
                <p className="text-xs text-gray-500">Stay synchronized with your team</p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {user && <NotificationBell userId={user.id} />}
              
              {/* Debug buttons - only show in development */}
              {process.env.NODE_ENV === 'development' && user && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={testNotification}
                    className="hidden sm:flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs"
                    title="Test notification"
                  >
                    <Bell className="h-3 w-3" />
                    Test
                  </button>
                  <button
                    onClick={triggerNotificationCheck}
                    className="hidden sm:flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs"
                    title="Check notifications now"
                  >
                    Check
                  </button>
                  <button
                    onClick={async () => {
                      if (!user) return
                      try {
                        console.log('🧹 Cleaning up duplicate notifications...')
                        const { error } = await supabase
                          .from('notifications')
                          .delete()
                          .eq('user_id', user.id)
                        
                        if (error) {
                          console.error('Error cleaning notifications:', error)
                          alert(`Error: ${error.message}`)
                        } else {
                          console.log('✅ All notifications cleaned up')
                          alert('All notifications cleaned up! The spam should stop.')
                          // Reset notification service
                          notificationSetup.current = false
                          notificationService.current?.destroy()
                        }
                      } catch (error) {
                        console.error('Failed to clean notifications:', error)
                      }
                    }}
                    className="hidden sm:flex items-center gap-1 px-2 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-xs"
                    title="Clean up duplicate notifications"
                  >
                    🧹 Clean
                  </button>
                  <button
                    onClick={resetApp}
                    className="hidden sm:flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs"
                    title="Reset app"
                  >
                    Reset
                  </button>
                </div>
              )}
              
              <AuthButton user={user} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-gray-500">Loading calendar...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col justify-center items-center h-[60vh]">
            <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200 max-w-md">
              <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={resetApp}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Reset App
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card
                label="Total Events"
                value={events.length}
                icon={<CalendarIcon className="h-8 w-8 text-blue-500 opacity-20" />}
              />
              <Card
                label="This Month"
                value={events.filter(e => {
                  const d = new Date(e.start_date)
                  const n = new Date()
                  return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
                }).length}
                icon={<CalendarIcon className="h-8 w-8 text-green-500 opacity-20" />}
              />
              <Card
                label="Notifications"
                value={user ? 'Active' : 'Sign in'}
                icon={<Bell className="h-8 w-8 text-purple-500 opacity-20" />}
              />
            </div>

            <Calendar events={events} user={user} />
          </>
        )}
      </main>
    </div>
  )
}

// Simple stat card component
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
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}