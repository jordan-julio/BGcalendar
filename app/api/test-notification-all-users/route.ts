/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/test-event-notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

// Initialize Firebase Admin (reuse from your other files)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    })
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error)
  }
}

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

export async function GET(_req: NextRequest) {
  try {
    console.log('🧪 Testing individual event notifications...')

    // Get all upcoming events in next 24 hours
    const now = new Date()
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: upcomingEvents, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date, description')
      .gte('start_date', now.toISOString())
      .lte('start_date', next24Hours.toISOString())
      .order('start_date', { ascending: true })

    if (eventsError) {
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    if (!upcomingEvents || upcomingEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No upcoming events found in next 24 hours',
        events: [],
        notifications: []
      })
    }

    // Get all users with FCM tokens
    const { data: allTokens, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, token')

    if (tokensError || !allTokens || allTokens.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No users with FCM tokens found',
        events: upcomingEvents,
        notifications: []
      })
    }

    // Group tokens by user
    const userTokensMap = new Map<string, string[]>()
    allTokens.forEach(tokenData => {
      if (!userTokensMap.has(tokenData.user_id)) {
        userTokensMap.set(tokenData.user_id, [])
      }
      userTokensMap.get(tokenData.user_id)!.push(tokenData.token)
    })

    console.log(`📅 Found ${upcomingEvents.length} events and ${userTokensMap.size} users`)

    const results = []
    let totalNotificationsSent = 0

    // Send notification for each event to each user
    for (const event of upcomingEvents) {
      console.log(`📨 Processing event: "${event.title}"`)
      
      const eventResults = {
        event: {
          id: event.id,
          title: event.title,
          start_date: event.start_date
        },
        userNotifications: [] as unknown[],
        totalSent: 0,
        totalFailed: 0
      }

      for (const [userId, tokens] of userTokensMap) {
        try {
          const success = await sendTestEventNotification(userId, tokens, event)
          
          if (success) {
            eventResults.totalSent++
            totalNotificationsSent++
          } else {
            eventResults.totalFailed++
          }

          eventResults.userNotifications.push({
            userId,
            tokenCount: tokens.length,
            success
          })

        } catch (error) {
          console.error(`❌ Error for user ${userId}:`, error)
          eventResults.totalFailed++
          eventResults.userNotifications.push({
            userId,
            tokenCount: tokens.length,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      results.push(eventResults)
    }

    return NextResponse.json({
      success: true,
      message: `Test completed. Sent ${totalNotificationsSent} notifications for ${upcomingEvents.length} events to ${userTokensMap.size} users`,
      summary: {
        eventsFound: upcomingEvents.length,
        usersFound: userTokensMap.size,
        totalNotificationsSent,
        totalPossible: upcomingEvents.length * userTokensMap.size
      },
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Error testing event notifications:', error)
    return NextResponse.json(
      { 
        error: 'Failed to test event notifications',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function sendTestEventNotification(
  userId: string, 
  tokens: string[], 
  event: {id: string, title: string, start_date: string, description?: string}
): Promise<boolean> {
  try {
    if (tokens.length === 0) return false

    const eventDate = new Date(event.start_date)
    const now = new Date()
    const hoursUntil = Math.round((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60))
    
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

    const title = `${event.title}`
    const body = `Event "${event.title}" is ${timeText} (${eventDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })})`

    const message = {
      notification: { title, body },
      data: {
        type: 'test_event_reminder',
        event_id: event.id,
        event_title: event.title,
        event_start_date: event.start_date,
        hours_until: hoursUntil.toString(),
        timestamp: new Date().toISOString()
      },
      tokens
    }

    const response = await admin.messaging().sendEachForMulticast(message)
    return response.successCount > 0
    
  } catch (error) {
    console.error('❌ Error sending test notification:', error)
    return false
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}