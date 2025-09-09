import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useWeather } from '@/hooks/useWeather';
import { AnimatedWeatherBackground } from '@/components/weather/AnimatedWeatherBackground';
import { 
  MapPin,
  Thermometer,
  Droplets,
  Wind,
  Eye,
  Gauge,
  Sun,
  Sunrise,
  Sunset,
  CloudRain,
  CloudSnow,
  Cloud,
  CloudLightning,
  Waves,
  Navigation,
  Activity,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Loader2,
  Umbrella,
  Shirt,
  Home as HomeIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const Weather: React.FC = () => {
  const { t } = useTranslation();
  const { currentWeather, forecast, hourlyForecast, loading, error, location } = useWeather();
  const [activeTab, setActiveTab] = useState('today');

  const getWeatherIcon = (condition: string, size: string = "h-6 w-6") => {
    const weather = condition.toLowerCase();
    if (weather.includes('thunder')) return <CloudLightning className={cn(size, "text-purple-400")} />;
    if (weather.includes('rain')) return <CloudRain className={cn(size, "text-blue-400")} />;
    if (weather.includes('snow')) return <CloudSnow className={cn(size, "text-blue-200")} />;
    if (weather.includes('cloud')) return <Cloud className={cn(size, "text-gray-400")} />;
    if (weather.includes('clear')) return <Sun className={cn(size, "text-yellow-400")} />;
    return <Sun className={cn(size, "text-yellow-400")} />;
  };

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  const getUVIndexInfo = (uv?: number) => {
    if (!uv) return { level: 'Low', color: 'bg-green-500', textColor: 'text-green-500', advice: 'Safe' };
    if (uv <= 2) return { level: 'Low', color: 'bg-green-500', textColor: 'text-green-500', advice: 'Safe' };
    if (uv <= 5) return { level: 'Moderate', color: 'bg-yellow-500', textColor: 'text-yellow-500', advice: 'Use SPF 30+' };
    if (uv <= 7) return { level: 'High', color: 'bg-orange-500', textColor: 'text-orange-500', advice: 'Use SPF 50+' };
    if (uv <= 10) return { level: 'Very High', color: 'bg-red-500', textColor: 'text-red-500', advice: 'Avoid sun' };
    return { level: 'Extreme', color: 'bg-purple-500', textColor: 'text-purple-500', advice: 'Stay inside' };
  };

  const getAgriculturalAdvice = () => {
    if (!currentWeather) return null;
    const advice = [];
    
    if (currentWeather.humidity > 80) {
      advice.push({ icon: Droplets, text: 'High humidity - Monitor for fungal diseases', type: 'warning' });
    }
    if (currentWeather.wind_speed > 20) {
      advice.push({ icon: Wind, text: 'Strong winds - Postpone spraying', type: 'danger' });
    }
    if (currentWeather.temp > 35) {
      advice.push({ icon: Thermometer, text: 'High temperature - Increase irrigation', type: 'warning' });
    }
    if (forecast[0]?.pop > 0.3) {
      advice.push({ icon: Umbrella, text: 'Rain expected - Delay fertilization', type: 'info' });
    }
    
    return advice;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading weather...</p>
          <p className="text-xs text-muted-foreground mt-1 opacity-60">Getting your location...</p>
        </div>
      </div>
    );
  }

  if (error || !currentWeather) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-background/95 flex items-center justify-center p-4">
        <Card className="max-w-sm w-full backdrop-blur-sm bg-card/80">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
            <p className="font-medium mb-1">Weather Unavailable</p>
            <p className="text-sm text-muted-foreground">{error || 'Check connection'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const uvInfo = getUVIndexInfo(currentWeather.uv_index);
  const agriculturalAdvice = getAgriculturalAdvice();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 pb-20">
      {/* Hero Section - Mobile Optimized */}
      <AnimatedWeatherBackground 
        condition={currentWeather.main} 
        className="relative h-[45vh] md:h-[50vh]"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />
        
        <div className="relative z-10 h-full flex flex-col justify-between p-4 md:p-6">
          {/* Location Header */}
          <div className="flex items-start justify-between">
            <div>
              <Badge variant="secondary" className="backdrop-blur-sm bg-background/30 border-white/20 mb-2">
                <MapPin className="h-3 w-3 mr-1" />
                {currentWeather.location || 'Current Location'}
              </Badge>
              <p className="text-xs text-white/60">
                {format(new Date(), 'EEEE, MMM d')}
              </p>
            </div>
            {currentWeather.provider && (
              <Badge variant="outline" className="backdrop-blur-sm bg-background/20 border-white/10 text-[10px]">
                {currentWeather.provider}
              </Badge>
            )}
          </div>

          {/* Main Temperature Display */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="flex items-center justify-center gap-3">
                {getWeatherIcon(currentWeather.main, "h-12 w-12 md:h-16 md:w-16")}
                <h1 className="text-6xl md:text-7xl font-bold text-white">
                  {Math.round(currentWeather.temp)}°
                </h1>
              </div>
              <p className="text-lg md:text-xl capitalize text-white/90 mt-1">
                {currentWeather.description}
              </p>
              <p className="text-sm text-white/70">
                Feels like {Math.round(currentWeather.feels_like)}°
              </p>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: TrendingUp, value: `${Math.round(currentWeather.temp_max)}°`, label: 'High' },
              { icon: TrendingDown, value: `${Math.round(currentWeather.temp_min)}°`, label: 'Low' },
              { icon: Droplets, value: `${currentWeather.humidity}%`, label: 'Humidity' },
              { icon: Wind, value: `${Math.round(currentWeather.wind_speed)}km/h`, label: 'Wind' },
            ].map((stat, idx) => (
              <div key={idx} className="backdrop-blur-sm bg-white/10 rounded-lg p-2 text-center">
                <stat.icon className="h-4 w-4 mx-auto mb-1 text-white/70" />
                <p className="text-sm font-semibold text-white">{stat.value}</p>
                <p className="text-[10px] text-white/60">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </AnimatedWeatherBackground>

      {/* Content Section */}
      <div className="p-4 md:p-6 -mt-4 relative z-20">
        {/* Agricultural Insights - Mobile Card */}
        {agriculturalAdvice && agriculturalAdvice.length > 0 && (
          <Card className="mb-4 backdrop-blur-sm bg-card/90 border-muted/30">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Farm Advisory
              </h3>
              <div className="space-y-2">
                {agriculturalAdvice.map((advice, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <advice.icon className={cn(
                      "h-4 w-4 mt-0.5",
                      advice.type === 'warning' && "text-yellow-500",
                      advice.type === 'danger' && "text-red-500",
                      advice.type === 'info' && "text-blue-500"
                    )} />
                    <p className="text-xs text-muted-foreground">{advice.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weather Details Grid - Mobile Optimized */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Card className="backdrop-blur-sm bg-card/90 border-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Sunrise className="h-4 w-4 text-orange-400" />
                <span className="text-xs text-muted-foreground">Sunrise</span>
              </div>
              <p className="text-lg font-semibold">
                {format(new Date(currentWeather.sunrise * 1000), 'HH:mm')}
              </p>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-sm bg-card/90 border-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Sunset className="h-4 w-4 text-orange-600" />
                <span className="text-xs text-muted-foreground">Sunset</span>
              </div>
              <p className="text-lg font-semibold">
                {format(new Date(currentWeather.sunset * 1000), 'HH:mm')}
              </p>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-sm bg-card/90 border-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Activity className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-muted-foreground">UV Index</span>
              </div>
              <p className="text-lg font-semibold">{currentWeather.uv_index || 0}</p>
              <p className={cn("text-[10px] font-medium", uvInfo.textColor)}>
                {uvInfo.level}
              </p>
            </CardContent>
          </Card>

          <Card className="backdrop-blur-sm bg-card/90 border-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Gauge className="h-4 w-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">Pressure</span>
              </div>
              <p className="text-lg font-semibold">{currentWeather.pressure}</p>
              <p className="text-[10px] text-muted-foreground">hPa</p>
            </CardContent>
          </Card>
        </div>

        {/* More Details - Expandable Cards */}
        <Card className="mb-4 backdrop-blur-sm bg-card/90 border-muted/30">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <Eye className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Visibility</p>
                <p className="text-sm font-semibold">{(currentWeather.visibility / 1000).toFixed(1)}km</p>
              </div>
              <div className="text-center">
                <Navigation 
                  className="h-4 w-4 mx-auto mb-1 text-muted-foreground" 
                  style={{ transform: `rotate(${currentWeather.wind_deg}deg)` }}
                />
                <p className="text-xs text-muted-foreground">Wind Dir</p>
                <p className="text-sm font-semibold">{getWindDirection(currentWeather.wind_deg)}</p>
              </div>
              <div className="text-center">
                <Cloud className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Clouds</p>
                <p className="text-sm font-semibold">{currentWeather.clouds}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forecast Tabs - Mobile Optimized */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 bg-muted/50">
            <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
            <TabsTrigger value="tomorrow" className="text-xs">Tomorrow</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">7 Days</TabsTrigger>
          </TabsList>

          {/* Today - Hourly */}
          <TabsContent value="today" className="mt-0">
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {hourlyForecast.slice(0, 12).map((hour, index) => (
                  <Card key={index} className="min-w-[80px] backdrop-blur-sm bg-card/90 border-muted/30">
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">
                        {format(new Date(hour.dt * 1000), 'HH:mm')}
                      </p>
                      {getWeatherIcon(hour.weather[0]?.main || '', "h-6 w-6")}
                      <p className="text-lg font-semibold mt-1">{Math.round(hour.temp)}°</p>
                      {hour.pop > 0 && (
                        <div className="flex items-center justify-center gap-0.5 mt-1">
                          <Droplets className="h-3 w-3 text-blue-400" />
                          <span className="text-[10px]">{Math.round(hour.pop * 100)}%</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </TabsContent>

          {/* Tomorrow */}
          <TabsContent value="tomorrow" className="mt-0">
            {forecast[1] && (
              <Card className="backdrop-blur-sm bg-card/90 border-muted/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getWeatherIcon(forecast[1].weather[0]?.main || '', "h-10 w-10")}
                      <div>
                        <p className="font-semibold capitalize">{forecast[1].weather[0]?.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(forecast[1].dt * 1000), 'EEEE, MMM d')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold">{Math.round(forecast[1].temp.max)}°</span>
                        <span className="text-lg text-muted-foreground">{Math.round(forecast[1].temp.min)}°</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 pt-3 border-t">
                    <div className="text-center">
                      <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-400" />
                      <p className="text-xs">{Math.round(forecast[1].pop * 100)}%</p>
                    </div>
                    <div className="text-center">
                      <Wind className="h-4 w-4 mx-auto mb-1 text-gray-400" />
                      <p className="text-xs">{Math.round(forecast[1].wind_speed)}km/h</p>
                    </div>
                    <div className="text-center">
                      <Thermometer className="h-4 w-4 mx-auto mb-1 text-orange-400" />
                      <p className="text-xs">{Math.round(forecast[1].humidity)}%</p>
                    </div>
                    <div className="text-center">
                      <Sun className="h-4 w-4 mx-auto mb-1 text-yellow-400" />
                      <p className="text-xs">{forecast[1].uvi || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Week View */}
          <TabsContent value="week" className="mt-0">
            <div className="space-y-2">
              {forecast.slice(0, 7).map((day, index) => (
                <Card key={index} className="backdrop-blur-sm bg-card/90 border-muted/30">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-12">
                          <p className="text-xs font-semibold">
                            {index === 0 ? 'Today' : format(new Date(day.dt * 1000), 'EEE')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(day.dt * 1000), 'MMM d')}
                          </p>
                        </div>
                        {getWeatherIcon(day.weather[0]?.main || '', "h-6 w-6")}
                        <p className="text-xs text-muted-foreground capitalize flex-1">
                          {day.weather[0]?.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {day.pop > 0 && (
                          <div className="flex items-center gap-0.5">
                            <Droplets className="h-3 w-3 text-blue-400" />
                            <span className="text-xs">{Math.round(day.pop * 100)}%</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{Math.round(day.temp.max)}°</span>
                          <span className="text-xs text-muted-foreground">{Math.round(day.temp.min)}°</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Weather;