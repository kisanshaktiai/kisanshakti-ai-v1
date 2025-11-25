import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Thermometer, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { WeatherAnimation } from './WeatherAnimation';

interface WeatherHeroCardProps {
  currentWeather: any;
  location: string;
  lastSyncTime: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  weatherIcon: React.ReactNode;
  weatherCondition: 'sun' | 'rain' | 'clouds' | 'storm' | 'snow' | 'fog' | 'night';
  gradient: string;
}

export const WeatherHeroCard: React.FC<WeatherHeroCardProps> = ({
  currentWeather,
  location,
  lastSyncTime,
  isRefreshing,
  onRefresh,
  weatherIcon,
  weatherCondition,
  gradient
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative bg-gradient-to-br ${gradient} overflow-hidden rounded-b-3xl shadow-2xl`}
    >
      {/* Animated weather particles */}
      <motion.div
        className="absolute inset-0 w-full h-full"
        animate={{ opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <WeatherAnimation condition={weatherCondition} className="w-full h-full" />
      </motion.div>

      <div className="relative z-10 px-6 pt-6 pb-8">
        {/* Location and Sync Row */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {location || 'Current Location'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(), 'EEEE, MMM d, yyyy')}
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRefresh}
            className="relative p-3 rounded-xl bg-background/20 backdrop-blur-sm border border-white/10 hover:bg-background/30 transition-all shadow-lg"
          >
            <RefreshCw
              className={cn(
                "h-5 w-5 text-foreground",
                isRefreshing && "animate-spin"
              )}
            />
            {lastSyncTime && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute -bottom-7 right-0 text-xs text-muted-foreground whitespace-nowrap bg-background/80 px-2 py-1 rounded-md"
              >
                {format(new Date(lastSyncTime), 'h:mm a')}
              </motion.span>
            )}
          </motion.button>
        </div>

        {/* Main Weather Display */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="flex justify-between items-center"
        >
          <div className="flex-1">
            <motion.div
              className="flex items-baseline gap-2"
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-7xl sm:text-8xl font-bold text-foreground tracking-tight">
                {Math.round(currentWeather.temp)}
              </span>
              <span className="text-3xl text-muted-foreground">°C</span>
            </motion.div>

            <motion.p
              className="text-xl font-semibold capitalize text-foreground/90 mt-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {currentWeather.description}
            </motion.p>

            <motion.p
              className="text-sm text-muted-foreground flex items-center gap-2 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Thermometer className="h-4 w-4" />
              Feels like {Math.round(currentWeather.feels_like)}°C
            </motion.p>
          </div>

          {/* Animated Weather Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <motion.div
              animate={{
                y: [0, -5, 0],
                rotate: [0, 3, -3, 0]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="p-6 rounded-3xl bg-white/10 backdrop-blur-sm shadow-xl"
            >
              {weatherIcon}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};
