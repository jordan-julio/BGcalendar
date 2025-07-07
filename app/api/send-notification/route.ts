// app/api/send-notification/route.ts
import { NextRequest, NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client (server-side)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for admin access
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userIds, title, body: messageBody, data, imageUrl } = body

    console.log('📤 API called with:', { userIds, title, messageBody })

    // Validate required fields
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'User IDs array is required' },
        { status: 400 }
      )
    }

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      )
    }

    console.log(`📤 Sending notification to ${userIds.length} users:`, { title, messageBody })

    // Get FCM tokens for specified users
    const { data: tokenData, error } = await supabase
      .from('fcm_tokens')
      .select('user_id, token')
      .in('user_id', userIds)

    if (error) {
      console.error('❌ Error fetching FCM tokens:', error)
      return NextResponse.json(
        { error: 'Failed to fetch FCM tokens', details: error.message },
        { status: 500 }
      )
    }

    if (!tokenData || tokenData.length === 0) {
      console.log('⚠️ No FCM tokens found for specified users')
      return NextResponse.json(
        { error: 'No FCM tokens found for specified users. Users need to enable notifications first.' },
        { status: 404 }
      )
    }

    const tokens = tokenData.map(item => item.token)
    console.log(`✅ Found ${tokens.length} FCM tokens`)

    // Check if Firebase Admin is initialized
    if (!admin.apps.length) {
      console.error('❌ Firebase Admin not initialized')
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      )
    }

    // Prepare the message
    const message = {
      notification: {
        title,
        body: messageBody,
        ...(imageUrl && { imageUrl })
      },
      data: {
        ...data,
        timestamp: new Date().toISOString()
      },
      tokens
    }

    console.log('📨 Sending FCM message:', { 
      title, 
      body: messageBody, 
      tokenCount: tokens.length 
    })

    // Send multicast message
    const response = await admin.messaging().sendEachForMulticast(message)

    console.log('✅ FCM Response:', {
      successCount: response.successCount,
      failureCount: response.failureCount
    })

    // Log successful notifications
    if (response.successCount > 0) {
      const notificationLogs = tokenData.map(tokenItem => ({
        user_id: tokenItem.user_id,
        title,
        body: messageBody,
        data: data || {},
        status: 'sent'
      }))

      const { error: logError } = await supabase
        .from('notifications_log')
        .insert(notificationLogs)

      if (logError) {
        console.error('❌ Error logging notifications:', logError)
      } else {
        console.log('✅ Notifications logged successfully')
      }
    }

    // Handle failed tokens (remove invalid tokens)
    if (response.failureCount > 0) {
      const failedTokens: string[] = []
      const invalidTokenErrors = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']
      
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          console.error(`❌ Failed to send to token ${idx}:`, resp.error.code)
          
          // Only remove tokens that are definitely invalid
          if (invalidTokenErrors.includes(resp.error.code)) {
            failedTokens.push(tokens[idx])
          }
        }
      })

      // Remove invalid tokens from database
      if (failedTokens.length > 0) {
        console.log(`🧹 Removing ${failedTokens.length} invalid tokens`)
        const { error: deleteError } = await supabase
          .from('fcm_tokens')
          .delete()
          .in('token', failedTokens)
        
        if (deleteError) {
          console.error('❌ Error removing invalid tokens:', deleteError)
        } else {
          console.log('✅ Invalid tokens removed successfully')
        }
      }
    }

    return NextResponse.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      messagesSent: response.successCount,
      totalTokens: tokens.length,
      message: `Sent ${response.successCount}/${tokens.length} notifications successfully`
    })

  } catch (error) {
    console.error('❌ Error in send-notification API:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to send notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to send notifications.' },
    { status: 405 }
  )
}