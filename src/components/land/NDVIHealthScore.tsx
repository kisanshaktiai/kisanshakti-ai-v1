import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Heart, TrendingUp, TrendingDown, Minus, Sparkles, Info } from 'lucide-react';
import { 
  getScientificHealthStatus, 
  formatNDVI, 
  getTrendDirection,
  NDVI_THRESHOLDS 
} from '@/lib/ndviScience';

interface NDVIHealthScoreProps {
  ndvi: number;
  trend: number;
  healthLabel: string;
  className?: string;
}

export function NDVIHealthScore({ ndvi, trend, healthLabel, className }: NDVIHealthScoreProps) {
  const { t } = useTranslation();
  
  // Get scientific health status
  const healthStatus = getScientificHealthStatus(ndvi);
  const trendDirection = getTrendDirection(trend);
  
  // SVG circle properties - using NDVI value directly (0-1 scale)
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  // Map NDVI (0-1) to circle progress
  const strokeDashoffset = circumference - (Math.max(0, Math.min(1, ndvi)) * circumference);

  const getTrendIcon = () => {
    if (trendDirection === 'improving') return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trendDirection === 'declining') return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendLabel = () => {
    if (trendDirection === 'improving') return t('ndvi.trend.improving', 'Improving');
    if (trendDirection === 'declining') return t('ndvi.trend.declining', 'Declining');
    return t('ndvi.trend.stable', 'Stable');
  };

  return (
    <Card className={cn(
      "relative overflow-hidden border-none shadow-xl",
      `bg-gradient-to-br ${healthStatus.bgColor}`,
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-full bg-background/80", healthStatus.textColor)}>
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {t('ndvi.health_score.title', 'Crop Health')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('ndvi.health_score.subtitle', 'Scientific NDVI Analysis')}
              </p>
            </div>
          </div>
          <Sparkles className="h-5 w-5 text-primary animate-pulse" />
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="relative">
            <svg width={size} height={size} className="-rotate-90">
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-muted/30"
              />
              {/* Progress circle */}
              <motion.circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className={healthStatus.strokeColor}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{
                  strokeDasharray: circumference,
                }}
              />
            </svg>
            
            {/* Center content - Scientific NDVI value */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span 
                className={cn("text-3xl font-bold", healthStatus.textColor)}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                {formatNDVI(ndvi)}
              </motion.span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                NDVI
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn(
                "font-medium",
                healthStatus.level === 'excellent' && "border-green-600 text-green-600",
                healthStatus.level === 'healthy' && "border-emerald-500 text-emerald-500",
                healthStatus.level === 'moderate' && "border-amber-500 text-amber-500",
                healthStatus.level === 'poor' && "border-orange-500 text-orange-500",
                healthStatus.level === 'critical' && "border-red-600 text-red-600"
              )}
            >
              {t(healthStatus.labelKey, healthStatus.label)}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            {getTrendIcon()}
            <span className="text-muted-foreground">{getTrendLabel()}</span>
          </div>
        </div>

        {/* Scientific reference */}
        <div className="mt-3 pt-3 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Scale: 0.0 (bare soil) → 1.0 (dense vegetation) | Healthy: ≥{NDVI_THRESHOLDS.HEALTHY}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
