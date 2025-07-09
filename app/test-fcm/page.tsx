/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TestTube, CheckCircle, XCircle, Loader, ArrowLeft, User } from 'lucide-react'
import Link from 'next/link'

export default function FCMDiagnosticPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null)

  // Initialize auth
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user ?? null)
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setAuthLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const runDiagnostic = async () => {
    if (!user) return

    setLoading(true)
    setDiagnosticResults(null)

    try {
      console.log('🔍 Running FCM diagnostic...')
      
      const response = await fetch('/api/diagnose-fcm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user.id })
      })

      const data = await response.json()
      console.log('📊 Diagnostic results:', data)
      
      setDiagnosticResults({
        success: response.ok,
        data,
        timestamp: new Date()
      })

    } catch (error) {
      console.error('❌ Diagnostic failed:', error)
      setDiagnosticResults({
        success: false,
        error: error && typeof error === 'object' && 'message' in error ? (error as { message: string }).message : String(error),
        timestamp: new Date()
      })
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Please sign in to run FCM diagnostics</p>
          <Link href="/" className="text-blue-600 hover:underline">Go to Calendar</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Calendar
          </Link>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <TestTube className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">FCM Token Diagnostic</h1>
              <p className="text-gray-600">Test each FCM token individually to identify issues</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">User Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-gray-900">{user.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">User ID</p>
              <p className="text-xs font-mono text-gray-900 break-all">{user.id}</p>
            </div>
          </div>
        </div>

        {/* Test Button */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Run FCM Token Test</h2>
          <p className="text-gray-600 mb-6">
            This will test each of your FCM tokens individually to identify which ones are working
            and which ones might be causing notification failures.
          </p>
          
          <button
            onClick={runDiagnostic}
            disabled={loading}
            className="inline-flex items-center gap-3 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {loading ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Running Diagnostic...
              </>
            ) : (
              <>
                <TestTube className="h-5 w-5" />
                Test My FCM Tokens
              </>
            )}
          </button>
        </div>

        {/* Results */}
        {diagnosticResults && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              {diagnosticResults.success ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Diagnostic Results</h2>
                <p className="text-sm text-gray-500">
                  {diagnosticResults.timestamp.toLocaleString()}
                </p>
              </div>
            </div>

            {diagnosticResults.success && diagnosticResults.data ? (
              <div className="space-y-6">
                {/* Summary */}
                {diagnosticResults.data.summary && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {diagnosticResults.data.summary.totalTokens}
                      </div>
                      <div className="text-sm text-blue-800">Total Tokens</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600 mb-1">
                        {diagnosticResults.data.summary.successfulTokens}
                      </div>
                      <div className="text-sm text-green-800">Working</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-red-600 mb-1">
                        {diagnosticResults.data.summary.failedTokens}
                      </div>
                      <div className="text-sm text-red-800">Failed</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                      <div className="text-sm font-bold text-purple-600 mb-1">
                        {diagnosticResults.data.summary.allTokensWorking ? '✅' : '❌'}
                      </div>
                      <div className="text-sm text-purple-800">All Working</div>
                    </div>
                  </div>
                )}

                {/* Token Test Results */}
                {diagnosticResults.data.testResults && diagnosticResults.data.testResults.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Individual Token Results</h3>
                    <div className="space-y-4">
                      {diagnosticResults.data.testResults.map((result: any, idx: number) => (
                        <div key={idx} className={`p-4 rounded-lg border ${
                          result.success 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {result.success ? (
                                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                              )}
                              <div>
                                <p className="font-medium text-gray-900">
                                  Token {idx + 1}: {result.tokenPreview}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {result.success ? 'Working correctly' : 'Failed to send'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded ${
                              result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {result.success ? 'Success' : 'Failed'}
                            </span>
                          </div>

                          {result.success ? (
                            <div className="text-sm text-green-700">
                              <p>✅ Message sent successfully</p>
                              <p className="font-mono">Message ID: {result.messageId}</p>
                            </div>
                          ) : (
                            <div className="text-sm text-red-700 space-y-2">
                              <p><strong>Error:</strong> {result.errorMessage}</p>
                              <p><strong>Code:</strong> {result.errorCode}</p>
                              {result.error?.explanation && (
                                <p><strong>Explanation:</strong> {result.error.explanation}</p>
                              )}
                              {result.error?.action && (
                                <p className="text-orange-700"><strong>Action:</strong> {result.error.action}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">💡 Recommendations</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {diagnosticResults.data.summary?.allTokensWorking ? (
                      <li>✅ All your FCM tokens are working correctly!</li>
                    ) : (
                      <>
                        <li>• Invalid tokens have been automatically removed from the database</li>
                        <li>• Try refreshing the page and generating new FCM tokens</li>
                        <li>• Check that your VAPID key matches between client and server</li>
                        <li>• Make sure notification permissions are granted in your browser</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">Diagnostic Failed</h3>
                <p className="text-sm text-red-700">
                  {diagnosticResults.error || 'Unknown error occurred'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-4 text-sm text-gray-500">
            <Link href="/debug" className="hover:text-gray-700">FCM Debug</Link>
            <span>•</span>
            <Link href="/broadcast-test" className="hover:text-gray-700">Broadcast Test</Link>
            <span>•</span>
            <Link href="/api/test-setup" target="_blank" className="hover:text-gray-700">Setup Check</Link>
          </div>
        </div>
      </div>
    </div>
  )
}