'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths } from 'date-fns'
import { Event } from '@/types'
import EventModal from './EventModal'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import EventBar from './Eventbar'
import { supabase } from '@/lib/supabase'

interface CalendarProps {
  events: Event[]
  user: any
}

export default function Calendar({ events, user }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single()

        setRole(roleRow?.role ?? null)
      }
    }

    fetchRole()
  }, [])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    const startWeek = new Date(start)
    startWeek.setDate(start.getDate() - start.getDay())
    const endWeek = new Date(end)
    endWeek.setDate(end.getDate() + (6 - end.getDay()))
    
    return eachDayOfInterval({ start: startWeek, end: endWeek })
  }, [currentDate])

  const handleDayClick = (date: Date) => {
    if (!user || !role) {
      alert('Please sign in to add events')
      return
    }

    if (role === 'Member') {
      return // prevent adding
    }
    setSelectedDate(date)
    setSelectedEvent(null)
    setShowModal(true)
  }

  const handleEventClick = (event: Event) => {
    if (!user || !role) {
      return
    }

    if (role === 'Member') {
      setSelectedEvent(event) // can only view details
      setSelectedDate(null)
      setShowModal(true)
      return
    }

    if (role === 'Admin' || role === 'Super Admin') {
      setSelectedEvent(event)
      setSelectedDate(null)
      setShowModal(true)
    }
  }


  const previousMonth = () => setCurrentDate(subMonths(currentDate, 1))
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const goToToday = () => setCurrentDate(new Date())

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
        {/* Calendar Navigation */}
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-white rounded-lg transition-colors shadow-sm border border-slate-200"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
              
              <h2 className="text-xl font-semibold text-gray-900 min-w-[200px] text-center">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-white rounded-lg transition-colors shadow-sm border border-slate-200"
                aria-label="Next month"
              >
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 rounded-lg transition-colors shadow-sm border border-slate-200"
              >
                Today
              </button>
              
              {role && (role === 'Super Admin' || role === 'Admin') && (
                <button
                  onClick={() => {
                    setSelectedDate(new Date())
                    setSelectedEvent(null)
                    setShowModal(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add Event</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          {/* Day Headers */}
          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-visible">

            {calendarDays.map((day, idx) => (
              <div
                key={idx}
                onClick={() => handleDayClick(day)}
                className={`
                  bg-white min-h-[100px] sm:min-h-[120px] p-2 cursor-pointer hover:bg-gray-50 transition-colors relative
                  ${!isSameMonth(day, currentDate) ? 'text-gray-400 bg-gray-50' : 'text-gray-900'}
                  ${isToday(day) ? 'bg-blue-50 hover:bg-blue-100' : ''}
                `}
              >
                <div className={`
                  text-sm font-medium mb-1
                  ${isToday(day) ? 'text-blue-600 font-semibold' : ''}
                `}>
                  {format(day, 'd')}
                </div>
                
                {/* Event Bars */}
                <div className="relative">
                  <EventBar
                    events={events}
                    currentDay={day}
                    monthStart={monthStart}
                    monthEnd={monthEnd}
                    onEventClick={handleEventClick}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <EventModal
          event={selectedEvent}
          date={selectedDate}
          onClose={() => setShowModal(false)}
          user={user}
          role={role}
        />
      )}
    </>
  )
}