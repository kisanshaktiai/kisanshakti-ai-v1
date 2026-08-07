import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useTranslation } from 'react-i18next';
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
import { RainfallChart } from '@/components/weather/RainfallChart';
import { VoiceWeatherSummary } from '@/components/weather/VoiceWeatherSummary';
import { WeatherHeroCard } from '@/components/weather/WeatherHeroCard';
import { FarmingRecommendations } from '@/components/weather/FarmingRecommendations';
import { PageShell } from '@/components/layout/PageShell';

import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';
import { useLandWeatherState } from '@/hooks/useLandWeatherState';
import { LandAgronomyPanel } from '@/components/weather/LandAgronomyPanel';
// Weather sync now handled by backend edge function
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toastManager } from '@/utils/ToastManager';
import { WeatherSkeleton } from '@/components/skeletons';
import { PullRefreshController } from '@/components/weather/PullRefreshController';
import { HourlyForecastChart } from '@/components/weather/HourlyForecastChart';
import { SevenDayForecast } from '@/components/weather/SevenDayForecast';

export default function Weather() {
  const { t } = useTranslation();
  const {
    currentWeather, forecast, hourlyForecast, loading, error, refetch, lastUpdated,
    locationSource, regionalFallbackLabel, weatherDistanceKm, weatherStationName, isStale,
  } = useWeather();

  // MODEL B — land-scoped agronomy. Display weather may borrow a nearby cell;
  // irrigation/GDD/disease never may, so they are keyed to one selected land.
  const { lands } = useLands();
  const [selectedLandId, setSelectedLandId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedLandId && lands?.length) setSelectedLandId(lands[0].id);
  }, [lands, selectedLandId]);
  const { state: landState, isToday: landStateIsToday, isLoading: landStateLoading } =
    useLandWeatherState(selectedLandId);
  const selectedLand = lands?.find((l: any) => l.id === selectedLandId);

  
  /**
   * FIX: Removed problematic useEffect with touch listeners
   * ROOT CAUSE: useEffect dependencies [startY, pullDistance] caused constant re-runs,
   * re-attaching listeners and triggering multiple refresh calls
   * SOLUTION: Use PullRefreshController component instead
   */

  // Manual refresh function with toast deduplication
  const handleManualSync = async () => {
    try {
      await refetch();
      toastManager.success(t('weather.toast.sync_success'), 'weather-sync-success');
    } catch (err) {
      toastManager.error(t('weather.toast.sync_error'), 'weather-sync-error');
      throw err; // Re-throw for PullRefreshController to handle
    }
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
      sun: 'from-warning/20 via-warning/10 to-background',
      rain: 'from-info/20 via-info/10 to-background',
      clouds: 'from-gray-400/20 via-gray-300/10 to-background',
      storm: 'from-primary/20 via-primary/10 to-background',
      snow: 'from-info/20 via-info/10 to-background',
      fog: 'from-gray-500/20 via-gray-400/10 to-background',
      night: 'from-info/20 via-info/10 to-background'
    };
    return gradients[condition] || gradients.clouds;
  };

  const getStatColor = (type: string, value: number) => {
    switch(type) {
      case 'humidity':
        return value > 70 ? 'text-info' : value > 40 ? 'text-info' : 'text-foreground/80';
      case 'wind':
        return value > 20 ? 'text-warning' : value > 10 ? 'text-warning' : 'text-success';
      case 'visibility':
        return value < 2 ? 'text-destructive' : value < 5 ? 'text-warning' : 'text-success';
      case 'pressure':
        return value < 1000 ? 'text-info' : value > 1020 ? 'text-destructive' : 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  if (loading) {
    return <WeatherSkeleton />;
  }

  if (error || !currentWeather) {
    return (
      <PageShell variant="gradient-soft" className="flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="max-w-md w-full bg-background/60 backdrop-blur-xl border-border/50 shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t('weather.error.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {error || t('weather.error.message')}
              </p>
              <Button onClick={handleManualSync} className="w-full" size="lg">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('weather.error.retry')}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </PageShell>
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
    <PageShell variant="plain" padding="none" spacing="none" className="relative">
      <AnimatedWeatherBackground condition={currentWeather.main || 'clear'} className="opacity-30 fixed inset-0 pointer-events-none" />

      {/* PullRefreshController inherits the global scroll container — no nested scroller. */}
      <PullRefreshController onRefresh={handleManualSync} threshold={80}>
        <div className="relative z-10">
          {/* Hero Section with Weather Info */}
          <WeatherHeroCard
            currentWeather={currentWeather}
            location={currentWeather.location || 'Current Location'}
            lastSyncTime={lastUpdated ? new Date(lastUpdated) : null}
            isRefreshing={false}
            onRefresh={handleManualSync}
            weatherIcon={getWeatherIcon(currentWeather.main, 'large')}
            weatherCondition={getWeatherCondition()}
            gradient={getWeatherGradient()}
            lastUpdated={lastUpdated}
            locationSource={locationSource as any}
            regionalFallbackLabel={regionalFallbackLabel}
            weatherDistanceKm={weatherDistanceKm}
            weatherStationName={weatherStationName}
            isStale={isStale}
          />

          {/* Land selector — only meaningful when the farmer has multiple fields */}
          {lands && lands.length > 1 && (
            <div className="px-4 pt-3">
              <Select value={selectedLandId} onValueChange={setSelectedLandId}>
                <SelectTrigger className="h-9 text-xs rounded-xl">
                  <SelectValue placeholder={t('weather.field.select')} />
                </SelectTrigger>
                <SelectContent>
                  {lands.map((l: any) => (
                    <SelectItem key={l.id} value={l.id} className="text-xs">
                      {l.name}{l.area_acres ? ` · ${l.area_acres} ac` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* MODEL B — DB-derived field intelligence */}
          {selectedLandId && (
            <LandAgronomyPanel
              state={landState}
              landName={selectedLand?.name}
              isToday={landStateIsToday}
              isLoading={landStateLoading}
            />
          )}



          {/* Sunrise/Sunset Row - NEW: Shows real data from API */}
          {(currentWeather.sunrise || currentWeather.sunset) && (
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.15 }}
              className="px-3 pt-3 pb-1"
            >
              <div className="flex justify-center gap-6">
                {currentWeather.sunrise && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-warning/10 to-warning/10 border border-warning/20">
                    <Sunrise className="h-4 w-4 text-warning" />
                    <span className="text-xs font-medium">
                      {format(new Date(currentWeather.sunrise * 1000), 'h:mm a')}
                    </span>
                  </div>
                )}
                {currentWeather.sunset && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-primary/10 to-info/10 border border-primary/20">
                    <Sunset className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">
                      {format(new Date(currentWeather.sunset * 1000), 'h:mm a')}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Quick Stats Grid - Modern 2030 Design */}
          <div className="px-3 py-2 relative z-20">
            <motion.div 
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.2 }}
              className="grid grid-cols-3 gap-2"
            >
              {/* Row 1: Primary Stats */}
              {[
                { icon: Wind, label: 'Wind', value: Math.round(currentWeather.wind_speed * 3.6), unit: 'km/h', type: 'wind', gradient: 'from-info/10 to-info/10' },
                { icon: Droplets, label: 'Humidity', value: currentWeather.humidity, unit: '%', type: 'humidity', gradient: 'from-info/10 to-info/10' },
                { icon: Eye, label: 'Visibility', value: (currentWeather.visibility / 1000).toFixed(1), unit: 'km', type: 'visibility', gradient: 'from-success/10 to-success/10' }
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  variants={scaleIn}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.25 + index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "bg-gradient-to-br backdrop-blur-xl rounded-2xl p-3 border border-white/10 shadow-sm",
                    stat.gradient
                  )}
                >
                  <div className="flex flex-col items-center text-center gap-1">
                    <stat.icon className={cn("h-5 w-5", getStatColor(stat.type, Number(stat.value)))} />
                    <span className={cn("text-xl font-bold tracking-tight", getStatColor(stat.type, Number(stat.value)))}>
                      {stat.value}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium">{stat.label}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Row 2: Secondary Stats + Voice */}
            <motion.div 
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
              transition={{ delay: 0.3 }}
              className="grid grid-cols-4 gap-2 mt-2"
            >
              {/* Voice Button */}
              <motion.div
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-primary/10 to-primary/5 backdrop-blur-xl rounded-2xl p-2 border border-primary/20 shadow-sm flex items-center justify-center"
              >
                <VoiceWeatherSummary
                  currentWeather={currentWeather}
                  forecast={forecast}
                  className="w-full"
                />
              </motion.div>

              {/* Pressure */}
              <motion.div
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.35 }}
                className="bg-gradient-to-br from-gray-500/10 to-slate-500/10 backdrop-blur-xl rounded-2xl p-2 border border-white/10 shadow-sm"
              >
                <div className="flex flex-col items-center text-center gap-0.5">
                  <Gauge className="h-4 w-4 text-foreground/80" />
                  <span className="text-sm font-bold">{currentWeather.pressure}</span>
                  <span className="text-[9px] text-muted-foreground">hPa</span>
                </div>
              </motion.div>

              {/* UV Index - NEW: Real data from API */}
              <motion.div
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.4 }}
                className={cn(
                  "bg-gradient-to-br backdrop-blur-xl rounded-2xl p-2 border border-white/10 shadow-sm",
                  currentWeather.uv_index !== undefined && currentWeather.uv_index > 7 
                    ? "from-destructive/10 to-warning/10" 
                    : currentWeather.uv_index !== undefined && currentWeather.uv_index > 3 
                      ? "from-warning/10 to-warning/10"
                      : "from-success/10 to-success/10"
                )}
              >
                <div className="flex flex-col items-center text-center gap-0.5">
                  <Sun className={cn(
                    "h-4 w-4",
                    currentWeather.uv_index !== undefined && currentWeather.uv_index > 7 
                      ? "text-destructive" 
                      : currentWeather.uv_index !== undefined && currentWeather.uv_index > 3 
                        ? "text-warning"
                        : "text-success"
                  )} />
                  <span className="text-sm font-bold">
                    {currentWeather.uv_index !== undefined ? currentWeather.uv_index.toFixed(1) : '--'}
                  </span>
                  <span className="text-[9px] text-muted-foreground">UV</span>
                </div>
              </motion.div>

              {/* Dew Point - NEW: Real data from API */}
              <motion.div
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={{ delay: 0.45 }}
                className="bg-gradient-to-br from-success/10 to-info/10 backdrop-blur-xl rounded-2xl p-2 border border-white/10 shadow-sm"
              >
                <div className="flex flex-col items-center text-center gap-0.5">
                  <Thermometer className="h-4 w-4 text-success" />
                  <span className="text-sm font-bold">
                    {currentWeather.dew_point !== undefined ? Math.round(currentWeather.dew_point) : '--'}°
                  </span>
                  <span className="text-[9px] text-muted-foreground">Dew Pt</span>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Main Scrollable Content */}
          <div className="pb-24 space-y-1">
            {/* Farming Recommendations */}
            <FarmingRecommendations
              currentWeather={currentWeather}
              forecast={forecast}
              landState={landStateIsToday ? landState : null}
            />


            {/* Hourly Forecast Chart - NEW: Line chart instead of cards */}
            {hourlyForecast && hourlyForecast.length > 0 && (
              <HourlyForecastChart hourlyForecast={hourlyForecast} />
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
                      {t('weather.rainfall.title')}
                    </span>
                    <Badge variant="secondary" className="text-xs">{t('weather.forecast.days_7')}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t('weather.rainfall.today')}</p>
                      <p className="text-lg font-bold text-primary">
                        {forecast && forecast[0]?.rain ? forecast[0].rain.toFixed(1) : '0.0'} {t('weather.units.mm')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">{t('weather.rainfall.week')}</p>
                      <p className="text-lg font-bold text-primary">
                        {forecast ? forecast.slice(0, 7).reduce((sum, day) => sum + (day.rain || 0), 0).toFixed(1) : '0.0'} {t('weather.units.mm')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="h-24">
                    <RainfallChart data={rainfallData} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* 7-Day Forecast - Modern 2030 Component */}
            <SevenDayForecast forecast={forecast} />
          </div>
        </div>
      </PullRefreshController>
    </PageShell>
  );
};
