// components/WeekEventBar.tsx - Enhanced with smart color assignment and responsive design
'use client'

import { useState, useEffect, useRef } from 'react'
import { isSameDay, startOfDay, endOfDay, isWithinInterval } from 'date-fns'
import { Event } from '@/types'
import { getEventColorSmart, getOverlappingEvents, setCustomEventColor, getAllAvailableColors } from '@/lib/utils'
import { ChevronDown, ChevronUp, Palette, X } from 'lucide-react'

interface WeekEventBarProps {
  events: Event[]
  weekDays: Date[]
  onEventClick: (event: Event) => void
}

export default function WeekEventBar({ events, weekDays, onEventClick }: WeekEventBarProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [hoveredEvent, setHoveredEvent] = useState<{ event: Event; position: { x: number; y: number } } | null>(null)
const [showColorPicker, setShowColorPicker] = useState<{ eventId: string; position: {
  width: number; x: number; y: number; 
} } | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  
  // Create unique week identifier
  const weekId = weekDays[0]?.toISOString().slice(0, 10) || 'week'
  const isExpanded = expandedWeeks.has(weekId)

  // Auto-close color picker on outside click, escape key, or timeout
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(null)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowColorPicker(null)
      }
    }

    const handleResize = () => {
      if (showColorPicker) {
        setShowColorPicker(null)
      }
    }

    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
      window.addEventListener('resize', handleResize)
      
      // Auto-close after 15 seconds for mobile users
      const autoCloseTimer = setTimeout(() => {
        setShowColorPicker(null)
      }, 15000)

      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscapeKey)
        window.removeEventListener('resize', handleResize)
        clearTimeout(autoCloseTimer)
      }
    }
  }, [showColorPicker])

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
    overlappingEventIds: string[]
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
    
    // Get overlapping events for smart color assignment
    const overlappingEventIds = getOverlappingEvents(event, sortedEvents)
    
    eventPlacements.push({
      event,
      row,
      startIndex,
      endIndex,
      overlappingEventIds
    })
  })

  // Constants for layout
  const BASE_VISIBLE_ROWS = 3
  const ROW_HEIGHT = 22
  const ROW_GAP = 2
  const TOTAL_ROW_HEIGHT = ROW_HEIGHT + ROW_GAP

  // Determine which events to show
  const maxRow = Math.max(...eventPlacements.map(p => p.row), -1)
  const totalEvents = eventPlacements.length
  const hasOverflow = maxRow >= BASE_VISIBLE_ROWS
  
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

  // Smart positioning for color picker - centered in screen
  const calculateColorPickerPosition = () => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const isMobile = viewportWidth < 768
    
    // Different dimensions for mobile vs desktop
    const pickerWidth = isMobile ? Math.min(320, viewportWidth - 32) : 280
    const pickerHeight = isMobile ? 360 : 320
    
    // Center the popup in the middle of the screen
    const x = (viewportWidth - pickerWidth) / 2
    const y = (viewportHeight - pickerHeight) / 2

    return { x, y, width: pickerWidth, height: pickerHeight }
  }

  // Handle color picker
  const handleColorChange = (eventId: string, color: { bg: string; text: string; name?: string }) => {
    setCustomEventColor(eventId, color)
    setShowColorPicker(null)
  }

  // Calculate container height dynamically
  const actualVisibleRows = Math.max(...visibleEvents.map(p => p.row), -1) + 1
  const containerHeight = Math.max(
    actualVisibleRows * TOTAL_ROW_HEIGHT + (hasOverflow ? 24 : 0),
    BASE_VISIBLE_ROWS * TOTAL_ROW_HEIGHT
  )

  const availableColors = getAllAvailableColors()

  return (
    <div 
      className="absolute inset-0 pointer-events-none"
      style={{ 
        top: '32px',
        height: `${containerHeight}px`,
        zIndex: showColorPicker ? 9995 : 10 // Lower z-index when color picker is open
      }}
    >
      {/* Event bars - Only render visible events */}
      {visibleEvents.map(({ event, row, startIndex, endIndex, overlappingEventIds }) => {
        // *** ENHANCED: Use smart color assignment ***
        const color = getEventColorSmart(event.id, overlappingEventIds)
        const spanDays = endIndex - startIndex + 1
        
        // Calculate positioning
        const dayWidth = `calc((100% - 6px) / 7)`
        const leftPosition = `calc(${startIndex} * (${dayWidth} + 1px))`
        const totalWidth = `calc(${spanDays} * (${dayWidth} + 1px) - 1px)`
        
        return (
          <div
            key={`${event.id}-${row}`}
            className="absolute cursor-pointer transition-all hover:brightness-110 hover:shadow-sm rounded-md group event-bar"
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
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            onMouseEnter={(e) => {
              if (!showColorPicker) {
                const rect = e.currentTarget.getBoundingClientRect()
                setHoveredEvent({
                  event,
                  position: { x: rect.left, y: rect.bottom + 5 }
                })
              }
            }}
            onMouseLeave={() => {
              if (!showColorPicker) {
                setHoveredEvent(null)
              }
            }}
            title={`${event.title}${event.time ? ` at ${event.time}` : ''}`}
          >
            <div className="truncate w-full flex items-center justify-between">
              <span className="truncate">{event.title}</span>
              
              {/* Color picker button - shows on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const position = calculateColorPickerPosition()
                  setShowColorPicker({
                    eventId: event.id,
                    position
                  })
                  setHoveredEvent(null) // Hide tooltip when color picker opens
                }}
                className="opacity-100 rounded touch-manipulation"
                title="Change color"
              >
                <Palette className="h-3 w-3" />
              </button>
            </div>
          </div>
        )
      })}
      
      {/* Overflow indicator */}
      {hasOverflow && (
        <div 
          className="absolute left-0 right-0 pointer-events-auto"
          style={{ 
            top: `${(actualVisibleRows * TOTAL_ROW_HEIGHT)}px`,
            zIndex: 15
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
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors touch-manipulation"
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

      {/* Color Picker Popup */}
      {showColorPicker && (
        <>
          {/* Backdrop with higher z-index */}
          <div 
            className="fixed inset-0 bg-black/40 md:bg-black/20 touch-manipulation"
            style={{ zIndex: 9997 }}
            onClick={() => setShowColorPicker(null)}
          />
          
          {/* Color picker with highest z-index */}
          <div
            ref={colorPickerRef}
            className="fixed bg-white rounded-lg shadow-2xl border border-gray-200 pointer-events-auto animate-in fade-in-0 zoom-in-95 duration-200 touch-manipulation"
            style={{
              left: showColorPicker.position.x,
              top: showColorPicker.position.y,
              width: `${showColorPicker.position.width}px`,
              maxHeight: `fit`,
              zIndex: 9999 // Highest z-index
            }}
          >
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h4 className="text-lg font-semibold text-gray-900">Choose Color</h4>
              <button
                onClick={() => setShowColorPicker(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
                aria-label="Close color picker"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-5 flex-1 overflow-y-auto">
              {/* Standard colors */}
              <div>
                <p className="text-sm text-gray-600 mb-3 font-medium">Standard Colors</p>
                <div className="grid grid-cols-6 gap-3">
                  {availableColors.standard.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorChange(showColorPicker.eventId, color)}
                      className="w-10 h-10 rounded-lg border-2 border-gray-300 hover:border-gray-400 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation shadow-sm"
                      style={{ backgroundColor: color.bg }}
                      title={color.name}
                      aria-label={`Select ${color.name} color`}
                    />
                  ))}
                </div>
              </div>
              
              {/* Pastel colors */}
              <div>
                <p className="text-sm text-gray-600 mb-3 font-medium">Pastel Colors</p>
                <div className="grid grid-cols-5 gap-3">
                  {availableColors.pastel.map((color, index) => (
                    <button
                      key={index}
                      onClick={() => handleColorChange(showColorPicker.eventId, color)}
                      className="w-10 h-10 rounded-lg border-2 border-gray-300 hover:border-gray-400 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation shadow-sm"
                      style={{ backgroundColor: color.bg }}
                      title={color.name}
                      aria-label={`Select ${color.name} color`}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* Footer hint for mobile */}
            <div className="md:hidden px-4 pb-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <p className="text-sm text-gray-600 text-center pt-3">
                Tap outside to close • Auto-closes in 15s
              </p>
            </div>
          </div>
        </>
      )}

      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-0 right-0 bg-red-100 text-red-800 text-xs p-1 rounded opacity-50 pointer-events-none">
          {totalEvents} events, {maxRow + 1} rows, {visibleEvents.length} visible
        </div>
      )}

      {/* Tooltip - only show when color picker is not open */}
      {hoveredEvent && !showColorPicker && (
        <div
          className="fixed bg-gray-800 text-white text-xs rounded px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap max-w-xs z-50"
          style={{
            left: Math.min(hoveredEvent.position.x, window.innerWidth - 200),
            top: hoveredEvent.position.y
          }}
        >
          <div className="truncate">
            {hoveredEvent.event.title}
            {hoveredEvent.event.time && ` • ${hoveredEvent.event.time}`}
            {hoveredEvent.event.description && ` • ${hoveredEvent.event.description}`}
          </div>
        </div>
      )}
    </div>
  )
}