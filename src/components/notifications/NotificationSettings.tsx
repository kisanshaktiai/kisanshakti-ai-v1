import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { notificationService } from '@/services/notificationService';
import { Bell, BellOff, CloudSun, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import { IconTile, SettingsGroup, SettingsRow, sectionCardClass } from '@/components/profile/SettingsList';
import { cn } from '@/lib/utils';

export default function NotificationSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [taskReminders, setTaskReminders] = useState(true);
  const [weatherAlerts, setWeatherAlerts] = useState(true);

  useEffect(() => {
    checkSubscriptionStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const subscribed = await notificationService.isSubscribed();
      setIsSubscribed(subscribed);
      
      // Load preferences from localStorage
      const prefs = localStorage.getItem('notificationPreferences');
      if (prefs) {
        const { taskReminders: task, weatherAlerts: weather } = JSON.parse(prefs);
        setTaskReminders(task ?? true);
        setWeatherAlerts(weather ?? true);
      }
    } catch (error) {
      console.error('Failed to check subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      if (isSubscribed) {
        const success = await notificationService.unsubscribe(user.id);
        if (success) {
          setIsSubscribed(false);
          toast({
            title: t('notification.disabledTitle'),
            description: t('notification.disabledDesc'),
          });
        }
      } else {
        const success = await notificationService.subscribe(user.id);
        if (success) {
          setIsSubscribed(true);
          toast({
            title: t('notification.enabledTitle'),
            description: t('notification.enabledDesc'),
            className: 'border-success bg-success text-success-foreground',
          });
        } else {
          toast({
            title: t('notification.permissionRequired'),
            description: t('notification.permissionDesc'),
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('notification.updateFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = (key: string, value: boolean) => {
    const prefs = {
      taskReminders: key === 'taskReminders' ? value : taskReminders,
      weatherAlerts: key === 'weatherAlerts' ? value : weatherAlerts,
    };
    
    localStorage.setItem('notificationPreferences', JSON.stringify(prefs));
    
    if (key === 'taskReminders') setTaskReminders(value);
    if (key === 'weatherAlerts') setWeatherAlerts(value);

    toast({
      title: t('notification.settingsUpdated'),
      description: t(value ? 'notification.turnedOn' : 'notification.turnedOff', { what: t(key === 'taskReminders' ? 'notification.taskReminders' : 'notification.weatherAlerts') }),
    });
  };

  if (loading) {
    return (
      <div className={cn(sectionCardClass, 'flex items-center justify-center py-10')}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Toggle */}
      <div className={cn(sectionCardClass, 'p-4', isSubscribed && 'border-primary/25 bg-primary/5')}>
        <div className="flex items-center gap-3">
          <IconTile icon={isSubscribed ? Bell : BellOff} tone={isSubscribed ? 'primary' : 'muted'} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-foreground">{t('notification.pushNotifications')}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm leading-snug text-muted-foreground">
              {isSubscribed && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
              <span className="min-w-0">{isSubscribed ? t('notification.active') : t('notification.getUpdates')}</span>
            </p>
          </div>
        </div>
        <Button
          onClick={handleToggleNotifications}
          disabled={loading}
          variant={isSubscribed ? 'outline' : 'default'}
          className="mt-4 h-12 w-full text-base"
        >
          {isSubscribed ? <BellOff className="h-4 w-4" aria-hidden="true" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
          {loading ? t('common.loading') : isSubscribed ? t('notification.disableShort') : t('notification.enableShort')}
        </Button>
      </div>

      {isSubscribed && (
        <SettingsGroup className="animate-fade-in">
          {/* Task Reminders */}
          <label htmlFor="task-reminders" className="block cursor-pointer">
            <SettingsRow
              icon={Calendar}
              tone="info"
              title={t('notification.taskReminders')}
              description={t('notification.taskRemindersDesc')}
              trailing={
                <Switch
                  id="task-reminders"
                  checked={taskReminders}
                  onCheckedChange={(checked) => updatePreference('taskReminders', checked)}
                />
              }
            />
          </label>

          {/* Weather Alerts */}
          <label htmlFor="weather-alerts" className="block cursor-pointer">
            <SettingsRow
              icon={CloudSun}
              tone="warning"
              title={t('notification.weatherAlerts')}
              description={t('notification.weatherAlertsDesc')}
              trailing={
                <Switch
                  id="weather-alerts"
                  checked={weatherAlerts}
                  onCheckedChange={(checked) => updatePreference('weatherAlerts', checked)}
                />
              }
            />
          </label>
        </SettingsGroup>
      )}
    </div>
  );
}
