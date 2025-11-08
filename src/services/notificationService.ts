import { supabase } from '@/integrations/supabase/client';

export interface NotificationSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

class NotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;

  async initialize() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.ready;
      return true;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return false;
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  async subscribe(userId: string): Promise<boolean> {
    try {
      if (!this.swRegistration) {
        await this.initialize();
      }

      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        return false;
      }

      // For demo purposes, we'll use a public VAPID key
      // In production, you'd generate your own
      const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBrXhqhCNEhp1hQLTdU4';
      
      const subscription = await this.swRegistration!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
      });

      const subscriptionData = JSON.parse(JSON.stringify(subscription));

      // Store subscription in Supabase
      await this.saveSubscription(userId, subscriptionData);

      return true;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    }
  }

  async unsubscribe(userId: string): Promise<boolean> {
    try {
      if (!this.swRegistration) return false;

      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await this.removeSubscription(userId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return false;
    }
  }

  async isSubscribed(): Promise<boolean> {
    try {
      if (!this.swRegistration) {
        await this.initialize();
      }
      const subscription = await this.swRegistration?.pushManager.getSubscription();
      return !!subscription;
    } catch {
      return false;
    }
  }

  private async saveSubscription(userId: string, subscription: any) {
    // Store in localStorage as backup
    const subscriptions = this.getStoredSubscriptions();
    subscriptions[userId] = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('pushSubscriptions', JSON.stringify(subscriptions));
    
    // Save to database
    try {
      // Get tenant_id from auth session or use default
      const { data: { session } } = await supabase.auth.getSession();
      const tenantId = session?.user?.user_metadata?.tenant_id || '00000000-0000-0000-0000-000000000000';
      
      const { error } = await supabase.from('push_subscriptions').upsert({
        tenant_id: tenantId,
        farmer_id: userId,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        user_agent: navigator.userAgent,
        is_active: true
      }, {
        onConflict: 'farmer_id,endpoint'
      });
      
      if (error) {
        console.error('Error saving subscription to database:', error);
      } else {
        console.log('Subscription saved to database for user:', userId);
      }
    } catch (err) {
      console.error('Failed to save subscription:', err);
    }
  }

  private async removeSubscription(userId: string) {
    // Remove from localStorage
    const subscriptions = this.getStoredSubscriptions();
    delete subscriptions[userId];
    localStorage.setItem('pushSubscriptions', JSON.stringify(subscriptions));
    
    // Remove from database
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('farmer_id', userId);
      
      if (error) {
        console.error('Error removing subscription from database:', error);
      } else {
        console.log('Subscription removed from database for user:', userId);
      }
    } catch (err) {
      console.error('Failed to remove subscription:', err);
    }
  }

  private getStoredSubscriptions(): Record<string, any> {
    try {
      const stored = localStorage.getItem('pushSubscriptions');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  async sendNotification(title: string, options?: NotificationOptions) {
    if (Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }

  async scheduleTaskReminder(taskId: string, taskTitle: string, dueDate: Date) {
    // Schedule 3 notifications: 5 days before, 1 day before, and same day
    const notifications = [
      { type: '5_days', daysBefore: 5, title: `Upcoming: ${taskTitle}` },
      { type: '1_day', daysBefore: 1, title: `Tomorrow: ${taskTitle}` },
      { type: 'same_day', daysBefore: 0, title: `Today: ${taskTitle}` },
    ];

    const now = new Date();
    const reminders = this.getScheduledReminders();

    notifications.forEach(({ type, daysBefore, title }) => {
      const notificationTime = new Date(dueDate);
      notificationTime.setDate(notificationTime.getDate() - daysBefore);
      notificationTime.setHours(9, 0, 0, 0); // 9 AM

      if (notificationTime > now) {
        reminders.push({
          id: `${taskId}-${type}`,
          taskId,
          title,
          time: notificationTime.toISOString(),
          type: 'task',
          notificationType: type,
        });
      }
    });

    localStorage.setItem('scheduledReminders', JSON.stringify(reminders));
  }

  async scheduleWeatherAlert(alertType: string, message: string) {
    const reminders = this.getScheduledReminders();
    reminders.push({
      id: `weather-${Date.now()}`,
      title: `Weather Alert: ${alertType}`,
      message,
      time: new Date().toISOString(),
      type: 'weather',
    });
    localStorage.setItem('scheduledReminders', JSON.stringify(reminders));

    // Send immediate notification
    this.sendNotification(`Weather Alert: ${alertType}`, {
      body: message,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'weather-alert',
      requireInteraction: true,
    });
  }

  private getScheduledReminders(): any[] {
    try {
      const reminders = localStorage.getItem('scheduledReminders');
      return reminders ? JSON.parse(reminders) : [];
    } catch {
      return [];
    }
  }

  private urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray as unknown as BufferSource;
  }
}

export const notificationService = new NotificationService();
