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

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Starting FCM diagnostic...')
    
    const body = await req.json()
    const { userId } = body

    const diagnostic = {
      timestamp: new Date().toISOString(),
      userId,
      firebaseAdmin: {
        initialized: admin.apps.length > 0,
        projectId: admin.apps[0]?.options?.projectId,
        clientEmail: admin.apps[0]?.options?.credential ? 'Set' : 'Missing'
      },
      tokens: [] as any[],
      testResults: [] as any[],
      errors: [] as string[]
    }

    // Get user's FCM tokens
    const { data: userTokens, error: tokensError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('*')
      .eq('user_id', userId)

    if (tokensError) {
      diagnostic.errors.push(`Token fetch error: ${tokensError.message}`)
      return NextResponse.json(diagnostic, { status: 500 })
    }

    if (!userTokens || userTokens.length === 0) {
      diagnostic.errors.push('No FCM tokens found for user')
      return NextResponse.json(diagnostic, { status: 404 })
    }

    diagnostic.tokens = userTokens.map(token => ({
      id: token.id,
      tokenPreview: token.token.substring(0, 20) + '...',
      created: token.created_at,
      deviceInfo: token.device_info
    }))

    // Test each token individually
    for (const tokenData of userTokens) {
      const testResult = {
        tokenId: tokenData.id,
        tokenPreview: tokenData.token.substring(0, 20) + '...',
        success: false,
        messageId: null as string | null,
        error: null as any,
        errorCode: null as string | null,
        errorMessage: null as string | null,
        timestamp: new Date().toISOString()
      }

      try {
        console.log(`🧪 Testing token: ${tokenData.token.substring(0, 20)}...`)

        // Send a test message to this specific token
        const message = {
          notification: {
            title: '🔍 FCM Diagnostic Test',
            body: `Testing FCM token for user ${userId.substring(0, 8)}...`,
          },
          data: {
            type: 'fcm_diagnostic',
            user_id: userId,
            test_timestamp: new Date().toISOString()
          },
          token: tokenData.token // Single token, not array
        }

        console.log(`📨 Sending test message to token...`)
        const response = await admin.messaging().send(message)
        
        testResult.success = true
        testResult.messageId = response
        console.log(`✅ Success! Message ID: ${response}`)

      } catch (error: any) {
        testResult.success = false
        testResult.error = {
          name: error.name,
          message: error.message,
          code: error.code,
          details: error.details || null
        }
        testResult.errorCode = error.code
        testResult.errorMessage = error.message

        console.error(`❌ Token test failed:`, {
          code: error.code,
          message: error.message,
          details: error.details
        })

        // Common FCM error codes and their meanings
        const errorExplanations = {
          'messaging/registration-token-not-registered': 'Token is invalid/expired - app was uninstalled or token expired',
          'messaging/invalid-registration-token': 'Token format is invalid',
          'messaging/mismatched-credential': 'Firebase project mismatch - check VAPID key',
          'messaging/invalid-argument': 'Message format is invalid',
          'messaging/authentication-error': 'Firebase Admin authentication failed',
          'messaging/server-unavailable': 'FCM service temporarily unavailable'
        } as const

        type FcmErrorCode = keyof typeof errorExplanations

        testResult.error.explanation =
          errorExplanations[(error.code as FcmErrorCode)] || 'Unknown FCM error'

        // If token is invalid, mark it for deletion
        if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
          try {
            await supabaseAdmin
              .from('fcm_tokens')
              .delete()
              .eq('id', tokenData.id)
            console.log(`🗑️ Deleted invalid token ${tokenData.id}`)
            testResult.error.action = 'Token deleted from database'
          } catch (deleteError) {
            console.error('Failed to delete invalid token:', deleteError)
          }
        }
      }

      diagnostic.testResults.push(testResult)
    }

    // Summary
    const successfulTests = diagnostic.testResults.filter(t => t.success).length
    const failedTests = diagnostic.testResults.filter(t => !t.success).length

    console.log(`📊 Diagnostic complete: ${successfulTests} successful, ${failedTests} failed`)

    return NextResponse.json({
      ...diagnostic,
      summary: {
        totalTokens: userTokens.length,
        successfulTokens: successfulTests,
        failedTokens: failedTests,
        allTokensWorking: successfulTests === userTokens.length
      }
    })

  } catch (error) {
    console.error('❌ Diagnostic error:', error)
    return NextResponse.json(
      {
        error: 'Diagnostic failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'FCM Diagnostic Tool',
    usage: 'POST with { "userId": "user-id" } to test FCM tokens for a specific user',
    description: 'Tests each FCM token individually to identify which ones are working'
  })
}