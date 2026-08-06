import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CloudRain, Droplets, ThermometerSun, TrendingUp, Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

/**
 * Shape mirrors `public.land_weather_state` (the weather pipeline's derived
 * per-land agronomy row). Every field is nullable — the row only exists once
 * the weather edge function has run for this land.
 *
 * The retired `schedule_climate_monitoring` fields (monitoring_date,
 * ndvi_value, adjustment_triggered, tasks_rescheduled) have no equivalent
 * here and are intentionally not rendered.
 */
export interface ClimateState {
  metric_date: string | null;
  temperature_c: number | null;
  humidity_percent: number | null;
  total_rainfall_mm: number | null;
  et0_mm: number | null;
  vpd_kpa: number | null;
  water_deficit_mm: number | null;
  irrigation_needed: boolean | null;
  irrigation_urgency: string | null;
  disease_risk_level: string | null;
  crop_stress_level: string | null;
  water_balance_status: string | null;
}

interface ClimateAlertBannerProps {
  data: ClimateState | null;
}

const isHigh = (level: string | null | undefined) =>
  !!level && ['high', 'critical', 'severe'].includes(level.toLowerCase());

const ClimateAlertBanner: React.FC<ClimateAlertBannerProps> = ({ data }) => {
  const { t } = useTranslation();

  // No measurement yet → render nothing rather than fake zeros.
  if (!data) return null;

  const hasTemp = data.temperature_c != null;
  const hasRain = data.total_rainfall_mm != null;
  const hasEt0 = data.et0_mm != null;
  const hasAnyMeasurement = hasTemp || hasRain || hasEt0 || data.humidity_percent != null;

  const hasHighRainfall = (data.total_rainfall_mm ?? 0) > 50;
  const hasHighTemp = (data.temperature_c ?? 0) > 35;
  const needsIrrigation = data.irrigation_needed === true || isHigh(data.irrigation_urgency);
  const diseaseRisk = isHigh(data.disease_risk_level);
  const cropStress = isHigh(data.crop_stress_level);

  if (!hasAnyMeasurement && !needsIrrigation && !diseaseRisk && !cropStress) {
    return null;
  }

  return (
    <div className="px-4 space-y-2">
      {/* Current derived climate state */}
      {hasAnyMeasurement && (
        <Alert className="bg-gradient-to-r from-info to-success dark:from-info/20 dark:to-success/20 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              {hasRain && (
                <div className="flex items-center gap-2 text-xs">
                  <CloudRain className={`h-4 w-4 ${hasHighRainfall ? 'text-info animate-pulse' : 'text-info'}`} />
                  <span className="font-semibold">{data.total_rainfall_mm}mm</span>
                </div>
              )}

              {hasTemp && (
                <div className="flex items-center gap-2 text-xs">
                  <ThermometerSun className={`h-4 w-4 ${hasHighTemp ? 'text-destructive animate-pulse' : 'text-warning'}`} />
                  <span className="font-semibold">{data.temperature_c}°C</span>
                </div>
              )}

              {hasEt0 && (
                <div className="flex items-center gap-2 text-xs">
                  <Droplets className="h-4 w-4 text-info" />
                  <span className="font-semibold">ET₀ {data.et0_mm}mm</span>
                </div>
              )}

              {data.vpd_kpa != null && (
                <div className="flex items-center gap-2 text-xs">
                  <Wind className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">VPD {data.vpd_kpa}kPa</span>
                </div>
              )}
            </div>

            <Badge variant="secondary" className="text-[10px]">
              <TrendingUp className="h-3 w-3 mr-1" />
              {t('schedule.climate.ai_active')}
            </Badge>
          </div>
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

      {hasHighTemp && (
        <Alert variant="default" className="bg-destructive-soft dark:bg-destructive/20 border-destructive/50 text-xs py-2">
          <ThermometerSun className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.high_temperature')}
          </AlertDescription>
        </Alert>
      )}

      {needsIrrigation && (
        <Alert variant="default" className="bg-info-soft dark:bg-info/20 border-info/50 text-xs py-2">
          <Droplets className="h-3 w-3" />
          <AlertDescription className="flex items-center gap-2">
            <span>{t('schedule.climate.irrigation_needed', 'Irrigation needed')}</span>
            {data.water_deficit_mm != null && (
              <Badge variant="secondary" className="text-[10px]">
                {data.water_deficit_mm}mm
              </Badge>
            )}
          </AlertDescription>
        </Alert>
      )}

      {diseaseRisk && (
        <Alert variant="default" className="bg-warning-soft dark:bg-warning/20 border-warning/50 text-xs py-2">
          <ThermometerSun className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.disease_risk', 'Elevated disease risk')} — {data.disease_risk_level}
          </AlertDescription>
        </Alert>
      )}

      {cropStress && (
        <Alert variant="default" className="bg-warning-soft dark:bg-warning/20 border-warning/50 text-xs py-2">
          <ThermometerSun className="h-3 w-3" />
          <AlertDescription>
            {t('schedule.climate.crop_stress', 'Crop stress detected')} — {data.crop_stress_level}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ClimateAlertBanner;
