'use client'

import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface Notification {
    id: string
    event_id: string
    user_id: string
    notify_date: string
    sent: boolean
    event?: Event
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (!userId) return

    fetchNotifications()
    checkAndSendNotifications()

    // Check for notifications every hour
    const interval = setInterval(checkAndSendNotifications, 3600000)

    return () => clearInterval(interval)
  }, [userId])

  const fetchNotifications = async () => {
    const today = new Date().toISOString().split('T')[0]
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        event:events(*)
      `)
      .eq('user_id', userId)
      .gte('notify_date', today)
      .lte('notify_date', nextWeek)
      .eq('sent', false)

    if (!error && data) {
      setNotifications(data)
    }
  }

  const checkAndSendNotifications = async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const today = new Date().toISOString().split('T')[0]
    
    const { data: dueNotifications } = await supabase
      .from('notifications')
      .select(`
        *,
        event:events(*)
      `)
      .eq('user_id', userId)
      .eq('notify_date', today)
      .eq('sent', false)

    if (dueNotifications && dueNotifications.length > 0) {
      for (const notification of dueNotifications) {
        if (notification.event) {
          new Notification(`Upcoming Event: ${notification.event.title}`, {
            body: `This event is scheduled for ${new Date(notification.event.start_date).toLocaleDateString()}`,
            icon: '/icon-192x192.png',
          })

          // Mark as sent
          await supabase
            .from('notifications')
            .update({ sent: true })
            .eq('id', notification.id)
        }
      }
      fetchNotifications()
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {notifications.length > 0 && (
          <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">No upcoming events</p>
            ) : (
              notifications.map((notification) => (
                <div key={notification.id} className="p-4 hover:bg-gray-50 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {notification.event?.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {notification.event && new Date(notification.event.start_date).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}