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
      className="min-h-screen relative bg-gradient-to-br from-background to-background/95 overflow-y-auto" 
      ref={containerRef}
      style={{ transform: `translateY(${pullDistance}px)` }}
    >
      <AnimatedWeatherBackground condition={currentWeather.main || 'clear'} className="opacity-30" />
      
      {/* Pull-to-refresh indicator */}
      <AnimatePresence>
        {pullDistance > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: pullDistance / 100 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50"
          >
            <div className={cn(
              "p-2 rounded-full bg-primary/20 backdrop-blur-sm",
              pullDistance > 60 && "bg-primary/30"
            )}>
              <RefreshCw className={cn(
                "h-5 w-5 text-primary",
                pullDistance > 60 && "animate-spin"
              )} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="relative z-10">
        {/* Hero Section with Weather Info */}
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.5 }}
          className={`relative bg-gradient-to-br ${getWeatherGradient()} overflow-hidden`}
        >
          {/* Animated weather particles - Full Width */}
          <motion.div 
            className="absolute inset-0 w-full h-full"
            animate={{ 
              opacity: [0.1, 0.3, 0.1],
            }}
            transition={{ 
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <WeatherAnimation condition={getWeatherCondition()} className="w-full h-full" />
          </motion.div>
          
          <div className="relative z-10 px-4 pt-4 pb-6">
            {/* Location and Sync Row */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {currentWeather.location || 'Current Location'}
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(), 'EEEE, MMM d, yyyy')}
                </p>
              </div>
              
              {/* Sync Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleManualSync}
                className="relative p-2 rounded-lg bg-background/20 backdrop-blur-sm border border-white/10 hover:bg-background/30 transition-all"
              >
                <RefreshCw className={cn(
                  "h-4 w-4 text-foreground",
                  (isSyncing || isRefreshing) && "animate-spin"
                )} />
                {lastSyncTime && (
                  <motion.span 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute -bottom-6 right-0 text-[10px] text-muted-foreground whitespace-nowrap bg-background/80 px-1 py-0.5 rounded"
                  >
                    {format(new Date(lastSyncTime), 'h:mm a')}
                  </motion.span>
                )}
              </motion.button>
            </div>

            {/* Main Weather Display */}
            <motion.div 
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
              className="flex justify-between items-center"
            >
              <div className="flex-1">
                <motion.div 
                  className="flex items-baseline gap-1"
                  animate={{ opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span className="text-6xl font-bold text-foreground">
                    {Math.round(currentWeather.temp)}
                  </span>
                  <span className="text-2xl text-muted-foreground">°C</span>
                </motion.div>
                
                <motion.p 
                  className="text-base font-medium capitalize text-foreground/90 mt-1"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {currentWeather.description}
                </motion.p>
                <motion.p 
                  className="text-xs text-muted-foreground flex items-center gap-1 mt-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <Thermometer className="h-3 w-3" />
                  Feels like {Math.round(currentWeather.feels_like)}°C
                </motion.p>
              </div>

              {/* Animated Weather Icon - Modern AccuWeather Style */}
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ 
                  scale: 1,
                  rotate: 0,
                }}
                transition={{ 
                  type: "spring",
                  stiffness: 200,
                  damping: 15
                }}
              >
                <motion.div
                  animate={{ 
                    y: [0, -3, 0],
                    rotate: [0, 2, -2, 0],
                  }}
                  transition={{ 
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm"
                >
                  {getWeatherIcon(currentWeather.main, 'large')}
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>

        {/* Quick Stats Grid */}
        <div className="px-3 -mt-3 relative z-20">
          <motion.div 
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="grid grid-cols-2 gap-2"
          >
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
                transition={{ delay: 0.4 + index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-card/90 backdrop-blur-xl rounded-xl p-3 border border-border/50 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <stat.icon className={cn("h-3.5 w-3.5", getStatColor(stat.type, Number(stat.value)))} />
                      <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-xl font-bold", getStatColor(stat.type, Number(stat.value)))}>
                        {stat.value}
                      </span>
                      <span className="text-xs text-muted-foreground">{stat.unit}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "h-6 w-0.5 rounded-full",
                    stat.type === 'humidity' && "bg-gradient-to-b from-blue-500 to-cyan-500",
                    stat.type === 'wind' && "bg-gradient-to-b from-orange-500 to-yellow-500",
                    stat.type === 'visibility' && "bg-gradient-to-b from-green-500 to-emerald-500",
                    stat.type === 'pressure' && "bg-gradient-to-b from-purple-500 to-indigo-500"
                  )} />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Rainfall Summary & Chart */}
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5 }}
          className="px-3 mt-4"
        >
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-200/20 backdrop-blur-xl shadow-sm rounded-xl overflow-hidden">
            <CardHeader className="pb-2 pt-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-blue-500" />
                  Rainfall Summary
                </CardTitle>
                <div className="flex gap-3">
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Today</p>
                    <p className="text-lg font-bold text-blue-600">{todayRainfall.toFixed(1)}mm</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Week</p>
                    <p className="text-lg font-bold text-cyan-600">{weeklyRainfall.toFixed(1)}mm</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <RainfallChart data={rainfallData} className="h-28" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Forecast Tabs */}
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.6 }}
          className="px-3 mt-4"
        >
          <Card className="bg-card/90 backdrop-blur-xl border-border/50 shadow-sm rounded-xl">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-base font-semibold">Weather Forecast</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 w-full bg-muted/50 rounded-lg p-0.5 h-8">
                  <TabsTrigger 
                    value="today" 
                    className="rounded-md text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Today
                  </TabsTrigger>
                  <TabsTrigger 
                    value="tomorrow"
                    className="rounded-md text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Tomorrow
                  </TabsTrigger>
                  <TabsTrigger 
                    value="week"
                    className="rounded-md text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    7 Days
                  </TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                  <TabsContent value="today" className="mt-3">
                    <ScrollArea className="w-full">
                      <motion.div 
                        variants={slideIn}
                        initial="hidden"
                        animate="visible"
                        className="flex gap-2 pb-1"
                      >
                        {hourlyForecast.slice(0, 12).map((hour, index) => (
                          <motion.div
                            key={index}
                            variants={scaleIn}
                            initial="hidden"
                            animate="visible"
                            transition={{ delay: index * 0.03 }}
                            className="min-w-[80px]"
                          >
                            <Card className="bg-gradient-to-br from-background/60 to-background/40 border-border/30 rounded-lg">
                              <CardContent className="p-2 text-center">
                                <p className="text-[10px] text-muted-foreground mb-1">
                                  {format(new Date(hour.dt * 1000), 'h:mm a')}
                                </p>
                                <div className="my-1 flex justify-center">
                                  {getWeatherIcon(hour.weather[0].main, 'small')}
                                </div>
                                <p className="text-sm font-bold">
                                  {Math.round(hour.temp)}°
                                </p>
                                {hour.pop > 0 && (
                                  <div className="flex items-center justify-center gap-0.5 mt-1">
                                    <Droplets className="h-2.5 w-2.5 text-blue-500" />
                                    <span className="text-[10px] font-medium">{Math.round(hour.pop * 100)}%</span>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </motion.div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="tomorrow" className="mt-3">
                    {forecast[1] && (
                      <motion.div 
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="space-y-3"
                      >
                        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 rounded-lg">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-background/50">
                                  {getWeatherIcon(forecast[1].weather[0].main, 'medium')}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm capitalize">
                                    {forecast[1].weather[0].description}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(forecast[1].dt * 1000), 'EEEE, MMM d')}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-bold">{Math.round(forecast[1].temp.max)}°</span>
                                  <span className="text-base text-muted-foreground">/{Math.round(forecast[1].temp.min)}°</span>
                                </div>
                                {forecast[1].pop > 0 && (
                                  <Badge variant="secondary" className="mt-1 text-[10px] h-5">
                                    <Droplets className="h-2.5 w-2.5 mr-0.5" />
                                    {Math.round(forecast[1].pop * 100)}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                            
                            {/* Farming Suitability Badges */}
                            <div className="mt-3 flex gap-1.5 flex-wrap">
                              <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px] h-5">
                                <Sprout className="h-2.5 w-2.5 mr-0.5" />
                                Good for Planting
                              </Badge>
                              <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-[10px] h-5">
                                <Umbrella className="h-2.5 w-2.5 mr-0.5" />
                                Light Irrigation
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )}
                  </TabsContent>

                  <TabsContent value="week" className="mt-3">
                    <div className="space-y-1.5">
                      {forecast.slice(0, 7).map((day, index) => (
                        <motion.div
                          key={index}
                          variants={slideIn}
                          initial="hidden"
                          animate="visible"
                          transition={{ delay: index * 0.03 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Card className="bg-background/60 border-border/30 rounded-lg hover:bg-muted/30 transition-all">
                            <CardContent className="p-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 rounded-md bg-muted/50">
                                    {getWeatherIcon(day.weather[0].main, 'small')}
                                  </div>
                                  <div>
                                    <p className="font-medium text-xs">
                                      {format(new Date(day.dt * 1000), 'EEE, MMM d')}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground capitalize">
                                      {day.weather[0].description}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {day.pop > 0 && (
                                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                                      <Droplets className="h-2.5 w-2.5 mr-0.5" />
                                      {Math.round(day.pop * 100)}%
                                    </Badge>
                                  )}
                                  <div className="text-right">
                                    <span className="text-base font-bold">{Math.round(day.temp.max)}°</span>
                                    <span className="text-sm text-muted-foreground ml-0.5">
                                      {Math.round(day.temp.min)}°
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </TabsContent>
                </AnimatePresence>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Agricultural Insights */}
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.7 }}
          className="px-3 mt-4"
        >
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-200/20 backdrop-blur-xl shadow-sm rounded-xl">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-green-500" />
                Agricultural Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-3">
              {/* Recommendation Cards */}
              <div className="grid grid-cols-3 gap-2">
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg p-2.5 text-white text-center"
                >
                  <Droplets className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-[10px] font-semibold">Irrigation</p>
                  <p className="text-[9px] opacity-90">Moderate</p>
                </motion.div>
                
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg p-2.5 text-white text-center"
                >
                  <Activity className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-[10px] font-semibold">Spraying</p>
                  <p className="text-[9px] opacity-90">Good Time</p>
                </motion.div>
                
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg p-2.5 text-white text-center"
                >
                  <Sprout className="h-5 w-5 mx-auto mb-1" />
                  <p className="text-[10px] font-semibold">Planting</p>
                  <p className="text-[9px] opacity-90">Suitable</p>
                </motion.div>
              </div>

              {/* Crop Recommendations */}
              <div className="flex flex-wrap gap-1.5">
                {['Rice', 'Wheat', 'Cotton', 'Sugarcane'].map((crop) => (
                  <Badge 
                    key={crop}
                    className="bg-green-100 text-green-700 border-green-200 rounded-full px-2 py-0.5 text-[10px]"
                  >
                    {crop}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Weather Map Section */}
        <motion.div 
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.8 }}
          className="px-3 mt-4 pb-20"
        >
          <WeatherMap />
        </motion.div>

        {/* Data Provider Attribution */}
        <div className="text-center py-3 px-4">
          <p className="text-[10px] text-muted-foreground">
            Weather data provided by OpenWeatherMap • Last updated {lastSyncTime ? format(new Date(lastSyncTime), 'h:mm a') : 'Never'}
          </p>
        </div>
      </div>
    </div>
  );
}