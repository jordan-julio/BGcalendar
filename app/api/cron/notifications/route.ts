/* eslint-disable @typescript-eslint/no-unused-vars */
// Core logic for sending notifications for events in the next 24 hours
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
    console.log('✅ Firebase Admin SDK initialized')
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

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Starting 24-hour event notification process...')
    
    // Get current time and 24 hours ahead
    const now = new Date()
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    console.log(`📅 Looking for events between ${now.toISOString()} and ${next24Hours.toISOString()}`)

    // Step 1: Get all events in the next 24 hours
    const { data: upcomingEvents, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date, description')
      .gte('start_date', now.toISOString())
      .lte('start_date', next24Hours.toISOString())
      .order('start_date', { ascending: true })

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError)
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      )
    }

    console.log(`📊 Found ${upcomingEvents?.length || 0} events in next 24 hours`)

    if (!upcomingEvents || upcomingEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No events found in next 24 hours',
        results: {
          eventsFound: 0,
          usersNotified: 0,
          notificationsSent: 0
        }
      })
    }

    // Step 2: Get all users with FCM tokens
    const { data: allTokens, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, token')

    if (tokensError) {
      console.error('❌ Error fetching FCM tokens:', tokensError)
      return NextResponse.json(
        { error: 'Failed to fetch FCM tokens', details: tokensError.message },
        { status: 500 }
      )
    }

    if (!allTokens || allTokens.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users with FCM tokens found',
        results: {
          eventsFound: upcomingEvents.length,
          usersNotified: 0,
          notificationsSent: 0
        }
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

    console.log(`👥 Found ${userTokensMap.size} unique users with FCM tokens`)

    // Step 3: Send notifications to all users about upcoming events
    let totalNotificationsSent = 0
    let usersNotified = 0
    const errors: string[] = []

    // Create notification content
    const eventTitles = upcomingEvents.map(e => e.title).slice(0, 3)
    const moreEventsCount = upcomingEvents.length > 3 ? upcomingEvents.length - 3 : 0

    const title = '📅 Upcoming Events'
    let notificationBody: string
    
    if (upcomingEvents.length === 1) {
      notificationBody = `"${upcomingEvents[0].title}" is coming up in the next 24 hours`
    } else {
      const eventsList = eventTitles.join(', ')
      const moreText = moreEventsCount > 0 ? ` and ${moreEventsCount} more` : ''
      notificationBody = `${upcomingEvents.length} events coming up: ${eventsList}${moreText}`
    }

    console.log('📝 Notification payload:', { title, body: notificationBody })

    // Process each user
    for (const [userId, tokens] of userTokensMap) {
      try {
        console.log(`📨 Sending notification to user ${userId} with ${tokens.length} tokens`)
        
        const message = {
          notification: {
            title,
            body: notificationBody,
          },
          data: {
            type: 'events_reminder',
            events_count: upcomingEvents.length.toString(),
            timestamp: new Date().toISOString()
          },
          tokens
        }

        const response = await admin.messaging().sendEachForMulticast(message)
        
        console.log(`📊 FCM Response for user ${userId}:`, {
          successCount: response.successCount,
          failureCount: response.failureCount
        })

        // Track successful notifications
        if (response.successCount > 0) {
          usersNotified++
          totalNotificationsSent += response.successCount

          // Log notification to database
          await supabaseAdmin
            .from('notifications_log')
            .insert({
              user_id: userId,
              title,
              body: notificationBody,
              data: {
                type: 'events_reminder',
                events_count: upcomingEvents.length,
                success_count: response.successCount,
                failure_count: response.failureCount
              },
              status: 'sent'
            })
        }

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

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Error sending notification to user ${userId}:`, error)
        errors.push(`User ${userId}: ${errorMsg}`)
      }
    }

    console.log(`✅ Notification process completed. Sent ${totalNotificationsSent} notifications to ${usersNotified} users`)

    return NextResponse.json({
      success: true,
      message: `Sent notifications to ${usersNotified}/${userTokensMap.size} users about ${upcomingEvents.length} upcoming events`,
      results: {
        eventsFound: upcomingEvents.length,
        usersNotified,
        notificationsSent: totalNotificationsSent,
        errors
      },
      events: upcomingEvents.map(e => ({
        id: e.id,
        title: e.title,
        start_date: e.start_date
      }))
    })

  } catch (error) {
    console.error('❌ Error in notification process:', error)
    return NextResponse.json(
      {
        error: 'Failed to send notifications',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}