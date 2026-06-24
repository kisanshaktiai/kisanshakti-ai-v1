import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Thermometer, Leaf, AlertCircle, Sprout, Bug, CircleCheckBig, Wind, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { landsApi } from '@/services/landsApi';
import { Skeleton } from '@/components/ui/skeleton';
import { useWeatherStore } from '@/stores/weatherStore';
import { cn } from '@/lib/utils';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';

interface LandSpecificChatTabProps {
  landId: string;
  onQuickAction: (action: string) => void;
}

export function LandSpecificChatTab({ landId, onQuickAction }: LandSpecificChatTabProps) {
  const { t } = useTranslation();
  const refLabels = useLandRefLabels();
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
    if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-success', textColor: 'text-success' };
    if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-warning', textColor: 'text-warning' };
    return { label: t('chat.needsAttention'), color: 'bg-destructive', textColor: 'text-destructive' };
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
                {landData.area_acres} {t('common.acres')} {landData.soil_type && `• ${refLabels.soil(landData.soil_type)}`}
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
            <div className="col-span-4 flex items-center gap-2 p-2 rounded-xl bg-success/10 border border-success/20 backdrop-blur-sm">
              <TrendingUp className="w-4 h-4 text-success" />
              <span className="text-xs font-medium text-success dark:text-success">
                Growing: {landData.current_crop}
              </span>
            </div>
          )}
          
          {/* Temperature - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 backdrop-blur-sm">
            <Thermometer className="w-4 h-4 text-warning mb-1" />
            <span className="text-sm font-bold text-foreground">{temperature}°</span>
            <span className="text-[9px] text-muted-foreground">Temp</span>
          </div>
          
          {/* Humidity - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-info/10 to-info/5 border border-info/20 backdrop-blur-sm">
            <Droplets className="w-4 h-4 text-info mb-1" />
            <span className="text-sm font-bold text-foreground">{humidity}%</span>
            <span className="text-[9px] text-muted-foreground">Humidity</span>
          </div>
          
          {/* Wind - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-info/10 to-info/5 border border-info/20 backdrop-blur-sm">
            <Wind className="w-4 h-4 text-info mb-1" />
            <span className="text-sm font-bold text-foreground">{windSpeed}</span>
            <span className="text-[9px] text-muted-foreground">km/h</span>
          </div>
          
          {/* Rainfall - REAL DATA */}
          <div className="flex flex-col items-center p-2 rounded-xl bg-gradient-to-br from-info/10 to-info/5 border border-info/20 backdrop-blur-sm">
            <Cloud className="w-4 h-4 text-info mb-1" />
            <span className="text-sm font-bold text-foreground">{rainfall}</span>
            <span className="text-[9px] text-muted-foreground">mm</span>
          </div>
        </div>

        {/* Quick Actions - Pill Buttons with Modern Touch */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-info/20 to-info/10 text-info dark:text-info hover:from-info/30 hover:to-info/20 transition-all duration-200 whitespace-nowrap border border-info/20 shadow-sm"
          >
            <Droplets className="w-3 h-3" />
            {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-success/20 to-success/10 text-success dark:text-success hover:from-success/30 hover:to-success/20 transition-all duration-200 whitespace-nowrap border border-success/20 shadow-sm"
          >
            <CircleCheckBig className="w-3 h-3" />
            {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-destructive/20 to-destructive/10 text-destructive dark:text-destructive hover:from-destructive/30 hover:to-destructive/20 transition-all duration-200 whitespace-nowrap border border-destructive/20 shadow-sm"
          >
            <Bug className="w-3 h-3" />
            {t('chat.pestRisk')}
          </button>
          <button
            onClick={() => onQuickAction('weather')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-gradient-to-r from-primary/20 to-primary/10 text-primary dark:text-primary hover:from-primary/30 hover:to-primary/20 transition-all duration-200 whitespace-nowrap border border-primary/20 shadow-sm"
          >
            <AlertCircle className="w-3 h-3" />
            {t('chat.weatherAlert')}
          </button>
        </div>
        
        {/* Last Updated Indicator */}
        {lastUpdated && (
          <div className="flex items-center justify-end mt-2">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
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