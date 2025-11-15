import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Thermometer, Leaf, AlertCircle, Sprout, Bug, CircleCheckBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { landsApi } from '@/services/landsApi';
import { Skeleton } from '@/components/ui/skeleton';

interface LandSpecificChatTabProps {
  landId: string;
  onQuickAction: (action: string) => void;
}

export function LandSpecificChatTab({ landId, onQuickAction }: LandSpecificChatTabProps) {
  const { t } = useTranslation();
  const [landData, setLandData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState({
    temperature: 28,
    humidity: 65,
    rainfall: 12
  });

  useEffect(() => {
    fetchLandDetails();
    // Simulate weather fetch (in production, fetch from weather API)
    setTimeout(() => {
      setWeather({
        temperature: Math.floor(Math.random() * 10) + 25,
        humidity: Math.floor(Math.random() * 30) + 50,
        rainfall: Math.floor(Math.random() * 20)
      });
    }, 500);
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
    if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-green-500' };
    if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-yellow-500' };
    return { label: t('chat.needsAttention'), color: 'bg-red-500' };
  };

  const ndviScore = 0.72; // Simulated NDVI score
  const ndviStatus = getNDVIStatus(ndviScore);

  if (loading) {
    return (
      <div className="mx-2 mt-2 mb-2">
        <Card className="p-3 bg-gradient-to-r from-primary/5 to-secondary/5 border-primary/20">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!landData) return null;

  return (
    <div className="mx-2 mt-2 mb-2 max-h-32 overflow-y-auto">
      <Card className="p-3 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/20 backdrop-blur-sm">
        {/* Compact Land Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{landData.name}</h3>
            <span className="text-xs text-muted-foreground">
              {landData.area_acres} {t('common.acres')}
            </span>
            {landData.soil_type && (
              <span className="text-xs text-muted-foreground">• {landData.soil_type}</span>
            )}
          </div>
          <Badge className={`${ndviStatus.color} text-white text-xs px-2 py-0.5`}>
            <Leaf className="w-3 h-3 mr-0.5" />
            {ndviStatus.label}
          </Badge>
        </div>

        {/* Compact Info Grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-2">
          {landData.current_crop && (
            <div className="flex items-center gap-1 p-1.5 rounded bg-green-100/50 dark:bg-green-900/20">
              <Sprout className="w-3 h-3 text-green-600" />
              <span className="text-xs truncate">{landData.current_crop}</span>
            </div>
          )}
          <div className="flex items-center gap-1 p-1.5 rounded bg-orange-100/50 dark:bg-orange-900/20">
            <Thermometer className="w-3 h-3 text-orange-600" />
            <span className="text-xs">{weather.temperature}°C</span>
          </div>
          <div className="flex items-center gap-1 p-1.5 rounded bg-blue-100/50 dark:bg-blue-900/20">
            <Droplets className="w-3 h-3 text-blue-600" />
            <span className="text-xs">{weather.humidity}%</span>
          </div>
          <div className="flex items-center gap-1 p-1.5 rounded bg-cyan-100/50 dark:bg-cyan-900/20">
            <Cloud className="w-3 h-3 text-cyan-600" />
            <span className="text-xs">{weather.rainfall}mm</span>
          </div>
        </div>

        {/* Compact Quick Actions */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors whitespace-nowrap"
          >
            <Droplets className="w-3 h-3" />
            {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors whitespace-nowrap"
          >
            <CircleCheckBig className="w-3 h-3" />
            {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap"
          >
            <Bug className="w-3 h-3" />
            {t('chat.pestRisk')}
          </button>
          <button
            onClick={() => onQuickAction('weather')}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors whitespace-nowrap"
          >
            <AlertCircle className="w-3 h-3" />
            {t('chat.weatherAlert')}
          </button>
        </div>
      </Card>
    </div>
  );
}