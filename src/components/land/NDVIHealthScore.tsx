import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Heart, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';

interface NDVIHealthScoreProps {
  ndvi: number;
  trend: number;
  healthLabel: string;
  className?: string;
}

export function NDVIHealthScore({ ndvi, trend, healthLabel, className }: NDVIHealthScoreProps) {
  const { t } = useTranslation();
  
  // Calculate health score (0-100)
  const healthScore = Math.round(Math.min(100, Math.max(0, ndvi * 100 + (trend * 1000))));
  
  // Get color based on score
  const getScoreColor = () => {
    if (healthScore >= 70) return 'text-success';
    if (healthScore >= 50) return 'text-warning';
    if (healthScore >= 30) return 'text-orange-500';
    return 'text-destructive';
  };

  const getGradientColor = () => {
    if (healthScore >= 70) return 'from-success/20 via-success/10 to-transparent';
    if (healthScore >= 50) return 'from-warning/20 via-warning/10 to-transparent';
    if (healthScore >= 30) return 'from-orange-500/20 via-orange-500/10 to-transparent';
    return 'from-destructive/20 via-destructive/10 to-transparent';
  };

  const getStrokeColor = () => {
    if (healthScore >= 70) return 'stroke-success';
    if (healthScore >= 50) return 'stroke-warning';
    if (healthScore >= 30) return 'stroke-orange-500';
    return 'stroke-destructive';
  };

  const getTrendIcon = () => {
    if (trend > 0.001) return <TrendingUp className="h-4 w-4 text-success" />;
    if (trend < -0.001) return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendLabel = () => {
    if (trend > 0.001) return t('ndvi.trend.improving', 'Improving');
    if (trend < -0.001) return t('ndvi.trend.declining', 'Declining');
    return t('ndvi.trend.stable', 'Stable');
  };

  // SVG circle properties
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;

  return (
    <Card className={cn(
      "relative overflow-hidden border-none shadow-xl",
      `bg-gradient-to-br ${getGradientColor()}`,
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={cn("p-2 rounded-full bg-background/80", getScoreColor())}>
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {t('ndvi.health_score.title', 'Crop Health Score')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('ndvi.health_score.subtitle', 'AI-powered analysis')}
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
                className={getStrokeColor()}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{
                  strokeDasharray: circumference,
                }}
              />
            </svg>
            
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span 
                className={cn("text-4xl font-bold", getScoreColor())}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                {healthScore}
              </motion.span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {t('ndvi.health_score.out_of', 'out of 100')}
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
                healthLabel === 'Excellent' && "border-success text-success",
                healthLabel === 'Healthy' && "border-success text-success",
                healthLabel === 'Moderate' && "border-warning text-warning",
                healthLabel === 'Critical' && "border-destructive text-destructive"
              )}
            >
              {t(`ndvi.health_labels.${healthLabel.toLowerCase()}`, healthLabel)}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            {getTrendIcon()}
            <span className="text-muted-foreground">{getTrendLabel()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
