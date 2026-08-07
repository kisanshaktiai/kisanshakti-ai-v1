/**
 * SevenDayForecast - Modern 2030-ready 7-day forecast UI
 * 
 * Design Philosophy for Rural Farmers:
 * - Large, colorful weather icons for instant recognition
 * - Visual temperature bars instead of just numbers
 * - Clear day labels with "Today" highlighted
 * - Rain probability shown with droplet fill indicator
 * - High contrast colors for outdoor visibility
 * - Swipeable horizontal scroll for mobile
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { format, isToday, isTomorrow, addDays } from 'date-fns';
import { 
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, 
  CloudDrizzle, Droplets, Wind, Calendar, Thermometer,
  TrendingUp, TrendingDown
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ForecastDay {
  dt: number;
  temp: {
    day: number;
    min: number;
    max: number;
  };
  weather: Array<{
    main: string;
    description: string;
    icon: string;
  }>;
  pop: number;
  rain?: number;
  humidity: number;
  wind_speed: number;
}

interface SevenDayForecastProps {
  forecast: ForecastDay[];
}

export const SevenDayForecast: React.FC<SevenDayForecastProps> = ({ forecast }) => {
  const { t, i18n } = useTranslation();

  // Find min/max temp across all days for relative scale
  const allTemps = forecast.slice(0, 7).flatMap(d => [d.temp.min, d.temp.max]);
  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);
  const tempRange = maxTemp - minTemp || 1;

  const getWeatherIcon = (main: string) => {
    const iconConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
      'Clear': { icon: Sun, color: 'text-warning', bg: 'bg-warning/20' },
      'Clouds': { icon: Cloud, color: 'text-muted-foreground', bg: 'bg-muted-foreground/40/20' },
      'Rain': { icon: CloudRain, color: 'text-info', bg: 'bg-info/20' },
      'Drizzle': { icon: CloudDrizzle, color: 'text-info', bg: 'bg-info/20' },
      'Thunderstorm': { icon: CloudLightning, color: 'text-primary', bg: 'bg-primary/20' },
      'Snow': { icon: CloudSnow, color: 'text-info', bg: 'bg-info/20' },
    };
    return iconConfig[main] || { icon: Cloud, color: 'text-muted-foreground', bg: 'bg-muted-foreground/40/20' };
  };

  /**
   * Label from the REAL date only. Using `index === 0` used to force "Today"
   * even when the first row was tomorrow (the cache filters out past slots),
   * which shifted every following day by one.
   */
  const getDayLabel = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    if (isToday(date)) return t('weather.forecast.today');
    if (isTomorrow(date)) return t('weather.forecast.tomorrow');
    return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-IN' : `${i18n.language}-IN`, {
      weekday: 'short',
    }).format(date);
  };


  const getTemperatureColor = (temp: number): string => {
    if (temp >= 40) return 'text-destructive';
    if (temp >= 35) return 'text-warning';
    if (temp >= 30) return 'text-warning';
    if (temp >= 25) return 'text-warning';
    if (temp >= 20) return 'text-success';
    if (temp >= 15) return 'text-success';
    return 'text-info';
  };

  const getTemperatureBarGradient = (min: number, max: number): string => {
    const avgTemp = (min + max) / 2;
    if (avgTemp >= 35) return 'from-warning to-destructive';
    if (avgTemp >= 30) return 'from-warning to-warning';
    if (avgTemp >= 25) return 'from-warning to-warning';
    if (avgTemp >= 20) return 'from-success to-warning';
    if (avgTemp >= 15) return 'from-success to-success';
    return 'from-info to-success';
  };

  // Calculate bar position for temperature visualization
  const getTempBarStyle = (min: number, max: number) => {
    const left = ((min - minTemp) / tempRange) * 100;
    const width = ((max - min) / tempRange) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 15)}%` };
  };

  if (!forecast || forecast.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="px-4 py-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          {t('weather.forecast.title')}
        </h3>
        <span className="text-xs text-muted-foreground">{t('weather.forecast.days_7')}</span>
      </div>

      {/* Modern Vertical List Layout */}
      <div className="space-y-2">
        {forecast.slice(0, 7).map((day, index) => {
          const weatherConfig = getWeatherIcon(day.weather[0]?.main || 'Clear');
          const IconComponent = weatherConfig.icon;
          const isFirstDay = index === 0;
          const barStyle = getTempBarStyle(day.temp.min, day.temp.max);

          return (
            <motion.div
              key={day.dt}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.05 }}
            >
              <Card 
                className={cn(
                  "relative overflow-hidden transition-all duration-300",
                  "bg-card/90 backdrop-blur-xl border-border/50",
                  "hover:shadow-lg hover:scale-[1.01]",
                  isFirstDay && "ring-2 ring-primary/30 bg-primary/5"
                )}
              >
                <div className="flex items-center p-3 gap-3">
                  {/* Day Label */}
                  <div className="w-12 flex-shrink-0">
                    <p className={cn(
                      "text-sm font-bold",
                      isFirstDay ? "text-primary" : "text-foreground"
                    )}>
                      {getDayLabel(day.dt)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(day.dt * 1000), 'd MMM')}
                    </p>
                  </div>

                  {/* Weather Icon with Background */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    weatherConfig.bg
                  )}>
                    <IconComponent className={cn("h-5 w-5", weatherConfig.color)} />
                  </div>

                  {/* Temperature Bar Visualization */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-xs font-medium", getTemperatureColor(day.temp.min))}>
                        {Math.round(day.temp.min)}°
                      </span>
                      <span className={cn("text-sm font-bold", getTemperatureColor(day.temp.max))}>
                        {Math.round(day.temp.max)}°
                      </span>
                    </div>
                    
                    {/* Visual Temperature Bar */}
                    <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: barStyle.width }}
                        transition={{ delay: 0.6 + index * 0.05, duration: 0.4 }}
                        className={cn(
                          "absolute h-full rounded-full bg-gradient-to-r",
                          getTemperatureBarGradient(day.temp.min, day.temp.max)
                        )}
                        style={{ left: barStyle.left }}
                      />
                    </div>
                  </div>

                  {/* Rain Probability Indicator */}
                  {day.pop > 0 && (
                    <div className="flex flex-col items-center w-10 flex-shrink-0">
                      <div className="relative">
                        <Droplets className={cn(
                          "h-4 w-4",
                          day.pop > 0.6 ? "text-info" : 
                          day.pop > 0.3 ? "text-info" : "text-info"
                        )} />
                        {/* Fill indicator based on probability */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-info/30 rounded-b"
                          style={{ height: `${day.pop * 100}%` }}
                        />
                      </div>
                      <span className={cn(
                        "text-[10px] font-semibold mt-0.5",
                        day.pop > 0.6 ? "text-info" : "text-info"
                      )}>
                        {Math.round(day.pop * 100)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Subtle condition indicator for high-impact days */}
                {(day.pop > 0.7 || day.temp.max >= 40 || day.weather[0]?.main === 'Thunderstorm') && (
                  <div className={cn(
                    "absolute top-0 right-0 w-1 h-full",
                    day.weather[0]?.main === 'Thunderstorm' ? "bg-primary" :
                    day.pop > 0.7 ? "bg-info" : "bg-warning"
                  )} />
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Weekly Summary Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
        className="mt-3 flex items-center justify-between px-2"
      >
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-info" />
            <span>Low: {Math.round(minTemp)}°</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-warning" />
            <span>High: {Math.round(maxTemp)}°</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Droplets className="h-3 w-3 text-info" />
          <span>
            {forecast.slice(0, 7).filter(d => d.pop > 0.3).length} rainy days
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};
