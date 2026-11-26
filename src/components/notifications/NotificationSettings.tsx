import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { notificationService } from '@/services/notificationService';
import { Bell, BellOff, Cloud, Calendar, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
      <Card className="glass-card">
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-primary/10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      
      <CardHeader className="relative">
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2 rounded-xl bg-primary/10"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isSubscribed ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
          </motion.div>
          <div>
            <CardTitle>{t('notification.pushNotifications')}</CardTitle>
            <CardDescription>
              {t('notification.pushNotificationsDesc')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 relative">
        {/* Main Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-primary/10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isSubscribed ? 'bg-primary/10' : 'bg-muted/50'}`}>
              {isSubscribed ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <Bell className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-semibold">{t('notification.enable')}</p>
              <p className="text-sm text-muted-foreground">
                {isSubscribed ? t('notification.active') : t('notification.getUpdates')}
              </p>
            </div>
          </div>
          <Button
            onClick={handleToggleNotifications}
            disabled={loading}
            variant={isSubscribed ? 'outline' : 'default'}
            className={isSubscribed ? '' : 'bg-gradient-to-r from-primary to-accent'}
          >
            {loading ? t('common.loading') : isSubscribed ? t('notification.disableShort') : t('notification.enableShort')}
          </Button>
        </div>

        <AnimatePresence>
          {isSubscribed && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Task Reminders */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-background/30 border border-border/50 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Calendar className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <Label htmlFor="task-reminders" className="font-medium cursor-pointer">
                      {t('notification.taskReminders')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('notification.taskRemindersDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="task-reminders"
                  checked={taskReminders}
                  onCheckedChange={(checked) => updatePreference('taskReminders', checked)}
                />
              </div>

              {/* Weather Alerts */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-background/30 border border-border/50 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Cloud className="h-4 w-4 text-orange-500" />
                  </div>
                  <div>
                    <Label htmlFor="weather-alerts" className="font-medium cursor-pointer">
                      {t('notification.weatherAlerts')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('notification.weatherAlertsDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  id="weather-alerts"
                  checked={weatherAlerts}
                  onCheckedChange={(checked) => updatePreference('weatherAlerts', checked)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
