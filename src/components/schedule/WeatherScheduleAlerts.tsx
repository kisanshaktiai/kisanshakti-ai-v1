import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CloudRain, AlertTriangle, Calendar, ArrowRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface WeatherAlert {
  id: string;
  title: string;
  message: string;
  priority: string;
  created_at: string;
  data: {
    task_id?: string;
    task_name?: string;
    old_date?: string;
    new_date?: string;
    weather_condition?: string;
    weather_data?: {
      rain_mm?: number;
      temp_max?: number;
      wind_speed?: number;
    };
  };
}

interface WeatherScheduleAlertsProps {
  className?: string;
  maxAlerts?: number;
}

export default function WeatherScheduleAlerts({ className, maxAlerts = 3 }: WeatherScheduleAlertsProps) {
  const { currentLanguage } = useLanguageStore();
  const { user } = useAuthStore();
  const lang = currentLanguage || 'hi';

  const { data: alerts = [], isLoading, refetch } = useQuery({
    queryKey: ['weather-alerts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('alert_notifications')
        .select('*')
        .eq('farmer_id', user.id)
        .eq('alert_type', 'weather_adjustment')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(maxAlerts);

      if (error) {
        console.error('Error fetching weather alerts:', error);
        return [];
      }

      return (data || []) as WeatherAlert[];
    },
    enabled: !!user?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  const getWeatherIcon = (condition?: string) => {
    switch (condition) {
      case 'heavy_rain':
      case 'continuous_rain':
        return <CloudRain className="h-4 w-4 text-info" />;
      case 'extreme_heat':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'frost':
        return <AlertTriangle className="h-4 w-4 text-info" />;
      case 'high_wind':
        return <AlertTriangle className="h-4 w-4 text-primary" />;
      default:
        return <CloudRain className="h-4 w-4 text-primary" />;
    }
  };

  const getConditionLabel = (condition?: string) => {
    const labels: Record<string, Record<string, string>> = {
      heavy_rain: { hi: 'भारी बारिश', mr: 'जोरदार पाऊस', en: 'Heavy Rain' },
      continuous_rain: { hi: 'लगातार बारिश', mr: 'सतत पाऊस', en: 'Continuous Rain' },
      extreme_heat: { hi: 'अत्यधिक गर्मी', mr: 'अत्यंत उष्णता', en: 'Extreme Heat' },
      frost: { hi: 'पाला', mr: 'दव/थंडी', en: 'Frost' },
      high_wind: { hi: 'तेज हवा', mr: 'वादळी वारे', en: 'High Wind' },
    };
    return labels[condition || '']?.[lang] || condition || '';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'dd MMM');
    } catch {
      return dateStr;
    }
  };

  const markAsRead = async (alertId: string) => {
    await supabase
      .from('alert_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', alertId);
    refetch();
  };

  if (isLoading || alerts.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("space-y-2", className)}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CloudRain className="h-4 w-4 text-primary" />
          {lang === 'hi' ? 'मौसम अलर्ट' : lang === 'mr' ? 'हवामान अलर्ट' : 'Weather Alerts'}
        </h3>
        <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
          {alerts.length} {lang === 'hi' ? 'नए' : lang === 'mr' ? 'नवीन' : 'new'}
        </Badge>
      </div>

      <AnimatePresence>
        {alerts.map((alert, index) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card 
              className="relative overflow-hidden border-2 border-warning/30 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors"
              onClick={() => markAsRead(alert.id)}
            >
              {/* Priority indicator */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1.5",
                alert.priority === 'high' ? "bg-gradient-to-b from-destructive to-warning" : "bg-gradient-to-b from-warning to-warning"
              )} />

              <div className="p-3 pl-4 space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getWeatherIcon(alert.data?.weather_condition)}
                    <span className="text-xs font-medium text-foreground line-clamp-1">
                      {alert.data?.task_name || alert.title}
                    </span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className="text-[9px] px-1.5 py-0 bg-info/10 text-info border-info/30 shrink-0"
                  >
                    {getConditionLabel(alert.data?.weather_condition)}
                  </Badge>
                </div>

                {/* Date change info */}
                {alert.data?.old_date && alert.data?.new_date && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground line-through">
                      {formatDate(alert.data.old_date)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-primary" />
                    <span className="text-primary font-medium">
                      {formatDate(alert.data.new_date)}
                    </span>
                    <span className="text-[10px] text-warning">
                      ({lang === 'hi' ? 'पुनर्निर्धारित' : lang === 'mr' ? 'पुन्हा निश्चित' : 'rescheduled'})
                    </span>
                  </div>
                )}

                {/* Weather data */}
                {alert.data?.weather_data && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {alert.data.weather_data.rain_mm && alert.data.weather_data.rain_mm > 0 && (
                      <span>🌧️ {alert.data.weather_data.rain_mm}mm</span>
                    )}
                    {alert.data.weather_data.temp_max && (
                      <span>🌡️ {Math.round(alert.data.weather_data.temp_max)}°C</span>
                    )}
                    {alert.data.weather_data.wind_speed && alert.data.weather_data.wind_speed > 15 && (
                      <span>💨 {Math.round(alert.data.weather_data.wind_speed)} km/h</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
