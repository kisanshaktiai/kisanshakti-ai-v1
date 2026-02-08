import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Thermometer, Leaf, AlertCircle, Sprout, Bug, CircleCheckBig, Wind, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { landsApi } from '@/services/landsApi';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeatherStore } from '@/stores/weatherStore';
import { cn } from '@/lib/utils';

interface LandSpecificChatTabProps {
  landId: string;
  onQuickAction: (action: string) => void;
}

export function LandSpecificChatTab({ landId, onQuickAction }: LandSpecificChatTabProps) {
  const { t } = useTranslation();
  const [landData, setLandData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // FIX: Use REAL weather data from centralized store instead of fake random data
  const { currentWeather, lastUpdated } = useWeatherStore();

  useEffect(() => {
    fetchLandDetails();
  }, [landId]);

  const fetchLandDetails = async () => {
    try {
      setLoading(true);
      const land = await landsApi.fetchLandById(landId);
      setLandData(land);
    } catch (error) {
      console.error('Error fetching land details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNDVIStatus = (score: number) => {
    if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-emerald-500', textColor: 'text-emerald-500' };
    if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-amber-500', textColor: 'text-amber-500' };
    return { label: t('chat.needsAttention'), color: 'bg-rose-500', textColor: 'text-rose-500' };
  };

  const ndviScore = 0.72; // TODO: Fetch from NDVI API
  const ndviStatus = getNDVIStatus(ndviScore);

  // Get real weather values from store
  const temperature = currentWeather?.temp ?? '--';
  const humidity = currentWeather?.humidity ?? '--';
  const windSpeed = currentWeather?.wind_speed ? Math.round(currentWeather.wind_speed * 3.6) : '--';
  const rainfall = currentWeather?.rain_1h ?? 0;

  if (loading) {
    return (
      <div className="mx-2 mt-2 mb-2">
        <Card className="p-3 bg-gradient-to-br from-primary/5 via-background to-secondary/5 border-primary/20 backdrop-blur-xl">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-4 gap-2">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!landData) return null;

  return (
    <div className="mx-2 mt-2 mb-2 max-h-40 overflow-y-auto">
      <Card className="p-3 bg-gradient-to-br from-primary/5 via-background/80 to-secondary/5 border-primary/20 backdrop-blur-xl shadow-lg">
        {/* Compact Land Header - 2030 Modern Design */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground leading-tight">{landData.name}</h3>
              <span className="text-[10px] text-muted-foreground">
                {landData.area_acres} {t('common.acres')} {landData.soil_type && `• ${landData.soil_type}`}
              </span>
            </div>
          </div>
          <Badge className={cn(
            ndviStatus.color,
            "text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm"
          )}>
            <Leaf className="w-2.5 h-2.5 mr-0.5" />
            {ndviStatus.label}
          </Badge>
        </div>

        {/* Weather Stats Grid - Real Data with Modern Glassmorphism */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {/* Current Crop */}
          {landData.current_crop && (
            <div className="col-span-4 flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Growing: {landData.current_crop}
              </span>
            </div>
          )}
          
          {/* Temperature - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/20 backdrop-blur-sm">
            <Thermometer className="w-4 h-4 text-orange-500 mb-1" />
            <span className="text-sm font-bold text-foreground">{temperature}°</span>
            <span className="text-[9px] text-muted-foreground">Temp</span>
          </div>
          
          {/* Humidity - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 backdrop-blur-sm">
            <Droplets className="w-4 h-4 text-blue-500 mb-1" />
            <span className="text-sm font-bold text-foreground">{humidity}%</span>
            <span className="text-[9px] text-muted-foreground">Humidity</span>
          </div>
          
          {/* Wind - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/20 backdrop-blur-sm">
            <Wind className="w-4 h-4 text-cyan-500 mb-1" />
            <span className="text-sm font-bold text-foreground">{windSpeed}</span>
            <span className="text-[9px] text-muted-foreground">km/h</span>
          </div>
          
          {/* Rainfall - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/20 backdrop-blur-sm">
            <Cloud className="w-4 h-4 text-indigo-500 mb-1" />
            <span className="text-sm font-bold text-foreground">{rainfall}</span>
            <span className="text-[9px] text-muted-foreground">mm</span>
          </div>
        </div>

        {/* Quick Actions - Pill Buttons with Modern Touch */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-blue-500/20 to-blue-400/10 text-blue-700 dark:text-blue-300 hover:from-blue-500/30 hover:to-blue-400/20 transition-all duration-200 whitespace-nowrap border border-blue-500/20 shadow-sm"
          >
            <Droplets className="w-3 h-3" />
            {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/10 text-emerald-700 dark:text-emerald-300 hover:from-emerald-500/30 hover:to-emerald-400/20 transition-all duration-200 whitespace-nowrap border border-emerald-500/20 shadow-sm"
          >
            <CircleCheckBig className="w-3 h-3" />
            {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-rose-500/20 to-rose-400/10 text-rose-700 dark:text-rose-300 hover:from-rose-500/30 hover:to-rose-400/20 transition-all duration-200 whitespace-nowrap border border-rose-500/20 shadow-sm"
          >
            <Bug className="w-3 h-3" />
            {t('chat.pestRisk')}
          </button>
          <button
            onClick={() => onQuickAction('weather')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-purple-500/20 to-purple-400/10 text-purple-700 dark:text-purple-300 hover:from-purple-500/30 hover:to-purple-400/20 transition-all duration-200 whitespace-nowrap border border-purple-500/20 shadow-sm"
          >
            <AlertCircle className="w-3 h-3" />
            {t('chat.weatherAlert')}
          </button>
        </div>
        
        {/* Last Updated Indicator */}
        {lastUpdated && (
          <div className="flex items-center justify-end mt-2">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-muted-foreground">
                Live • {Math.round((Date.now() - lastUpdated) / 60000)}m ago
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}