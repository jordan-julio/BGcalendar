/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Event } from '@/types'
import { format } from 'date-fns'

interface EventModalProps {
  event: Event | null
  date: Date | null
  onClose: () => void
  user: any,
  role: string | null
}

export default function EventModal({ event, date, onClose, user, role }: EventModalProps) {
  // FIXED: Better date handling to avoid timezone issues
  const getFormattedDate = (dateInput: Date | string | null): string => {
    if (!dateInput) return ''
    
    if (typeof dateInput === 'string') {
      // If it's already a string, assume it's in YYYY-MM-DD format
      return dateInput.split('T')[0]
    }
    
    // If it's a Date object, format it properly in local timezone
    return format(dateInput, 'yyyy-MM-dd')
  }

  const [title, setTitle] = useState(event?.title || '')
  const [description, setDescription] = useState(event?.description || '')
  const [startDate, setStartDate] = useState(
    getFormattedDate(event?.start_date || date)
  )
  const [endDate, setEndDate] = useState(
    getFormattedDate(event?.end_date || date)
  )
  const [time, setTime] = useState(event?.time || '')
  const [loading, setLoading] = useState(false)

  // Debug logging
  console.log('🗓️ EventModal opened with:', {
    event: event?.title,
    date: date?.toDateString(),
    startDate,
    endDate,
    role
  })

  const canEdit = () => {
    if (!user || !role) return false
    if (role === 'Member') return false
    if (role === 'Super Admin') return true // Super Admin can edit anything
    if (role === 'Admin') {
      // Admin can edit their own events or create new ones
      return !event || event.created_by === user.id
    }
    return false
  }

  const canDelete = () => {
    if (!user || !role || !event) return false
    return role === 'Super Admin' // Only Super Admin can delete
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!canEdit()) {
      if (role === 'Member') {
        alert('You don\'t have permission to add or edit events.')
      } else if (role === 'Admin' && event && event.created_by !== user.id) {
        alert('Admins can only edit their own events.')
      } else {
        alert('You don\'t have permission to perform this action.')
      }
      return
    }

    if (!user) return

    setLoading(true)

    try {
      if (event) {
        // Update existing event
        console.log('🔄 Updating event:', event.id, 'by user:', user.id, 'role:', role)
        
        const { error } = await supabase
          .from('events')
          .update({
            title,
            description,
            start_date: startDate,
            end_date: endDate,
            time: time || null,
          })
          .eq('id', event.id)

        if (error) throw error
        console.log('✅ Event updated successfully')
      } else {
        // Create new event
        console.log('➕ Creating new event by user:', user.id, 'role:', role)
        
        const { error } = await supabase
          .from('events')
          .insert({
            title,
            description,
            start_date: startDate,
            end_date: endDate,
            time: time || null,
            created_by: user.id,
          })

        if (error) throw error
        console.log('✅ Event created successfully')
      }
      
      onClose()
    } catch (error) {
      console.error('❌ Error saving event:', error)
      alert('Error saving event: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!event || !canDelete()) {
      alert('Only Super Admins can delete events.')
      return
    }

    if (!confirm('Are you sure you want to delete this event? This action cannot be undone.')) {
      return
    }

    setLoading(true)

    try {
      console.log('🗑️ Deleting event:', event.id, 'by Super Admin:', user.id)
      
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', event.id)

      if (error) throw error
      
      console.log('✅ Event deleted successfully')
      
      onClose()
    } catch (error) {
      console.error('❌ Error deleting event:', error)
      alert('Error deleting event: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const isReadOnly = !canEdit()

  return (
    <div className="fixed inset-0 bg-[rgba(0,0,0,0.5)] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {event ? (isReadOnly ? 'View Event' : 'Edit Event') : 'New Event'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Role & Permission Info */}
        {role && (
          <div className="mb-4 p-2 bg-gray-50 rounded text-sm text-gray-600">
            <strong>Your role:</strong> {role}
            {event && event.created_by && (
              <span className="ml-2">
                | <strong>Created by:</strong> {event.created_by === user?.id ? 'You' : 'Another user'}
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <fieldset disabled={isReadOnly} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                required={!isReadOnly}
                readOnly={isReadOnly}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                rows={3}
                readOnly={isReadOnly}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required={!isReadOnly}
                  readOnly={isReadOnly}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required={!isReadOnly}
                  readOnly={isReadOnly}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time (optional)
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                readOnly={isReadOnly}
              />
            </div>
          </fieldset>

          <div className="flex justify-between mt-6">
            <div>
              {canDelete() && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                {isReadOnly ? 'Close' : 'Cancel'}
              </button>
              
              {canEdit() && (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {loading ? 'Saving...' : (event ? 'Update' : 'Create Event')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}