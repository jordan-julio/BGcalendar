/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

// Initialize Firebase Admin SDK
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
    console.log('🚀 Starting notification broadcast to all users with events...')
    
    const requestBody = await req.json()
    const { 
      testMode = false, 
      hoursAhead = 24,
      customTitle,
      customBody 
    } = requestBody

    // Get current time and future time
    const now = new Date()
    const futureTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000)

    console.log(`📅 Looking for events between ${now.toISOString()} and ${futureTime.toISOString()}`)

    // Step 1: Get all events in the next X hours
    const { data: upcomingEvents, error: eventsError } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date, created_by')
      .gte('start_date', now.toISOString())
      .lte('start_date', futureTime.toISOString())
      .order('start_date', { ascending: true })

    if (eventsError) {
      console.error('❌ Error fetching events:', eventsError)
      return NextResponse.json(
        { error: 'Failed to fetch events', details: eventsError.message },
        { status: 500 }
      )
    }

    console.log(`📊 Found ${upcomingEvents?.length || 0} events in next ${hoursAhead} hours`)

    if (!upcomingEvents || upcomingEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No events found in next ${hoursAhead} hours`,
        results: {
          eventsFound: 0,
          usersNotified: 0,
          notificationsSent: 0,
          errors: []
        }
      })
    }

    // Step 2: Get all users with FCM tokens
    const { data: allTokens, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('user_id, token, created_at')

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
          notificationsSent: 0,
          errors: ['No FCM tokens found']
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

    // Step 3: Send notifications to all users
    const results = {
      eventsFound: upcomingEvents.length,
      usersProcessed: userTokensMap.size,
      usersNotified: 0,
      notificationsSent: 0,
      failedUsers: 0,
      errors: [] as string[],
      users: [] as any[],
      detailedErrors: [] as any[] // NEW: Detailed error tracking
    }

    const eventTitles = upcomingEvents.map(e => e.title).slice(0, 3)
    const moreEventsCount = upcomingEvents.length > 3 ? upcomingEvents.length - 3 : 0

    // Create notification content
    const title = customTitle || (testMode ? '📅 Upcoming Events' : '📅 Upcoming Events')
    let notificationBody = customBody
    
    if (!notificationBody) {
      if (upcomingEvents.length === 1) {
        notificationBody = testMode 
          ? `"Event ${upcomingEvents[0].title}" is coming up in the next ${hoursAhead} hours`
          : `"Event ${upcomingEvents[0].title}" is coming up in the next ${hoursAhead} hours`
      } else {
        const eventsList = eventTitles.join(', ')
        const moreText = moreEventsCount > 0 ? ` and ${moreEventsCount} more` : ''
        notificationBody = testMode
          ? `${upcomingEvents.length} events coming up: ${eventsList}${moreText}`
          : `${upcomingEvents.length} events coming up: ${eventsList}${moreText}`
      }
    }

    console.log('📝 Notification payload:', { title, body: notificationBody })

    // Process each user
    for (const [userId, tokens] of userTokensMap) {
      const userResult = {
        userId,
        tokenCount: tokens.length,
        notificationSent: false,
        error: null as string | null,
        fcmResponse: null as any,
        tokens: tokens.map(t => t.substring(0, 20) + '...') // Truncated for debugging
      }

      try {
        console.log(`📨 Sending notification to user ${userId} with ${tokens.length} tokens`)
        
        // NEW: Validate tokens before sending
        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i]
          if (!token || token.length < 100) {
            console.error(`❌ Invalid token format for user ${userId}, token ${i}:`, token?.substring(0, 50))
            results.detailedErrors.push({
              userId,
              tokenIndex: i,
              error: 'Invalid token format',
              token: token?.substring(0, 50)
            })
          }
        }

        const message = {
          notification: {
            title,
            body: notificationBody,
          },
          data: {
            type: testMode ? 'broadcast_test' : 'broadcast_reminder',
            events_count: upcomingEvents.length.toString(),
            timestamp: new Date().toISOString(),
            test_mode: testMode.toString()
            // REMOVED: events_data JSON to avoid payload issues
          },
          tokens
        }

        console.log(`📤 Sending message with payload size check:`, {
          titleLength: title.length,
          bodyLength: notificationBody.length,
          dataKeys: Object.keys(message.data),
          tokenCount: tokens.length
        })

        const response = await admin.messaging().sendEachForMulticast(message)
        userResult.fcmResponse = {
          successCount: response.successCount,
          failureCount: response.failureCount
        }

        console.log(`📊 FCM Response for user ${userId}:`, {
          successCount: response.successCount,
          failureCount: response.failureCount
        })

        // NEW: Detailed error logging
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error) {
            const errorDetails = {
              userId,
              tokenIndex: idx,
              token: tokens[idx].substring(0, 20) + '...',
              errorCode: resp.error.code,
              errorMessage: resp.error.message,
              timestamp: new Date().toISOString()
            }
            
            console.error(`❌ Token ${idx + 1} failed:`, errorDetails)
            results.detailedErrors.push(errorDetails)
          } else if (resp.success) {
            console.log(`✅ Token ${idx + 1} succeeded for user ${userId}`)
          }
        })

        if (response.successCount > 0) {
          userResult.notificationSent = true
          results.usersNotified++
          results.notificationsSent += response.successCount

          // Log notification to database
          await supabaseAdmin
            .from('notifications_log')
            .insert({
              user_id: userId,
              title,
              body: notificationBody,
              data: {
                type: testMode ? 'broadcast_test' : 'broadcast_reminder',
                events_count: upcomingEvents.length,
                test_mode: testMode,
                success_count: response.successCount,
                failure_count: response.failureCount
              },
              status: 'sent'
            })
        } else {
          userResult.error = 'All tokens failed'
          results.failedUsers++
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
        userResult.error = errorMsg
        results.errors.push(`User ${userId}: ${errorMsg}`)
        results.failedUsers++
        
        // NEW: Add to detailed errors
        results.detailedErrors.push({
          userId,
          error: 'Exception thrown',
          message: errorMsg,
          timestamp: new Date().toISOString()
        })
      }

      results.users.push(userResult)
    }

    console.log(`✅ Broadcast completed. Sent ${results.notificationsSent} notifications to ${results.usersNotified} users`)
    console.log(`📋 Detailed errors:`, results.detailedErrors)

    return NextResponse.json({
      success: true,
      message: `Sent notifications to ${results.usersNotified}/${results.usersProcessed} users about ${results.eventsFound} upcoming events`,
      results,
      events: upcomingEvents.map(e => ({
        id: e.id,
        title: e.title,
        start_date: e.start_date
      })),
      // NEW: Include detailed debugging info
      debug: {
        detailedErrors: results.detailedErrors,
        notificationPayload: {
          title,
          icon: '/calendar-icon.png', // Optional icon for the notification
          badge: '/badge-icon.png', // Optional badge for the notification
          body: notificationBody,
          titleLength: title.length,
          bodyLength: notificationBody.length
        }
      }
    })

  } catch (error) {
    console.error('❌ Error in broadcast notification:', error)
    return NextResponse.json(
      {
        error: 'Failed to send broadcast notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Broadcast Notification Endpoint',
    usage: 'Send POST request to broadcast notifications to all users with events',
    parameters: {
      testMode: 'boolean - Add [TEST] prefix to notifications',
      hoursAhead: 'number - Hours to look ahead for events (default: 24)',
      customTitle: 'string - Custom notification title',
      customBody: 'string - Custom notification body'
    },
    examples: {
      'Test all users': 'POST with { "testMode": true }',
      'Custom timeframe': 'POST with { "hoursAhead": 48 }',
      'Custom message': 'POST with { "customTitle": "Event Alert", "customBody": "Check your calendar!" }'
    }
  })
}