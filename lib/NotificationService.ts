// lib/NotificationService.ts - Fixed version with proper notification timing
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from './supabase'

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
    // Only initialize on client side
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
    // Only run on client side
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    
    try {
      await navigator.serviceWorker.register('/sw.js')
      this.registration = await navigator.serviceWorker.ready;
      console.log('✅ Service Worker ready for notifications');
    } catch (err) {
      console.error('❌ SW not ready:', err);
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    // Only run on client side
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('⚠️ Notifications not supported or running on server')
      return 'denied'
    }

    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission()
    }

    return this.permission
  }

  async setupNotifications(userId: string): Promise<boolean> {
    const now = new Date()
    if (globalSetupInProgress || 
        (globalLastSetupTime && (now.getTime() - globalLastSetupTime.getTime()) < 5000)) {
      console.log('🔄 Global setup protection - preventing duplicate setup')
      return true
    }

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

      if (!this.registration) {
        await this.initServiceWorker()
      }

      const shouldSchedule = !this.lastScheduleTime || 
        (now.getTime() - this.lastScheduleTime.getTime()) > 60 * 60 * 1000 // 1 hour

      if (shouldSchedule) {
        await this.scheduleEventNotifications(userId)
        this.lastScheduleTime = now
      } else {
        console.log('⏭️ Skipping notification scheduling - done recently')
      }
      
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
      futureDate.setDate(today.getDate() + 7) // Next 7 days

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

      if (this.registration && 'sync' in this.registration) {
        await (this.registration as any).sync.register('check-notifications');
        console.log('🔄 Background sync “check-notifications” registered');
      }
      console.log(`📋 Found ${events.length} upcoming events`)

      const existingNotifsMap = new Map<string, Set<string>>()
      existingNotifs?.forEach(notif => {
        if (!existingNotifsMap.has(notif.event_id)) {
          existingNotifsMap.set(notif.event_id, new Set())
        }
        existingNotifsMap.get(notif.event_id)!.add(notif.notification_type)
      })

      const notifications: any[] = []
      
      for (const event of events) {
        const eventDate = new Date(event.start_date)
        const dayBefore = new Date(eventDate)
        dayBefore.setDate(eventDate.getDate() - 1)

        const existingTypes = existingNotifsMap.get(event.id) || new Set()

        // Day before notification
        if (dayBefore >= today && !existingTypes.has('day_before')) {
          notifications.push({
            event_id: event.id,
            user_id: userId,
            notify_date: dayBefore.toISOString().slice(0, 10),
            sent: false,
            notification_type: 'day_before'
          })
        }

        // Event day notification
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
    // Only run on client side
    if (typeof window === 'undefined') {
      return
    }
    
    console.log('⏰ Setting up notification checks...')

    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    // Check every 10 minutes when app is active
    this.checkInterval = setInterval(() => {
      if (!document.hidden) {
        console.log('🔍 Periodic notification check')
        this.checkAndSendNotifications(userId)
      }
    }, 10 * 60 * 1000)

    // Initial check after a delay
    setTimeout(() => {
      this.checkAndSendNotifications(userId)
    }, 5000)

    // Page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        console.log('👁️ Page visible - checking notifications')
        setTimeout(() => {
          this.checkAndSendNotifications(userId)
        }, 1000)
      }
    })
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

    const now = new Date()
    if (this.lastNotificationCheck && 
        (now.getTime() - this.lastNotificationCheck.getTime()) < 5 * 60 * 1000) {
      console.log('⏭️ Skipping notification check - too recent')
      return
    }
    
    this.lastNotificationCheck = now

    try {
      console.log('🔍 Checking for due notifications...')
      
      // Get events happening in the next 25 hours (to catch events happening tomorrow)
      const next25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000)

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .gte('start_date', now.toISOString().slice(0, 10))
        .lte('start_date', next25Hours.toISOString().slice(0, 10))
        .order('start_date', { ascending: true })

      if (eventsError) {
        console.error('❌ Error fetching upcoming events:', eventsError)
        return
      }

      if (!events?.length) {
        console.log('📭 No events in the next 25 hours')
        return
      }

      console.log(`📋 Found ${events.length} events in the next 25 hours`)

      // Get all sent notifications for these events
      const eventIds = events.map(e => e.id)
      const { data: sentNotifications, error: notifError } = await supabase
        .from('notifications')
        .select('event_id, notification_type, sent')
        .eq('user_id', targetUserId)
        .eq('sent', true)
        .in('event_id', eventIds)

      if (notifError) {
        console.error('❌ Error checking sent notifications:', notifError)
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
    
    // If event has a time, use it for more precise calculation
    if (event.time) {
      const [hours, minutes] = event.time.split(':').map(Number)
      eventDate.setHours(hours, minutes, 0, 0)
    } else {
      // If no time specified, assume it's at 9 AM
      eventDate.setHours(9, 0, 0, 0)
    }

    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const sentTypes = sentNotifsMap.get(event.id) || new Set()
    
    let notificationType: string | null = null
    let shouldSend = false

    // Determine what type of notification to send
    if (hoursUntilEvent <= 25 && hoursUntilEvent >= -1) { // Extended window to catch day-before
      if (hoursUntilEvent <= 2 && hoursUntilEvent >= 0) {
        // Event starting within 2 hours - send immediate notification
        if (!sentTypes.has('event_day')) {
          notificationType = 'event_day'
          shouldSend = true
        }
      } else if (hoursUntilEvent <= 24 && hoursUntilEvent > 2) {
        // Event happening today (but more than 2 hours away) - send day notification
        if (!sentTypes.has('event_day') && !sentTypes.has('day_before')) {
          notificationType = 'event_day'
          shouldSend = true
        }
      } else if (hoursUntilEvent > 24) {
        // Event happening tomorrow - send day-before notification
        if (!sentTypes.has('day_before')) {
          notificationType = 'day_before'
          shouldSend = true
        }
      }
    }

    if (shouldSend && notificationType) {
      console.log(`🔔 Sending ${notificationType} notification for "${event.title}" (${hoursUntilEvent.toFixed(1)}h away)`)
      
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
    
    let title: string
    let body: string
    
    if (isImmediate) {
      title = `🔥 Starting Soon: ${event.title}`
      body = `Event starts ${event.time ? `at ${event.time}` : 'soon'}!`
    } else if (hoursUntilEvent <= 24) {
      title = `📅 Today: ${event.title}`
      body = `Event ${event.time ? `at ${event.time}` : 'happening today'}`
    } else {
      title = `⏰ Tomorrow: ${event.title}`
      body = `Don't forget: Event ${event.time ? `at ${event.time}` : 'happening tomorrow'}`
    }

    const options: NotificationOptions = {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: `event-${event.id}-${notificationType}`,
      data: { 
        url: '/',
        eventId: event.id,
        notificationType
      },
      requireInteraction: isImmediate,
      silent: false,
      //vibrate: isImmediate ? [300, 100, 300, 100, 300] : [200, 100, 200]
    }

    if (this.registration) {
      await this.registration.showNotification(title, options)
      console.log(`✅ Sent notification: ${title}`)
    } else {
      // Fallback to regular notification if no service worker
      new Notification(title, options)
      console.log(`✅ Sent fallback notification: ${title}`)
    }
  }

  // Manual trigger for testing
  async triggerNotificationCheck(): Promise<void> {
    if (!this.userId) {
      console.log('⚠️ No user ID available for notification check')
      return
    }
    
    console.log('🔍 Manually triggering notification check...')
    this.lastNotificationCheck = null // Reset to force check
    await this.checkAndSendNotifications(this.userId)
  }

  // Test notification
  async testNotification(): Promise<void> {
    // Only run on client side
    if (typeof window === 'undefined') {
      throw new Error('Test notification can only run on client side')
    }
    
    if (this.permission !== 'granted') {
      console.warn('⚠️ No permission for notifications')
      throw new Error('Notification permission not granted')
    }

    const title = '🧪 Test Notification'
    const body = 'This is a test notification from BG Events app!'
    
    if (this.registration) {
      await this.registration.showNotification(title, {
        body,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: 'test-notification',
        requireInteraction: false,
        //vibrate: [300, 100, 300]
      })
      console.log('✅ Test notification sent via service worker')
    } else {
      new Notification(title, { body, icon: '/icon-192x192.png' })
      console.log('✅ Test notification sent via fallback')
    }
  }

  // Cleanup old notifications from database
  async cleanupOldNotifications(userId: string): Promise<void> {
    try {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      // Delete notifications for events that happened more than 3 days ago
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', userId)
        .lt('notify_date', threeDaysAgo.toISOString().slice(0, 10))

      if (error) {
        console.error('❌ Error cleaning up old notifications:', error)
      } else {
        console.log('✅ Cleaned up old notifications')
      }
    } catch (error) {
      console.error('❌ Error in cleanupOldNotifications:', error)
    }
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
    globalSetupInProgress = false
    globalLastSetupTime = null
  }
}