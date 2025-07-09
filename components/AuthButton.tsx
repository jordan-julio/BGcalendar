'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { LogIn, LogOut } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AuthButton({ user }: { user: any }) {
  const router = useRouter()

  const handleSignIn = () => {
    router.push('/login')
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut().then(({ error }: { error: unknown }) => {
      router.refresh()
      return { error }
    })
    if (error) {
      console.error(error)
      return alert('Error signing out')
    }

  }

  return user ? (
    <div className="flex items-center gap-3">
      <div className="hidden sm:block">
        <p className="text-sm text-gray-600">{user.email}</p>
      </div>
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 transition-all shadow-sm hover:shadow"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign Out</span>
      </button>
    </div>
  ) : (
    <button
      onClick={handleSignIn}
      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-lg"
    >
      <LogIn className="h-4 w-4" />
      Sign In
    </button>
  )
}