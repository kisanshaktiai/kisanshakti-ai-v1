import React from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Cloud, CloudRain, Sun, Wind } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HourlyTimelineProps {
  hourlyForecast: any[];
}

export const HourlyTimeline: React.FC<HourlyTimelineProps> = ({ hourlyForecast }) => {
  const getWeatherIcon = (main: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      'Clear': <Sun className="h-6 w-6 text-warning" />,
      'Clouds': <Cloud className="h-6 w-6 text-foreground/80" />,
      'Rain': <CloudRain className="h-6 w-6 text-info" />,
      'Drizzle': <CloudRain className="h-6 w-6 text-info" />
    };
    return iconMap[main] || <Cloud className="h-6 w-6" />;
  };

  if (!hourlyForecast || hourlyForecast.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="px-4 py-3"
    >
      <h3 className="text-base font-bold mb-3">Hourly Forecast</h3>
      
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {hourlyForecast.slice(0, 12).map((hour, index) => (
          <motion.div
            key={hour.dt}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + index * 0.03 }}
            className="flex-none w-[70px] snap-center"
          >
            <Card className="p-2 text-center hover:shadow-md transition-all bg-background/60 backdrop-blur-sm border">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                {index === 0 ? 'Now' : format(new Date(hour.dt * 1000), 'ha')}
              </p>
              
              <div className="flex justify-center mb-1">
                {getWeatherIcon(hour.weather[0]?.main || 'Clear')}
              </div>
              
              <p className="text-lg font-bold mb-1">
                {Math.round(hour.temp)}°
              </p>
              
              {hour.pop > 0.2 && (
                <p className="text-[10px] text-info flex items-center justify-center gap-0.5">
                  <CloudRain className="h-2.5 w-2.5" />
                  {Math.round(hour.pop * 100)}%
                </p>
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
