'use client'

import { useState, useEffect } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface UpcomingEvent {
  id: string
  title: string
  start_date: string
  end_date: string
  time?: string
  description?: string
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [hasPermission, setHasPermission] = useState(Notification.permission === 'granted')
  const handleEnableNotifications = async () => {
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setHasPermission(permission === 'granted');
      
      // Test immediately after granting permission
      // You can optionally trigger a test notification here if needed
      // Example:
      if (permission === 'granted') {
        new Notification('Notifications enabled!', { body: 'You will now receive event alerts.' });
      }
    }
  };

  useEffect(() => {
    handleEnableNotifications();
  }, []);
  useEffect(() => {
    if (!userId) return

    // Request permission on mount if needed
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => setHasPermission(p === 'granted'))
    }

    fetchUpcomingEvents()
    
    // Refresh every 5 minutes
    const interval = setInterval(() => fetchUpcomingEvents(), 5 * 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [userId])

  // Fetch events happening in the next 7 days
  async function fetchUpcomingEvents() {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .gte('start_date', now.toISOString().slice(0, 10))
      .lte('start_date', nextWeek.toISOString().slice(0, 10))
      .order('start_date', { ascending: true })

    if (!error && data) {
      // Filter events to only show those happening in the next 24-48 hours for immediate attention
      const relevantEvents = data.filter(event => {
        const eventDate = new Date(event.start_date)
        const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
        return hoursUntilEvent <= 48 && hoursUntilEvent >= -24 // Show events from yesterday to 2 days ahead
      })
      
      setUpcomingEvents(relevantEvents)
    } else if (error) {
      console.error('Error fetching upcoming events:', error)
    }
  }

  const getEventStatus = (event: UpcomingEvent) => {
    const now = new Date()
    const eventDate = new Date(event.start_date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    if (hoursUntilEvent < 0) {
      return { status: 'Past', color: 'text-gray-500', urgent: false }
    } else if (hoursUntilEvent <= 2) {
      return { status: 'Now', color: 'text-red-600', urgent: true }
    } else if (hoursUntilEvent <= 24) {
      return { status: 'Today', color: 'text-orange-600', urgent: true }
    } else if (hoursUntilEvent <= 48) {
      return { status: 'Tomorrow', color: 'text-blue-600', urgent: false }
    } else {
      return { status: 'Upcoming', color: 'text-gray-600', urgent: false }
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString()
  }

  // Count urgent events (happening within 24 hours)
  const urgentCount = upcomingEvents.filter(event => {
    const now = new Date()
    const eventDate = new Date(event.start_date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    return hoursUntilEvent <= 24 && hoursUntilEvent >= 0
  }).length

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (Notification.permission === 'default') {
            Notification.requestPermission().then(p => setHasPermission(p === 'granted'))
          }
          setDropdownOpen(o => !o)
        }}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        title={hasPermission ? 'View upcoming events' : 'Enable browser notifications'}
      >
        {urgentCount > 0 ? (
          <BellRing className="h-5 w-5 text-orange-600" />
        ) : (
          <Bell className="h-5 w-5 text-gray-600" />
        )}
        
        {urgentCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-4 w-4 text-xs flex items-center justify-center font-medium">
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
        
        {!hasPermission && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 rounded-full h-3 w-3 border border-white" />
        )}
      </button>

      {dropdownOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setDropdownOpen(false)}
          />
          
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50 max-h-96 overflow-hidden border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Upcoming Events</h3>
              {!hasPermission && (
                <button
                  onClick={() => Notification.requestPermission().then(p => setHasPermission(p === 'granted'))}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors"
                >
                  Enable Notifications
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {upcomingEvents.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>No upcoming events</p>
                  <p className="text-xs text-gray-400 mt-1">Events for the next 48 hours will appear here</p>
                </div>
              ) : (
                upcomingEvents.map(event => {
                  const eventStatus = getEventStatus(event)
                  
                  return (
                    <div 
                      key={event.id} 
                      className={`p-3 border-b border-gray-100 hover:bg-gray-50 last:border-none transition-colors ${
                        eventStatus.urgent ? 'bg-orange-50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate" title={event.title}>
                            {event.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${eventStatus.color}`}>
                              {eventStatus.status}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(event.start_date)}
                            </span>
                            {event.time && (
                              <span className="text-xs text-gray-500">
                                @ {event.time}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-xs text-gray-600 mt-1 truncate" title={event.description}>
                              {event.description}
                            </p>
                          )}
                        </div>
                        
                        {eventStatus.urgent && (
                          <div className="ml-2 flex-shrink-0">
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {upcomingEvents.length > 0 && (
              <div className="p-3 bg-gray-50 border-t border-gray-200">
                <p className="text-xs text-gray-500 text-center">
                  {urgentCount > 0 ? (
                    <span className="text-orange-600 font-medium">
                      {urgentCount} event{urgentCount === 1 ? '' : 's'} happening soon
                    </span>
                  ) : (
                    'All events are more than 24 hours away'
                  )}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}