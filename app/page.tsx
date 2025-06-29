'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'
import NotificationBell from '@/components/NotificationBell'

import { Event } from '@/types'
import { Calendar as CalendarIcon, Users } from 'lucide-react'

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // 1) Register SW on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.error('SW registration failed:', err))
    }
  }, [])

  // 2) Auth + realtime + fetch events
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    fetchEvents()

    const channel = supabase
      .channel('events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
        if (payload.eventType === 'INSERT') {
          setEvents(prev => [...prev, payload.new as Event])
        } else if (payload.eventType === 'UPDATE') {
          setEvents(prev => prev.map(e => e.id === payload.new.id ? payload.new as Event : e))
        } else if (payload.eventType === 'DELETE') {
          setEvents(prev => prev.filter(e => e.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
      channel.unsubscribe()
    }
  }, [])

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true })
      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      console.error('Error fetching events:', err)
    } finally {
      setLoading(false)
    }
  }

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
                label="Team Members"
                value={user ? 'Active' : 'Sign in'}
                icon={<Users className="h-8 w-8 text-purple-500 opacity-20" />}
              />
            </div>

            {/* Calendar grid */}
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
