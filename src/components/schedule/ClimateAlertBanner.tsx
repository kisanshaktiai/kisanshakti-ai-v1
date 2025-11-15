import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudRain, Leaf, ThermometerSun, TrendingUp, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
      <Alert className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/20 dark:to-green-950/20 border-primary/30">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 text-xs">
              <CloudRain className={`h-4 w-4 ${hasHighRainfall ? 'text-blue-600 animate-pulse' : 'text-blue-500'}`} />
              <span className="font-semibold">{data.rainfall_24h}mm</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <Leaf className={`h-4 w-4 ${hasLowNDVI ? 'text-orange-600 animate-pulse' : 'text-green-500'}`} />
              <span className="font-semibold">NDVI: {data.ndvi_value.toFixed(2)}</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs">
              <ThermometerSun className={`h-4 w-4 ${hasHighTemp ? 'text-red-600 animate-pulse' : 'text-orange-500'}`} />
              <span className="font-semibold">{data.temperature_avg}°C</span>
            </div>
          </div>
          
          <Badge 
            variant={hasAdjustments ? 'default' : 'secondary'}
            className={`text-[10px] ${hasAdjustments ? 'bg-primary animate-pulse' : ''}`}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            AI Active
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
                {data.tasks_rescheduled} Tasks Auto-Adjusted
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {data.adjustment_reason || 'Schedule automatically optimized based on climate conditions'}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Messages */}
      {hasHighRainfall && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950/20 border-blue-300 text-xs py-2">
          <CloudRain className="h-3 w-3" />
          <AlertDescription>
            Heavy rainfall detected. Irrigation and spraying tasks may be delayed.
          </AlertDescription>
        </Alert>
      )}

      {hasLowNDVI && (
        <Alert variant="default" className="bg-orange-50 dark:bg-orange-950/20 border-orange-300 text-xs py-2">
          <Leaf className="h-3 w-3" />
          <AlertDescription>
            Low crop health (NDVI). Fertilizer application may be prioritized.
          </AlertDescription>
        </Alert>
      )}

      {hasHighTemp && (
        <Alert variant="default" className="bg-red-50 dark:bg-red-950/20 border-red-300 text-xs py-2">
          <ThermometerSun className="h-3 w-3" />
          <AlertDescription>
            High temperature. Irrigation may be advanced to prevent heat stress.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ClimateAlertBanner;