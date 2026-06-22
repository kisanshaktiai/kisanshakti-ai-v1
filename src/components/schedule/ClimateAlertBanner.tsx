import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudRain, Leaf, ThermometerSun, TrendingUp, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

interface ClimateAlert {
  rainfall_24h: number;
  ndvi_value: number;
  temperature_avg: number;
  adjustment_triggered: boolean;
  tasks_rescheduled: number;
  adjustment_reason?: string;
}

interface ClimateAlertBannerProps {
  data: ClimateAlert | null;
}

const ClimateAlertBanner: React.FC<ClimateAlertBannerProps> = ({ data }) => {
  const { t } = useTranslation();
  
  if (!data) return null;

  const hasHighRainfall = data.rainfall_24h > 50;
  const hasLowNDVI = data.ndvi_value < 0.3;
  const hasHighTemp = data.temperature_avg > 35;
  const hasAdjustments = data.adjustment_triggered;

  if (!hasHighRainfall && !hasLowNDVI && !hasHighTemp && !hasAdjustments) {
    return null;
  }

  return (
    <div className="px-4 space-y-2">
      {/* Climate Conditions */}
      <Alert className="bg-gradient-to-r from-info to-success dark:from-info/20 dark:to-success/20 border-primary/30">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <CloudRain className={`h-4 w-4 ${hasHighRainfall ? 'text-info animate-pulse' : 'text-info'}`} />
              <span className="font-semibold">{data.rainfall_24h}mm</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <Leaf className={`h-4 w-4 ${hasLowNDVI ? 'text-warning animate-pulse' : 'text-success'}`} />
              <span className="font-semibold">NDVI: {data.ndvi_value.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <ThermometerSun className={`h-4 w-4 ${hasHighTemp ? 'text-destructive animate-pulse' : 'text-warning'}`} />
              <span className="font-semibold">{data.temperature_avg}°C</span>
            </div>
          </div>
          
          <Badge 
            variant={hasAdjustments ? 'default' : 'secondary'}
            className={`text-[10px] ${hasAdjustments ? 'bg-primary animate-pulse' : ''}`}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            {t('schedule.climate.ai_active')}
          </Badge>
        </div>
      </Alert>

      {/* Adjustment Alert */}
      {hasAdjustments && (
        <Alert className="bg-gradient-to-r from-primary/10 to-success/10 border-primary/40 animate-in slide-in-from-top-2">
          <Calendar className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-success text-success-foreground text-[10px]">
                {t('schedule.climate.tasks_auto_adjusted', { count: data.tasks_rescheduled })}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {data.adjustment_reason || t('schedule.climate.schedule_optimized')}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Messages */}
      {hasHighRainfall && (
        <Alert variant="default" className="bg-info-soft dark:bg-info/20 border-info/50 text-xs py-2">
          <CloudRain className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.heavy_rainfall')}
          </AlertDescription>
        </Alert>
      )}

      {hasLowNDVI && (
        <Alert variant="default" className="bg-warning-soft dark:bg-warning/20 border-warning/50 text-xs py-2">
          <Leaf className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.low_crop_health')}
          </AlertDescription>
        </Alert>
      )}

      {hasHighTemp && (
        <Alert variant="default" className="bg-destructive-soft dark:bg-destructive/20 border-destructive/50 text-xs py-2">
          <ThermometerSun className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.high_temperature')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ClimateAlertBanner;