import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Cloud, Droplets, Wind, X, Maximize2, Minimize2, Lock, Unlock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWeather } from '@/hooks/useWeather';
import { useVoiceNavigation } from '@/contexts/VoiceNavigationContext';
import { cn } from '@/lib/utils';

interface Position {
  x: number;
  y: number;
}

export const FloatingWeatherDock: React.FC = () => {
  const { currentWeather, loading } = useWeather();
  const { announceElement } = useVoiceNavigation();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: window.innerHeight - 200 });
  const constraintsRef = useRef<HTMLDivElement>(null);

  // Voice command support
  useEffect(() => {
    const handleVoiceCommand = (e: CustomEvent) => {
      if (e.detail === 'show weather') {
        setIsExpanded(true);
        announceElement('Weather widget opened');
      }
    };
    window.addEventListener('voice-command', handleVoiceCommand as EventListener);
    return () => window.removeEventListener('voice-command', handleVoiceCommand as EventListener);
  }, [announceElement]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isLocked) {
      const newX = position.x + info.offset.x;
      const newY = position.y + info.offset.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 200;
      
      setPosition({
        x: Math.max(20, Math.min(newX, maxX)),
        y: Math.max(80, Math.min(newY, maxY))
      });
    }
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      announceElement('Weather details expanded');
    }
  };

  const toggleLocked = () => {
    setIsLocked(!isLocked);
    announceElement(isLocked ? 'Weather widget unlocked' : 'Weather widget locked');
  };

  if (!currentWeather && !loading) return null;

  return (
    <motion.div
      ref={constraintsRef}
      className="fixed inset-0 pointer-events-none z-40"
      style={{ overflow: 'hidden' }}
    >
      <motion.div
        drag={!isLocked && !isExpanded}
        dragMomentum={false}
        dragElastic={0}
        onDragEnd={handleDragEnd}
        initial={false}
        animate={{
          x: position.x,
          y: position.y,
          width: isExpanded ? 320 : 60,
          height: isExpanded ? 180 : 60,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "absolute pointer-events-auto cursor-move",
          isLocked && "cursor-default"
        )}
        style={{ touchAction: 'none' }}
      >
        <Card className={cn(
          "relative overflow-hidden h-full shadow-2xl border-2",
          "bg-gradient-to-br from-card/95 to-card/80 backdrop-blur-xl",
          isExpanded ? "border-primary/30" : "border-border/50",
          "transition-all duration-300"
        )}>
          {/* Minimized State */}
          <AnimatePresence>
            {!isExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={toggleExpanded}
              >
                <div className="flex flex-col items-center gap-1">
                  <Cloud className="w-6 h-6 text-primary" />
                  <span className="text-xs font-semibold">
                    {currentWeather ? `${Math.round(currentWeather.temp)}°` : '---'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expanded State */}
          <AnimatePresence>
            {isExpanded && currentWeather && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-4 h-full flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-semibold">Weather</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleLocked}
                    >
                      {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleExpanded}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Current Weather */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-3xl font-bold">
                      {Math.round(currentWeather.temp)}°C
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Feels like {Math.round(currentWeather.feels_like)}°C
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium capitalize">
                      {currentWeather.description}
                    </div>
                  </div>
                </div>

                {/* Weather Details Grid */}
                <div className="grid grid-cols-2 gap-2 mt-auto">
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                    <Droplets className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Humidity</div>
                      <div className="text-sm font-semibold">{currentWeather.humidity}%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-2">
                    <Wind className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Wind</div>
                      <div className="text-sm font-semibold">
                        {Math.round(currentWeather.wind_speed * 3.6)} km/h
                      </div>
                    </div>
                  </div>
                </div>

                {/* Offline Indicator */}
                {!navigator.onLine && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">
                    Offline - Cached data
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading State */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
};
