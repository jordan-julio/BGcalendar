'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Clock, Globe } from 'lucide-react';

interface NotificationPreferences {
  daily_reminders: boolean;
  reminder_time: string;
  timezone: string;
}

export default function NotificationPreferences({ userId }: { userId: string }) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    daily_reminders: true,
    reminder_time: '06:00:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        console.error('Error loading preferences:', error);
        return;
      }

      if (data) {
        setPreferences({
          daily_reminders: data.daily_reminders,
          reminder_time: data.reminder_time,
          timezone: data.timezone
        });
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);

    try {
        const { data, error } = await supabase
        .from('notification_preferences')
        .upsert(
            {
            user_id: userId,
            daily_reminders: preferences.daily_reminders,
            reminder_time: preferences.reminder_time,
            timezone: preferences.timezone,
            updated_at: new Date().toISOString(),
            },
            {
            onConflict: 'user_id'          // <- use user_id as unique key
            }
        );

        if (error) {
        // log all the useful bits
        console.error('upsert error message:', error.message);
        console.error('upsert error details:', error.details);
        console.error('upsert error hint:', error.hint);
        alert(`Failed to save preferences: ${error.message}`);
        } else {
        console.log('upsert succeeded, data:', data);
        alert('Preferences saved successfully!');
        }
    } catch (err) {
        console.error('catch error:', err);
        alert('Failed to save preferences');
    } finally {
        setSaving(false);
    }
    };

  if (loading) {
    return <div className="p-4">Loading preferences...</div>;
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5" />
        Notification Preferences
      </h3>

      <div className="space-y-4">
        {/* Daily Reminders Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-900">Daily Reminders</label>
            <p className="text-xs text-gray-500">Get notified about upcoming events</p>
          </div>
          <button
            style={{
                minWidth: '44px',
                minHeight: '24px',  
            }}
            onClick={() => setPreferences(prev => ({ ...prev, daily_reminders: !prev.daily_reminders }))}
            className={`relative inline-flex items-center rounded-full transition-colors ${
              preferences.daily_reminders ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                preferences.daily_reminders ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Reminder Time */}
        <div>
          <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Reminder Time
          </label>
          <input
            type="time"
            value={preferences.reminder_time}
            onChange={(e) => setPreferences(prev => ({ ...prev, reminder_time: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            disabled={!preferences.daily_reminders}
          />
        </div>

        {/* Timezone */}
        <div>
          <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Timezone
          </label>
          <select
            value={preferences.timezone}
            onChange={(e) => setPreferences(prev => ({ ...prev, timezone: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            disabled={!preferences.daily_reminders}
          >
            <option value="Asia/Jakarta">Jakarta (WIB)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Chicago">Central Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Paris">Paris</option>
            <option value="Asia/Tokyo">Tokyo</option>
            <option value="Asia/Shanghai">Shanghai</option>
            <option value="Australia/Sydney">Sydney</option>
          </select>
        </div>

        {/* Save Button */}
        <button
          onClick={savePreferences}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}