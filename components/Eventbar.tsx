'use client'

import { isSameDay, isWithinInterval, differenceInDays, startOfDay, endOfDay } from 'date-fns'
import { Event } from '@/types'
import { getEventColor } from '@/lib/utils'

interface EventBarProps {
  events: Event[]
  currentDay: Date
  monthStart: Date
  monthEnd: Date
  onEventClick: (event: Event) => void
}

export default function EventBar({ events, currentDay, monthStart, monthEnd, onEventClick }: EventBarProps) {
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
        
        // Calculate if this is the first day of the event in the current view
        const isFirstDay = isSameDay(currentDay, eventStart) || 
                          (currentDay.getDay() === 0 && eventStart < currentDay) ||
                          isSameDay(currentDay, monthStart)
        
        // Calculate if this is the last day of the event in the current view
        const isLastDay = isSameDay(currentDay, eventEnd) || 
                         (currentDay.getDay() === 6 && eventEnd > currentDay) ||
                         isSameDay(currentDay, monthEnd)
        
        // Calculate the span for multi-day events
        const daysUntilEnd = Math.min(
          differenceInDays(eventEnd, currentDay) + 1,
          7 - currentDay.getDay()
        )

        return (
          <div
            key={event.id}
            onClick={(e) => {
              e.stopPropagation()
              onEventClick(event)
            }}
            className={`
              relative h-6 flex items-center text-xs font-medium text-white cursor-pointer
              transition-all hover:shadow-md hover:z-10
              ${isFirstDay ? 'rounded-l-md pl-2' : 'pl-1'}
              ${isLastDay ? 'rounded-r-md pr-2' : 'pr-1'}
              ${isFirstDay && isLastDay ? 'rounded-md' : ''}
            `}
            style={{
              backgroundColor: color.bg,
              color: color.text,
              width: isFirstDay   ? `calc(${daysUntilEnd * 100}% + ${daysUntilEnd - 1}px)`   : '100%',
              marginTop: idx * 28 + 'px',
              zIndex: 10 - idx
            }}
          >
            {isFirstDay && (
              <span className="truncate pr-1">
                {event.title}
              </span>
            )}
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