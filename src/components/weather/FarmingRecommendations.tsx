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
    if (!landState || landState.irrigation_needed == null) {
      return { status: 'unknown', icon: Droplets, color: 'text-muted-foreground', bgColor: 'bg-muted/30', fromField: false };
    }
    const urgency = (landState.irrigation_urgency ?? '').toUpperCase();
    if (urgency === 'CRITICAL' || urgency === 'HIGH' || urgency === 'URGENT') {
      return { status: 'high', icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10', fromField: true };
    }
    if (urgency === 'MEDIUM' || urgency === 'MODERATE') {
      return { status: 'medium', icon: Droplets, color: 'text-info', bgColor: 'bg-info/10', fromField: true };
    }
    return landState.irrigation_needed
      ? { status: 'medium', icon: Droplets, color: 'text-info', bgColor: 'bg-info/10', fromField: true }
      : { status: 'low', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10', fromField: true };
  };

  const spraying = { status: 'unknown', icon: Bug, color: 'text-muted-foreground', bgColor: 'bg-muted/30', fromField: false };
  const planting = { status: 'unknown', icon: Sprout, color: 'text-muted-foreground', bgColor: 'bg-muted/30', fromField: false };

  const irrigation = getIrrigationAdvice();
  const spraying = getSprayingAdvice();
  const planting = getPlantingAdvice();

  const irrigationSub = irrigation.fromField && landState?.water_deficit_mm !== null && landState?.water_deficit_mm !== undefined
    ? t('weather.farming.deficit_mm', { value: Number(landState.water_deficit_mm).toFixed(1) })
    : undefined;

  const recommendations = [
    {
      icon: Droplets,
      title: t('weather.farming.irrigation'),
      ...irrigation,
      sub: irrigationSub,
      label: irrigation.status === 'high' ? t('weather.farming.high') :
             irrigation.status === 'medium' ? t('weather.farming.medium') :
             irrigation.status === 'low' ? t('weather.farming.low') :
             t('weather.farming.unavailable', 'Decision unavailable')
    },
    {
      icon: Bug,
      title: t('weather.farming.spraying'),
      ...spraying,
      sub: undefined,
      label: t('weather.farming.unavailable', 'Decision unavailable')
    },
    {
      icon: Sprout,
      title: t('weather.farming.planting'),
      ...planting,
      sub: undefined,
      label: t('weather.farming.unavailable', 'Decision unavailable')
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
        {t('weather.farming.title')}

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
                      {t('weather.farming.field_badge')}
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
