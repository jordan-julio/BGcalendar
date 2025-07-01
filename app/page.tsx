// app/page.tsx - Updated with better notification debugging
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import NotificationBell from '@/components/NotificationBell'

import { Event } from '@/types'
import { Calendar as CalendarIcon, Bell, TestTube, Settings, Trash2 } from 'lucide-react'
import { NotificationService } from '@/lib/NotificationService'

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)
  
  // Refs to prevent multiple initializations
  const swRegistered = useRef(false)
  const notificationSetup = useRef(false)
  const eventsLoaded = useRef(false)
  const notificationService = useRef<NotificationService | null>(null)

  // Client-side only initialization
  useEffect(() => {
    setIsClient(true)
    if (!notificationService.current) {
      notificationService.current = NotificationService.getInstance()
    }
  }, [])

  // Service Worker registration - ONLY ONCE
  useEffect(() => {
    if (!isClient || swRegistered.current) return
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('✅ SW registered once:', reg.scope)
          swRegistered.current = true
        })
        .catch(err => console.error('❌ SW registration failed:', err))
    }
  }, [isClient])

  useEffect(() => {
    if (!isClient) return
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'CHECK_NOTIFICATIONS_REQUEST' && user) {
          console.log('📨 SW requested notification check');
          notificationService.current?.checkAndSendNotifications(user.id);
        }
      });
    }
  }, [user, isClient]);

  // Fetch events function with debouncing
  const fetchEvents = useCallback(async () => {
    if (eventsLoaded.current) return
    
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
      eventsLoaded.current = false
    } finally {
      setLoading(false)
    }
  }, [])

  // Setup notifications for user
  const setupNotificationsForUser = useCallback(async (userId: string) => {
    if (notificationSetup.current || !notificationService.current) return
    
    try {
      console.log('🔔 Setting up notifications once for user:', userId)
      notificationSetup.current = true
      
      const success = await notificationService.current.setupNotifications(userId)
      if (success) {
        console.log('✅ Notifications setup successfully')
        // Clean up old notifications
        await notificationService.current.cleanupOldNotifications(userId)
      } else {
        console.log('⚠️ Notification setup failed - permission denied')
      }
    } catch (error) {
      console.error('❌ Error setting up notifications:', error)
      notificationSetup.current = false
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
        
        if (currentUser && !notificationSetup.current) {
          await setupNotificationsForUser(currentUser.id)
        }
        
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
  }, [fetchEvents, setupNotificationsForUser, isClient])

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

  // Page visibility handler
  useEffect(() => {
    if (!isClient) return
    
    let timeoutId: NodeJS.Timeout
    
    const handleVisibilityChange = () => {
      if (!document.hidden && user && notificationService.current) {
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
  }, [user, isClient])

  // Debug functions
  const testNotification = useCallback(async () => {
    if (!notificationService.current) return
    try {
      await notificationService.current.testNotification()
      console.log('✅ Test notification sent')
      alert('Test notification sent! Check your notifications.')
    } catch (error) {
      console.error('❌ Failed to send test notification:', error)
      alert('Failed to send test notification. Check console for details.')
    }
  }, [])

  const triggerNotificationCheck = useCallback(async () => {
    if (!user || !notificationService.current) return
    try {
      await notificationService.current.triggerNotificationCheck()
      console.log('✅ Notification check triggered')
      alert('Notification check completed! Check console for details.')
    } catch (error) {
      console.error('❌ Failed to trigger notification check:', error)
    }
  }, [user])

  const forceNotificationSetup = useCallback(async () => {
    if (!user || !notificationService.current) return
    try {
      notificationSetup.current = false
      notificationService.current.destroy()
      const success = await notificationService.current.setupNotifications(user.id)
      notificationSetup.current = success
      console.log('✅ Force notification setup completed:', success)
      alert(`Notification setup ${success ? 'successful' : 'failed'}!`)
    } catch (error) {
      console.error('❌ Failed to force setup notifications:', error)
    }
  }, [user])

  const cleanupNotifications = useCallback(async () => {
    if (!user) return
    try {
      console.log('🧹 Cleaning up notifications...')
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id)
      
      if (error) {
        console.error('Error cleaning notifications:', error)
        alert(`Error: ${error.message}`)
      } else {
        console.log('✅ All notifications cleaned up')
        alert('All notifications cleaned up!')
        // Reset notification service
        notificationSetup.current = false
        notificationService.current?.destroy()
      }
    } catch (error) {
      console.error('Failed to clean notifications:', error)
    }
  }, [user])

  const resetApp = useCallback(() => {
    eventsLoaded.current = false
    notificationSetup.current = false
    setError(null)
    setLoading(true)
    window.location.reload()
  }, [])

  const checkNotificationPermission = useCallback(() => {
    if (!isClient) {
      alert('Client not ready yet')
      return
    }
    const permission = Notification.permission
    alert(`Notification permission: ${permission}\n\nGranted: ${permission === 'granted'}\nService Worker: ${'serviceWorker' in navigator}\nNotifications API: ${'Notification' in window}`)
  }, [isClient])

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
              {user && isClient && <NotificationBell userId={user.id} />}
              
              {/* Debug buttons - only show when client is ready */}
              {user && isClient && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={testNotification}
                    className="flex items-center gap-1 px-3 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-sm font-medium transition-colors"
                    title="Send test notification"
                  >
                    <TestTube className="h-4 w-4" />
                    Test Notification
                  </button>
                  <button
                    onClick={triggerNotificationCheck}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium transition-colors"
                    title="Check notifications now"
                  >
                    <Bell className="h-4 w-4" />
                    Check Now
                  </button>
                  <button
                    onClick={checkNotificationPermission}
                    className="flex items-center gap-1 px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-sm font-medium transition-colors"
                    title="Check notification status"
                  >
                    <Settings className="h-4 w-4" />
                    Status
                  </button>
                  <button
                    onClick={forceNotificationSetup}
                    className="flex items-center gap-1 px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded text-sm font-medium transition-colors"
                    title="Force notification setup"
                  >
                    <Settings className="h-4 w-4" />
                    Setup
                  </button>
                  <button
                    onClick={cleanupNotifications}
                    className="flex items-center gap-1 px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded text-sm font-medium transition-colors"
                    title="Clean up notifications"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clean
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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
                label="Next 24 Hours"
                value={events.filter(e => {
                  const eventDate = new Date(e.start_date)
                  const now = new Date()
                  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
                  return eventDate >= now && eventDate <= next24Hours
                }).length}
                icon={<Bell className="h-8 w-8 text-orange-500 opacity-20" />}
              />
              <Card
                label="Notifications"
                value={user ? (isClient && Notification.permission === 'granted' ? 'Enabled' : 'Disabled') : 'Sign in'}
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