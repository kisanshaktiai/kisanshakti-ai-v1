import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, 
  Thermometer, CloudSnow, CloudDrizzle, CloudLightning,
  Sunrise, Sunset, Navigation, AlertTriangle, Info,
  TrendingUp, TrendingDown, Calendar, MapPin
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AnimatedWeatherBackground } from '@/components/weather/AnimatedWeatherBackground';
import { WeatherCard } from '@/components/weather/WeatherCard';
import { RainfallChart } from '@/components/weather/RainfallChart';
import { WeatherAnimation } from '@/components/weather/WeatherAnimation';
import { SyncIndicator } from '@/components/weather/SyncIndicator';
import { AgriculturalInsights } from '@/components/weather/AgriculturalInsights';
import { useWeather } from '@/hooks/useWeather';
import { useWeatherSync } from '@/hooks/useWeatherSync';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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

  // Save weather data on load and updates
  useEffect(() => {
    if (currentWeather) {
      // Extract rainfall from forecast if available
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

  const getWeatherIcon = (condition: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      'Clear': <Sun className="h-8 w-8" />,
      'Clouds': <Cloud className="h-8 w-8" />,
      'Rain': <CloudRain className="h-8 w-8" />,
      'Drizzle': <CloudDrizzle className="h-8 w-8" />,
      'Thunderstorm': <CloudLightning className="h-8 w-8" />,
      'Snow': <CloudSnow className="h-8 w-8" />,
      'Mist': <Cloud className="h-8 w-8" />,
      'Fog': <Cloud className="h-8 w-8" />,
    };
    return iconMap[condition] || <Cloud className="h-8 w-8" />;
  };

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="h-20 w-20 mx-auto rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Cloud className="h-10 w-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading weather data...</p>
        </div>
      </div>
    );
  }

  if (error || !currentWeather) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-destructive/5">
        <Card className="max-w-md w-full bg-background/60 backdrop-blur-xl border-border/50">
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
            <Button onClick={handleRefresh} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Prepare rainfall chart data
  const rainfallData = forecast.slice(0, 7).map((day, index) => ({
    date: new Date(day.dt * 1000).toISOString().split('T')[0],
    rainfall: day.rain || 0,
    cumulative: forecast.slice(0, index + 1).reduce((sum, d) => sum + (d.rain || 0), 0)
  }));

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-background via-background to-primary/5">
      <AnimatedWeatherBackground condition={currentWeather.main || 'clear'} />
      <WeatherAnimation condition={getWeatherCondition()} />
      
      <div className="relative z-10 container mx-auto px-4 py-6 space-y-6 pb-20">
        {/* Header with location and sync */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {currentWeather.location || 'Weather Dashboard'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
          
          <SyncIndicator
            lastSyncTime={lastSyncTime}
            syncStatus={syncStatus}
            isSyncing={isSyncing || isRefreshing}
            onSync={handleRefresh}
          />
        </div>

        {/* Current Weather Hero Card */}
        <Card className="bg-background/60 backdrop-blur-xl border-border/50 overflow-hidden">
          <div className="relative p-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Weather Display */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-6">
                  <div className="p-4 rounded-2xl bg-primary/10">
                    {getWeatherIcon(currentWeather.main)}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-6xl font-bold text-foreground">
                        {Math.round(currentWeather.temp)}
                      </span>
                      <span className="text-3xl text-muted-foreground">°C</span>
                    </div>
                    <p className="text-xl text-muted-foreground capitalize">
                      {currentWeather.description}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Feels like {Math.round(currentWeather.feels_like)}°C
                    </p>
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Wind className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Wind</p>
                      <p className="text-sm font-medium">
                        {Math.round(currentWeather.wind_speed * 3.6)} km/h
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Humidity</p>
                      <p className="text-sm font-medium">{currentWeather.humidity}%</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Visibility</p>
                      <p className="text-sm font-medium">
                        {(currentWeather.visibility / 1000).toFixed(1)} km
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pressure</p>
                      <p className="text-sm font-medium">{currentWeather.pressure} hPa</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rainfall Summary */}
              <div className="space-y-4">
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      Rainfall Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {todayRainfall.toFixed(1)} mm
                      </p>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground">This Week</p>
                      <p className="text-xl font-semibold text-blue-500">
                        {weeklyRainfall.toFixed(1)} mm
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </Card>

        {/* Weather Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <WeatherCard
            title="Sunrise / Sunset"
            value={format(new Date(currentWeather.sunrise * 1000), 'h:mm a')}
            description={`Sunset: ${format(new Date(currentWeather.sunset * 1000), 'h:mm a')}`}
            icon={<Sunrise className="h-5 w-5" />}
          />
          
          <WeatherCard
            title="UV Index"
            value={currentWeather.uv_index || 'N/A'}
            description={
              currentWeather.uv_index 
                ? currentWeather.uv_index <= 2 ? 'Low'
                  : currentWeather.uv_index <= 5 ? 'Moderate'
                  : currentWeather.uv_index <= 7 ? 'High'
                  : currentWeather.uv_index <= 10 ? 'Very High'
                  : 'Extreme'
                : 'No data'
            }
            icon={<Sun className="h-5 w-5" />}
          />
          
          <WeatherCard
            title="Wind Details"
            value={`${Math.round(currentWeather.wind_speed * 3.6)}`}
            unit="km/h"
            description={`Direction: ${getWindDirection(currentWeather.wind_deg)} (${currentWeather.wind_deg}°)`}
            icon={<Navigation className="h-5 w-5" />}
          />
        </div>

        {/* Rainfall Chart */}
        <RainfallChart data={rainfallData} />

        {/* Forecast Tabs */}
        <Card className="bg-background/60 backdrop-blur-xl border-border/50">
          <CardHeader>
            <CardTitle>Weather Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 w-full max-w-md">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
                <TabsTrigger value="week">7 Days</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="mt-4">
                <ScrollArea className="h-[200px]">
                  <div className="flex gap-4 pb-4">
                    {hourlyForecast.slice(0, 12).map((hour, index) => (
                      <Card key={index} className="min-w-[120px] bg-background/40">
                        <CardContent className="p-4 text-center">
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(hour.dt * 1000), 'h:mm a')}
                          </p>
                          <div className="my-2">
                            {getWeatherIcon(hour.weather[0].main)}
                          </div>
                          <p className="text-lg font-semibold">
                            {Math.round(hour.temp)}°
                          </p>
                          {hour.pop > 0 && (
                            <div className="flex items-center justify-center gap-1 mt-1">
                              <Droplets className="h-3 w-3 text-blue-500" />
                              <span className="text-xs">{Math.round(hour.pop * 100)}%</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="tomorrow" className="mt-4">
                {forecast[1] && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getWeatherIcon(forecast[1].weather[0].main)}
                        <div>
                          <p className="font-medium capitalize">
                            {forecast[1].weather[0].description}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(forecast[1].dt * 1000), 'EEEE, MMM d')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">
                          {Math.round(forecast[1].temp.max)}°/{Math.round(forecast[1].temp.min)}°
                        </p>
                        {forecast[1].pop > 0 && (
                          <div className="flex items-center gap-1 justify-end mt-1">
                            <Droplets className="h-4 w-4 text-blue-500" />
                            <span className="text-sm">{Math.round(forecast[1].pop * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="week" className="mt-4">
                <div className="space-y-3">
                  {forecast.slice(0, 7).map((day, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-8">
                          {getWeatherIcon(day.weather[0].main)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {format(new Date(day.dt * 1000), 'EEE')}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {day.weather[0].description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {day.pop > 0 && (
                          <div className="flex items-center gap-1">
                            <Droplets className="h-3 w-3 text-blue-500" />
                            <span className="text-sm">{Math.round(day.pop * 100)}%</span>
                          </div>
                        )}
                        <div className="text-right">
                          <span className="font-semibold">{Math.round(day.temp.max)}°</span>
                          <span className="text-muted-foreground ml-1">
                            {Math.round(day.temp.min)}°
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Agricultural Insights */}
        <AgriculturalInsights weather={currentWeather} forecast={forecast} />

        {/* Data Provider Attribution */}
        <div className="text-center text-xs text-muted-foreground">
          Weather data provided by {currentWeather.provider || 'OpenWeather'} • 
          Last updated: {format(new Date(currentWeather.dt * 1000), 'h:mm a')}
        </div>
      </div>
    </div>
  );
}