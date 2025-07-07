/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { Clock, Bell, Play, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import Link from 'next/link'

export default function BroadcastTestPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [testMode, setTestMode] = useState(true)
  const [hoursAhead, setHoursAhead] = useState(24)
  const [customTitle, setCustomTitle] = useState('')
  const [customBody, setCustomBody] = useState('')

  const runBroadcast = async () => {
    setLoading(true)
    setResults(null)

    try {
      console.log('🚀 Starting broadcast test...')
      
      const response = await fetch('/api/send-notification-to-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testMode,
          hoursAhead,
          customTitle: customTitle.trim() || undefined,
          customBody: customBody.trim() || undefined
        })
      })

      const data = await response.json()
      console.log('📊 Broadcast results:', data)
      
      setResults({
        success: response.ok,
        data,
        timestamp: new Date()
      })

    } catch (error) {
      console.error('❌ Broadcast failed:', error)
      setResults({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
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
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center">
              <Bell className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Broadcast Notifications</h1>
              <p className="text-gray-600">Send notifications to all users about upcoming events</p>
            </div>
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Test Mode */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">Test Mode</span>
                  <p className="text-xs text-gray-500">Add [TEST] prefix to notifications</p>
                </div>
              </label>
            </div>

            {/* Hours Ahead */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                <Clock className="inline h-4 w-4 mr-1" />
                Hours Ahead
              </label>
              <input
                type="number"
                value={hoursAhead}
                onChange={(e) => setHoursAhead(Number(e.target.value))}
                min="1"
                max="168"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Look for events in the next X hours</p>
            </div>

            {/* Custom Title */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Custom Title (optional)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Leave empty for auto-generated title"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Custom Body */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Custom Message (optional)
              </label>
              <textarea
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                placeholder="Leave empty for auto-generated message"
                rows={2}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Send Button */}
          <div className="mt-8 text-center">
            <button
              onClick={runBroadcast}
              disabled={loading}
              className="inline-flex items-center gap-3 px-8 py-4 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg font-medium"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                  Sending Broadcast...
                </>
              ) : (
                <>
                  <Play className="h-6 w-6" />
                  Send Broadcast Notification
                </>
              )}
            </button>
          </div>

          {/* Warning */}
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm font-bold">!</span>
              </div>
              <div>
                <h4 className="font-medium text-amber-800 mb-1">Important</h4>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>• This sends notifications to ALL users with FCM tokens</li>
                  <li>• Only sends if there are events in the specified timeframe</li>
                  <li>• Use test mode for testing to avoid spamming users</li>
                  <li>• All notifications are logged to the database</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              {results.success ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <XCircle className="h-8 w-8 text-red-600" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Broadcast Results</h2>
                <p className="text-sm text-gray-500">
                  {results.timestamp.toLocaleString()}
                </p>
              </div>
            </div>

            {results.success ? (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      {results.data.results?.eventsFound || 0}
                    </div>
                    <div className="text-sm text-blue-800">Events Found</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {results.data.results?.usersNotified || 0}
                    </div>
                    <div className="text-sm text-green-800">Users Notified</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600 mb-1">
                      {results.data.results?.notificationsSent || 0}
                    </div>
                    <div className="text-sm text-orange-800">Notifications Sent</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600 mb-1">
                      {results.data.results?.failedUsers || 0}
                    </div>
                    <div className="text-sm text-red-800">Failed Users</div>
                  </div>
                </div>

                {/* Events */}
                {results.data.events && results.data.events.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Upcoming Events</h3>
                    <div className="space-y-3">
                      {results.data.events.map((event: any) => (
                        <div key={event.id} className="p-3 bg-blue-50 rounded-lg">
                          <div className="font-medium text-blue-900">{event.title}</div>
                          <div className="text-sm text-blue-700">
                            {new Date(event.start_date).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* User Results */}
                {results.data.results?.users && results.data.results.users.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">User Results</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {results.data.results.users.map((user: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              user.notificationSent ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                User: {user.userId.substring(0, 8)}...
                              </div>
                              <div className="text-xs text-gray-500">
                                {user.tokenCount} token{user.tokenCount !== 1 ? 's' : ''}
                                {user.fcmResponse && (
                                  <> • {user.fcmResponse.successCount}/{user.tokenCount} sent</>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            {user.notificationSent ? (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Sent</span>
                            ) : (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Failed</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {results.data.results?.errors && results.data.results.errors.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Errors</h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <ul className="text-sm text-red-700 space-y-1">
                        {results.data.results.errors.map((error: string, idx: number) => (
                          <li key={idx}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">Broadcast Failed</h3>
                <p className="text-sm text-red-700">
                  {results.error || 'Unknown error occurred'}
                </p>
                <pre className="text-xs text-red-600 mt-2 overflow-x-auto">
                  {JSON.stringify(results.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Additional Links */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-4 text-sm text-gray-500">
            <Link href="/debug" className="hover:text-gray-700">FCM Debug</Link>
            <span>•</span>
            <Link href="/test-cron" className="hover:text-gray-700">Cron Test</Link>
            <span>•</span>
            <Link href="/api/test-setup" target="_blank" className="hover:text-gray-700">Setup Check</Link>
          </div>
        </div>
      </div>
    </div>
  )
}