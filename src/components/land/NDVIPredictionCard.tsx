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
  Gauge,
  Info
} from 'lucide-react';
import type { NDVIPrediction } from '@/hooks/useNDVIAnalysis';
import { 
  getScientificHealthStatus, 
  formatNDVI,
  NDVI_THRESHOLDS 
} from '@/lib/ndviScience';

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
      case 'improving': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'declining': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTrendColor = (direction: string) => {
    switch (direction) {
      case 'improving': return 'text-green-600';
      case 'declining': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  // Use scientific health status
  const getHealthBadge = (ndvi: number) => {
    const status = getScientificHealthStatus(ndvi);
    return {
      label: status.label,
      className: cn(
        status.level === 'excellent' && 'bg-green-600 text-white',
        status.level === 'healthy' && 'bg-emerald-500 text-white',
        status.level === 'moderate' && 'bg-amber-500 text-white',
        status.level === 'poor' && 'bg-orange-500 text-white',
        status.level === 'critical' && 'bg-red-600 text-white'
      )
    };
  };

  const currentStatus = getHealthBadge(currentNdvi);
  const status7 = getHealthBadge(prediction.days7.predicted_ndvi);
  const status14 = getHealthBadge(prediction.days14.predicted_ndvi);

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
        {/* Current Status - Scientific NDVI Value */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('ndvi.prediction.current', 'Current NDVI')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{formatNDVI(currentNdvi, 3)}</span>
            <Badge className={currentStatus.className}>
              {currentStatus.label}
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
              <span className={cn("text-sm font-semibold", getTrendColor(prediction.days7.trend_direction))}>
                {formatNDVI(prediction.days7.predicted_ndvi, 3)}
              </span>
            </div>
          </div>
          
          <div className="relative">
            <Progress 
              value={prediction.days7.predicted_ndvi * 100} 
              className="h-3 bg-muted"
            />
            <div className="flex items-center justify-between mt-1">
              <Badge variant="outline" className={status7.className}>
                {status7.label}
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
              <span className={cn("text-sm font-semibold", getTrendColor(prediction.days14.trend_direction))}>
                {formatNDVI(prediction.days14.predicted_ndvi, 3)}
              </span>
            </div>
          </div>
          
          <div className="relative">
            <Progress 
              value={prediction.days14.predicted_ndvi * 100} 
              className="h-3 bg-muted"
            />
            <div className="flex items-center justify-between mt-1">
              <Badge variant="outline" className={status14.className}>
                {status14.label}
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
                <span className="text-green-600 font-medium">📈 {t('ndvi.prediction.improving_msg', 'Good news!')}</span>{' '}
                {t('ndvi.prediction.improving_detail', 'Your crop health is expected to improve over the next 2 weeks.')}
              </>
            )}
            {prediction.days7.trend_direction === 'declining' && (
              <>
                <span className="text-red-600 font-medium">📉 {t('ndvi.prediction.declining_msg', 'Attention needed!')}</span>{' '}
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

        {/* Scientific Reference */}
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            NDVI thresholds: Excellent ≥{NDVI_THRESHOLDS.EXCELLENT} | Healthy ≥{NDVI_THRESHOLDS.HEALTHY} | Moderate ≥{NDVI_THRESHOLDS.MODERATE}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
