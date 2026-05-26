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
}

export const FarmingRecommendations: React.FC<FarmingRecommendationsProps> = ({
  currentWeather,
  forecast
}) => {
  const { t } = useTranslation();

  const getIrrigationAdvice = () => {
    const temp = currentWeather.temp;
    const humidity = currentWeather.humidity;
    const rainChance = forecast[0]?.pop || 0;

    if (rainChance > 0.6) {
      return { status: 'low', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' };
    } else if (temp > 32 && humidity < 40) {
      return { status: 'high', icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10' };
    } else {
      return { status: 'medium', icon: Droplets, color: 'text-info', bgColor: 'bg-info/10' };
    }
  };

  const getSprayingAdvice = () => {
    const windSpeed = currentWeather.wind_speed * 3.6;
    const rainChance = forecast[0]?.pop || 0;

    if (rainChance > 0.5 || windSpeed > 15) {
      return { status: 'bad', icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' };
    } else if (windSpeed < 8 && rainChance < 0.2) {
      return { status: 'good', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' };
    } else {
      return { status: 'moderate', icon: Bug, color: 'text-warning', bgColor: 'bg-warning/10' };
    }
  };

  const getPlantingAdvice = () => {
    const temp = currentWeather.temp;
    const humidity = currentWeather.humidity;

    if (temp > 15 && temp < 35 && humidity > 30 && humidity < 80) {
      return { status: 'good', icon: CheckCircle, color: 'text-success', bgColor: 'bg-success/10' };
    } else if (temp < 10 || temp > 40) {
      return { status: 'bad', icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' };
    } else {
      return { status: 'moderate', icon: Sprout, color: 'text-warning', bgColor: 'bg-warning/10' };
    }
  };

  const irrigation = getIrrigationAdvice();
  const spraying = getSprayingAdvice();
  const planting = getPlantingAdvice();

  const recommendations = [
    {
      icon: Droplets,
      title: t('weather.farming.irrigation', 'Irrigation'),
      ...irrigation,
      label: irrigation.status === 'high' ? t('weather.farming.high', 'HIGH') :
             irrigation.status === 'medium' ? t('weather.farming.medium', 'MEDIUM') :
             t('weather.farming.low', 'LOW')
    },
    {
      icon: Bug,
      title: t('weather.farming.spraying', 'Spraying'),
      ...spraying,
      label: spraying.status === 'good' ? t('weather.farming.good', 'GOOD') :
             spraying.status === 'moderate' ? t('weather.farming.moderate', 'MODERATE') :
             t('weather.farming.avoid', 'AVOID')
    },
    {
      icon: Sprout,
      title: t('weather.farming.planting', 'Planting'),
      ...planting,
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
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
