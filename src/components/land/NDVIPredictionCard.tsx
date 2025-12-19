import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  Sparkles, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Target,
  Gauge
} from 'lucide-react';
import type { NDVIPrediction } from '@/hooks/useNDVIAnalysis';

interface NDVIPredictionCardProps {
  prediction: NDVIPrediction | null;
  currentNdvi: number;
  className?: string;
}

export function NDVIPredictionCard({ prediction, currentNdvi, className }: NDVIPredictionCardProps) {
  const { t } = useTranslation();

  if (!prediction) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t('ndvi.prediction.not_available', 'Predictions available after more data is collected')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'improving': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'improving': return 'text-success';
      case 'declining': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getHealthStatus = (ndvi: number) => {
    if (ndvi >= 0.7) return { label: t('ndvi.health.excellent', 'Excellent'), color: 'bg-success text-success-foreground' };
    if (ndvi >= 0.5) return { label: t('ndvi.health.good', 'Good'), color: 'bg-primary text-primary-foreground' };
    if (ndvi >= 0.3) return { label: t('ndvi.health.moderate', 'Moderate'), color: 'bg-warning text-warning-foreground' };
    return { label: t('ndvi.health.poor', 'Poor'), color: 'bg-destructive text-destructive-foreground' };
  };

  const current7Status = getHealthStatus(prediction.days7.predicted_ndvi);
  const current14Status = getHealthStatus(prediction.days14.predicted_ndvi);

  return (
    <Card className={cn("relative overflow-hidden border-none shadow-xl bg-gradient-to-br from-card to-muted/20", className)}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
      
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          {t('ndvi.prediction.title', 'AI Prediction')}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Current Status */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('ndvi.prediction.current', 'Current')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{currentNdvi.toFixed(3)}</span>
            <Badge className={getHealthStatus(currentNdvi).color}>
              {getHealthStatus(currentNdvi).label}
            </Badge>
          </div>
        </div>

        {/* 7-Day Prediction */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('ndvi.prediction.7_days', '7-Day Forecast')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {getTrendIcon(prediction.days7.trend_direction)}
              <span className={cn("text-sm", getTrendColor(prediction.days7.trend_direction))}>
                {prediction.days7.predicted_ndvi.toFixed(3)}
              </span>
            </div>
          </div>
          
          <div className="relative">
            <Progress 
              value={prediction.days7.predicted_ndvi * 100} 
              className="h-3 bg-muted"
            />
            <div className="flex items-center justify-between mt-1">
              <Badge variant="outline" className={current7Status.color}>
                {current7Status.label}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gauge className="h-3 w-3" />
                {prediction.days7.confidence}% {t('ndvi.prediction.confidence', 'confidence')}
              </div>
            </div>
          </div>
        </motion.div>

        {/* 14-Day Prediction */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('ndvi.prediction.14_days', '14-Day Forecast')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {getTrendIcon(prediction.days14.trend_direction)}
              <span className={cn("text-sm", getTrendColor(prediction.days14.trend_direction))}>
                {prediction.days14.predicted_ndvi.toFixed(3)}
              </span>
            </div>
          </div>
          
          <div className="relative">
            <Progress 
              value={prediction.days14.predicted_ndvi * 100} 
              className="h-3 bg-muted"
            />
            <div className="flex items-center justify-between mt-1">
              <Badge variant="outline" className={current14Status.color}>
                {current14Status.label}
              </Badge>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Gauge className="h-3 w-3" />
                {prediction.days14.confidence}% {t('ndvi.prediction.confidence', 'confidence')}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trend Summary */}
        <div className="pt-3 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            {prediction.days7.trend_direction === 'improving' && (
              <>
                <span className="text-success font-medium">📈 {t('ndvi.prediction.improving_msg', 'Good news!')}</span>{' '}
                {t('ndvi.prediction.improving_detail', 'Your crop health is expected to improve over the next 2 weeks.')}
              </>
            )}
            {prediction.days7.trend_direction === 'declining' && (
              <>
                <span className="text-destructive font-medium">📉 {t('ndvi.prediction.declining_msg', 'Attention needed!')}</span>{' '}
                {t('ndvi.prediction.declining_detail', 'Crop health may decline. Consider taking preventive action.')}
              </>
            )}
            {prediction.days7.trend_direction === 'stable' && (
              <>
                <span className="text-primary font-medium">➡️ {t('ndvi.prediction.stable_msg', 'Stable conditions')}</span>{' '}
                {t('ndvi.prediction.stable_detail', 'Crop health is expected to remain steady. Continue current care.')}
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
