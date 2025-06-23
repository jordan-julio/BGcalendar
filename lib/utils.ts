import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const COLORS = [
  { bg: '#3B82F6', text: '#FFFFFF' }, // Blue
  { bg: '#10B981', text: '#FFFFFF' }, // Green
  { bg: '#F59E0B', text: '#FFFFFF' }, // Amber
  { bg: '#EF4444', text: '#FFFFFF' }, // Red
  { bg: '#8B5CF6', text: '#FFFFFF' }, // Purple
  { bg: '#EC4899', text: '#FFFFFF' }, // Pink
  { bg: '#14B8A6', text: '#FFFFFF' }, // Teal
  { bg: '#F97316', text: '#FFFFFF' }, // Orange
  { bg: '#6366F1', text: '#FFFFFF' }, // Indigo
  { bg: '#84CC16', text: '#FFFFFF' }, // Lime
]

export function getEventColor(eventId: string) {
  const hash = eventId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return COLORS[hash % COLORS.length]
}