// components/Eventbar.tsx (note the lowercase 'b' to match your import)
'use client'

import { isSameDay, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { Event } from '@/types'
import { getEventColor } from '@/lib/utils'

interface EventBarProps {
  events: Event[]
  currentDay: Date
  weekDays?: Date[] // Make it optional to maintain backward compatibility
  monthStart?: Date
  monthEnd?: Date
  onEventClick: (event: Event) => void
}

export default function EventBar({ events, currentDay, weekDays, monthStart, monthEnd, onEventClick }: EventBarProps) {
  // If weekDays is provided, use the new week-based logic
  if (weekDays && weekDays.length > 0) {
    const currentDayIndex = weekDays.findIndex(day => isSameDay(day, currentDay))
    
    if (currentDayIndex === -1) return null

    // Get all events that span through this week
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

    // Sort events by start date for consistent ordering
    const sortedEvents = weekEvents.sort((a, b) => 
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )

    // Assign rows to events to prevent overlaps
    const eventPlacements: Array<{
      event: Event
      row: number
      startIndex: number
      endIndex: number
      isVisibleToday: boolean
      isFirstDay: boolean
      isLastDay: boolean
    }> = []

    sortedEvents.forEach(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      
      // Find start and end indices in this week
      let startIndex = weekDays.findIndex(day => isSameDay(day, eventStart))
      let endIndex = weekDays.findIndex(day => isSameDay(day, eventEnd))
      
      // Handle events that start before this week
      if (startIndex === -1 && eventStart < weekDays[0]) {
        startIndex = 0
      }
      
      // Handle events that end after this week  
      if (endIndex === -1 && eventEnd > weekDays[6]) {
        endIndex = 6
      }
      
      // Handle events that span into this week from previous week
      if (startIndex === -1) {
        for (let i = 0; i < weekDays.length; i++) {
          if (isWithinInterval(weekDays[i], { start: startOfDay(eventStart), end: endOfDay(eventEnd) })) {
            startIndex = i
            break
          }
        }
      }
      
      // Handle events that span from this week into next week
      if (endIndex === -1) {
        for (let i = weekDays.length - 1; i >= 0; i--) {
          if (isWithinInterval(weekDays[i], { start: startOfDay(eventStart), end: endOfDay(eventEnd) })) {
            endIndex = i
            break
          }
        }
      }
      
      // Skip if event doesn't intersect this week
      if (startIndex === -1 || endIndex === -1) return
      
      // Find the first available row
      let row = 0
      while (true) {
        const hasConflict = eventPlacements.some(placement => 
          placement.row === row && 
          !(endIndex < placement.startIndex || startIndex > placement.endIndex)
        )
        
        if (!hasConflict) break
        row++
      }
      
      const isVisibleToday = currentDayIndex >= startIndex && currentDayIndex <= endIndex
      const isFirstDay = currentDayIndex === startIndex
      const isLastDay = currentDayIndex === endIndex
      
      eventPlacements.push({
        event,
        row,
        startIndex,
        endIndex,
        isVisibleToday,
        isFirstDay,
        isLastDay
      })
    })

    // Filter to only events visible today
    const visibleEvents = eventPlacements.filter(p => p.isVisibleToday)

    return (
      <div className="relative w-full h-full">
        {visibleEvents.map(({ event, row, startIndex, endIndex, isFirstDay, isLastDay }) => {
          const color = getEventColor(event.id)
          
          // Calculate exact positioning for continuous bars
          const spanDays = endIndex - startIndex + 1
          const cellWidthPercent = 100 / 7 // Each day is 1/7 of the container width
          
          // Calculate the full width of the event bar
          const totalWidth = spanDays * cellWidthPercent
          
          // Calculate offset from the start of the week to the start of the event
          const leftOffsetPercent = (startIndex - currentDayIndex) * cellWidthPercent
          
          const style: React.CSSProperties = {
            backgroundColor: color.bg,
            color: color.text,
            position: 'absolute',
            top: `${row * 24}px`,
            height: '20px',
            zIndex: 20 + row,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            paddingLeft: '8px',
            paddingRight: '8px'
          }

          // Set the positioning to create continuous bars
          style.left = `${leftOffsetPercent}%`
          style.width = `calc(${totalWidth}% + ${spanDays - 1}px)` // Add 1px per gap between cells
          
          // Apply border radius only at actual start/end
          if (isFirstDay && isLastDay) {
            style.borderRadius = '6px'
          } else if (isFirstDay) {
            style.borderTopLeftRadius = '6px'
            style.borderBottomLeftRadius = '6px'
          } else if (isLastDay) {
            style.borderTopRightRadius = '6px'
            style.borderBottomRightRadius = '6px'
          }

          return (
            <div
              key={`${event.id}-${row}`}
              onClick={(e) => {
                e.stopPropagation()
                onEventClick(event)
              }}
              className="cursor-pointer transition-all hover:brightness-110 hover:shadow-sm"
              style={style}
              title={`${event.title}${event.time ? ` at ${event.time}` : ''}`}
            >
              <div className="truncate text-xs font-medium w-full">
                {isFirstDay ? event.title : ''}
              </div>
            </div>
          )
        })}
        
        {/* Show "+X more" only for events starting today */}
        {(() => {
          const eventsStartingToday = eventPlacements.filter(p => p.isFirstDay && currentDayIndex === p.startIndex)
          const maxVisible = 3
          
          if (eventsStartingToday.length > maxVisible) {
            return (
              <div 
                className="absolute text-xs text-gray-500 font-medium px-2"
                style={{ top: `${maxVisible * 24}px`, zIndex: 50 }}
              >
                +{eventsStartingToday.length - maxVisible} more
              </div>
            )
          }
          return null
        })()}
      </div>
    )
  }

  // Fallback to old logic if weekDays is not provided (for backward compatibility)
  const dayEvents = events.filter(event => {
    const eventStart = new Date(event.start_date)
    const eventEnd = new Date(event.end_date)
    
    return isWithinInterval(currentDay, {
      start: startOfDay(eventStart),
      end: endOfDay(eventEnd)
    })
  })

  return (
    <div className="space-y-1">
      {dayEvents.slice(0, 3).map((event, idx) => {
        const eventStart = new Date(event.start_date)
        const eventEnd = new Date(event.end_date)
        const color = getEventColor(event.id)
        
        return (
          <div
            key={event.id}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            className="relative h-6 flex items-center text-xs font-medium cursor-pointer transition-all hover:shadow-md hover:z-10 rounded-md px-2"
            style={{
              backgroundColor: color.bg,
              color: color.text,
              marginTop: idx * 28 + 'px',
              zIndex: 10 - idx
            }}
          >
            <span className="truncate">
              {event.title}
            </span>
          </div>
        )
      })}
      
      {dayEvents.length > 3 && (
        <div className="text-xs text-gray-500 font-medium mt-1">
          +{dayEvents.length - 3} more
        </div>
      )}
    </div>
  )
}