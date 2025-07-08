/* eslint-disable @typescript-eslint/no-unused-vars */
// components/ColorManagementModal.tsx - Advanced color management
'use client'

import { useState, useEffect } from 'react'
import { Event } from '@/types'
import { 
  getAllAvailableColors, 
  setCustomEventColor, 
  removeCustomEventColor, 
  getEventColor,
  generateUniqueColor 
} from '@/lib/utils'
import { X, Palette, RotateCcw, Shuffle } from 'lucide-react'

interface ColorManagementModalProps {
  events: Event[]
  onClose: () => void
  onColorsChanged: () => void
}

export default function ColorManagementModal({ events, onClose, onColorsChanged }: ColorManagementModalProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [customColor, setCustomColor] = useState({ bg: '#3B82F6', text: '#FFFFFF' })
  
  const availableColors = getAllAvailableColors()

  // Group events by their current colors to show conflicts
  const eventsByColor = events.reduce((acc, event) => {
    const color = getEventColor(event.id)
    const colorKey = color.bg
    if (!acc[colorKey]) {
      acc[colorKey] = []
    }
    acc[colorKey].push(event)
    return acc
  }, {} as Record<string, Event[]>)

  // Find color conflicts (multiple events with same color)
  const colorConflicts = Object.entries(eventsByColor).filter(([_, events]) => events.length > 1)

  const handleColorChange = (eventId: string, color: { bg: string; text: string; name?: string }) => {
    setCustomEventColor(eventId, color)
    onColorsChanged()
  }

  const handleResetColor = (eventId: string) => {
    removeCustomEventColor(eventId)
    onColorsChanged()
  }

  const handleGenerateUniqueColors = () => {
    // Generate unique colors for all events with conflicts
    colorConflicts.forEach(([_, conflictingEvents]) => {
      conflictingEvents.forEach((event, index) => {
        if (index > 0) { // Keep first event's color, change others
          const uniqueColor = generateUniqueColor(event.id + index, 70, 45)
          setCustomEventColor(event.id, uniqueColor)
        }
      })
    })
    onColorsChanged()
  }

  const handleCustomColorSubmit = () => {
    if (selectedEvent) {
      handleColorChange(selectedEvent, customColor)
      setSelectedEvent(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Palette className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Event Color Management</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row max-h-[calc(90vh-80px)]">
          {/* Left panel - Event list */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Events</h3>
                
                {colorConflicts.length > 0 && (
                  <button
                    onClick={handleGenerateUniqueColors}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Shuffle className="h-4 w-4" />
                    Fix All Conflicts
                  </button>
                )}
              </div>

              {/* Color conflicts warning */}
              {colorConflicts.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800 font-medium mb-1">
                    Color Conflicts Detected
                  </p>
                  <p className="text-xs text-amber-700">
                    {colorConflicts.length} color{colorConflicts.length === 1 ? '' : 's'} shared by multiple events. 
                    Click &quot;Fix All Conflicts&quot; to auto-assign unique colors.
                  </p>
                </div>
              )}
            </div>

            {/* Events grouped by color */}
            <div className="space-y-4">
              {Object.entries(eventsByColor).map(([colorBg, eventsInColor]) => (
                <div key={colorBg} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: colorBg }}
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {eventsInColor.length} event{eventsInColor.length === 1 ? '' : 's'}
                    </span>
                    {eventsInColor.length > 1 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                        Conflict
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {eventsInColor.map(event => (
                      <div key={event.id} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {event.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(event.start_date).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => setSelectedEvent(event.id)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Change color"
                          >
                            <Palette className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleResetColor(event.id)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            title="Reset to default color"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel - Color picker */}
          <div className="lg:w-80 border-l border-gray-200 p-6 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Color Picker</h3>
            
            {selectedEvent ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-700 mb-2">
                    Editing: <span className="font-medium">
                      {events.find(e => e.id === selectedEvent)?.title}
                    </span>
                  </p>
                </div>

                {/* Current color preview */}
                <div className="p-3 rounded-lg border border-gray-200 bg-white">
                  <p className="text-xs text-gray-500 mb-2">Current Color</p>
                  <div 
                    className="w-full h-8 rounded flex items-center justify-center text-sm font-medium"
                    style={{ 
                      backgroundColor: getEventColor(selectedEvent).bg,
                      color: getEventColor(selectedEvent).text 
                    }}
                  >
                    Sample Event
                  </div>
                </div>

                {/* Standard color palette */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Standard Colors</p>
                  <div className="grid grid-cols-5 gap-2">
                    {availableColors.standard.map((color, index) => (
                      <button
                        key={index}
                        onClick={() => handleColorChange(selectedEvent, color)}
                        className="w-8 h-8 rounded border-2 border-gray-300 hover:border-blue-500 transition-colors hover:scale-110"
                        style={{ backgroundColor: color.bg }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Pastel color palette */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Pastel Colors</p>
                  <div className="grid grid-cols-4 gap-2">
                    {availableColors.pastel.map((color, index) => (
                      <button
                        key={index}
                        onClick={() => handleColorChange(selectedEvent, color)}
                        className="w-8 h-8 rounded border-2 border-gray-300 hover:border-blue-500 transition-colors hover:scale-110"
                        style={{ backgroundColor: color.bg }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Custom color input */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Custom Color</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Background</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={customColor.bg}
                          onChange={(e) => setCustomColor(prev => ({ ...prev, bg: e.target.value }))}
                          className="w-8 h-8 rounded border border-gray-300"
                        />
                        <input
                          type="text"
                          value={customColor.bg}
                          onChange={(e) => setCustomColor(prev => ({ ...prev, bg: e.target.value }))}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="#3B82F6"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Text Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={customColor.text}
                          onChange={(e) => setCustomColor(prev => ({ ...prev, text: e.target.value }))}
                          className="w-8 h-8 rounded border border-gray-300"
                        />
                        <input
                          type="text"
                          value={customColor.text}
                          onChange={(e) => setCustomColor(prev => ({ ...prev, text: e.target.value }))}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                          placeholder="#FFFFFF"
                        />
                      </div>
                    </div>

                    {/* Custom color preview */}
                    <div 
                      className="w-full h-8 rounded border border-gray-300 flex items-center justify-center text-sm font-medium"
                      style={{ 
                        backgroundColor: customColor.bg,
                        color: customColor.text 
                      }}
                    >
                      Preview
                    </div>

                    <button
                      onClick={handleCustomColorSubmit}
                      className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Apply Custom Color
                    </button>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="space-y-2 pt-4 border-t border-gray-300">
                  <button
                    onClick={() => {
                      const uniqueColor = generateUniqueColor(selectedEvent)
                      handleColorChange(selectedEvent, uniqueColor)
                    }}
                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    Generate Unique Color
                  </button>
                  
                  <button
                    onClick={() => handleResetColor(selectedEvent)}
                    className="w-full py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Reset to Default
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Palette className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Select an event to change its color</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {events.length} total events • {colorConflicts.length} color conflicts
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}