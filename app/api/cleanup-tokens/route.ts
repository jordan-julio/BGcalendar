// app/api/cleanup-tokens/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    console.log('🧹 Starting cleanup of all FCM tokens...')

    // Get all FCM tokens
    const { data: allTokens, error: fetchError } = await supabaseAdmin
      .from('fcm_tokens')
      .select('id, user_id, token, created_at')

    if (fetchError) {
      console.error('❌ Error fetching tokens:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
    }

    if (!allTokens || allTokens.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No tokens found to clean up',
        removed: 0
      })
    }

    console.log(`📊 Found ${allTokens.length} tokens to review`)

    // Remove all existing tokens (they're likely invalid)
    const { error: deleteError } = await supabaseAdmin
      .from('fcm_tokens')
      .delete()
      .neq('id', 0) // Delete all records

    if (deleteError) {
      console.error('❌ Error deleting tokens:', deleteError)
      return NextResponse.json({ error: 'Failed to delete tokens' }, { status: 500 })
    }

    console.log(`✅ Removed ${allTokens.length} potentially invalid tokens`)

    return NextResponse.json({
      success: true,
      message: `Removed ${allTokens.length} tokens. Users will need to re-enable notifications.`,
      removed: allTokens.length,
      affectedUsers: [...new Set(allTokens.map(t => t.user_id))].length
    })

  } catch (error) {
    console.error('❌ Error in cleanup:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup tokens' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'FCM Token Cleanup Endpoint',
    usage: 'Send POST request to remove all existing FCM tokens',
    warning: 'This will require all users to re-enable notifications'
  })
}