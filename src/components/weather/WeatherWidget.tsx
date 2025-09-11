import React from 'react';
import { Card } from '@/components/ui/card';
import { Cloud, CloudRain, Sun, CloudSnow, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWeather } from '@/hooks/useWeather';
import { AnimatedWeatherBackground } from './AnimatedWeatherBackground';

export const WeatherWidget: React.FC = () => {
  const navigate = useNavigate();
  const { currentWeather, loading } = useWeather();

  const getWeatherIcon = (condition: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      Clear: <Sun className="w-8 h-8 text-weather-sunny" />,
      Clouds: <Cloud className="w-8 h-8 text-weather-cloudy" />,
      Rain: <CloudRain className="w-8 h-8 text-weather-rainy" />,
      Snow: <CloudSnow className="w-8 h-8 text-info" />,
    };
    return iconMap[condition] || <Cloud className="w-8 h-8 text-weather-cloudy" />;
  };

  if (loading) {
    return (
      <Card className="p-4 cursor-pointer hover:shadow-lg transition-shadow bg-gradient-to-br from-primary/5 to-secondary/5">
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card 
      className="overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
      onClick={() => navigate('/app/weather')}
    >
      <AnimatedWeatherBackground condition={currentWeather?.main || 'Clear'} className="h-full">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Today's Weather</p>
              <p className="text-2xl font-bold text-foreground">
                {currentWeather?.temp || '--'}°C
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {currentWeather?.description || 'Loading...'}
              </p>
              {currentWeather?.provider && (
                <p className="text-xs opacity-50 mt-1">
                  {currentWeather.provider}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center">
              {currentWeather?.main && getWeatherIcon(currentWeather.main)}
              <p className="text-xs text-muted-foreground mt-2">
                Feels like {currentWeather?.feels_like || '--'}°C
              </p>
            </div>
          </div>
        </div>
      </AnimatedWeatherBackground>
    </Card>
  );
};