import { useEffect } from 'react';
import { notificationService } from '@/services/notificationService';
import { useAuthStore } from '@/stores/authStore';

export function useNotifications() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (user?.id) {
      // Initialize notification service
      notificationService.initialize();
    }
  }, [user?.id]);

  const requestPermission = async () => {
    if (!user?.id) return false;
    return await notificationService.subscribe(user.id);
  };

  const scheduleTaskReminder = async (taskId: string, taskTitle: string, dueDate: Date) => {
    const prefs = localStorage.getItem('notificationPreferences');
    if (prefs) {
      const { taskReminders } = JSON.parse(prefs);
      if (taskReminders) {
        await notificationService.scheduleTaskReminder(taskId, taskTitle, dueDate);
      }
    }
  };

  const sendWeatherAlert = async (alertType: string, message: string) => {
    const prefs = localStorage.getItem('notificationPreferences');
    if (prefs) {
      const { weatherAlerts } = JSON.parse(prefs);
      if (weatherAlerts) {
        await notificationService.scheduleWeatherAlert(alertType, message);
      }
    }
  };

  return {
    requestPermission,
    scheduleTaskReminder,
    sendWeatherAlert,
  };
}
