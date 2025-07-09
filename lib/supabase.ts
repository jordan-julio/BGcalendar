import { createBrowserClient } from '@supabase/ssr'

// Debug logging
console.log('=== SUPABASE CONFIG DEBUG ===')
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Supabase Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
console.log('Supabase Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length)
console.log('Environment:', process.env.NODE_ENV)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate configuration
if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing!')
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing!')
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
}

// Validate URL format
try {
  new URL(supabaseUrl)
  console.log('✅ Supabase URL format is valid')
} catch (error) {
  console.error('❌ Invalid Supabase URL format:', supabaseUrl)
  throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL format')
}

// Create client with better error handling
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-my-custom-header': 'bg-events-app'
    }
  }
})

// Test connection on initialization
const testConnection = async () => {
  try {
    console.log('🔄 Testing Supabase connection...')
    const { error } = await supabase.from('events').select('count').limit(1)
    
    if (error) {
      console.error('❌ Supabase connection test failed:', error)
    } else {
      console.log('✅ Supabase connection test successful')
    }
  } catch (error) {
    console.error('❌ Supabase connection test error:', error)
  }
}

// Test connection after a short delay to allow for initialization
if (typeof window !== 'undefined') {
  setTimeout(testConnection, 1000)
}

console.log('=== END SUPABASE CONFIG DEBUG ===')