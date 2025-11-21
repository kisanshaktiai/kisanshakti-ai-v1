import React from 'react';
import { motion } from 'framer-motion';
import { Cloud, CloudRain, Sun, CloudSnow, Wind, Droplets, Thermometer, Sunrise, Sunset } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWeather } from '@/hooks/useWeather';
import { Card } from '@/components/ui/card';

export const ModernWeatherCard: React.FC = () => {
  const navigate = useNavigate();
  const { currentWeather, loading } = useWeather();

  const getWeatherIcon = (condition: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      Clear: <Sun className="w-12 h-12" />,
      Clouds: <Cloud className="w-12 h-12" />,
      Rain: <CloudRain className="w-12 h-12" />,
      Snow: <CloudSnow className="w-12 h-12" />,
    };
    return iconMap[condition] || <Cloud className="w-12 h-12" />;
  };

  const getWeatherGradient = (condition: string) => {
    const gradientMap: Record<string, string> = {
      Clear: 'from-amber-400/20 via-orange-300/20 to-yellow-300/20',
      Clouds: 'from-slate-400/20 via-gray-300/20 to-slate-300/20',
      Rain: 'from-blue-400/20 via-cyan-300/20 to-blue-300/20',
      Snow: 'from-cyan-200/20 via-blue-100/20 to-white/20',
    };
    return gradientMap[condition] || 'from-slate-300/20 via-gray-200/20 to-slate-200/20';
  };

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-20 left-4 right-4 z-30 pointer-events-auto"
      >
        <Card className="backdrop-blur-2xl bg-card/60 border-border/50 shadow-2xl">
          <div className="p-6 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="fixed top-20 left-4 right-4 z-30 pointer-events-auto"
      onClick={() => navigate('/app/weather')}
    >
      <Card className={`backdrop-blur-2xl bg-gradient-to-br ${getWeatherGradient(currentWeather?.main || 'Clear')} border-border/50 shadow-2xl cursor-pointer overflow-hidden`}>
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {currentWeather?.main === 'Clear' && (
            <>
              <motion.div
                className="absolute -top-10 -right-10 w-32 h-32 bg-amber-300/20 rounded-full blur-3xl"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              <motion.div
                className="absolute -bottom-10 -left-10 w-32 h-32 bg-orange-300/20 rounded-full blur-3xl"
                animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.3, 0.5] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </>
          )}
          {(currentWeather?.main === 'Rain' || currentWeather?.main === 'Drizzle') && (
            <div className="absolute inset-0">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-0.5 h-6 bg-blue-400/30 rounded-full"
                  initial={{ top: -20, left: `${Math.random() * 100}%` }}
                  animate={{ top: '100%' }}
                  transition={{
                    duration: 1 + Math.random(),
                    repeat: Infinity,
                    delay: Math.random() * 2,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="relative p-5">
          <div className="flex items-start justify-between">
            {/* Left: Temperature and Location */}
            <div className="flex-1">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="flex items-baseline gap-1 mb-1"
              >
                <span className="text-5xl font-bold text-foreground">
                  {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}
                </span>
                <span className="text-2xl text-muted-foreground">°C</span>
              </motion.div>
              <p className="text-sm font-medium text-foreground/90 capitalize mb-1">
                {currentWeather?.description || 'Loading...'}
              </p>
              <p className="text-xs text-muted-foreground">
                Feels like {currentWeather?.feels_like ? Math.round(currentWeather.feels_like) : '--'}°C
              </p>
            </div>

            {/* Right: Weather Icon */}
            <motion.div
              initial={{ rotate: -20, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="text-primary"
            >
              {currentWeather?.main && getWeatherIcon(currentWeather.main)}
            </motion.div>
          </div>

          {/* Weather Details Grid */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/30">
            {/* Wind */}
            <div className="flex flex-col items-center gap-1">
              <Wind className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Wind</span>
              <span className="text-sm font-semibold text-foreground">
                {currentWeather?.wind_speed ? Math.round(currentWeather.wind_speed * 3.6) : '--'} km/h
              </span>
            </div>

            {/* Humidity */}
            <div className="flex flex-col items-center gap-1">
              <Droplets className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Humidity</span>
              <span className="text-sm font-semibold text-foreground">
                {currentWeather?.humidity || '--'}%
              </span>
            </div>

            {/* Pressure */}
            <div className="flex flex-col items-center gap-1">
              <Thermometer className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Pressure</span>
              <span className="text-sm font-semibold text-foreground">
                {currentWeather?.pressure || '--'} hPa
              </span>
            </div>
          </div>

          {/* Tap to view full forecast hint */}
          <motion.div
            className="mt-3 pt-3 border-t border-border/30 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-xs text-muted-foreground">Tap for detailed forecast</span>
          </motion.div>
        </div>
      </Card>
    </motion.div>
  );
};
