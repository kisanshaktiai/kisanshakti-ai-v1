import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
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
  Home as HomeIcon,
  RefreshCw,
  CloudDrizzle,
  Cloudy,
  CloudFog,
  Moon,
  CloudHail,
  Info,
  Heart,
  Compass,
  Timer,
  Zap,
  Users,
  Flower2,
  TreePine,
  Wheat,
  MapPinned,
  Navigation2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const Weather: React.FC = () => {
  const { t } = useTranslation();
  const { currentWeather, forecast, hourlyForecast, loading, error, location, refetch } = useWeather();
  const [activeTab, setActiveTab] = useState('today');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getWeatherIcon = (condition: string, size: string = "h-6 w-6") => {
    const weather = condition.toLowerCase();
    const iconProps = cn(size);
    
    if (weather.includes('thunder') || weather.includes('storm')) 
      return <CloudLightning className={cn(iconProps, "text-weather-stormy")} />;
    if (weather.includes('drizzle')) 
      return <CloudDrizzle className={cn(iconProps, "text-weather-rainy/70")} />;
    if (weather.includes('rain')) 
      return <CloudRain className={cn(iconProps, "text-weather-rainy")} />;
    if (weather.includes('snow')) 
      return <CloudSnow className={cn(iconProps, "text-weather-cloudy")} />;
    if (weather.includes('hail')) 
      return <CloudHail className={cn(iconProps, "text-weather-cloudy")} />;
    if (weather.includes('fog') || weather.includes('mist') || weather.includes('haze')) 
      return <CloudFog className={cn(iconProps, "text-weather-cloudy/60")} />;
    if (weather.includes('cloud')) 
      return <Cloud className={cn(iconProps, "text-weather-cloudy")} />;
    if (weather.includes('clear') && new Date().getHours() > 18) 
      return <Moon className={cn(iconProps, "text-weather-night")} />;
    if (weather.includes('clear')) 
      return <Sun className={cn(iconProps, "text-weather-sunny")} />;
    
    return <Sun className={cn(iconProps, "text-weather-sunny")} />;
  };

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  const getUVIndexInfo = (uv?: number) => {
    if (!uv) return { level: 'Low', color: 'bg-gradient-to-r from-uv-low to-uv-low', advice: 'Enjoy time outside', percentage: 10 };
    if (uv <= 2) return { level: 'Low', color: 'bg-gradient-to-r from-uv-low to-uv-low', advice: 'Enjoy time outside', percentage: 20 };
    if (uv <= 5) return { level: 'Moderate', color: 'bg-gradient-to-r from-uv-moderate to-uv-moderate', advice: 'Wear sunscreen SPF 30+', percentage: 50 };
    if (uv <= 7) return { level: 'High', color: 'bg-gradient-to-r from-uv-high to-uv-high', advice: 'Seek shade, SPF 50+', percentage: 70 };
    if (uv <= 10) return { level: 'Very High', color: 'bg-gradient-to-r from-uv-very-high to-uv-very-high', advice: 'Avoid sun 10am-4pm', percentage: 90 };
    return { level: 'Extreme', color: 'bg-gradient-to-r from-uv-extreme to-uv-very-high', advice: 'Stay indoors', percentage: 100 };
  };

  const getAgriculturalInsights = () => {
    if (!currentWeather) return [];
    const insights = [];
    
    // Temperature-based advice
    if (currentWeather.temp > 35) {
      insights.push({ 
        icon: Thermometer, 
        title: 'Heat Stress Alert',
        text: 'Increase irrigation frequency. Consider shade nets for sensitive crops.',
        type: 'warning',
        action: 'Water crops early morning or late evening'
      });
    } else if (currentWeather.temp < 10) {
      insights.push({ 
        icon: CloudSnow, 
        title: 'Frost Risk',
        text: 'Protect tender plants. Cover sensitive crops at night.',
        type: 'info',
        action: 'Use frost blankets or mulch'
      });
    }
    
    // Humidity-based advice
    if (currentWeather.humidity > 80) {
      insights.push({ 
        icon: Droplets, 
        title: 'Disease Alert',
        text: 'High humidity increases fungal disease risk.',
        type: 'warning',
        action: 'Apply preventive fungicides'
      });
    } else if (currentWeather.humidity < 30) {
      insights.push({ 
        icon: Droplets, 
        title: 'Low Humidity',
        text: 'Increased water stress on plants.',
        type: 'info',
        action: 'Increase irrigation and mulching'
      });
    }
    
    // Wind-based advice
    if (currentWeather.wind_speed > 20) {
      insights.push({ 
        icon: Wind, 
        title: 'Strong Winds',
        text: 'Postpone pesticide spraying. Support tall plants.',
        type: 'danger',
        action: 'Secure greenhouse covers'
      });
    }
    
    // Rain forecast advice
    if (forecast[0]?.pop > 0.6) {
      insights.push({ 
        icon: CloudRain, 
        title: 'Rain Expected',
        text: 'Delay fertilizer application. Harvest ripe crops.',
        type: 'info',
        action: 'Prepare drainage channels'
      });
    }
    
    return insights;
  };

  // Get location name with better formatting
  const getLocationDisplay = () => {
    if (currentWeather?.location) {
      return currentWeather.location;
    }
    if (location) {
      return `${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E`;
    }
    return 'Fetching location...';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-weather-sunny/10 via-background to-weather-rainy/10 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/20 animate-pulse mx-auto" />
            <Loader2 className="h-10 w-10 animate-spin text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Loading weather data...</p>
            <p className="text-xs text-muted-foreground animate-pulse">Detecting your location</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !currentWeather) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-destructive/5 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl border-destructive/20">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Weather Unavailable</h3>
              <p className="text-sm text-muted-foreground">{error || 'Unable to fetch weather data'}</p>
            </div>
            <Button onClick={refetch} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const uvInfo = getUVIndexInfo(currentWeather.uv_index);
  const agriculturalInsights = getAgriculturalInsights();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-20">
      {/* Modern Hero Section with Glass Morphism */}
      <AnimatedWeatherBackground 
        condition={currentWeather.main} 
        className="relative h-[55vh] md:h-[60vh] overflow-hidden"
      >
        {/* Gradient Overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/60" />
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5" />
        
        <div className="relative z-10 h-full flex flex-col p-4 md:p-6">
          {/* Header with Location and Actions */}
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-white/10 backdrop-blur-md">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-lg leading-tight">
                    {getLocationDisplay()}
                  </h2>
                  <p className="text-white/70 text-xs">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "rounded-full bg-overlay-light/10 backdrop-blur-md hover:bg-overlay-light/20 text-overlay-light",
                isRefreshing && "animate-spin"
              )}
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Main Weather Display - Centered */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              {/* Animated Weather Icon */}
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-overlay-light/10 rounded-full blur-3xl scale-150 animate-pulse" />
                {getWeatherIcon(currentWeather.main, "h-20 w-20 md:h-24 md:w-24 relative drop-shadow-2xl")}
              </div>
              
              {/* Temperature Display */}
              <div className="space-y-2">
                <div className="flex items-start justify-center">
                  <h1 className="text-7xl md:text-8xl font-bold text-overlay-light tracking-tighter">
                    {Math.round(currentWeather.temp)}
                  </h1>
                  <span className="text-3xl text-overlay-light/80 font-light mt-2">°C</span>
                </div>
                <p className="text-xl md:text-2xl capitalize text-overlay-light/90 font-medium">
                  {currentWeather.description}
                </p>
                <div className="flex items-center justify-center gap-4 text-overlay-light/70">
                  <span className="text-sm">Feels like {Math.round(currentWeather.feels_like)}°</span>
                  <span className="text-overlay-light/40">•</span>
                  <span className="text-sm">H: {Math.round(currentWeather.temp_max)}° L: {Math.round(currentWeather.temp_min)}°</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid - Glass Cards */}
          <div className="grid grid-cols-4 gap-2 mt-auto">
            {[
              { icon: Wind, value: `${Math.round(currentWeather.wind_speed)}`, unit: 'km/h', label: 'Wind' },
              { icon: Droplets, value: `${currentWeather.humidity}`, unit: '%', label: 'Humidity' },
              { icon: Eye, value: `${(currentWeather.visibility / 1000).toFixed(1)}`, unit: 'km', label: 'Visibility' },
              { icon: Gauge, value: `${currentWeather.pressure}`, unit: 'hPa', label: 'Pressure' },
            ].map((stat, idx) => (
              <div key={idx} className="backdrop-blur-md bg-overlay-light/10 rounded-2xl p-3 text-center border border-overlay-light/10">
                <stat.icon className="h-4 w-4 mx-auto mb-1.5 text-overlay-light/80" />
                <p className="text-lg font-bold text-overlay-light">
                  {stat.value}
                  <span className="text-xs font-normal text-overlay-light/60">{stat.unit}</span>
                </p>
                <p className="text-[10px] text-overlay-light/60 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </AnimatedWeatherBackground>

      {/* Main Content - Modern Cards Design */}
      <div className="px-4 md:px-6 -mt-6 relative z-20 space-y-4">
        
        {/* Agricultural Insights - Premium Card Design */}
        {agriculturalInsights.length > 0 && (
          <Card className="backdrop-blur-lg bg-card/95 border-muted/50 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 px-4 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                <Wheat className="h-5 w-5 text-primary" />
                Agricultural Insights
              </h3>
            </div>
            <CardContent className="p-4 space-y-3">
              {agriculturalInsights.map((insight, idx) => (
                <div key={idx} className="flex gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                    insight.type === 'warning' && "bg-yellow-500/20",
                    insight.type === 'danger' && "bg-red-500/20",
                    insight.type === 'info' && "bg-blue-500/20"
                  )}>
                    <insight.icon className={cn(
                      "h-5 w-5",
                      insight.type === 'warning' && "text-yellow-500",
                      insight.type === 'danger' && "text-red-500",
                      insight.type === 'info' && "text-blue-500"
                    )} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="font-medium text-sm">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground">{insight.text}</p>
                    <p className="text-xs font-medium text-primary">{insight.action}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Today's Details - Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Sunrise/Sunset */}
          <Card className="col-span-2 backdrop-blur-lg bg-card/95 border-muted/50 shadow-lg overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">Sun Cycle</h4>
                <Sun className="h-4 w-4 text-weather-sunny" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sunrise className="h-5 w-5 text-warning" />
                    <span className="text-xs text-muted-foreground">Sunrise</span>
                  </div>
                  <p className="text-xl font-bold">
                    {format(new Date(currentWeather.sunrise * 1000), 'HH:mm')}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sunset className="h-5 w-5 text-warning-foreground" />
                    <span className="text-xs text-muted-foreground">Sunset</span>
                  </div>
                  <p className="text-xl font-bold">
                    {format(new Date(currentWeather.sunset * 1000), 'HH:mm')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* UV Index */}
          <Card className="backdrop-blur-lg bg-card/95 border-muted/50 shadow-lg overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-muted-foreground">UV Index</h4>
                <Activity className="h-4 w-4 text-uv-extreme" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-bold">{currentWeather.uv_index || 0}</p>
                <div className="space-y-1">
                  <Progress value={uvInfo.percentage} className="h-2" />
                  <p className="text-[10px] font-medium text-muted-foreground">{uvInfo.level}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wind */}
          <Card className="backdrop-blur-lg bg-card/95 border-muted/50 shadow-lg overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-muted-foreground">Wind</h4>
                <Wind className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <p className="text-2xl font-bold">{Math.round(currentWeather.wind_speed)}</p>
                  <span className="text-xs text-muted-foreground">km/h</span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation2 
                    className="h-4 w-4 text-muted-foreground" 
                    style={{ transform: `rotate(${currentWeather.wind_deg}deg)` }}
                  />
                  <span className="text-xs font-medium">{getWindDirection(currentWeather.wind_deg)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Forecast Tabs - Modern Design */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="today" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Hourly
            </TabsTrigger>
            <TabsTrigger value="tomorrow" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Tomorrow
            </TabsTrigger>
            <TabsTrigger value="week" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
              7 Days
            </TabsTrigger>
          </TabsList>

          {/* Hourly Forecast */}
          <TabsContent value="today" className="mt-4">
            <ScrollArea className="w-full">
              <div className="flex gap-3 pb-2">
                {hourlyForecast.slice(0, 24).map((hour, index) => (
                  <Card key={index} className="min-w-[100px] backdrop-blur-lg bg-card/95 border-muted/50 shadow-lg">
                    <CardContent className="p-4 text-center space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {index === 0 ? 'Now' : format(new Date(hour.dt * 1000), 'HH:mm')}
                      </p>
                      <div className="py-2">
                        {getWeatherIcon(hour.weather[0]?.main || '', "h-8 w-8")}
                      </div>
                      <p className="text-xl font-bold">{Math.round(hour.temp)}°</p>
                      {hour.pop > 0 && (
                        <div className="flex items-center justify-center gap-1 text-weather-rainy">
                          <Droplets className="h-3 w-3" />
                          <span className="text-xs font-medium">{Math.round(hour.pop * 100)}%</span>
                        </div>
                      )}
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Wind className="h-3 w-3" />
                        <span className="text-[10px]">{Math.round(hour.wind_speed)}km/h</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="mt-2" />
            </ScrollArea>
          </TabsContent>

          {/* Tomorrow Forecast */}
          <TabsContent value="tomorrow" className="mt-4">
            {forecast[1] && (
              <Card className="backdrop-blur-lg bg-card/95 border-muted/50 shadow-xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
                        {getWeatherIcon(forecast[1].weather[0]?.main || '', "h-14 w-14 relative")}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg capitalize">{forecast[1].weather[0]?.description}</h3>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(forecast[1].dt * 1000), 'EEEE, MMMM d')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end">
                          <span className="text-3xl font-bold">{Math.round(forecast[1].temp.max)}°</span>
                          <span className="text-lg text-muted-foreground">{Math.round(forecast[1].temp.min)}°</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-weather-rainy/10 flex items-center justify-center mx-auto">
                        <Droplets className="h-5 w-5 text-weather-rainy" />
                      </div>
                      <p className="text-sm font-medium">{Math.round(forecast[1].pop * 100)}%</p>
                      <p className="text-[10px] text-muted-foreground">Rain</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
                        <Wind className="h-5 w-5 text-gray-500" />
                      </div>
                      <p className="text-sm font-medium">{Math.round(forecast[1].wind_speed)}km/h</p>
                      <p className="text-[10px] text-muted-foreground">Wind</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
                        <Droplets className="h-5 w-5 text-blue-500" />
                      </div>
                      <p className="text-sm font-medium">{Math.round(forecast[1].humidity)}%</p>
                      <p className="text-[10px] text-muted-foreground">Humidity</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
                        <Sun className="h-5 w-5 text-purple-500" />
                      </div>
                      <p className="text-sm font-medium">{forecast[1].uvi || 0}</p>
                      <p className="text-[10px] text-muted-foreground">UV Index</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Week View */}
          <TabsContent value="week" className="mt-4 space-y-2">
            {forecast.slice(0, 7).map((day, index) => (
              <Card key={index} className="backdrop-blur-lg bg-card/95 border-muted/50 shadow-lg hover:shadow-xl transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-16 text-left">
                        <p className="font-medium text-sm">
                          {index === 0 ? 'Today' : format(new Date(day.dt * 1000), 'EEE')}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(day.dt * 1000), 'MMM d')}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {getWeatherIcon(day.weather[0]?.main || '', "h-8 w-8")}
                        <div className="hidden sm:block">
                          <p className="text-sm capitalize">{day.weather[0]?.description}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      {day.pop > 0 && (
                        <div className="flex items-center gap-1 text-weather-rainy">
                          <Droplets className="h-4 w-4" />
                          <span className="text-sm font-medium">{Math.round(day.pop * 100)}%</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-xl font-bold">{Math.round(day.temp.max)}°</span>
                        <span className="text-base text-muted-foreground">{Math.round(day.temp.min)}°</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {/* Data Provider Attribution */}
        {currentWeather.provider && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">
              Weather data by {currentWeather.provider}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Weather;