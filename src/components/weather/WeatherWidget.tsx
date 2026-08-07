import React from 'react';
import { Card } from '@/components/ui/card';
import { Cloud, CloudRain, Sun, CloudSnow, Loader2, Droplets, Wind, Thermometer, Umbrella } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';
import { useLandWeatherState } from '@/hooks/useLandWeatherState';
import { AnimatedWeatherBackground } from './AnimatedWeatherBackground';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export const WeatherWidget: React.FC = () => {
  const navigate = useNavigate();
  // NOTE: this instance is normally a store *follower* — the weather page or
  // whichever consumer mounted first owns the fetch loop (see useWeather).
  const { currentWeather, loading, lastUpdated, forecast, hourlyForecast } = useWeather();

  const { lands } = useLands();
  const primaryLandId = lands?.[0]?.id;
  const { state: landState, isToday: landStateIsToday } = useLandWeatherState(primaryLandId);


  const getWeatherIcon = (condition: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      Clear: <Sun className="w-10 h-10 text-warning drop-shadow-lg" />,
      Clouds: <Cloud className="w-10 h-10 text-muted-foreground drop-shadow-lg" />,
      Rain: <CloudRain className="w-10 h-10 text-info drop-shadow-lg" />,
      Snow: <CloudSnow className="w-10 h-10 text-info drop-shadow-lg" />,
    };
    return iconMap[condition] || <Cloud className="w-10 h-10 text-muted-foreground drop-shadow-lg" />;
  };

  if (loading) {
    return (
      <Card className="p-4 cursor-pointer bg-gradient-to-br from-primary/5 via-background to-secondary/5 border-primary/20 backdrop-blur-xl">
        <div className="flex items-center justify-center h-28">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  // Calculate rain chance from forecast
  const rainChance = forecast?.[0]?.pop ? Math.round(forecast[0].pop * 100) : 0;

  // Next 6 hours is what actually changes a farmer's morning plan.
  const next6h = (hourlyForecast ?? []).slice(0, 6);
  const rain6h = next6h.length
    ? Math.round(Math.max(...next6h.map((h: any) => Number(h?.pop ?? 0))) * 100)
    : 0;

  // Land verdict — only shown when the DB computed it for today.
  const landVerdict = (() => {
    if (!landState || !landStateIsToday) return null;
    const urgency = (landState.irrigation_urgency ?? '').toUpperCase();
    const risk = (landState.disease_risk_level ?? '').toUpperCase();
    if (urgency === 'CRITICAL' || urgency === 'HIGH' || urgency === 'URGENT') {
      return { text: 'Irrigate today', tone: 'text-destructive' };
    }
    if (risk === 'HIGH' || risk === 'CRITICAL' || risk === 'SEVERE') {
      return { text: 'High disease risk', tone: 'text-warning' };
    }
    if (urgency === 'MEDIUM' || urgency === 'MODERATE' || landState.irrigation_needed) {
      return { text: 'Irrigation due soon', tone: 'text-info' };
    }
    return { text: 'Field conditions normal', tone: 'text-success' };
  })();



  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <Card 
        className="overflow-hidden cursor-pointer transition-all duration-300 relative group border-primary/20"
        onClick={() => navigate('/app/weather')}
      >
        <AnimatedWeatherBackground condition={currentWeather?.main || 'Clear'} className="h-full opacity-40">
          <div className="p-4 relative z-10">
            {/* Header Row */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">Today's Weather</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground tracking-tight">
                    {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}
                  </span>
                  <span className="text-lg text-muted-foreground">°C</span>
                </div>
              </div>
              
              <motion.div 
                className="p-2 rounded-2xl bg-background/40 backdrop-blur-sm border border-white/10 shadow-lg"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                {currentWeather?.main && getWeatherIcon(currentWeather.main)}
              </motion.div>
            </div>

            {/* Description */}
            <p className="text-sm font-medium capitalize text-foreground/80 mb-3">
              {currentWeather?.description || 'Loading...'}
            </p>

            {/* Stats Row - Modern Pill Design */}
            <div className="flex gap-2">
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm border border-white/10">
                <Thermometer className="w-3 h-3 text-warning" />
                <span className="text-[10px] font-medium">{currentWeather?.feels_like ? Math.round(currentWeather.feels_like) : '--'}°</span>
              </div>
              
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm border border-white/10">
                <Droplets className="w-3 h-3 text-info" />
                <span className="text-[10px] font-medium">{currentWeather?.humidity ?? '--'}%</span>
              </div>
              
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-background/50 backdrop-blur-sm border border-white/10">
                <Wind className="w-3 h-3 text-info" />
                <span className="text-[10px] font-medium">{currentWeather?.wind_speed ? `${Math.round(currentWeather.wind_speed * 3.6)} km/h` : '--'}</span>
              </div>
              
              {rain6h > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-info/20 backdrop-blur-sm border border-info/30">
                  <Umbrella className="w-3 h-3 text-info" />
                  <span className="text-[10px] font-medium text-info">{rain6h}% / 6h</span>
                </div>
              )}

              {rain6h === 0 && rainChance > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-info/20 backdrop-blur-sm border border-info/30">
                  <CloudRain className="w-3 h-3 text-info" />
                  <span className="text-[10px] font-medium text-info">{rainChance}%</span>
                </div>
              )}
            </div>

            {/* Provider & Update Badge */}
            <div className="flex items-center justify-between mt-3">
              {currentWeather?.provider && (
                <div className="px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm border border-white/10">
                  <p className="text-[9px] text-muted-foreground font-medium">
                    {currentWeather.provider}
                  </p>
                </div>
              )}
              
              {lastUpdated && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <p className="text-[9px] text-muted-foreground">
                    {Math.round((Date.now() - lastUpdated) / 60000)}m ago
                  </p>
                </div>
              )}
            </div>

            {/* Hover Arrow Indicator */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary text-xs">→</span>
              </div>
            </div>
          </div>
        </AnimatedWeatherBackground>
      </Card>
    </motion.div>
  );
};