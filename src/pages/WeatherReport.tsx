import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const WeatherReport: React.FC = () => {
  const { t } = useTranslation();
  const { currentWeather, forecast, hourlyForecast, loading, error, location } = useWeather();

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
    if (!uv) return { level: 'Low', color: 'bg-green-500', advice: 'Safe for outdoor activities' };
    if (uv <= 2) return { level: 'Low', color: 'bg-green-500', advice: 'Safe for outdoor activities' };
    if (uv <= 5) return { level: 'Moderate', color: 'bg-yellow-500', advice: 'Wear sunscreen' };
    if (uv <= 7) return { level: 'High', color: 'bg-orange-500', advice: 'Seek shade during midday' };
    if (uv <= 10) return { level: 'Very High', color: 'bg-red-500', advice: 'Take extra precautions' };
    return { level: 'Extreme', color: 'bg-purple-500', advice: 'Avoid outdoor exposure' };
  };

  const getMoonPhase = (phase?: number) => {
    if (!phase) return { icon: '🌑', name: 'New Moon' };
    if (phase < 0.125) return { icon: '🌑', name: 'New Moon' };
    if (phase < 0.25) return { icon: '🌒', name: 'Waxing Crescent' };
    if (phase < 0.375) return { icon: '🌓', name: 'First Quarter' };
    if (phase < 0.5) return { icon: '🌔', name: 'Waxing Gibbous' };
    if (phase < 0.625) return { icon: '🌕', name: 'Full Moon' };
    if (phase < 0.75) return { icon: '🌖', name: 'Waning Gibbous' };
    if (phase < 0.875) return { icon: '🌗', name: 'Last Quarter' };
    return { icon: '🌘', name: 'Waning Crescent' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground animate-pulse">Loading weather data...</p>
          <p className="text-xs text-muted-foreground mt-2">Accessing your location...</p>
        </div>
      </div>
    );
  }

  if (error || !currentWeather) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-semibold mb-2">Unable to load weather data</p>
            <p className="text-muted-foreground text-sm">{error || 'Please check your connection and try again.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const uvInfo = getUVIndexInfo(currentWeather.uv_index);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background">
      {/* Hero Section with Animated Background */}
      <AnimatedWeatherBackground 
        condition={currentWeather.main} 
        className="relative h-[400px] md:h-[500px]"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/90" />
        
        <div className="relative z-10 h-full flex flex-col justify-end p-6 md:p-8">
          <div className="max-w-7xl mx-auto w-full">
            {/* Location Badge */}
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="secondary" className="backdrop-blur-md bg-background/20 border-white/20">
                <MapPin className="h-3 w-3 mr-1" />
                {currentWeather.location || `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`}
              </Badge>
              {currentWeather.provider && (
                <Badge variant="outline" className="backdrop-blur-md bg-background/20 border-white/20 text-xs">
                  {currentWeather.provider}
                </Badge>
              )}
            </div>

            {/* Temperature Display */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-baseline gap-4">
                  <h1 className="text-7xl md:text-8xl font-bold text-foreground">
                    {Math.round(currentWeather.temp)}°
                  </h1>
                  <div className="text-2xl text-muted-foreground">
                    <p className="flex items-center gap-1">
                      <ChevronUp className="h-4 w-4" />
                      {Math.round(currentWeather.temp_max)}°
                    </p>
                    <p className="flex items-center gap-1">
                      <ChevronDown className="h-4 w-4" />
                      {Math.round(currentWeather.temp_min)}°
                    </p>
                  </div>
                </div>
                <p className="text-2xl capitalize text-foreground/90 mt-2">
                  {currentWeather.description}
                </p>
                <p className="text-lg text-muted-foreground">
                  Feels like {Math.round(currentWeather.feels_like)}°
                </p>
              </div>

              {/* Weather Icon */}
              <div className="hidden md:block">
                {getWeatherIcon(currentWeather.main, "h-24 w-24")}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mt-6">
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">Humidity</p>
                <p className="text-lg font-semibold">{currentWeather.humidity}%</p>
              </div>
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">Wind</p>
                <p className="text-lg font-semibold">{Math.round(currentWeather.wind_speed)} km/h</p>
              </div>
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">Pressure</p>
                <p className="text-lg font-semibold">{currentWeather.pressure} hPa</p>
              </div>
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">Visibility</p>
                <p className="text-lg font-semibold">{(currentWeather.visibility / 1000).toFixed(1)} km</p>
              </div>
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">Clouds</p>
                <p className="text-lg font-semibold">{currentWeather.clouds}%</p>
              </div>
              <div className="backdrop-blur-md bg-background/20 rounded-lg p-3 border border-white/10">
                <p className="text-xs text-muted-foreground">UV Index</p>
                <p className="text-lg font-semibold">{currentWeather.uv_index || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedWeatherBackground>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 md:p-8 -mt-8 relative z-20">
        {/* Weather Details Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Sun & Moon Card */}
          <Card className="backdrop-blur-md bg-card/50 border-muted/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sun className="h-5 w-5 text-yellow-500" />
                Sun & Moon
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Sunrise className="h-5 w-5 text-orange-400" />
                    <div>
                      <p className="text-sm text-muted-foreground">Sunrise</p>
                      <p className="font-semibold">{format(new Date(currentWeather.sunrise * 1000), 'HH:mm')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Sunset className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Sunset</p>
                      <p className="font-semibold">{format(new Date(currentWeather.sunset * 1000), 'HH:mm')}</p>
                    </div>
                  </div>
                </div>
                {forecast[0]?.moon_phase !== undefined && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Moon Phase</p>
                        <p className="font-semibold">{getMoonPhase(forecast[0].moon_phase).name}</p>
                      </div>
                      <div className="text-3xl">{getMoonPhase(forecast[0].moon_phase).icon}</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Wind & Air Card */}
          <Card className="backdrop-blur-md bg-card/50 border-muted/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wind className="h-5 w-5 text-blue-500" />
                Wind & Air
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Speed</p>
                    <p className="font-semibold">{Math.round(currentWeather.wind_speed)} km/h</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Direction</p>
                    <p className="font-semibold flex items-center gap-1">
                      <Navigation className="h-4 w-4" style={{ transform: `rotate(${currentWeather.wind_deg}deg)` }} />
                      {getWindDirection(currentWeather.wind_deg)}
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pressure</p>
                      <p className="font-semibold">{currentWeather.pressure} hPa</p>
                    </div>
                    {currentWeather.dew_point !== undefined && (
                      <div>
                        <p className="text-sm text-muted-foreground">Dew Point</p>
                        <p className="font-semibold">{Math.round(currentWeather.dew_point)}°</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* UV & Health Card */}
          <Card className="backdrop-blur-md bg-card/50 border-muted/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-500" />
                UV & Health
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">UV Index</p>
                    <Badge className={cn("text-white", uvInfo.color)}>
                      {uvInfo.level}
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div 
                      className={cn("h-full transition-all", uvInfo.color)}
                      style={{ width: `${Math.min((currentWeather.uv_index || 0) * 10, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{uvInfo.advice}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Forecast Tabs */}
        <Tabs defaultValue="hourly" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="hourly" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Hourly Forecast
            </TabsTrigger>
            <TabsTrigger value="daily" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              14-Day Forecast
            </TabsTrigger>
          </TabsList>

          {/* Hourly Forecast */}
          <TabsContent value="hourly" className="space-y-4">
            <ScrollArea className="h-[400px] w-full">
              <div className="flex gap-4 pb-4">
                {hourlyForecast.map((hour, index) => (
                  <Card key={index} className="min-w-[140px] backdrop-blur-md bg-card/50 border-muted/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm font-semibold mb-2">
                        {format(new Date(hour.dt * 1000), 'HH:mm')}
                      </p>
                      {getWeatherIcon(hour.weather[0]?.main || '', "h-8 w-8")}
                      <p className="text-2xl font-bold mt-2">{Math.round(hour.temp)}°</p>
                      <p className="text-xs text-muted-foreground">
                        {hour.weather[0]?.description}
                      </p>
                      {hour.pop > 0 && (
                        <div className="flex items-center justify-center gap-1 mt-2">
                          <Droplets className="h-3 w-3 text-blue-400" />
                          <span className="text-xs">{Math.round(hour.pop * 100)}%</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Daily Forecast */}
          <TabsContent value="daily" className="space-y-4">
            <ScrollArea className="h-[600px] w-full">
              <div className="space-y-3">
                {forecast.map((day, index) => (
                  <Card key={index} className="backdrop-blur-md bg-card/50 border-muted/50 hover:bg-card/70 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-20">
                            <p className="font-semibold">{format(new Date(day.dt * 1000), 'EEE')}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(day.dt * 1000), 'MMM d')}
                            </p>
                          </div>
                          {getWeatherIcon(day.weather[0]?.main || '', "h-8 w-8")}
                          <div>
                            <p className="font-medium capitalize">{day.weather[0]?.description}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Droplets className="h-3 w-3" />
                              {Math.round(day.pop * 100)}%
                              <Wind className="h-3 w-3 ml-2" />
                              {Math.round(day.wind_speed)} km/h
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-4 w-4 text-orange-400" />
                                <span className="font-bold text-lg">{Math.round(day.temp.max)}°</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <TrendingDown className="h-4 w-4 text-blue-400" />
                                <span className="text-muted-foreground">{Math.round(day.temp.min)}°</span>
                              </div>
                            </div>
                          </div>
                          {day.moon_phase !== undefined && (
                            <div className="text-2xl">
                              {getMoonPhase(day.moon_phase).icon}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WeatherReport;