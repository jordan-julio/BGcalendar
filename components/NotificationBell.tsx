'use client'

import { useState, useEffect } from 'react'
import { Bell, BellRing } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface NotificationRecord {
  id: string
  event_id: string
  user_id: string
  notify_date: string
  sent: boolean
  notification_type: 'day_before' | 'event_day'
  event: {
    id: string
    title: string
    start_date: string
    time?: string
    description?: string
  }
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [upcoming, setUpcoming] = useState<NotificationRecord[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [hasPermission, setHasPermission] = useState(Notification.permission === 'granted')

  useEffect(() => {
    if (!userId) return

    // on mount: request permission & fetch
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => setHasPermission(p === 'granted'))
    }

    fetchUpcoming()
    const interval1 = setInterval(() => checkAndSend(), 60_000)
    const interval2 = setInterval(() => fetchUpcoming(), 3_600_000)

    return () => {
      clearInterval(interval1)
      clearInterval(interval2)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // fetch next 7 days
  async function fetchUpcoming() {
    const today = new Date().toISOString().slice(0,10)
    const week  = new Date(Date.now() + 7*86400000).toISOString().slice(0,10)

    const { data, error } = await supabase
      .from('notifications')
      .select('*, event:events(*)')
      .eq('user_id', userId)
      .gte('notify_date', today)
      .lte('notify_date', week)
      .eq('sent', false)
      .order('notify_date', { ascending: true })

    if (!error) setUpcoming(data || [])
  }

  // check DB and fire SW notifications
  async function checkAndSend() {
    if (!hasPermission) return

    const today = new Date().toISOString().slice(0,10)
    const { data, error } = await supabase
      .from('notifications')
      .select('*, event:events(*)')
      .eq('user_id', userId)
      .eq('notify_date', today)
      .eq('sent', false)

    if (error || !data?.length) return

    const reg = await navigator.serviceWorker.ready
    for (const note of data) {
      const { event, notification_type } = note
      const title = notification_type === 'day_before'
        ? `Reminder: ${event.title}`
        : `Today: ${event.title}`
      const body = notification_type === 'day_before'
        ? `Happening tomorrow (${new Date(event.start_date).toLocaleDateString()})`
        : `Happening today${event.time ? ` at ${event.time}` : ''}`

      reg.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: `event-${event.id}`,
        data: { url: '/' }
      })

      // mark sent
      await supabase
        .from('notifications')
        .update({ sent: true })
        .eq('id', note.id)
    }
  }

  const formatDate = (dStr: string) => {
    const d = new Date(dStr)
    const t = new Date()
    const tm = new Date(); tm.setDate(t.getDate()+1)
    if (d.toDateString() === t.toDateString()) return 'Today'
    if (d.toDateString() === tm.toDateString()) return 'Tomorrow'
    return d.toLocaleDateString()
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (Notification.permission === 'default') {
            Notification.requestPermission().then(p => setHasPermission(p === 'granted'))
          }
          setDropdownOpen(o => !o)
        }}
        className="relative p-2 hover:bg-gray-100 rounded-lg"
        title={hasPermission ? 'View reminders' : 'Enable browser notifications'}
      >
        {upcoming.length > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {upcoming.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-4 w-4 text-xs flex items-center justify-center">
            {upcoming.length > 9 ? '9+' : upcoming.length}
          </span>
        )}
        {!hasPermission && (
          <span className="absolute -top-1 -right-1 bg-yellow-500 rounded-full h-3 w-3" />
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50 max-h-96 overflow-auto">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">Upcoming Reminders</h3>
            {!hasPermission && (
              <button
                onClick={() => Notification.requestPermission().then(p => setHasPermission(p==='granted'))}
                className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
              >
                Enable
              </button>
            )}
          </div>

          {(!hasPermission || upcoming.length === 0) ? (
            <div className="p-4 text-center text-gray-500">
              {!hasPermission ? 'Notifications disabled' : 'No upcoming reminders'}
            </div>
          ) : (
            upcoming.map(n => (
              <div key={n.id} className="p-3 border-b hover:bg-gray-50 last:border-none">
                <p className="font-medium truncate">{n.event.title}</p>
                <p className="text-xs text-gray-600">
                  {n.notification_type === 'day_before' ? 'Reminder: ' : 'Event: '}
                  {formatDate(n.event.start_date)}
                  {n.event.time && ` @ ${n.event.time}`}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
