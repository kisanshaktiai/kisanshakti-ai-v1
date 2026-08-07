import React from 'react';
import { motion } from 'framer-motion';
import { Droplets, Bug, Sprout, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface FarmingRecommendationsProps {
  currentWeather: any;
  forecast: any[];
  /**
   * MODEL B — soil/crop-aware daily state for the selected land.
   * When present it OVERRIDES the client-side heuristics below: the database
   * value accounts for soil water holding capacity, effective rainfall and
   * crop stage, none of which the browser can know.
   */
  landState?: {
    irrigation_needed: boolean | null;
    irrigation_urgency: string | null;
    water_deficit_mm: number | null;
    disease_risk_level: string | null;
  } | null;
}

export const FarmingRecommendations: React.FC<FarmingRecommendationsProps> = ({
  currentWeather,
  forecast,
  landState
}) => {
  const { t } = useTranslation();

  const getIrrigationAdvice = () => {
    // DB-derived (authoritative) path.
    if (landState) {
      const urgency = (landState.irrigation_urgency ?? '').toUpperCase();
      if (urgency === 'CRITICAL' || urgency === 'HIGH' || urgency === 'URGENT') {
        return { status: 'high', icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', fromField: true };
      }
      if (urgency === 'MEDIUM' || urgency === 'MODERATE' || landState.irrigation_needed) {
        return { status: 'medium', icon: Droplets, color: 'text-info', bgColor: 'bg-info/10', fromField: true };
      }
      if (urgency === 'LOW' || urgency === 'NONE' || landState.irrigation_needed === false) {
        return { status: 'low', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10', fromField: true };
      }
    }

    const temp = currentWeather.temp;
    const humidity = currentWeather.humidity;
    const rainChance = forecast[0]?.pop || 0;

    if (rainChance > 0.6) {
      return { status: 'low', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10', fromField: false };
    } else if (temp > 32 && humidity < 40) {
      return { status: 'high', icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', fromField: false };
    } else {
      return { status: 'medium', icon: Droplets, color: 'text-info', bgColor: 'bg-info/10', fromField: false };
    }
  };

  const getSprayingAdvice = () => {
    const windSpeed = currentWeather.wind_speed * 3.6;
    const rainChance = forecast[0]?.pop || 0;

    if (rainChance > 0.5 || windSpeed > 15) {
      return { status: 'bad', icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10', fromField: false };
    } else if (windSpeed < 8 && rainChance < 0.2) {
      return { status: 'good', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10', fromField: false };
    } else {
      return { status: 'moderate', icon: Bug, color: 'text-warning', bgColor: 'bg-warning/10', fromField: false };
    }
  };

  const getPlantingAdvice = () => {
    const temp = currentWeather.temp;
    const humidity = currentWeather.humidity;

    if (temp > 15 && temp < 35 && humidity > 30 && humidity < 80) {
      return { status: 'good', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10', fromField: false };
    } else if (temp < 10 || temp > 40) {
      return { status: 'bad', icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10', fromField: false };
    } else {
      return { status: 'moderate', icon: Sprout, color: 'text-warning', bgColor: 'bg-warning/10', fromField: false };
    }
  };

  const irrigation = getIrrigationAdvice();
  const spraying = getSprayingAdvice();
  const planting = getPlantingAdvice();

  const irrigationSub = irrigation.fromField && landState?.water_deficit_mm !== null && landState?.water_deficit_mm !== undefined
    ? `${Number(landState.water_deficit_mm).toFixed(1)} mm deficit`
    : undefined;

  const recommendations = [
    {
      icon: Droplets,
      title: t('weather.farming.irrigation', 'Irrigation'),
      ...irrigation,
      sub: irrigationSub,
      label: irrigation.status === 'high' ? t('weather.farming.high', 'HIGH') :
             irrigation.status === 'medium' ? t('weather.farming.medium', 'MEDIUM') :
             t('weather.farming.low', 'LOW')
    },
    {
      icon: Bug,
      title: t('weather.farming.spraying', 'Spraying'),
      ...spraying,
      sub: undefined,
      label: spraying.status === 'good' ? t('weather.farming.good', 'GOOD') :
             spraying.status === 'moderate' ? t('weather.farming.moderate', 'MODERATE') :
             t('weather.farming.avoid', 'AVOID')
    },
    {
      icon: Sprout,
      title: t('weather.farming.planting', 'Planting'),
      ...planting,
      sub: undefined,
      label: planting.status === 'good' ? t('weather.farming.favorable', 'FAVORABLE') :
             planting.status === 'moderate' ? t('weather.farming.ok', 'OK') :
             t('weather.farming.notRecommended', 'NOT RECOMMENDED')
    }
  ];


  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="px-4 py-3"
    >
      <h3 className="text-base font-bold mb-3 flex items-center gap-2">
        <Sprout className="h-4 w-4 text-primary" />
        {t('weather.farming.title', 'Farming Recommendations')}
      </h3>

      {/* FIX: Improved horizontal scroll with better snap and touch handling */}
      <div 
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory -mx-4 px-4"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth'
        }}
      >
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + index * 0.1 }}
            className="flex-none w-[140px] snap-center"
          >
            <Card className={cn(
              "relative overflow-hidden border h-full transition-all hover:shadow-md",
              "bg-gradient-to-br from-card to-card/80 backdrop-blur-sm",
              rec.color === 'text-success' && "border-success/30",
              rec.color === 'text-destructive' && "border-destructive/30",
              rec.color === 'text-warning' && "border-warning/30",
              rec.color === 'text-info' && "border-info/30"
            )}>
              <div className={cn(
                "absolute top-0 right-0 w-20 h-20 rounded-full -translate-y-10 translate-x-10 opacity-20",
                rec.bgColor
              )} />
              
              <CardContent className="p-4 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <rec.icon className={cn("h-8 w-8", rec.color)} />
                  {rec.fromField && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      Field
                    </span>
                  )}
                </div>
                
                <div>
                  <p className="text-sm font-semibold mb-1.5">{rec.title}</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-xs font-bold px-2.5 py-0.5 rounded-full",
                      rec.color,
                      rec.bgColor
                    )}
                  >
                    {rec.label}
                  </Badge>
                  {rec.sub && (
                    <p className="text-[9px] text-muted-foreground mt-1">{rec.sub}</p>
                  )}
                </div>
              </CardContent>

            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
