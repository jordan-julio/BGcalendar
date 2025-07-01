import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get current time
    const now = new Date()
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    
    const today = now.toISOString().slice(0, 10)
    const tomorrow = next24Hours.toISOString().slice(0, 10)

    // Get notifications that should be sent (due today or tomorrow and not yet sent)
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select(`
        *,
        event:events(*)
      `)
      .eq('user_id', userId)
      .in('notify_date', [today, tomorrow])
      .eq('sent', false)
      .order('notify_date', { ascending: true })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      )
    }

    // Filter notifications that should be sent now (within 24 hours)
    const dueNotifications = notifications?.filter(notification => {
      const eventDate = new Date(notification.event.start_date)
      const timeDiff = eventDate.getTime() - now.getTime()
      const hoursUntilEvent = timeDiff / (1000 * 60 * 60)
      
      // Send notifications for events happening within the next 24 hours
      return hoursUntilEvent <= 24 && hoursUntilEvent >= 0
    }) || []

    return NextResponse.json({
      notifications: dueNotifications,
      count: dueNotifications.length
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}