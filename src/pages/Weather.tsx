import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { motion } from 'framer-motion';

export default function Weather() {
  const navigate = useNavigate();
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
  const [showAlerts, setShowAlerts] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pull-to-refresh implementation
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  useEffect(() => {
    if (currentWeather) {
      const rainfallMm = forecast?.[0]?.rain || 0;
      saveWeatherObservation(currentWeather, rainfallMm);
    }
  }, [currentWeather]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), triggerManualSync()]);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

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
      small: 'h-5 w-5',
      medium: 'h-8 w-8',
      large: 'h-12 w-12'
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

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-primary/5">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="relative">
            <div className="h-20 w-20 mx-auto rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Cloud className="h-10 w-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading weather data...</p>
        </motion.div>
      </div>
    );
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
              <Button onClick={handleRefresh} className="w-full" size="lg">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Prepare rainfall chart data
  const rainfallData = forecast.slice(0, 7).map((day, index) => ({
    date: format(new Date(day.dt * 1000), 'EEE'),
    rainfall: day.rain || 0,
    cumulative: forecast.slice(0, index + 1).reduce((sum, d) => sum + (d.rain || 0), 0)
  }));

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-background to-background/95" ref={containerRef}>
      <AnimatedWeatherBackground condition={currentWeather.main || 'clear'} className="opacity-30" />
      
      <div className="relative z-10">
        {/* Hero Section with Weather Info */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`relative bg-gradient-to-br ${getWeatherGradient()} overflow-hidden`}
        >
          {/* Animated weather particles */}
          <WeatherAnimation condition={getWeatherCondition()} className="opacity-20" />
          
          <div className="relative z-10 px-4 pt-6 pb-8">
            {/* Location and Sync Row */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h1 className="text-lg font-semibold text-foreground/90 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {currentWeather.location || 'Current Location'}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {format(new Date(), 'EEE, MMM d')}
                </p>
              </div>
              
              {/* Sync Button with Animation */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                className="relative p-2 rounded-full bg-background/20 backdrop-blur-sm border border-white/10"
              >
                <RefreshCw className={cn(
                  "h-4 w-4 text-white",
                  (isSyncing || isRefreshing) && "animate-spin"
                )} />
                {lastSyncTime && (
                  <span className="absolute -bottom-5 right-0 text-[10px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(lastSyncTime), 'h:mm a')}
                  </span>
                )}
              </motion.button>
            </div>

            {/* Main Weather Display */}
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-7xl font-bold text-foreground">
                    {Math.round(currentWeather.temp)}
                  </span>
                  <span className="text-3xl text-muted-foreground">°C</span>
                </motion.div>
                
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-xl font-medium capitalize text-foreground/90 mt-2">
                    {currentWeather.description}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Thermometer className="h-3 w-3" />
                    Feels like {Math.round(currentWeather.feels_like)}°C
                  </p>
                </motion.div>
              </div>

              {/* Animated Weather Icon */}
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
                className="p-6 rounded-full bg-white/10 backdrop-blur-sm"
              >
                {getWeatherIcon(currentWeather.main, 'large')}
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats Grid */}
        <div className="px-4 -mt-4 relative z-20">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-2 gap-3"
          >
            {[
              { icon: Wind, label: 'Wind', value: Math.round(currentWeather.wind_speed * 3.6), unit: 'km/h', type: 'wind' },
              { icon: Droplets, label: 'Humidity', value: currentWeather.humidity, unit: '%', type: 'humidity' },
              { icon: Eye, label: 'Visibility', value: (currentWeather.visibility / 1000).toFixed(1), unit: 'km', type: 'visibility' },
              { icon: Gauge, label: 'Pressure', value: currentWeather.pressure, unit: 'hPa', type: 'pressure' }
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                whileTap={{ scale: 0.98 }}
                className="bg-card/90 backdrop-blur-xl rounded-2xl p-4 border border-border/50 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className={cn("h-4 w-4", getStatColor(stat.type, Number(stat.value)))} />
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-2xl font-bold", getStatColor(stat.type, Number(stat.value)))}>
                        {stat.value}
                      </span>
                      <span className="text-sm text-muted-foreground">{stat.unit}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "h-8 w-1 rounded-full",
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
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="px-4 mt-6"
        >
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-200/20 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Droplets className="h-5 w-5 text-blue-500" />
                  Rainfall Summary
                </CardTitle>
                <div className="flex gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Today</p>
                    <p className="text-xl font-bold text-blue-600">{todayRainfall.toFixed(1)}mm</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Week</p>
                    <p className="text-xl font-bold text-cyan-600">{weeklyRainfall.toFixed(1)}mm</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <RainfallChart data={rainfallData} className="h-32" />
            </CardContent>
          </Card>
        </motion.div>

        {/* Forecast Tabs with Pill Style */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="px-4 mt-6"
        >
          <Card className="bg-card/90 backdrop-blur-xl border-border/50 shadow-xl rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Weather Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 w-full bg-muted/50 rounded-full p-1">
                  <TabsTrigger 
                    value="today" 
                    className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Today
                  </TabsTrigger>
                  <TabsTrigger 
                    value="tomorrow"
                    className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    Tomorrow
                  </TabsTrigger>
                  <TabsTrigger 
                    value="week"
                    className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    7 Days
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="today" className="mt-4">
                  <ScrollArea className="w-full">
                    <div className="flex gap-3 pb-2">
                      {hourlyForecast.slice(0, 12).map((hour, index) => (
                        <motion.div
                          key={index}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="min-w-[100px]"
                        >
                          <Card className="bg-gradient-to-br from-background/60 to-background/40 border-border/30 rounded-xl">
                            <CardContent className="p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-2">
                                {format(new Date(hour.dt * 1000), 'h:mm a')}
                              </p>
                              <div className="my-2 flex justify-center">
                                {getWeatherIcon(hour.weather[0].main, 'small')}
                              </div>
                              <p className="text-lg font-bold">
                                {Math.round(hour.temp)}°
                              </p>
                              {hour.pop > 0 && (
                                <div className="flex items-center justify-center gap-1 mt-2">
                                  <Droplets className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs font-medium">{Math.round(hour.pop * 100)}%</span>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tomorrow" className="mt-4">
                  {forecast[1] && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-4"
                    >
                      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 rounded-xl">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-3 rounded-xl bg-background/50">
                                {getWeatherIcon(forecast[1].weather[0].main)}
                              </div>
                              <div>
                                <p className="font-semibold text-lg capitalize">
                                  {forecast[1].weather[0].description}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(forecast[1].dt * 1000), 'EEEE, MMM d')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold">{Math.round(forecast[1].temp.max)}°</span>
                                <span className="text-xl text-muted-foreground">/{Math.round(forecast[1].temp.min)}°</span>
                              </div>
                              {forecast[1].pop > 0 && (
                                <Badge variant="secondary" className="mt-2">
                                  <Droplets className="h-3 w-3 mr-1" />
                                  {Math.round(forecast[1].pop * 100)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {/* Farming Suitability Badge */}
                          <div className="mt-4 flex gap-2">
                            <Badge className="bg-green-500/10 text-green-600 border-green-200">
                              <Sprout className="h-3 w-3 mr-1" />
                              Good for Planting
                            </Badge>
                            <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">
                              <Umbrella className="h-3 w-3 mr-1" />
                              Light Irrigation
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </TabsContent>

                <TabsContent value="week" className="mt-4">
                  <div className="space-y-2">
                    {forecast.slice(0, 7).map((day, index) => (
                      <motion.div
                        key={index}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Card className="bg-background/60 border-border/30 rounded-xl hover:bg-muted/30 transition-all">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-muted/50">
                                  {getWeatherIcon(day.weather[0].main, 'small')}
                                </div>
                                <div>
                                  <p className="font-semibold">
                                    {format(new Date(day.dt * 1000), 'EEE, MMM d')}
                                  </p>
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {day.weather[0].description}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {day.pop > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    <Droplets className="h-3 w-3 mr-1" />
                                    {Math.round(day.pop * 100)}%
                                  </Badge>
                                )}
                                <div className="text-right">
                                  <span className="text-xl font-bold">{Math.round(day.temp.max)}°</span>
                                  <span className="text-base text-muted-foreground ml-1">
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
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>

        {/* Agricultural Insights - Redesigned */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="px-4 mt-6"
        >
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-200/20 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-green-500" />
                Agricultural Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Recommendation Cards */}
              <div className="grid grid-cols-3 gap-2">
                <motion.div 
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-3 text-white text-center"
                >
                  <Droplets className="h-6 w-6 mx-auto mb-1" />
                  <p className="text-xs font-semibold">Irrigation</p>
                  <p className="text-[10px] opacity-90">Recommended</p>
                </motion.div>
                
                <motion.div 
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-3 text-white text-center"
                >
                  <Activity className="h-6 w-6 mx-auto mb-1" />
                  <p className="text-xs font-semibold">Spraying</p>
                  <p className="text-[10px] opacity-90">Good Time</p>
                </motion.div>
                
                <motion.div 
                  whileTap={{ scale: 0.95 }}
                  className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-3 text-white text-center"
                >
                  <Sprout className="h-6 w-6 mx-auto mb-1" />
                  <p className="text-xs font-semibold">Planting</p>
                  <p className="text-[10px] opacity-90">Suitable</p>
                </motion.div>
              </div>

              {/* Crop Recommendations */}
              <div className="flex flex-wrap gap-2 mt-3">
                {['Rice', 'Wheat', 'Cotton', 'Sugarcane'].map((crop) => (
                  <Badge 
                    key={crop}
                    className="bg-green-100 text-green-700 border-green-200 rounded-full px-3 py-1"
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
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="px-4 mt-6 pb-24"
        >
          <WeatherMap />
        </motion.div>

        {/* Data Provider Attribution */}
        <div className="text-center py-4 px-4">
          <p className="text-xs text-muted-foreground">
            Weather data provided by OpenWeatherMap
          </p>
        </div>
      </div>
    </div>
  );
}