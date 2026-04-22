import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  lands: any[];
  currentActivityIndex: number;
  currentWeatherDescription?: string;
  currentWeatherTemp?: number;
  reduceMotion?: boolean;
}

/**
 * Memoized recent activity carousel.
 * Re-renders only when index, lands, or weather summary actually changes.
 */
function HomeRecentActivityImpl({
  lands,
  currentActivityIndex,
  currentWeatherDescription,
  currentWeatherTemp,
  reduceMotion,
}: Props) {
  const { t } = useTranslation();
  const dotCount = lands.length > 0 ? Math.min(lands.length, 5) : 3;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card className="mb-4 border-border/40 backdrop-blur-sm p-3">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{t('home.recent_activity')}</span>
        </div>
        <div className="overflow-hidden relative">
          <AnimatePresence mode="wait">
            {lands.length > 0 ? (
              <motion.div
                key={currentActivityIndex}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                className="flex items-center justify-between p-2.5 bg-gradient-to-r from-muted/50 to-muted/30 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  <div>
                    <p className="text-sm font-medium">
                      {(lands[currentActivityIndex] as any)?.name || t('home.unnamed_land')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(lands[currentActivityIndex] as any)?.area_acres} acres •{' '}
                      {(lands[currentActivityIndex] as any)?.village || t('home.location_not_set')}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {(lands[currentActivityIndex] as any)?.current_crop || t('home.no_crop')}
                </Badge>
              </motion.div>
            ) : (
              <motion.div
                key={`default-${currentActivityIndex}`}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.5, ease: 'easeInOut' }}
                className="flex items-center justify-between p-2.5 bg-gradient-to-r from-muted/50 to-muted/30 rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <div>
                    {currentActivityIndex === 0 && (
                      <>
                        <p className="text-sm font-medium">{t('home.activity.no_lands')}</p>
                        <p className="text-xs text-muted-foreground">{t('home.activity.add_first_land')}</p>
                      </>
                    )}
                    {currentActivityIndex === 1 && (
                      <>
                        <p className="text-sm font-medium">{t('home.activity.current_weather')}</p>
                        <p className="text-xs text-muted-foreground">
                          {currentWeatherDescription || t('home.loading')}
                        </p>
                      </>
                    )}
                    {currentActivityIndex === 2 && (
                      <>
                        <p className="text-sm font-medium">{t('home.activity.govt_schemes')}</p>
                        <p className="text-xs text-muted-foreground">{t('home.activity.check_subsidies')}</p>
                      </>
                    )}
                  </div>
                </div>
                {currentActivityIndex === 0 && (
                  <Link to="/app/lands/add" className="text-xs text-primary">
                    {t('home.badge.add_land')}
                  </Link>
                )}
                {currentActivityIndex === 1 && typeof currentWeatherTemp === 'number' && (
                  <span className="text-xs text-muted-foreground">{Math.round(currentWeatherTemp)}°C</span>
                )}
                {currentActivityIndex === 2 && (
                  <Link to="/app/schemes" className="text-xs text-primary">
                    {t('home.view')}
                  </Link>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dot Indicators */}
          <div className="flex justify-center gap-1.5 mt-2">
            {Array.from({ length: dotCount }).map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  idx === currentActivityIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export const HomeRecentActivity = memo(HomeRecentActivityImpl);
