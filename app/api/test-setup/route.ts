// app/api/test-setup/route.ts
import { NextResponse } from 'next/server'
import admin from 'firebase-admin'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasVapidKey: !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      hasCronSecret: !!process.env.CRON_SECRET
    },
    firebase: {
      adminInitialized: admin.apps.length > 0,
      apps: admin.apps.map(app => app?.name ?? 'unknown'),
      initializationError: undefined as string | undefined
    },
    supabase: {
      connectionTest: 'pending',
      error: undefined as string | undefined,
      tablesAccessible: undefined as boolean | undefined
    }
  }

  // Test Supabase connection
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Test query to check connection
    const { error } = await supabase
      .from('fcm_tokens')
      .select('count')
      .limit(1)

    if (error) {
      results.supabase = {
        connectionTest: 'failed',
        error: error.message,
        tablesAccessible: false
      }
    } else {
      results.supabase = {
        connectionTest: 'success',
        error: undefined,
        tablesAccessible: true
      }
    }
  } catch (error) {
    results.supabase = {
      connectionTest: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      tablesAccessible: false
    }
  }

  // Test Firebase Admin initialization
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
      })
      results.firebase.adminInitialized = true
    } catch (error) {
      results.firebase = {
        ...results.firebase,
        initializationError: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  return NextResponse.json(results, { 
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

export async function POST() {
  return NextResponse.json({
    message: 'This is a test endpoint. Use GET to check your setup status.',
    availableEndpoints: {
      'GET /api/test-setup': 'Check environment and service status',
      'POST /api/send-notification': 'Send FCM notifications',
      'POST /api/cron/daily-notifications': 'Daily notification cron job'
    }
  })
}