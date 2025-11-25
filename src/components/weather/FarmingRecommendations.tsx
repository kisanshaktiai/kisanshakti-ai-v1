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
      return { status: 'low', icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' };
    } else if (temp > 32 && humidity < 40) {
      return { status: 'high', icon: AlertTriangle, color: 'text-red-500', bgColor: 'bg-red-500/10' };
    } else {
      return { status: 'medium', icon: Droplets, color: 'text-blue-500', bgColor: 'bg-blue-500/10' };
    }
  };

  const getSprayingAdvice = () => {
    const windSpeed = currentWeather.wind_speed * 3.6;
    const rainChance = forecast[0]?.pop || 0;

    if (rainChance > 0.5 || windSpeed > 15) {
      return { status: 'bad', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' };
    } else if (windSpeed < 8 && rainChance < 0.2) {
      return { status: 'good', icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' };
    } else {
      return { status: 'moderate', icon: Bug, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
    }
  };

  const getPlantingAdvice = () => {
    const temp = currentWeather.temp;
    const humidity = currentWeather.humidity;

    if (temp > 15 && temp < 35 && humidity > 30 && humidity < 80) {
      return { status: 'good', icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10' };
    } else if (temp < 10 || temp > 40) {
      return { status: 'bad', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' };
    } else {
      return { status: 'moderate', icon: Sprout, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' };
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
      transition={{ delay: 0.4 }}
      className="px-4 py-6"
    >
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Sprout className="h-6 w-6 text-primary" />
        {t('weather.farming.title', 'Farming Recommendations')}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {recommendations.map((rec, index) => (
          <motion.div
            key={rec.title}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + index * 0.1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card className="relative overflow-hidden border-2 hover:shadow-lg transition-all">
              <div className={cn("absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-16 translate-x-16", rec.bgColor)} />
              
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-lg">
                    <rec.icon className={cn("h-5 w-5", rec.color)} />
                    {rec.title}
                  </span>
                  <rec.icon className={cn("h-6 w-6", rec.color)} />
                </CardTitle>
              </CardHeader>

              <CardContent>
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-sm font-bold px-3 py-1",
                    rec.color,
                    rec.bgColor
                  )}
                >
                  {rec.label}
                </Badge>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
