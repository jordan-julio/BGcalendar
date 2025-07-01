// components/WeekEventBar.tsx - Fixed version with proper overflow handling
'use client'

import { useState } from 'react'
import { isSameDay, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { Event } from '@/types'
import { getEventColor } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface WeekEventBarProps {
  events: Event[]
  weekDays: Date[]
  onEventClick: (event: Event) => void
}

export default function WeekEventBar({ events, weekDays, onEventClick }: WeekEventBarProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [hoveredEvent, setHoveredEvent] = useState<{ event: Event; position: { x: number; y: number } } | null>(null)
  
  // Create unique week identifier
  const weekId = weekDays[0]?.toISOString().slice(0, 10) || 'week'
  const isExpanded = expandedWeeks.has(weekId)

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

  // Constants for layout
  const BASE_VISIBLE_ROWS = 3
  const ROW_HEIGHT = 22
  const ROW_GAP = 2
  const TOTAL_ROW_HEIGHT = ROW_HEIGHT + ROW_GAP

  // Determine which events to show - THIS IS THE KEY FIX
  const maxRow = Math.max(...eventPlacements.map(p => p.row), -1)
  const totalEvents = eventPlacements.length
  const hasOverflow = maxRow >= BASE_VISIBLE_ROWS
  
  // CRITICAL: Only show events that fit in visible rows
  const maxVisibleRow = isExpanded ? maxRow : BASE_VISIBLE_ROWS - 1
  const visibleEvents = eventPlacements.filter(p => p.row <= maxVisibleRow)
  const hiddenEventsCount = totalEvents - visibleEvents.length

  const toggleExpanded = () => {
    const newExpanded = new Set(expandedWeeks)
    if (isExpanded) {
      newExpanded.delete(weekId)
    } else {
      newExpanded.add(weekId)
    }
    setExpandedWeeks(newExpanded)
  }

  // Calculate container height dynamically
  const actualVisibleRows = Math.max(...visibleEvents.map(p => p.row), -1) + 1
  const containerHeight = Math.max(
    actualVisibleRows * TOTAL_ROW_HEIGHT + (hasOverflow ? 24 : 0), // Extra space for expand button
    BASE_VISIBLE_ROWS * TOTAL_ROW_HEIGHT
  )

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        top: '32px', // Start below the day numbers
        height: `${containerHeight}px`,
        zIndex: 10 
      }}
    >
      {/* Event bars - Only render visible events */}
      {visibleEvents.map(({ event, row, startIndex, endIndex }) => {
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
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHoveredEvent({
                event,
                position: { x: rect.left, y: rect.bottom + 5 }
              })
            }}
            onMouseLeave={() => setHoveredEvent(null)}
            className="absolute cursor-pointer transition-all hover:brightness-110 hover:shadow-sm rounded-md"
            style={{
              backgroundColor: color.bg,
              color: color.text,
              left: leftPosition,
              width: totalWidth,
              top: `${row * TOTAL_ROW_HEIGHT}px`,
              height: `${ROW_HEIGHT}px`,
              zIndex: 20 + row,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '6px',
              paddingRight: '6px',
              pointerEvents: 'auto',
              fontSize: '11px',
              fontWeight: '500'
            }}
            title={`${event.title}${event.time ? ` at ${event.time}` : ''}`}
          >
            <div className="truncate w-full">
              {event.title}
            </div>
          </div>
        )
      })}
      
      {/* Overflow indicator and expand/collapse button */}
      {hasOverflow && (
        <div 
          className="absolute left-0 right-0 pointer-events-auto"
          style={{ 
            top: `${(actualVisibleRows * TOTAL_ROW_HEIGHT)}px`
          }}
        >
          <div className="flex items-center justify-between bg-gray-50 rounded-md border border-gray-200 px-2 py-1 mx-1 shadow-sm">
            <span className="text-xs text-gray-600 font-medium">
              {isExpanded ? (
                `Showing all ${totalEvents} events`
              ) : (
                `${hiddenEventsCount} more event${hiddenEventsCount === 1 ? '' : 's'}`
              )}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded()
              }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              {isExpanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  <span>Show all</span>
                  <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-0 right-0 bg-red-100 text-red-800 text-xs p-1 rounded opacity-50 pointer-events-none">
          {totalEvents} events, {maxRow + 1} rows, {visibleEvents.length} visible
        </div>
      )}

      {/* Global tooltip layer - rendered outside of event containers */}
      {hoveredEvent && (
        <div
          className="fixed bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            left: hoveredEvent.position.x,
            top: hoveredEvent.position.y,
            zIndex: 10000
          }}
        >
          {hoveredEvent.event.title}
          {hoveredEvent.event.time && ` • ${hoveredEvent.event.time}`}
          {hoveredEvent.event.description && ` • ${hoveredEvent.event.description}`}
        </div>
      )}
    </div>
  )
}