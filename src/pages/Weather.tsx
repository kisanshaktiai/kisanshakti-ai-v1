import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { 
  Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, 
  Thermometer, CloudSnow, CloudDrizzle, CloudLightning,
  Sunrise, Sunset, Navigation, AlertTriangle, Info,
  TrendingUp, TrendingDown, Calendar, MapPin, RefreshCw,
  ChevronDown, Activity, Sparkles, Waves, Timer,
  ShieldCheck, XCircle, Bell, Zap, Umbrella, Sprout
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedWeatherBackground } from '@/components/weather/AnimatedWeatherBackground';
import { WeatherCard } from '@/components/weather/WeatherCard';
import { RainfallChart } from '@/components/weather/RainfallChart';
import { WeatherAnimation } from '@/components/weather/WeatherAnimation';
import { SyncIndicator } from '@/components/weather/SyncIndicator';
import { AgriculturalInsights } from '@/components/weather/AgriculturalInsights';
import { WeatherMap } from '@/components/weather/WeatherMap';
import { VoiceWeatherSummary } from '@/components/weather/VoiceWeatherSummary';
import { WeatherHeroCard } from '@/components/weather/WeatherHeroCard';
import { FarmingRecommendations } from '@/components/weather/FarmingRecommendations';
import { HourlyTimeline } from '@/components/weather/HourlyTimeline';
import { useWeather } from '@/hooks/useWeather';
import { useWeatherSync } from '@/hooks/useWeatherSync';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { WeatherSkeleton } from '@/components/skeletons';

