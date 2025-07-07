/* eslint-disable @typescript-eslint/no-explicit-any */
// components/Calendar.tsx - Fixed version with correct date handling
'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { Event } from '@/types'
import EventModal from './EventModal'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import WeekEventBar from '@/components/WeekEventBar'
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

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentDate)
    const end = endOfMonth(currentDate)
    const startWeek = new Date(start)
    startWeek.setDate(start.getDate() - start.getDay())
    const endWeek = new Date(end)
    endWeek.setDate(end.getDate() + (6 - end.getDay()))
    
    return eachDayOfInterval({ start: startWeek, end: endWeek })
  }, [currentDate])

  // Calculate minimum height needed for each week based on events
  const getWeekHeight = (weekDays: Date[]) => {
    const weekEvents = events.filter(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      
      return weekDays.some(day => 
        isWithinInterval(day, {
          start: startOfDay(eventStart),
          end: endOfDay(eventEnd)
        })
      )
    })

    if (weekEvents.length === 0) return 120 // Base height

    // Simulate event placement to count rows
    const eventPlacements: Array<{ row: number; startIndex: number; endIndex: number }> = []
    
    weekEvents.forEach(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      
      let startIndex = weekDays.findIndex(day => 
        day.toDateString() === eventStart.toDateString()
      )
      let endIndex = weekDays.findIndex(day => 
        day.toDateString() === eventEnd.toDateString()
      )
      
      if (startIndex === -1 && eventStart < weekDays[0]) startIndex = 0
      if (endIndex === -1 && eventEnd > weekDays[6]) endIndex = 6
      if (startIndex === -1 || endIndex === -1) return
      
      let row = 0
      while (eventPlacements.some(p => 
        p.row === row && !(endIndex < p.startIndex || startIndex > p.endIndex)
      )) {
        row++
      }
      
      eventPlacements.push({ row, startIndex, endIndex })
    })

    const maxRow = Math.max(...eventPlacements.map(p => p.row), -1)
    const baseHeight = 120
    const eventRowHeight = 24
    const maxVisibleRows = 3
    const overflowButtonHeight = 20
    
    // Height calculation: base + visible event rows + overflow button if needed
    const neededRows = Math.min(maxRow + 1, maxVisibleRows)
    const hasOverflow = maxRow >= maxVisibleRows
    
    return baseHeight + (neededRows * eventRowHeight) + (hasOverflow ? overflowButtonHeight : 0)
  }

  const handleDayClick = (date: Date) => {
    if (!user || !role) {
      alert('Please sign in to add events')
      return
    }

    if (role === 'Member') {
      return // prevent adding
    }

    console.log('🗓️ Selected date:', date.toDateString(), 'Local format:', format(date, 'yyyy-MM-dd'))
    
    // FIXED: Create a new Date object to avoid timezone issues
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    setSelectedDate(localDate)
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

  const handleAddEventClick = () => {
    // FIXED: Use today's date but create a proper local date
    const today = new Date()
    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    
    setSelectedDate(localToday)
    setSelectedEvent(null)
    setShowModal(true)
  }

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
                  onClick={handleAddEventClick}
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
          <div className="grid grid-cols-7 mb-2" style={{ gap: '1px' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Weeks */}
          <div className="space-y-1">
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, weekIndex) => {
              const weekStart = weekIndex * 7
              const weekDays = calendarDays.slice(weekStart, weekStart + 7)
              const weekHeight = getWeekHeight(weekDays)
              
              return (
                <div key={weekIndex} className="relative">
                  {/* Week grid */}
                  <div className="grid grid-cols-7" style={{ gap: '1px' }}>
                    {weekDays.map((day, dayIndex) => (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        onClick={() => handleDayClick(day)}
                        className={`
                          relative bg-white p-2 cursor-pointer hover:bg-gray-50 transition-colors
                          ${!isSameMonth(day, currentDate) ? 'text-gray-400 bg-gray-50' : 'text-gray-900'}
                          ${isToday(day) ? 'bg-blue-50 hover:bg-blue-100' : ''}
                        `}
                        style={{ 
                          border: '1px solid #e5e7eb',
                          minHeight: `${weekHeight}px`
                        }}
                      >
                        {/* Day number */}
                        <div className={`
                          text-sm font-medium mb-1 relative z-30
                          ${isToday(day) ? 'text-blue-600 font-semibold' : ''}
                        `}>
                          {format(day, 'd')}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Week-level event bars */}
                  <WeekEventBar
                    events={events}
                    weekDays={weekDays}
                    onEventClick={handleEventClick}
                  />
                </div>
              )
            })}
          </div>

          {/* Legend for dense weeks */}
          {events.length > 10 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
              <p className="text-xs text-gray-600 mb-2 font-medium">Tips for busy weeks:</p>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• Click &quot;Show all&quot; to see all events in a week</li>
                <li>• Hover over events to see full details</li>
                <li>• Click any event to view or edit details</li>
              </ul>
            </div>
          )}
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