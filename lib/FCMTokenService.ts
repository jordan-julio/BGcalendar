/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/FCMTokenService.ts (Fixed version)
import { messaging, getToken, onMessage } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';

class FCMTokenService {
  private static instance: FCMTokenService;
  private currentToken: string | null = null;
  private isInitialized: boolean = false;

  static getInstance(): FCMTokenService {
    if (!FCMTokenService.instance) {
      FCMTokenService.instance = new FCMTokenService();
    }
    return FCMTokenService.instance;
  }

  async initializeForUser(userId: string, forceRefresh: boolean = false): Promise<boolean> {
    // Validate user is logged in
    if (!userId || userId.trim() === '') {
      console.log('❌ No valid user ID provided - user must be logged in for FCM');
      return false;
    }

    if (!messaging) {
      console.log('❌ Messaging not available');
      return false;
    }

    // Check if already initialized and not forcing refresh
    if (this.isInitialized && !forceRefresh && this.currentToken) {
      console.log('✅ FCM already initialized with token:', this.currentToken.substring(0, 20) + '...');
      return true;
    }

    try {
      console.log('🔔 Initializing FCM for user:', userId, forceRefresh ? '(force refresh)' : '');

      // Register service worker first
      await this.registerServiceWorker();

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('❌ Notification permission denied');
        return false;
      }

      console.log('✅ Notification permission granted');

      // Get FCM token (this will reuse existing token if valid)
      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.ready
      });

      if (token) {
        console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
        
        // Check if this is a new token or update
        const isNewToken = this.currentToken !== token;
        this.currentToken = token;
        
        if (isNewToken || forceRefresh) {
          // Save or update token in database
          await this.saveOrUpdateTokenInDatabase(userId, token);
        } else {
          console.log('📝 Token unchanged, skipping database update');
        }
        
        // Set up foreground message listener (only once)
        if (!this.isInitialized) {
          this.setupForegroundMessageListener();
        }
        
        this.isInitialized = true;
        return true;
      } else {
        console.log('❌ No registration token available');
        return false;
      }
    } catch (error) {
      console.error('❌ Error initializing FCM:', error);
      return false;
    }
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      if ('serviceWorker' in navigator) {
        // Check if firebase messaging service worker is already registered
        const existingRegistration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        
        if (!existingRegistration) {
          // Register fresh service worker only if not exists
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            updateViaCache: 'none'
          });
          console.log('✅ Firebase messaging service worker registered:', registration);
        } else {
          console.log('✅ Firebase messaging service worker already registered');
        }
        
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
        console.log('✅ Service Worker ready');
      }
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  }

  private async saveOrUpdateTokenInDatabase(userId: string, token: string): Promise<void> {
    try {
      // Double-check user is valid before database operation
      if (!userId || userId.trim() === '') {
        console.error('❌ Cannot save FCM token: invalid user ID');
        return;
      }

      console.log('💾 Saving/updating FCM token for user:', userId);
      
      // First, verify user exists in auth.users (optional check)
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user || userData.user.id !== userId) {
        console.error('❌ User authentication mismatch or not logged in:', userError);
        return;
      }

      // FIXED: Always use manual approach - no upsert/on_conflict needed
      await this.manualInsertOrUpdate(userId, token);

    } catch (error) {
      console.error('❌ Database error in saveOrUpdateTokenInDatabase:', error);
    }
  }

  private async manualInsertOrUpdate(userId: string, token: string): Promise<void> {
    try {
      // Check if user already has a token
      const { data: existingTokens, error: selectError } = await supabase
        .from('fcm_tokens')
        .select('id, token')
        .eq('user_id', userId);

      if (selectError) {
        console.error('❌ Error checking existing tokens:', selectError);
        return;
      }

      if (existingTokens && existingTokens.length > 0) {
        // Update existing token
        console.log('🔄 Updating existing FCM token');
        const { error: updateError } = await supabase
          .from('fcm_tokens')
          .update({
            token: token,
            device_info: this.getDeviceInfo(),
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('❌ Error updating FCM token:', updateError);
        } else {
          console.log('✅ FCM token updated successfully (manual)');
        }
      } else {
        // Insert new token
        console.log('➕ Inserting new FCM token');
        const { error: insertError } = await supabase
          .from('fcm_tokens')
          .insert({
            user_id: userId,
            token: token,
            device_info: this.getDeviceInfo(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('❌ Error inserting FCM token:', insertError);
        } else {
          console.log('✅ FCM token inserted successfully (manual)');
        }
      }
    } catch (error) {
      console.error('❌ Error in manual insert/update:', error);
    }
  }

  private setupForegroundMessageListener(): void {
    if (!messaging) return;

    onMessage(messaging, (payload) => {
      console.log('📨 Received foreground message:', payload);
      
      if (payload.notification || payload.data) {
        const notificationTitle = payload.notification?.title || payload.data?.title || 'BG Events';
        const notificationBody = payload.notification?.body || payload.data?.body || 'You have a new notification';
        
        // FIXED: Use ServiceWorkerRegistration.showNotification instead of new Notification()
        this.showForegroundNotification(notificationTitle, notificationBody, payload.data || {});
      }
    });

    console.log('🔔 FCM foreground listener ready');
  }

  private async showForegroundNotification(title: string, body: string, data: any): Promise<void> {
    try {
      // Check if we have an active service worker registration
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        
        const options = {
          body,
          tag: data?.type || 'default',
          data: data,
          requireInteraction: true,
          silent: false,
          vibrate: [200, 100, 200],
          actions: [
            {
              action: 'view',
              title: 'View'
            },
            {
              action: 'dismiss',
              title: 'Dismiss'
            }
          ]
        };

        console.log('📱 Showing foreground notification via service worker:', { title, body });
        
        // FIXED: Use service worker registration instead of new Notification()
        await registration.showNotification(title, options);
      } else {
        console.warn('⚠️ Service Worker not available for foreground notifications');
      }
    } catch (error) {
      console.error('❌ Error showing foreground notification:', error);
      
      // Fallback: try browser notification if available and not in service worker context
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body, tag: data?.type || 'default' });
        } catch (fallbackError) {
          console.error('❌ Fallback notification failed:', fallbackError);
        }
      }
    }
  }

  private getDeviceInfo(): string {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    const timestamp = new Date().toISOString();
    return `${userAgent} - ${timestamp}`;
  }

  async refreshToken(userId: string): Promise<boolean> {
    console.log('🔄 Refreshing FCM token...');
    return await this.initializeForUser(userId, true);
  }

  async cleanup(userId: string): Promise<void> {
    try {
      // Remove all tokens for this user
      const { error } = await supabase
        .from('fcm_tokens')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Error removing FCM tokens:', error);
      } else {
        console.log('🧹 Removed FCM tokens for user:', userId);
      }
    } catch (error) {
      console.error('❌ Error in cleanup:', error);
    }
    
    // Clear local state
    this.currentToken = null;
    this.isInitialized = false;
    
    console.log('🧹 FCM cleanup completed');
  }

  getCurrentToken(): string | null {
    return this.currentToken;
  }

  isReady(): boolean {
    return this.isInitialized && this.currentToken !== null;
  }

  destroy(): void {
    this.currentToken = null;
    this.isInitialized = false;
  }
}

export default FCMTokenService;