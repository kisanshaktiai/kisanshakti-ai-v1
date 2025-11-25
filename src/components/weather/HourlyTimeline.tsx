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
      'Clear': <Sun className="h-6 w-6 text-yellow-500" />,
      'Clouds': <Cloud className="h-6 w-6 text-gray-500" />,
      'Rain': <CloudRain className="h-6 w-6 text-blue-500" />,
      'Drizzle': <CloudRain className="h-6 w-6 text-blue-400" />
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
      transition={{ delay: 0.5 }}
      className="px-4 py-6"
    >
      <h3 className="text-xl font-bold mb-4">Hourly Forecast</h3>
      
      <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
        <div className="flex gap-3 p-4">
          {hourlyForecast.slice(0, 24).map((hour, index) => (
            <motion.div
              key={hour.dt}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + index * 0.05 }}
            >
              <Card className="min-w-[100px] p-4 text-center hover:shadow-lg transition-all">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {index === 0 ? 'Now' : format(new Date(hour.dt * 1000), 'ha')}
                </p>
                
                <div className="flex justify-center mb-2">
                  {getWeatherIcon(hour.weather[0]?.main || 'Clear')}
                </div>
                
                <p className="text-2xl font-bold mb-1">
                  {Math.round(hour.temp)}°
                </p>
                
                {hour.pop > 0 && (
                  <p className="text-xs text-blue-500 flex items-center justify-center gap-1">
                    <CloudRain className="h-3 w-3" />
                    {Math.round(hour.pop * 100)}%
                  </p>
                )}
                
                <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <Wind className="h-3 w-3" />
                  {Math.round(hour.wind_speed * 3.6)}
                </p>
              </Card>
            </motion.div>
          ))}
        </div>
      </ScrollArea>
    </motion.div>
  );
};
