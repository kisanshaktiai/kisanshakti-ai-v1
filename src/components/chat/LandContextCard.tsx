import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cloud, Droplets, Thermometer, Leaf, Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';

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
  const refLabels = useLandRefLabels();
  
  const getNDVIStatus = (score: number) => {
    if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-success' };
    if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-warning' };
    return { label: t('chat.needsAttention'), color: 'bg-destructive' };
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
            <span className="text-xs text-muted-foreground">• {refLabels.soil(land.soil_type)}</span>
          )}
          {land.current_crop && (
            <span className="text-xs text-muted-foreground">• {refLabels.crop(land.current_crop)}</span>
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
          <div className="flex items-center gap-1 p-1.5 rounded bg-success-soft/50 dark:bg-success/20">
            <Sprout className="w-3 h-3 text-success" />
            <span className="text-xs truncate">{land.current_crop}</span>
          </div>
        )}
        <div className="flex items-center gap-1 p-1.5 rounded bg-warning-soft/50 dark:bg-warning/20">
          <Thermometer className="w-3 h-3 text-warning" />
          <span className="text-xs">{weather.temperature}°C</span>
        </div>
        <div className="flex items-center gap-1 p-1.5 rounded bg-info-soft/50 dark:bg-info/20">
          <Droplets className="w-3 h-3 text-info" />
          <span className="text-xs">{weather.humidity}%</span>
        </div>
        <div className="flex items-center gap-1 p-1.5 rounded bg-info-soft/50 dark:bg-info/20">
          <Cloud className="w-3 h-3 text-info" />
          <span className="text-xs">{weather.rainfall}mm</span>
        </div>
      </div>

      {/* Quick Action Chips */}
      {onQuickAction && (
        <div className="flex gap-1 mt-2 flex-wrap">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-info-soft dark:bg-info/30 text-info dark:text-info hover:bg-info/20 dark:hover:bg-info/50 transition-colors"
          >
            💧 {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-success-soft dark:bg-success/30 text-success dark:text-success hover:bg-success/20 dark:hover:bg-success/50 transition-colors"
          >
            🌱 {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="px-2 py-0.5 text-xs font-medium rounded-full bg-destructive-soft dark:bg-destructive/30 text-destructive dark:text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/50 transition-colors"
          >
            🐛 {t('chat.pestRisk')}
          </button>
        </div>
      )}
    </Card>
  );
}