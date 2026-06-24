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
  lastUpdated?: number | null;
}

export const WeatherHeroCard: React.FC<WeatherHeroCardProps> = ({
  currentWeather,
  location,
  lastSyncTime,
  isRefreshing,
  onRefresh,
  weatherIcon,
  weatherCondition,
  gradient,
  lastUpdated
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

      <div className="relative z-10 px-4 pt-4 pb-5">
        {/* Location and Sync Row */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {location || 'Current Location'}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {format(new Date(), 'EEE, MMM d')}
              </p>
              {lastUpdated && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                    <p className="text-[10px] text-muted-foreground">
                      Updated {(() => {
                        const minutesAgo = Math.round((Date.now() - lastUpdated) / 60000);
                        if (minutesAgo < 1) return 'just now';
                        if (minutesAgo === 1) return '1m ago';
                        return `${minutesAgo}m ago`;
                      })()}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRefresh}
            className="relative p-2 rounded-full bg-background/20 backdrop-blur-sm border border-white/10 hover:bg-background/30 transition-all"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 text-foreground",
                isRefreshing && "animate-spin"
              )}
            />
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
              className="flex items-baseline gap-1.5"
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="text-6xl font-bold text-foreground tracking-tight">
                {Math.round(currentWeather.temp)}
              </span>
              <span className="text-2xl text-muted-foreground">°C</span>
            </motion.div>

            <motion.p
              className="text-base font-semibold capitalize text-foreground/90 mt-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              {currentWeather.description}
            </motion.p>

            <motion.p
              className="text-xs text-muted-foreground flex items-center gap-1 mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Thermometer className="h-3 w-3" />
              Feels like {Math.round(currentWeather.feels_like)}°C
            </motion.p>
          </div>

          {/* Animated Weather Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-2"
          >
            <motion.div
              animate={{
                y: [0, -3, 0],
                rotate: [0, 2, -2, 0]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm shadow-lg"
            >
              {weatherIcon}
            </motion.div>
            {/* Provider badge */}
            {currentWeather.provider && (
              <div className="px-2 py-0.5 rounded-full bg-background/60 backdrop-blur-sm border border-white/10">
                <p className="text-[10px] text-muted-foreground font-medium">
                  {currentWeather.provider}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};
