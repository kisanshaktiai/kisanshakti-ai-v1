import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Thermometer, Leaf, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LandContextCardProps {
  land: any;
  weather?: {
    temperature: number;
    humidity: number;
    rainfall: number;
  };
  ndviScore?: number;
  onQuickAction?: (action: string) => void;
}

export function LandContextCard({ land, weather = { temperature: 28, humidity: 65, rainfall: 12 }, ndviScore = 0.72, onQuickAction }: LandContextCardProps) {
  const { t } = useTranslation();
  
  const getNDVIStatus = (score: number) => {
    if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-green-500' };
    if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-yellow-500' };
    return { label: t('chat.needsAttention'), color: 'bg-red-500' };
  };
  
  const ndviStatus = getNDVIStatus(ndviScore);
  
  return (
    <Card className="p-3 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/20 backdrop-blur-sm">
      {/* Compact Land Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{land.name}</h3>
          <span className="text-xs text-muted-foreground">
            {land.area_acres} {t('common.acres')}
          </span>
          {land.soil_type && (
            <span className="text-xs text-muted-foreground">• {land.soil_type}</span>
          )}
        </div>
        <Badge className={`${ndviStatus.color} text-white text-xs px-2 py-0.5`}>
          <Leaf className="w-3 h-3 mr-0.5" />
          {ndviStatus.label}
        </Badge>
      </div>

      {/* Compact Info Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {land.current_crop && (
          <div className="flex items-center gap-1 p-1.5 rounded bg-green-100/50 dark:bg-green-900/20">
            <Sprout className="w-3 h-3 text-green-600" />
            <span className="text-xs truncate">{land.current_crop}</span>
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

      {/* Quick Action Chips */}
      {onQuickAction && (
        <div className="flex gap-1 mt-2 flex-wrap">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
          >
            💧 {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
          >
            🌱 {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
          >
            🐛 {t('chat.pestRisk')}
          </button>
        </div>
      )}
    </Card>
  );
}