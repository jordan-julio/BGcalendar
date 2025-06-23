'use client';

import { useState, useEffect } from 'react';

// Mock event data - replace with your API
const mockEvents = [
  {
    id: 1,
    title: 'Team Meeting',
    date: '2025-06-24',
    time: '10:00 AM',
    location: 'Conference Room A',
    description: 'Weekly team sync and project updates'
  },
  {
    id: 2,
    title: 'Training Session',
    date: '2025-06-25',
    time: '2:00 PM',
    location: 'Training Center',
    description: 'New software training for all members'
  },
  {
    id: 3,
    title: 'Company Lunch',
    date: '2025-06-26',
    time: '12:30 PM',
    location: 'Main Cafeteria',
    description: 'Monthly company lunch gathering'
  },
  {
    id: 4,
    title: 'Board Meeting',
    date: '2025-06-28',
    time: '9:00 AM',
    location: 'Executive Boardroom',
    description: 'Quarterly board meeting and presentations'
  }
];

export default function Home() {
  const [events, setEvents] = useState(mockEvents);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    // Check if notifications are supported and get permission
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      
      if (permission === 'granted') {
        new Notification('Notifications Enabled!', {
          body: 'You will now receive event notifications',
          icon: '/icon-192x192.png'
        });
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const isUpcoming = (dateString: string) => {
    const eventDate = new Date(dateString);
    const today = new Date();
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  };

  const upcomingEvents = events.filter(event => isUpcoming(event.date));
  const futureEvents = events.filter(event => !isUpcoming(event.date));

  return (
    <div className="min-h-screen bg-slate-50 pb-6">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-slate-800">Internal Events</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                {new Date().toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 max-w-md mx-auto space-y-6">
        {/* Notification Permission */}
        {!notificationsEnabled && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                🔔
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-900 mb-1">
                  Enable Notifications
                </h3>
                <p className="text-sm text-blue-700 mb-3">
                  Get notified about upcoming events
                </p>
                <button
                  onClick={requestNotificationPermission}
                  className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Enable Notifications
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              Upcoming This Week
            </h2>
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-slate-800 text-base">
                      {event.title}
                    </h3>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
                      Soon
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>📅</span>
                      <span>{formatDate(event.date)} at {event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>📍</span>
                      <span>{event.location}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                    {event.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Future Events */}
        {futureEvents.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
              Future Events
            </h2>
            <div className="space-y-3">
              {futureEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                >
                  <h3 className="font-medium text-slate-800 text-base mb-2">
                    {event.title}
                  </h3>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>📅</span>
                      <span>{formatDate(event.date)} at {event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>📍</span>
                      <span>{event.location}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mt-2 leading-relaxed">
                    {event.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {events.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-lg font-medium text-slate-800 mb-2">
              No events scheduled
            </h3>
            <p className="text-slate-600">
              Check back later for upcoming events
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="pt-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
            <h3 className="font-medium text-slate-800 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 p-3 bg-slate-50 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                <span>🔄</span>
                Refresh
              </button>
              <button className="flex items-center justify-center gap-2 p-3 bg-slate-50 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors">
                <span>⚙️</span>
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}