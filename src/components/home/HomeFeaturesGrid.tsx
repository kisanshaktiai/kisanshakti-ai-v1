import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowUpRight, ArrowDownRight, TrendingUp, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface HomeFeatureCard {
  title: string;
  icon: React.ElementType;
  path: string;
  description: string;
  stats?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  color: string;
  iconColor?: string;
  badge?: string;
  progress?: number;
  /** Plan-gated: render greyed and route to /app/subscription on tap */
  locked?: boolean;
}

interface Props {
  features: HomeFeatureCard[];
  variant: 'main' | 'secondary';
  reduceMotion?: boolean;
}

/**
 * Memoized features grid (main or secondary).
 * Only re-renders when the `features` array reference or variant changes,
 * NOT every minute when the parent's clock ticks.
 */
function HomeFeaturesGridImpl({ features, variant, reduceMotion }: Props) {
  const isMain = variant === 'main';
  const containerDelay = isMain ? 0.2 : 0.3;
  const cardClass = isMain
    ? 'group hover:shadow-[0_10px_40px_-10px_rgba(var(--primary-rgb),0.2)] transition-all duration-300 overflow-hidden h-full border-border/50 backdrop-blur-sm'
    : 'group hover:shadow-lg transition-all duration-300 overflow-hidden h-full bg-card/50 backdrop-blur-sm border-border/40';

  return (
    <motion.div
      className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', isMain ? 'mb-4' : 'mb-6')}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: containerDelay }}
    >
      {features.map((feature) => {
        const Icon = feature.icon;
        const TrendIcon = isMain
          ? feature.trend === 'up'
            ? ArrowUpRight
            : ArrowDownRight
          : feature.trend === 'up'
            ? TrendingUp
            : ArrowDownRight;

        const isLocked = !!feature.locked;
        const targetPath = isLocked ? '/app/subscription' : feature.path;

        const p = feature.path || '';
        const tourTag = p.includes('weather')
          ? 'weather'
          : p.includes('schedule')
            ? 'schedule'
            : p.includes('ndvi')
              ? 'ndvi'
              : p.includes('chat')
                ? 'chat'
                : p.includes('market')
                  ? 'market'
                  : p.includes('community')
                    ? 'community'
                    : undefined;

        return (
          <Link
            key={`${variant}-${feature.title}`}
            to={targetPath}
            aria-disabled={isLocked}
            data-tour={tourTag}
          >
            <motion.div
              whileHover={reduceMotion || isLocked ? undefined : { scale: isMain ? 1.03 : 1.02, y: isMain ? -4 : -3 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Card className={cn(cardClass, isLocked && 'relative opacity-70 grayscale')}>
                {isLocked && (
                  <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center">
                    <Lock className="w-3 h-3 text-muted-foreground" />
                  </div>
                )}
                <div className={cn(isMain ? 'h-1' : 'h-0.5', feature.color)} />
                <CardHeader className={isMain ? 'pb-3' : 'pb-2'}>
                  <div className={cn('flex items-start justify-between', isMain ? 'mb-3' : 'mb-2')}>
                    <div
                      className={cn(
                        'rounded-2xl flex items-center justify-center shadow-soft',
                        isMain ? 'w-12 h-12' : 'w-10 h-10 rounded-xl',
                        feature.color,
                      )}
                    >
                      <Icon
                        className={cn(
                          isMain ? 'w-6 h-6 text-primary-foreground' : `w-5 h-5 ${feature.iconColor || 'text-primary'}`,
                        )}
                      />
                    </div>
                    {feature.badge && !isLocked && (
                      <Badge variant={isMain ? 'secondary' : 'outline'} className="text-xs">
                        {feature.badge}
                      </Badge>
                    )}
                  </div>
                  <CardTitle
                    className={cn(
                      'font-semibold group-hover:text-primary transition-colors',
                      isMain ? 'text-sm' : 'text-xs',
                    )}
                  >
                    {feature.title}
                  </CardTitle>
                  <p
                    className={cn(
                      'text-xs text-muted-foreground',
                      isMain ? 'mt-1 line-clamp-2' : 'mt-0.5 line-clamp-1',
                    )}
                  >
                    {feature.description}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between">
                    {isLocked ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5"
                      >
                        <Lock className="w-2.5 h-2.5" />
                        Upgrade
                      </Badge>
                    ) : (
                      <span className={cn('font-medium', isMain ? 'text-sm' : 'text-xs')}>{feature.stats}</span>
                    )}
                    {!isLocked && feature.trend && (
                      <div className={cn('flex items-center', isMain ? 'gap-1' : 'gap-0.5')}>
                        <TrendIcon
                          className={cn('w-3 h-3', feature.trend === 'up' ? 'text-success' : 'text-destructive')}
                        />
                        <span
                          className={cn('text-xs', feature.trend === 'up' ? 'text-success' : 'text-destructive')}
                        >
                          {feature.trendValue}
                        </span>
                      </div>
                    )}
                  </div>
                  {!isLocked && feature.progress !== undefined && feature.progress > 0 && (
                    <Progress value={feature.progress} className="mt-2 h-1" />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </Link>
        );
      })}
    </motion.div>
  );
}

export const HomeFeaturesGrid = memo(HomeFeaturesGridImpl);
