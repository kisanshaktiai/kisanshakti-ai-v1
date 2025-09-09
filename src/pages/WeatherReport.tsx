import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWeather } from '@/hooks/useWeather';
import { AnimatedWeatherBackground } from '@/components/weather/AnimatedWeatherBackground';
import { 
  Cloud, 
  Droplets, 
  Wind, 
  Eye, 
  Thermometer, 
  Gauge,
  Sun,
  Moon,
  Calendar,
  TrendingUp,
  TrendingDown,
  MapPin,
  CloudRain,
  Snowflake,
  CloudSnow,
  CloudDrizzle,
  CloudLightning,
  CloudFog,
  Waves
} from 'lucide-react';
import { format } from 'date-fns';

const WeatherReport: React.FC = () => {
  const { t } = useTranslation();
  const { currentWeather, forecast, hourlyForecast, loading, error } = useWeather();

  const getWeatherIcon = (condition: string) => {
    const weather = condition.toLowerCase();
    if (weather.includes('rain')) return <CloudRain className="h-5 w-5" />;
    if (weather.includes('snow')) return <CloudSnow className="h-5 w-5" />;
    if (weather.includes('drizzle')) return <CloudDrizzle className="h-5 w-5" />;
    if (weather.includes('thunder')) return <CloudLightning className="h-5 w-5" />;
    if (weather.includes('fog') || weather.includes('mist')) return <CloudFog className="h-5 w-5" />;
    if (weather.includes('cloud')) return <Cloud className="h-5 w-5" />;
    if (weather.includes('clear')) return <Sun className="h-5 w-5" />;
    return <Sun className="h-5 w-5" />;
  };

  const getMoonPhaseIcon = (phase?: number) => {
    if (!phase) return '🌑';
    if (phase < 0.125) return '🌑';
    if (phase < 0.25) return '🌒';
    if (phase < 0.375) return '🌓';
    if (phase < 0.5) return '🌔';
    if (phase < 0.625) return '🌕';
    if (phase < 0.75) return '🌖';
    if (phase < 0.875) return '🌗';
    return '🌘';
  };

  const getUVIndexLevel = (uv?: number) => {
    if (!uv) return { level: 'Low', color: 'default' };
    if (uv <= 2) return { level: 'Low', color: 'default' };
    if (uv <= 5) return { level: 'Moderate', color: 'secondary' };
    if (uv <= 7) return { level: 'High', color: 'destructive' };
    if (uv <= 10) return { level: 'Very High', color: 'destructive' };
    return { level: 'Extreme', color: 'destructive' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !currentWeather) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{error || 'Unable to load weather data'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Current Weather Hero Section */}
      <AnimatedWeatherBackground 
        condition={currentWeather.main} 
        className="h-64 md:h-80"
      >
        <div className="container mx-auto p-4 h-full flex flex-col justify-center">
          <div className="text-card-foreground">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-5 w-5" />
              <h1 className="text-2xl font-bold">{currentWeather.location}</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-5xl md:text-6xl font-bold">
                {Math.round(currentWeather.temp)}°
              </div>
              <div>
                <p className="text-lg capitalize">{currentWeather.description}</p>
                <p className="text-sm opacity-75">
                  Feels like {Math.round(currentWeather.feels_like)}°
                </p>
                {currentWeather.provider && (
                  <p className="text-xs opacity-50 mt-1">
                    Data from {currentWeather.provider}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </AnimatedWeatherBackground>

      {/* Weather Details */}
      <div className="container mx-auto p-4">
        <Tabs defaultValue="current" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="hourly">Hourly</TabsTrigger>
            <TabsTrigger value="forecast">14-Day Forecast</TabsTrigger>
          </TabsList>

          {/* Current Weather Details */}
          <TabsContent value="current" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">High / Low</p>
                      <p className="text-xl font-bold">
                        {Math.round(currentWeather.temp_max)}° / {Math.round(currentWeather.temp_min)}°
                      </p>
                    </div>
                    <Thermometer className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Humidity</p>
                      <p className="text-xl font-bold">{currentWeather.humidity}%</p>
                    </div>
                    <Droplets className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Wind Speed</p>
                      <p className="text-xl font-bold">{currentWeather.wind_speed} km/h</p>
                    </div>
                    <Wind className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pressure</p>
                      <p className="text-xl font-bold">{currentWeather.pressure} hPa</p>
                    </div>
                    <Gauge className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Visibility</p>
                      <p className="text-xl font-bold">{(currentWeather.visibility / 1000).toFixed(1)} km</p>
                    </div>
                    <Eye className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Cloud Cover</p>
                      <p className="text-xl font-bold">{currentWeather.clouds}%</p>
                    </div>
                    <Cloud className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {currentWeather.uv_index !== undefined && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">UV Index</p>
                        <p className="text-xl font-bold">{currentWeather.uv_index}</p>
                        <Badge 
                          variant={getUVIndexLevel(currentWeather.uv_index).color as any}
                          className="mt-1"
                        >
                          {getUVIndexLevel(currentWeather.uv_index).level}
                        </Badge>
                      </div>
                      <Sun className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {currentWeather.dew_point !== undefined && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Dew Point</p>
                        <p className="text-xl font-bold">{Math.round(currentWeather.dew_point)}°</p>
                      </div>
                      <Waves className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sun & Moon Info */}
            <Card>
              <CardHeader>
                <CardTitle>Sun & Moon</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Sun className="h-6 w-6 text-yellow-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Sunrise</p>
                      <p className="font-semibold">
                        {format(new Date(currentWeather.sunrise * 1000), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Moon className="h-6 w-6 text-blue-400" />
                    <div>
                      <p className="text-sm text-muted-foreground">Sunset</p>
                      <p className="font-semibold">
                        {format(new Date(currentWeather.sunset * 1000), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Hourly Forecast */}
          <TabsContent value="hourly">
            <ScrollArea className="h-96 w-full">
              <div className="space-y-2">
                {hourlyForecast.map((hour, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <p className="font-semibold">
                            {format(new Date(hour.dt * 1000), 'HH:mm')}
                          </p>
                          {getWeatherIcon(hour.weather[0]?.main || '')}
                          <p className="text-sm capitalize">
                            {hour.weather[0]?.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-bold">{Math.round(hour.temp)}°</p>
                            <p className="text-xs text-muted-foreground">
                              Feels {Math.round(hour.feels_like)}°
                            </p>
                          </div>
                          {hour.pop > 0 && (
                            <div className="flex items-center gap-1">
                              <Droplets className="h-4 w-4 text-blue-500" />
                              <span className="text-sm">{Math.round(hour.pop * 100)}%</span>
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

          {/* 14-Day Forecast */}
          <TabsContent value="forecast">
            <ScrollArea className="h-96 w-full">
              <div className="space-y-2">
                {forecast.map((day, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-20">
                            <p className="font-semibold">
                              {format(new Date(day.dt * 1000), 'EEE')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(day.dt * 1000), 'MMM d')}
                            </p>
                          </div>
                          {getWeatherIcon(day.weather[0]?.main || '')}
                          <p className="text-sm capitalize">
                            {day.weather[0]?.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-red-500" />
                            <span className="font-bold">{Math.round(day.temp.max)}°</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-blue-500" />
                            <span className="text-muted-foreground">{Math.round(day.temp.min)}°</span>
                          </div>
                          {day.pop > 0 && (
                            <div className="flex items-center gap-1">
                              <Droplets className="h-4 w-4 text-blue-500" />
                              <span className="text-sm">{Math.round(day.pop * 100)}%</span>
                            </div>
                          )}
                          {day.moon_phase !== undefined && (
                            <div className="text-xl">
                              {getMoonPhaseIcon(day.moon_phase)}
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