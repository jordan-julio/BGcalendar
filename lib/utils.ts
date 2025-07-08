import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Expanded color palette with more variety
export const COLORS = [
  { bg: '#3B82F6', text: '#FFFFFF', name: 'Blue' }, // Blue
  { bg: '#10B981', text: '#FFFFFF', name: 'Green' }, // Green
  { bg: '#F59E0B', text: '#FFFFFF', name: 'Amber' }, // Amber
  { bg: '#EF4444', text: '#FFFFFF', name: 'Red' }, // Red
  { bg: '#8B5CF6', text: '#FFFFFF', name: 'Purple' }, // Purple
  { bg: '#EC4899', text: '#FFFFFF', name: 'Pink' }, // Pink
  { bg: '#14B8A6', text: '#FFFFFF', name: 'Teal' }, // Teal
  { bg: '#F97316', text: '#FFFFFF', name: 'Orange' }, // Orange
  { bg: '#6366F1', text: '#FFFFFF', name: 'Indigo' }, // Indigo
  { bg: '#84CC16', text: '#FFFFFF', name: 'Lime' }, // Lime
  { bg: '#DC2626', text: '#FFFFFF', name: 'Red Dark' }, // Red Dark
  { bg: '#059669', text: '#FFFFFF', name: 'Green Dark' }, // Green Dark
  { bg: '#7C3AED', text: '#FFFFFF', name: 'Purple Dark' }, // Purple Dark
  { bg: '#BE185D', text: '#FFFFFF', name: 'Pink Dark' }, // Pink Dark
  { bg: '#0891B2', text: '#FFFFFF', name: 'Cyan' }, // Cyan
  { bg: '#C2410C', text: '#FFFFFF', name: 'Orange Dark' }, // Orange Dark
  { bg: '#4338CA', text: '#FFFFFF', name: 'Indigo Dark' }, // Indigo Dark
  { bg: '#65A30D', text: '#FFFFFF', name: 'Lime Dark' }, // Lime Dark
  { bg: '#7C2D12', text: '#FFFFFF', name: 'Brown' }, // Brown
  { bg: '#374151', text: '#FFFFFF', name: 'Gray' }, // Gray
]

// Pastel colors for better variety
export const PASTEL_COLORS = [
  { bg: '#DBEAFE', text: '#1E40AF', name: 'Blue Light' },
  { bg: '#D1FAE5', text: '#065F46', name: 'Green Light' },
  { bg: '#FEF3C7', text: '#92400E', name: 'Amber Light' },
  { bg: '#FEE2E2', text: '#991B1B', name: 'Red Light' },
  { bg: '#EDE9FE', text: '#5B21B6', name: 'Purple Light' },
  { bg: '#FCE7F3', text: '#9D174D', name: 'Pink Light' },
  { bg: '#CCFBF1', text: '#134E4A', name: 'Teal Light' },
  { bg: '#FED7AA', text: '#9A3412', name: 'Orange Light' },
]

// User-customizable color storage (would typically be in database)
let customEventColors: Record<string, { bg: string; text: string; name?: string }> = {}

// Function to get basic color (original behavior)
export function getEventColor(eventId: string) {
  // Check for custom color first
  if (customEventColors[eventId]) {
    return customEventColors[eventId]
  }
  
  const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return COLORS[hash % COLORS.length]
}

// ENHANCED: Get color with conflict resolution for overlapping events
export function getEventColorSmart(
  eventId: string, 
  overlappingEventIds: string[] = [],
  usePassiveColors: boolean = false
) {
  // Check for custom color first
  if (customEventColors[eventId]) {
    return customEventColors[eventId]
  }
  
  const colorPalette = usePassiveColors ? PASTEL_COLORS : COLORS
  
  // If no overlapping events, use simple hash
  if (overlappingEventIds.length === 0) {
    const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colorPalette[hash % colorPalette.length]
  }
  
  // Get colors already used by overlapping events
  const usedColorIndices = new Set<number>()
  overlappingEventIds.forEach(id => {
    if (id !== eventId) {
      const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      usedColorIndices.add(hash % colorPalette.length)
    }
  })
  
  // Find first available color that's not used by overlapping events
  const baseHash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  
  for (let i = 0; i < colorPalette.length; i++) {
    const colorIndex = (baseHash + i) % colorPalette.length
    if (!usedColorIndices.has(colorIndex)) {
      return colorPalette[colorIndex]
    }
  }
  
  // Fallback: if all colors are used, use the base color anyway
  return colorPalette[baseHash % colorPalette.length]
}

// Function to set custom color for an event
export function setCustomEventColor(eventId: string, color: { bg: string; text: string; name?: string }) {
  customEventColors[eventId] = color
  
  // In a real app, you'd save this to database/localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('customEventColors', JSON.stringify(customEventColors))
  }
}

// Function to load custom colors (call on app startup)
export function loadCustomEventColors() {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('customEventColors')
      if (saved) {
        customEventColors = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load custom event colors:', error)
    }
  }
}

// Function to remove custom color for an event
export function removeCustomEventColor(eventId: string) {
  delete customEventColors[eventId]
  
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('customEventColors', JSON.stringify(customEventColors))
  }
}

// Function to get all available colors for color picker
export function getAllAvailableColors() {
  return {
    standard: COLORS,
    pastel: PASTEL_COLORS,
    combined: [...COLORS, ...PASTEL_COLORS]
  }
}

// Utility function to check if overlapping events in a date range
export function getOverlappingEvents(
  targetEvent: { id: string; start_date: string; end_date: string },
  allEvents: Array<{ id: string; start_date: string; end_date: string }>
): string[] {
  const targetStart = new Date(targetEvent.start_date)
  const targetEnd = new Date(targetEvent.end_date)
  
  return allEvents
    .filter(event => {
      if (event.id === targetEvent.id) return false
      
      const eventStart = new Date(event.start_date)
      const eventEnd = new Date(event.end_date)
      
      // Check if events overlap
      return (targetStart <= eventEnd && targetEnd >= eventStart)
    })
    .map(event => event.id)
}

// Generate a completely unique color for an event (if needed)
export function generateUniqueColor(eventId: string, saturation: number = 70, lightness: number = 50): { bg: string; text: string } {
  // Use event ID to generate a consistent hue
  const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const hue = hash % 360
  
  const backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`
  const textColor = lightness > 50 ? '#000000' : '#FFFFFF'
  
  return {
    bg: backgroundColor,
    text: textColor
  }
}