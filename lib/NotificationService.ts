/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/NotificationService.ts - Fixed version with no infinite loops
import { supabase } from './supabase'

// Add global flag to prevent React Strict Mode issues
let globalSetupInProgress = false
let globalLastSetupTime: Date | null = null

export class NotificationService {
  private static instance: NotificationService
  private permission: NotificationPermission = 'default'
  private registration: ServiceWorkerRegistration | null = null
  private checkInterval: NodeJS.Timeout | null = null
  private userId: string | null = null
  private lastNotificationCheck: Date | null = null
  private isSetupInProgress: boolean = false
  private lastScheduleTime: Date | null = null

  private constructor() {
    if (typeof window !== 'undefined') {
      this.permission = Notification.permission
      this.initServiceWorker()
    }
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  private async initServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Wait for existing registration or register new one
        this.registration = await navigator.serviceWorker.ready;
        console.log('✅ Service Worker ready for notifications');
      } catch (err) {
        console.error('❌ SW not ready:', err);
      }
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('⚠️ Notifications not supported')
      return 'denied'
    }

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission()
    }

    return this.permission
  }

  async setupNotifications(userId: string): Promise<boolean> {
    // Global protection against React Strict Mode
    const now = new Date()
    if (globalSetupInProgress || 
        (globalLastSetupTime && (now.getTime() - globalLastSetupTime.getTime()) < 5000)) {
      console.log('🔄 Global setup protection - preventing duplicate setup')
      return true
    }

    // Prevent multiple simultaneous setups
    if (this.isSetupInProgress || this.userId === userId) {
      console.log('🔄 Notification setup already in progress or completed for this user')
      return true
    }

    try {
      globalSetupInProgress = true
      this.isSetupInProgress = true
      this.userId = userId
      globalLastSetupTime = now
      
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        console.log('❌ Notification permission denied')
        return false
      }

      // Ensure SW is ready
      if (!this.registration) {
        await this.initServiceWorker()
      }

      // Only schedule if we haven't done it recently (prevent spam)
      const shouldSchedule = !this.lastScheduleTime || 
        (now.getTime() - this.lastScheduleTime.getTime()) > 60 * 60 * 1000 // 1 hour

      if (shouldSchedule) {
        await this.scheduleEventNotifications(userId)
        this.lastScheduleTime = now
      } else {
        console.log('⏭️ Skipping notification scheduling - done recently')
      }
      
      // Start periodic checking (only if not already running)
      if (!this.checkInterval) {
        this.startPeriodicCheck(userId)
      }

      console.log('✅ Notifications setup complete')
      return true
    } catch (error) {
      console.error('❌ Error setting up notifications:', error)
      return false
    } finally {
      globalSetupInProgress = false
      this.isSetupInProgress = false
    }
  }

  private async scheduleEventNotifications(userId: string) {
    try {
      console.log('📅 Fetching events for notification scheduling...')
      
      const today = new Date()
      const futureDate = new Date(today)
      futureDate.setDate(today.getDate() + 30) // Next 30 days

      // Get events and existing notifications in parallel to reduce database calls
      const [eventsResult, existingNotifsResult] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .gte('start_date', today.toISOString().slice(0, 10))
          .lte('start_date', futureDate.toISOString().slice(0, 10)),
        
        supabase
          .from('notifications')
          .select('event_id, notification_type')
          .eq('user_id', userId)
      ])

      const { data: events, error: eventsError } = eventsResult
      const { data: existingNotifs, error: notifsError } = existingNotifsResult

      if (eventsError) {
        console.error('❌ Error fetching events:', eventsError)
        return
      }

      if (notifsError) {
        console.error('❌ Error fetching existing notifications:', notifsError)
        return
      }

      if (!events?.length) {
        console.log('📭 No upcoming events found')
        return
      }

      console.log(`📋 Found ${events.length} upcoming events`)

      // Create a map of existing notifications for quick lookup
      const existingNotifsMap = new Map<string, Set<string>>()
      existingNotifs?.forEach(notif => {
        if (!existingNotifsMap.has(notif.event_id)) {
          existingNotifsMap.set(notif.event_id, new Set())
        }
        existingNotifsMap.get(notif.event_id)!.add(notif.notification_type)
      })

      // Build notifications array
      const notifications: any[] = []
      
      for (const event of events) {
        const eventDate = new Date(event.start_date)
        const dayBefore = new Date(eventDate)
        dayBefore.setDate(eventDate.getDate() - 1)

        const existingTypes = existingNotifsMap.get(event.id) || new Set()

        // Day before notification (if event is more than 1 day away and we don't have one)
        if (dayBefore >= today && !existingTypes.has('day_before')) {
          notifications.push({
            event_id: event.id,
            user_id: userId,
            notify_date: dayBefore.toISOString().slice(0, 10),
            sent: false,
            notification_type: 'day_before'
          })
        }

        // Event day notification (if we don't have one)
        if (!existingTypes.has('event_day')) {
          notifications.push({
            event_id: event.id,
            user_id: userId,
            notify_date: eventDate.toISOString().slice(0, 10),
            sent: false,
            notification_type: 'event_day'
          })
        }
      }

      if (notifications.length > 0) {
        const { error: insertError } = await supabase
          .from('notifications')
          .insert(notifications)
        
        if (insertError) {
          console.error('❌ Error inserting notifications:', insertError)
        } else {
          console.log(`✅ Scheduled ${notifications.length} new notifications`)
        }
      } else {
        console.log('✅ All notifications already scheduled')
      }
    } catch (error) {
      console.error('❌ Error in scheduleEventNotifications:', error)
    }
  }

  private startPeriodicCheck(userId: string) {
    // Clear existing interval to prevent duplicates
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }

    console.log('⏰ Starting periodic notification check (every 10 minutes)')

    // Check every 10 minutes when app is active
    this.checkInterval = setInterval(() => {
      this.checkAndSendNotifications(userId)
    }, 10 * 60 * 1000) // 10 minutes

    // Also check once immediately
    setTimeout(() => {
      this.checkAndSendNotifications(userId)
    }, 5000) // Wait 5 seconds to avoid immediate spam
  }

  async checkAndSendNotifications(userId?: string): Promise<void> {
    const targetUserId = userId || this.userId
    if (!targetUserId) {
      console.log('⚠️ No user ID for notification check')
      return
    }
    
    if (this.permission !== 'granted' || !this.registration) {
      console.log('⚠️ Cannot send notifications: no permission or SW')
      return
    }

    // Throttle checks to avoid spam (don't check more than once per 5 minutes)
    const now = new Date()
    if (this.lastNotificationCheck && 
        (now.getTime() - this.lastNotificationCheck.getTime()) < 5 * 60 * 1000) {
      console.log('⏭️ Skipping notification check - too recent')
      return
    }
    
    this.lastNotificationCheck = now

    try {
      console.log('🔍 Checking for due notifications...')
      
      // Get events happening in the next 24 hours
      const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .gte('start_date', now.toISOString().slice(0, 10))
        .lte('start_date', next24Hours.toISOString().slice(0, 10))
        .order('start_date', { ascending: true })

      if (eventsError) {
        console.error('❌ Error fetching upcoming events:', eventsError)
        return
      }

      if (!events?.length) {
        console.log('📭 No events in the next 24 hours')
        return
      }

      console.log(`📋 Found ${events.length} events in the next 24 hours`)

      // Get all sent notifications for these events in one query
      const eventIds = events.map(e => e.id)
      const { data: sentNotifications, error: sentError } = await supabase
        .from('notifications')
        .select('event_id, notification_type')
        .eq('user_id', targetUserId)
        .eq('sent', true)
        .in('event_id', eventIds)

      if (sentError) {
        console.error('❌ Error checking sent notifications:', sentError)
        return
      }

      // Create map of sent notifications
      const sentNotifsMap = new Map<string, Set<string>>()
      sentNotifications?.forEach(notif => {
        if (!sentNotifsMap.has(notif.event_id)) {
          sentNotifsMap.set(notif.event_id, new Set())
        }
        sentNotifsMap.get(notif.event_id)!.add(notif.notification_type)
      })

      // Process events
      let notificationsSent = 0
      for (const event of events) {
        const sent = await this.processEventNotifications(event, targetUserId, now, sentNotifsMap)
        if (sent) notificationsSent++
      }

      console.log(`✅ Processed ${events.length} events, sent ${notificationsSent} notifications`)

    } catch (error) {
      console.error('❌ Error in checkAndSendNotifications:', error)
    }
  }

  private async processEventNotifications(
    event: any, 
    userId: string, 
    now: Date, 
    sentNotifsMap: Map<string, Set<string>>
  ): Promise<boolean> {
    const eventDate = new Date(event.start_date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    
    const sentTypes = sentNotifsMap.get(event.id) || new Set()
    
    // Determine what type of notification to send
    let notificationType: string | null = null
    let shouldSend = false

    if (hoursUntilEvent <= 24 && hoursUntilEvent >= 0) {
      if (hoursUntilEvent <= 2) {
        // Very soon - send immediate notification
        if (!sentTypes.has('event_day')) {
          notificationType = 'event_day'
          shouldSend = true
        }
      } else if (hoursUntilEvent <= 24) {
        // Within 24 hours - send day_before if we haven't sent any
        if (!sentTypes.has('day_before') && !sentTypes.has('event_day')) {
          notificationType = 'day_before'
          shouldSend = true
        }
      }
    }

    if (shouldSend && notificationType) {
      console.log(`🔔 Sending ${notificationType} notification for "${event.title}"`)
      
      await this.sendNotificationForEvent(event, hoursUntilEvent, notificationType)
      await this.recordSentNotification(event.id, userId, notificationType, now)
      
      return true
    }
    
    return false
  }

  private async recordSentNotification(eventId: string, userId: string, notificationType: string, sentAt: Date) {
    try {
      await supabase
        .from('notifications')
        .insert({
          event_id: eventId,
          user_id: userId,
          notify_date: sentAt.toISOString().slice(0, 10),
          sent: true,
          sent_at: sentAt.toISOString(),
          notification_type: notificationType
        })
      
      console.log(`✅ Recorded ${notificationType} notification for event ${eventId}`)
    } catch (error) {
      console.error('❌ Error recording sent notification:', error)
    }
  }

  private async sendNotificationForEvent(event: any, hoursUntilEvent: number, notificationType: string) {
    const isImmediate = hoursUntilEvent <= 2
    
    const title = isImmediate 
      ? `🔔 Happening Soon: ${event.title}`
      : `⏰ Upcoming Event: ${event.title}`
      
    let body: string
    if (isImmediate) {
      body = `Starting ${event.time ? `at ${event.time}` : 'soon'}!`
    } else {
      const hours = Math.round(hoursUntilEvent)
      body = `Event in ${hours} hour${hours === 1 ? '' : 's'}${event.time ? ` at ${event.time}` : ''}`
    }

    const options: NotificationOptions = {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: `event-${event.id}-${notificationType}`,
      data: { 
        url: '/',
        eventId: event.id 
      },
      requireInteraction: isImmediate,
      silent: false
    }

    if (this.registration) {
      await this.registration.showNotification(title, options)
      console.log(`✅ Sent notification: ${title}`)
    }
  }

  // Manual trigger (for testing)
  async triggerNotificationCheck(): Promise<void> {
    if (!this.userId) {
      console.log('⚠️ No user ID available for notification check')
      return
    }
    
    console.log('🔍 Manually triggering notification check...')
    this.lastNotificationCheck = null // Reset to force check
    await this.checkAndSendNotifications(this.userId)
  }

  // Cleanup
  destroy() {
    console.log('🧹 Destroying NotificationService...')
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.userId = null
    this.lastNotificationCheck = null
    this.lastScheduleTime = null
    this.isSetupInProgress = false
    // Reset global flags
    globalSetupInProgress = false
    globalLastSetupTime = null
  }

  // Test notification
  async testNotification() {
    if (this.permission !== 'granted') {
      console.warn('⚠️ No permission for notifications')
      return
    }

    const title = '🧪 Test Notification'
    const body = 'This is a test notification from BG Events'
    
    if (this.registration) {
      await this.registration.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-notification',
        requireInteraction: false
      })
      console.log('✅ Test notification sent')
    } else {
      console.log('❌ Service Worker not available')
    }
  }
}