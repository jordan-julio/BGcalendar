// app/api/cron/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    })
    console.log('✅ Firebase Admin SDK initialized for cron')
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error)
  }
}

// Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function GET(req: NextRequest) {
  try {
    console.log('🕕 Starting daily notification cron job...')

    // Verify authorization (Vercel Cron or your own secret)
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log('❌ Unauthorized cron attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    let totalNotificationsSent = 0
    const results = []

    // Define timezones to check (you can expand this)
    const timezones = [
      { name: 'UTC', tz: 'UTC' },
      { name: 'US Eastern', tz: 'America/New_York' },
      { name: 'UK', tz: 'Europe/London' },
      { name: 'Japan', tz: 'Asia/Tokyo' },
      { name: 'Indonesia', tz: 'Asia/Jakarta' } // Added for your location
    ]

    for (const timezone of timezones) {
      try {
        const currentTimeInTZ = new Date().toLocaleString('en-US', { timeZone: timezone.tz })
        const currentHour = new Date(currentTimeInTZ).getHours()
        
        console.log(`🌍 Checking ${timezone.name} (${timezone.tz}): ${currentHour}:00`)
        
        // Check if it's 6 AM in this timezone
        if (currentHour === 6) {
          console.log(`⏰ It's 6 AM in ${timezone.name}, processing notifications...`)
          const notificationsSent = await processNotificationsForTimezone(timezone.tz)
          totalNotificationsSent += notificationsSent
          
          results.push({
            timezone: timezone.name,
            hour: currentHour,
            notificationsSent
          })
        } else {
          results.push({
            timezone: timezone.name,
            hour: currentHour,
            notificationsSent: 0,
            note: 'Not 6 AM'
          })
        }
      } catch (error) {
        console.error(`❌ Error processing timezone ${timezone.name}:`, error)
        results.push({
          timezone: timezone.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    console.log(`✅ Daily notification cron completed. Sent ${totalNotificationsSent} notifications.`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Daily cron completed. Sent ${totalNotificationsSent} notifications`,
      timestamp: now.toISOString(),
      results
    })

  } catch (error) {
    console.error('❌ Error in daily notification cron:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function processNotificationsForTimezone(timezone: string): Promise<number> {
  try {
    console.log(`🌍 Processing notifications for timezone: ${timezone}`)

    // Get all users with FCM tokens (simplified approach)
    const { data: allTokens, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, token')

    if (tokensError) {
      console.error('❌ Error fetching FCM tokens:', tokensError)
      return 0
    }

    if (!allTokens || allTokens.length === 0) {
      console.log(`📭 No users with FCM tokens found`)
      return 0
    }

    // Group tokens by user
    const userTokensMap = new Map<string, string[]>()
    allTokens.forEach(tokenData => {
      if (!userTokensMap.has(tokenData.user_id)) {
        userTokensMap.set(tokenData.user_id, [])
      }
      userTokensMap.get(tokenData.user_id)!.push(tokenData.token)
    })

    console.log(`👥 Found ${userTokensMap.size} unique users with FCM tokens`)

    // Get all events in the next 24 hours (full event details)
    const upcomingEvents = await getEventsForNext24Hours()
    
    if (upcomingEvents.length === 0) {
      console.log(`📅 No events in next 24 hours, skipping notifications`)
      return 0
    }

    console.log(`📅 Found ${upcomingEvents.length} events in next 24 hours:`, 
      upcomingEvents.map(e => `"${e.title}" at ${e.start_date}`))

    let totalNotificationsSent = 0

    // Send individual notifications for each event to all users
    for (const event of upcomingEvents) {
      console.log(`📨 Processing event: "${event.title}" (${event.start_date})`)
      
      for (const [userId, tokens] of userTokensMap) {
        try {
          const success = await sendEventNotification(userId, tokens, event)
          if (success) {
            totalNotificationsSent++
          }
        } catch (error) {
          console.error(`❌ Error sending notification to user ${userId} for event ${event.id}:`, error)
        }
      }
    }

    return totalNotificationsSent

  } catch (error) {
    console.error(`❌ Error processing timezone ${timezone}:`, error)
    return 0
  }
}

async function getEventsForNext24Hours(): Promise<Array<{id: string, title: string, start_date: string, description?: string}>> {
  try {
    const now = new Date()
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    console.log(`📅 Checking for events between ${now.toISOString()} and ${next24Hours.toISOString()}`)

    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date, description')
      .gte('start_date', now.toISOString())
      .lte('start_date', next24Hours.toISOString())
      .order('start_date', { ascending: true })

    if (error) {
      console.error('❌ Error fetching events:', error)
      return []
    }

    return events || []
  } catch (error) {
    console.error('❌ Error checking events:', error)
    return []
  }
}

async function sendEventNotification(
  userId: string, 
  tokens: string[], 
  event: {id: string, title: string, start_date: string, description?: string}
): Promise<boolean> {
  try {
    if (tokens.length === 0) {
      console.log(`📭 No FCM tokens for user ${userId}`)
      return false
    }

    // Format the event time
    const eventDate = new Date(event.start_date)
    const now = new Date()
    const hoursUntil = Math.round((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60))
    
    // Create time-aware message
    let timeText = ''
    if (hoursUntil < 1) {
      timeText = 'starting soon'
    } else if (hoursUntil === 1) {
      timeText = 'in 1 hour'
    } else if (hoursUntil < 24) {
      timeText = `in ${hoursUntil} hours`
    } else {
      timeText = 'tomorrow'
    }

    const title = `📅 Upcoming Event: ${event.title}`
    const body = `Event "${event.title}" is ${timeText} (${eventDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })})`

    const message = {
      notification: {
        title,
        body
      },
      data: {
        type: 'event_reminder',
        event_id: event.id,
        event_title: event.title,
        event_start_date: event.start_date,
        hours_until: hoursUntil.toString(),
        timestamp: new Date().toISOString()
      },
      tokens
    }

    console.log(`📨 Sending event notification to user ${userId} for "${event.title}" (${tokens.length} tokens)`)

    const response = await admin.messaging().sendEachForMulticast(message)
    
    const successCount = response.successCount
    console.log(`📊 Event notification result for user ${userId}: ${successCount}/${tokens.length} successful`)

    // Log detailed errors
    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        console.error(`❌ Token ${idx + 1} failed:`, {
          code: resp.error.code,
          message: resp.error.message
        })
      }
    })

    // Remove invalid tokens
    if (response.failureCount > 0) {
      const invalidTokens: string[] = []
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(errorCode)) {
            invalidTokens.push(tokens[idx])
          }
        }
      })

      if (invalidTokens.length > 0) {
        console.log(`🧹 Removing ${invalidTokens.length} invalid tokens for user ${userId}`)
        await supabaseAdmin
          .from('fcm_tokens')
          .delete()
          .in('token', invalidTokens)
      }
    }

    // Log notification
    if (successCount > 0) {
      await supabaseAdmin
        .from('notifications_log')
        .insert({
          user_id: userId,
          title,
          body,
          data: { 
            type: 'event_reminder',
            event_id: event.id,
            event_title: event.title,
            event_start_date: event.start_date,
            hours_until: hoursUntil,
            success_count: successCount,
            failure_count: response.failureCount
          },
          status: 'sent'
        })
    }

    return successCount > 0
  } catch (error) {
    console.error('❌ Error sending event notification:', error)
    return false
  }
}

// Support POST requests too (for manual testing)
export async function POST(req: NextRequest) {
  console.log('📨 Manual cron trigger via POST')
  return GET(req)
}