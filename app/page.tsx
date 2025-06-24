'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import AuthButton from '@/components/AuthButton'

import { Event } from '@/types'
import { Calendar as CalendarIcon, Users } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

export default function Home() {
  const [events, setEvents] = useState<Event[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  
  useEffect(() => {
    checkNotificationPermission()
    
    // Check user session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    // Fetch events
    fetchEvents()

    // Set up realtime subscription
    const channel = supabase
      .channel('events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEvents(prev => [...prev, payload.new as Event])
          } else if (payload.eventType === 'UPDATE') {
            setEvents(prev => prev.map(e => e.id === payload.new.id ? payload.new as Event : e))
          } else if (payload.eventType === 'DELETE') {
            setEvents(prev => prev.filter(e => e.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
      channel.unsubscribe()
    }
  }, [])

  const checkNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Modern Header */}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
            <p className="mt-4 text-gray-500">Loading calendar...</p>
          </div>
        ) : (
          <>
            {/* Stats Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Events</p>
                    <p className="text-2xl font-semibold text-gray-900">{events.length}</p>
                  </div>
                  <CalendarIcon className="h-8 w-8 text-blue-500 opacity-20" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">This Month</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {events.filter(e => {
                        const start = new Date(e.start_date)
                        const now = new Date()
                        return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear()
                      }).length}
                    </p>
                  </div>
                  <CalendarIcon className="h-8 w-8 text-green-500 opacity-20" />
                </div>
              </div>
              
              <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Team Members</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {user ? 'Active' : 'Sign in'}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-purple-500 opacity-20" />
                </div>
              </div>
            </div>

            {/* Calendar */}
            <Calendar events={events} user={user} />
          </>
        )}
      </main>
    </div>
  )
}