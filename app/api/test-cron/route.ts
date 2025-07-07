/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/test-cron/route.ts
import { NextResponse } from 'next/server'
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
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error)
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

export async function POST() {
  try {
    console.log('🧪 Starting TEST daily notification check...')

    // First, let's check if Firebase Admin is properly initialized
    console.log('🔍 Checking Firebase Admin initialization...')
    console.log('Admin apps length:', admin.apps.length)

    // Check environment variables
    console.log('🔍 Checking environment variables...')
    console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing')
    console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing')
    console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Set' : '❌ Missing')

    const now = new Date()
    let totalNotificationsSent = 0
    const testResults = {
      timestamp: now.toISOString(),
      totalUsers: 0,
      usersWithTokens: 0,
      usersWithEvents: 0,
      notificationsSent: 0,
      users: [] as any[],
      errors: [] as string[],
      debug: {
        firebaseAdminApps: admin.apps.length,
        environmentCheck: {
          projectId: !!process.env.FIREBASE_PROJECT_ID,
          clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: !!process.env.FIREBASE_PRIVATE_KEY
        }
      }
    }

    // For testing, we'll check ALL users regardless of timezone and time preferences
    // Get all users with FCM tokens
    console.log('🔍 Fetching users with FCM tokens...')
    const { data: usersWithTokens, error: usersError } = await supabaseAdmin
      .from('fcm_tokens')
      .select(`
        user_id,
        token,
        created_at
      `)

    if (usersError) {
      console.error('❌ Error fetching users with tokens:', usersError)
      testResults.errors.push(`Error fetching users: ${usersError.message}`)
      return NextResponse.json(testResults, { status: 500 })
    }

    if (!usersWithTokens || usersWithTokens.length === 0) {
      console.log('⚠️ No users with FCM tokens found')
      testResults.errors.push('No users with FCM tokens found')
      return NextResponse.json(testResults, { status: 404 })
    }

    console.log(`✅ Found ${usersWithTokens.length} FCM token records`)

    // Group tokens by user_id
    const userTokensMap = new Map()
    usersWithTokens.forEach(tokenData => {
      if (!userTokensMap.has(tokenData.user_id)) {
        userTokensMap.set(tokenData.user_id, [])
      }
      userTokensMap.get(tokenData.user_id).push(tokenData.token)
    })

    testResults.totalUsers = userTokensMap.size
    testResults.usersWithTokens = userTokensMap.size

    console.log(`✅ Found ${testResults.totalUsers} unique users with FCM tokens`)

    // Process each user
    for (const [userId, tokens] of userTokensMap) {
      console.log(`\n🔍 Processing user: ${userId}`)
      
      const userResult = {
        userId,
        tokenCount: tokens.length,
        eventsCount: 0,
        notificationSent: false,
        error: null as string | null,
        debug: {
          tokensPreview: tokens.map((t: string) => t.substring(0, 20) + '...')
        }
      }

      try {
        // Check if user has events in next 24 hours
        console.log(`📅 Checking events for user ${userId}...`)
        const eventsCount = await checkUserEventsForNext24Hours(userId)
        userResult.eventsCount = eventsCount
        console.log(`📊 User ${userId} has ${eventsCount} events in next 24 hours`)

        if (eventsCount > 0) {
          testResults.usersWithEvents++
          
          console.log(`🚀 Attempting to send notification to user ${userId}...`)
          // Send notification
          const success = await sendTestDailyReminderNotification(userId, tokens, eventsCount)
          userResult.notificationSent = success
          
          console.log(`📊 Notification result for user ${userId}: ${success ? 'SUCCESS' : 'FAILED'}`)
          
          if (success) {
            totalNotificationsSent++
            testResults.notificationsSent++
          } else {
            userResult.error = 'Notification sending failed - check logs for details'
          }
        } else {
          console.log(`⏭️ Skipping user ${userId} - no events in next 24 hours`)
          userResult.error = 'No events in next 24 hours'
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Error processing user ${userId}:`, error)
        userResult.error = errorMsg
        testResults.errors.push(`User ${userId}: ${errorMsg}`)
      }

      testResults.users.push(userResult)
    }

    console.log(`\n✅ TEST notification check completed. Sent ${totalNotificationsSent} notifications.`)

    return NextResponse.json({
      success: true,
      message: `Sent ${totalNotificationsSent} notifications to ${testResults.usersWithEvents} users with events`,
      ...testResults
    })

  } catch (error) {
    console.error('❌ Error in TEST notification cron:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function checkUserEventsForNext24Hours(userId: string): Promise<number> {
  try {
    const now = new Date()
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('id, title, start_date')
      .gte('start_date', now.toISOString())
      .lte('start_date', next24Hours.toISOString())
      .order('start_date', { ascending: true })

    if (error) {
      console.error('Error fetching events:', error)
      return 0
    }

    console.log(`📅 User ${userId}: Found ${events?.length || 0} events in next 24 hours`)
    return events?.length || 0
  } catch (error) {
    console.error('Error checking user events:', error)
    return 0
  }
}

async function sendTestDailyReminderNotification(userId: string, tokens: string[], eventsCount: number): Promise<boolean> {
  try {
    if (tokens.length === 0) {
      console.log(`No FCM tokens for user ${userId}`)
      return false
    }

    console.log(`🔍 DEBUG: Starting notification send for user ${userId}`)
    console.log(`🔍 DEBUG: Tokens to send to:`, tokens.map(t => t.substring(0, 20) + '...'))

    // Check if Firebase Admin is properly initialized
    if (!admin.apps.length) {
      console.error('❌ Firebase Admin not initialized!')
      throw new Error('Firebase Admin not initialized')
    }

    console.log(`✅ Firebase Admin is initialized: ${admin.apps[0]?.name}`)

    const title = 'Daily Calendar Reminder'
    const body = `You have ${eventsCount} event${eventsCount > 1 ? 's' : ''} coming up in the next 24 hours`

    const message = {
      notification: {
        title,
        body,
        icon: '/calendar-icon.png', // Optional icon for the notification
        badge: '/badge-icon.png', // Optional badge for the notification
      },
      data: {
        type: 'test_daily_reminder',
        events_count: eventsCount.toString(),
        timestamp: new Date().toISOString(),
        test_mode: 'true'
      },
      tokens
    }

    console.log(`📨 DEBUG: Prepared message:`, {
      title,
      body,
      tokenCount: tokens.length,
      data: message.data
    })

    try {
      console.log(`🚀 DEBUG: Calling Firebase Admin messaging().sendEachForMulticast()...`)
      const response = await admin.messaging().sendEachForMulticast(message)
      
      console.log(`📊 DEBUG: FCM Response received:`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses.length
      })

      // Log detailed response for each token
      response.responses.forEach((resp, idx) => {
        if (resp.success) {
          console.log(`✅ Token ${idx + 1}: SUCCESS - Message ID: ${resp.messageId}`)
        } else {
          console.error(`❌ Token ${idx + 1}: FAILED - Error:`, {
            code: resp.error?.code,
            message: resp.error?.message,
            details: resp.error
          })
        }
      })

      const successCount = response.responses.filter(r => r.success).length
      console.log(`📈 Final result: ${successCount}/${tokens.length} notifications sent successfully`)

      // Log the test notification
      try {
        const { error: logError } = await supabaseAdmin
          .from('notifications_log')
          .insert({
            user_id: userId,
            title,
            body,
            data: { 
              type: 'test_daily_reminder', 
              events_count: eventsCount, 
              test_mode: true,
              fcm_response: {
                successCount: response.successCount,
                failureCount: response.failureCount
              }
            },
            status: successCount > 0 ? 'sent' : 'failed'
          })

        if (logError) {
          console.error('❌ Error logging test notification:', logError)
        } else {
          console.log('✅ Test notification logged to database')
        }
      } catch (logErr) {
        console.error('❌ Exception logging test notification:', logErr)
      }

      return successCount > 0

    } catch (fcmError) {
      if (fcmError && typeof fcmError === 'object') {
        console.error('❌ FCM Sending Error:', {
          name: (fcmError as any).name,
          message: (fcmError as any).message,
          code: (fcmError as any).code,
          stack: (fcmError as any).stack
        })
      } else {
        console.error('❌ FCM Sending Error:', fcmError)
      }
      throw fcmError
    }

  } catch (error) {
    console.error('❌ Error in sendTestDailyReminderNotification:', {
      userId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    return false
  }
}

// Handle GET requests for easy browser testing
export async function GET() {
  return NextResponse.json({
    message: 'Daily Notification Test Endpoint',
    usage: 'Send a POST request to trigger a test of the daily notification system',
    note: 'This will send notifications to ALL users with events in the next 24 hours, regardless of their timezone preferences',
    endpoints: {
      'POST /api/test-cron': 'Trigger test notifications',
      'GET /api/test-setup': 'Check environment setup',
      'POST /api/send-notification': 'Send custom notification'
    }
  })
}