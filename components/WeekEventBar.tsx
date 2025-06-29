// components/WeekEventBar.tsx - NEW COMPONENT
'use client'

import { isSameDay, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { Event } from '@/types'
import { getEventColor } from '@/lib/utils'

interface WeekEventBarProps {
  events: Event[]
  weekDays: Date[]
  onEventClick: (event: Event) => void
}

export default function WeekEventBar({ events, weekDays, onEventClick }: WeekEventBarProps) {
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
    
    eventPlacements.push({
      event,
      row,
      startIndex,
      endIndex
    })
  })

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        top: '32px', // Start below the day numbers
        zIndex: 10 
      }}
    >
      {eventPlacements.map(({ event, row, startIndex, endIndex }) => {
        const color = getEventColor(event.id)
        const spanDays = endIndex - startIndex + 1
        
        // Calculate positioning - each day is 1/7 of the width plus 1px gap
        const dayWidth = `calc((100% - 6px) / 7)` // 6px total for gaps between 7 days
        const leftPosition = `calc(${startIndex} * (${dayWidth} + 1px))`
        const totalWidth = `calc(${spanDays} * (${dayWidth} + 1px) - 1px)`
        
        return (
          <div
            key={`${event.id}-${row}`}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            className="absolute cursor-pointer transition-all hover:brightness-110 hover:shadow-sm rounded-md"
            style={{
              backgroundColor: color.bg,
              color: color.text,
              left: leftPosition,
              width: totalWidth,
              top: `${row * 24}px`,
              height: '20px',
              zIndex: 20 + row,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '8px',
              paddingRight: '8px',
              pointerEvents: 'auto'
            }}
            title={`${event.title}${event.time ? ` at ${event.time}` : ''}`}
          >
            <div className="truncate text-xs font-medium w-full">
              {event.title}
            </div>
          </div>
        )
      })}
      
      {/* Show "+X more" indicator */}
      {eventPlacements.length > 3 && (
        <div 
          className="absolute text-xs text-gray-500 font-medium px-2"
          style={{ 
            top: `${3 * 24}px`, 
            left: '8px',
            zIndex: 50,
            pointerEvents: 'none'
          }}
        >
          +{eventPlacements.length - 3} more
        </div>
      )}
    </div>
  )
}