export default function Weather() {
  const { currentWeather, forecast, hourlyForecast, loading, error, refetch } = useWeather();
  const { 
    lastSyncTime, 
    isSyncing, 
    syncStatus, 
    todayRainfall, 
    weeklyRainfall,
    saveWeatherObservation,
    triggerManualSync 
  } = useWeatherSync();

  const [activeTab, setActiveTab] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();
  
  // Pull-to-refresh state
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    if (currentWeather && forecast) {
      const rainfallMm = forecast[0]?.rain || 0;
      saveWeatherObservation(currentWeather, rainfallMm);
    }
  }, [currentWeather, forecast]);

  // Manual sync function
  const handleManualSync = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), triggerManualSync()]);
      toast.success('Weather data synced successfully');
    } catch (err) {
      toast.error('Failed to sync weather data');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Pull-to-refresh implementation
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      setStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 0 && containerRef.current?.scrollTop === 0) {
        e.preventDefault();
        setPullDistance(Math.min(diff, 100));
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 60) {
        await handleManualSync();
      }
      setPullDistance(0);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (container) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [startY, pullDistance]);

  const getWeatherCondition = (): 'sun' | 'rain' | 'clouds' | 'storm' | 'snow' | 'fog' | 'night' => {
    if (!currentWeather) return 'clouds';
    const main = currentWeather.main?.toLowerCase();
    const hour = new Date().getHours();
    
    if (main?.includes('thunder')) return 'storm';
    if (main?.includes('snow')) return 'snow';
    if (main?.includes('rain') || main?.includes('drizzle')) return 'rain';
    if (main?.includes('fog') || main?.includes('mist')) return 'fog';
    if (main?.includes('clear') && (hour >= 6 && hour < 18)) return 'sun';
    if (main?.includes('clear') && (hour < 6 || hour >= 18)) return 'night';
    return 'clouds';
  };

  const getWeatherIcon = (condition: string, size: 'small' | 'medium' | 'large' = 'medium') => {
    const sizeClass = {
      small: 'h-4 w-4',
      medium: 'h-6 w-6',
      large: 'h-10 w-10'
    }[size];

    const iconMap: { [key: string]: React.ReactNode } = {
      'Clear': <Sun className={sizeClass} />,
      'Clouds': <Cloud className={sizeClass} />,
      'Rain': <CloudRain className={sizeClass} />,
      'Drizzle': <CloudDrizzle className={sizeClass} />,
      'Thunderstorm': <CloudLightning className={sizeClass} />,
      'Snow': <CloudSnow className={sizeClass} />,
      'Mist': <Cloud className={sizeClass} />,
      'Fog': <Cloud className={sizeClass} />,
    };
    return iconMap[condition] || <Cloud className={sizeClass} />;
  };

  const getWeatherGradient = () => {
    const condition = getWeatherCondition();
    const gradients = {
      sun: 'from-yellow-400/20 via-orange-300/10 to-background',
      rain: 'from-blue-500/20 via-blue-400/10 to-background',
      clouds: 'from-gray-400/20 via-gray-300/10 to-background',
      storm: 'from-purple-600/20 via-purple-500/10 to-background',
      snow: 'from-cyan-300/20 via-blue-200/10 to-background',
      fog: 'from-gray-500/20 via-gray-400/10 to-background',
      night: 'from-indigo-900/20 via-blue-900/10 to-background'
    };
    return gradients[condition] || gradients.clouds;
  };

  const getStatColor = (type: string, value: number) => {
    switch(type) {
      case 'humidity':
        return value > 70 ? 'text-blue-500' : value > 40 ? 'text-cyan-500' : 'text-gray-500';
      case 'wind':
        return value > 20 ? 'text-orange-500' : value > 10 ? 'text-yellow-500' : 'text-green-500';
      case 'visibility':
        return value < 2 ? 'text-red-500' : value < 5 ? 'text-yellow-500' : 'text-green-500';
      case 'pressure':
        return value < 1000 ? 'text-blue-500' : value > 1020 ? 'text-red-500' : 'text-green-500';
      default:
        return 'text-muted-foreground';
    }
  };

  if (loading) {
    return <WeatherSkeleton />;
  }

  if (error || !currentWeather) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-destructive/5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="max-w-md w-full bg-background/60 backdrop-blur-xl border-border/50 shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Weather Data Unavailable
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {error || 'Unable to load weather information. Please check your connection and try again.'}
              </p>
              <Button onClick={handleManualSync} className="w-full" size="lg">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Prepare accurate rainfall chart data
  const rainfallData = forecast.slice(0, 7).map((day, index) => ({
    date: format(new Date(day.dt * 1000), 'EEE'),
    rainfall: day.rain || 0,
    cumulative: forecast.slice(0, index + 1).reduce((sum, d) => sum + (d.rain || 0), 0)
  }));

  // Animation variants for modern AccuWeather-style animations
  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const scaleIn = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 }
  };

  const slideIn = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <div 
      className="h-screen relative bg-gradient-to-br from-background to-background/95 flex flex-col overflow-hidden" 
      ref={containerRef}
    >
      <AnimatedWeatherBackground condition={currentWeather.main || 'clear'} className="opacity-30" />
      
      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        {/* Hero Section with Weather Info */}
        <div className="flex-none">
          <WeatherHeroCard
            currentWeather={currentWeather}
            location={currentWeather.location || 'Current Location'}
            lastSyncTime={lastSyncTime}
            isRefreshing={isRefreshing || isSyncing}
            onRefresh={handleManualSync}
            weatherIcon={getWeatherIcon(currentWeather.main, 'large')}
            weatherCondition={getWeatherCondition()}
            gradient={getWeatherGradient()}
          />
        </div>

        {/* Quick Stats Grid with Voice Icon */}
        <div className="flex-none px-3 py-3 relative z-20">
          <motion.div 
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
            className="grid grid-cols-5 gap-2"
          >
            {/* Voice Button as First Card */}
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
              className="bg-card/90 backdrop-blur-xl rounded-xl p-3 border border-border/50 shadow-sm flex items-center justify-center"
            >
              <VoiceWeatherSummary
                currentWeather={currentWeather}
                forecast={forecast}
                className="w-full"
              />
            </motion.div>

            {/* Weather Stats */}
            {[
              { icon: Wind, label: 'Wind', value: Math.round(currentWeather.wind_speed * 3.6), unit: 'km/h', type: 'wind' },
              { icon: Droplets, label: 'Humidity', value: currentWeather.humidity, unit: '%', type: 'humidity' },
              { icon: Eye, label: 'Visibility', value: (currentWeather.visibility / 1000).toFixed(1), unit: 'km', type: 'visibility' },
              { icon: Gauge, label: 'Pressure', value: currentWeather.pressure, unit: 'hPa', type: 'pressure' }
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.3 + index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-card/90 backdrop-blur-xl rounded-xl p-2 border border-border/50 shadow-sm"
              >
                <div className="text-center">
                  <stat.icon className={cn("h-4 w-4 mx-auto mb-1", getStatColor(stat.type, Number(stat.value)))} />
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className={cn("text-lg font-bold", getStatColor(stat.type, Number(stat.value)))}>
                      {stat.value}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground block">{stat.label}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pb-20 scrollbar-hide">
          {/* Farming Recommendations */}
          <FarmingRecommendations
            currentWeather={currentWeather}
            forecast={forecast}
          />

          {/* Hourly Timeline */}
          {hourlyForecast && hourlyForecast.length > 0 && (
            <HourlyTimeline hourlyForecast={hourlyForecast} />
          )}

          {/* Rainfall Summary */}
          <motion.div 
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.5 }}
            className="px-4 py-3"
          >
            <Card className="bg-card/80 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Umbrella className="h-3.5 w-3.5 text-primary" />
                    Rainfall
                  </span>
                  <Badge variant="secondary" className="text-xs">7 Days</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Today</p>
                    <p className="text-lg font-bold text-primary">{todayRainfall.toFixed(1)} mm</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Week</p>
                    <p className="text-lg font-bold text-primary">{weeklyRainfall.toFixed(1)} mm</p>
                  </div>
                </div>
                
                <div className="h-24">
                  <RainfallChart data={rainfallData} />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* 7-Day Forecast */}
          <div className="px-4 py-3">
            <h3 className="text-base font-bold mb-3">7-Day Forecast</h3>
            <div className="grid grid-cols-7 gap-1.5">
              {forecast.slice(0, 7).map((day, index) => (
                <motion.div
                  key={day.dt}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="text-center"
                >
                  <Card className="bg-background/60 backdrop-blur-sm hover:shadow-md transition-all p-2">
                    <p className="text-[10px] font-semibold mb-1">{format(new Date(day.dt * 1000), 'EEE')}</p>
                    <div className="flex justify-center mb-1">
                      {getWeatherIcon(day.weather[0]?.main || 'Clear', 'small')}
                    </div>
                    <p className="text-sm font-bold mb-0.5">{Math.round(day.temp.max)}°</p>
                    <p className="text-xs text-muted-foreground">{Math.round(day.temp.min)}°</p>
                    {day.pop > 0.2 && (
                      <div className="flex items-center justify-center gap-0.5 text-[10px] text-blue-500 mt-1">
                        <CloudRain className="h-2.5 w-2.5" />
                        {Math.round(day.pop * 100)}%
                      </div>
                    )}
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
