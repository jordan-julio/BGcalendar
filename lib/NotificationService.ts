// lib/NotificationService.ts
import { supabase } from './supabase'

export class NotificationService {
  private static instance: NotificationService
  private permission: NotificationPermission = 'default'
  private registration: ServiceWorkerRegistration | null = null

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
        this.registration = await navigator.serviceWorker.ready
      } catch (err) {
        console.error('SW not ready:', err)
      }
    }
  }

  private async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('Notifications unsupported')
      return 'denied'
    }
    if (this.permission === 'default') {
      this.permission = await Notification.requestPermission()
    }
    return this.permission
  }

  /** Call once at app start or when user toggles notifications */
  async setupNotifications(userId: string): Promise<boolean> {
    const perm = await this.requestPermission()
    if (perm !== 'granted') return false

    // ensure SW is ready
    if (!this.registration) {
      await this.initServiceWorker()
    }

    // schedule reminders in your DB
    await this.scheduleEventNotifications(userId)
    return true
  }

  private async scheduleEventNotifications(userId: string) {
    const today = new Date()
    const in30  = new Date(today)
    in30.setDate(today.getDate() + 30)

    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .gte('start_date', today.toISOString().slice(0,10))
      .lte('start_date', in30.toISOString().slice(0,10))

    if (error || !events?.length) return

    // clear old, unsent
    await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('sent', false)

    // insert new
    const toInsert = events.flatMap((ev: any) => {
      const d = new Date(ev.start_date)
      const dayBefore = new Date(d)
      dayBefore.setDate(d.getDate()-1)

      const list: any[] = []
      if (dayBefore >= new Date()) {
        list.push({
          event_id: ev.id,
          user_id: userId,
          notify_date: dayBefore.toISOString().slice(0,10),
          sent: false,
          notification_type: 'day_before'
        })
      }
      list.push({
        event_id: ev.id,
        user_id: userId,
        notify_date: d.toISOString().slice(0,10),
        sent: false,
        notification_type: 'event_day'
      })
      return list
    })

    if (toInsert.length) {
      const { error: insErr } = await supabase
        .from('notifications')
        .insert(toInsert)
      if (insErr) console.error(insErr)
    }
  }

  /** Called every minute */
  async checkAndSendDueNotifications(userId: string) {
    if (this.permission !== 'granted') return

    const today = new Date().toISOString().slice(0,10)
    const { data, error } = await supabase
      .from('notifications')
      .select('*, event:events(*)')
      .eq('user_id', userId)
      .eq('notify_date', today)
      .eq('sent', false)

    if (error || !data?.length) return

    for (const note of data) {
      await this.showViaSW(note.event, note.notification_type)
      await supabase
        .from('notifications')
        .update({ sent: true })
        .eq('id', note.id)
    }
  }

  /** ALWAYS uses service worker registration.showNotification */
  private async showViaSW(event: any, type: string) {
    const title = type === 'day_before'
      ? `Reminder: ${event.title}`
      : `Today: ${event.title}`

    const body = type === 'day_before'
      ? `Happening tomorrow (${new Date(event.start_date).toLocaleDateString()})`
      : `Happening today${event.time ? ` at ${event.time}` : ''}`

    const options: NotificationOptions = {
      body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: `event-${event.id}`,
      data: { url: '/' },
      requireInteraction: false
    }

    if (this.registration) {
      try {
        await this.registration.showNotification(title, options)
      } catch (err) {
        console.error('SW showNotification failed:', err)
      }
    } else {
      console.error('No SW registration available — notifications will not fire on Android')
    }
  }

  /** For your “Test” button */
  async testNotification() {
    if (this.permission !== 'granted') {
      console.warn('No permission for notifications')
      return
    }
    // dummy event
    await this.showViaSW({ id: 'test', title: 'Test Notification', start_date: new Date().toISOString() }, 'event_day')
  }

  /** Bell dropdown */
  async getUpcomingNotifications(userId: string) {
    const today = new Date().toISOString().slice(0,10)
    const week  = new Date(Date.now() + 7*86400000).toISOString().slice(0,10)

    const { data, error } = await supabase
      .from('notifications')
      .select('*, event:events(*)')
      .eq('user_id', userId)
      .gte('notify_date', today)
      .lte('notify_date', week)
      .eq('sent', false)
      .order('notify_date', { ascending: true })

    if (error) {
      console.error(error)
      return []
    }
    return data || []
  }
}
