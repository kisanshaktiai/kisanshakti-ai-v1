import { useTranslation } from 'react-i18next';
import {
  MapPin,
  Calendar,
  Bot,
  ShoppingCart,
  Cloud,
  Users,
  Satellite,
  FileText,
  BarChart3,
  Droplets,
  Thermometer,
  Wind,
  Activity,
  Leaf,
  ChevronDown,
  Sun,
  CloudRain,
  CloudSnow,
} from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';
import { HomeSkeleton } from '@/components/skeletons';
import { motion, AnimatePresence } from 'framer-motion';
import { useYouTubeChannelReels } from '@/hooks/useYouTubeChannelReels';
import WeatherScheduleAlerts from '@/components/schedule/WeatherScheduleAlerts';
import { AlertsSummaryCard } from '@/components/home/AlertsSummaryCard';
import { HomeFeaturesGrid, type HomeFeatureCard } from '@/components/home/HomeFeaturesGrid';
import { HomeRecentActivity } from '@/components/home/HomeRecentActivity';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useFeatures } from '@/hooks/useFeatures';

// Lazy-load the heavy video card (carousel + lazy images) to keep initial JS small.
const VideoHelpCard = lazy(() =>
  import('@/components/home/VideoHelpCard').then((m) => ({ default: m.VideoHelpCard })),
);

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const {
    currentWeather,
    forecast,
    hourlyForecast,
    loading: weatherLoading,
    lastUpdated,
    isStale: weatherIsStale,
    locationSource,
    weatherDistanceKm,
    weatherStationName,
    refetch: refetchWeather,
  } = useWeather();
  const reduceMotion = useReducedMotion();

  // ---------------------------------------------------------------------
  // Weather card provenance + freshness (the farmer must be able to tell
  // "my location" from "a station 12 km away" from "regional estimate").
  // ---------------------------------------------------------------------
  const weatherProvenance = (() => {
    if (locationSource === 'regional') return t('weather.provenance.regional');
    if (weatherDistanceKm != null && weatherDistanceKm >= 1) {
      return weatherStationName
        ? t('weather.provenance.named_station', { name: weatherStationName, km: weatherDistanceKm })
        : t('weather.provenance.nearby_station', { km: weatherDistanceKm });
    }
    if (locationSource === 'farm') return t('weather.provenance.your_field');
    return t('weather.provenance.your_location');
  })();

  const weatherUpdatedLabel = (() => {
    if (!lastUpdated) return null;
    const mins = Math.floor((Date.now() - lastUpdated) / 60000);
    if (mins < 1) return t('weather.header.updated_now');
    if (mins < 60) return t('weather.header.updated_minutes', { minutes: mins });
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? t('weather.header.updated_hour') : t('weather.header.updated_hours', { hours: hrs });
  })();

  // Rain in the next 6 hours is what actually changes the morning plan.
  const rainNext6h = (() => {
    const next6 = (hourlyForecast ?? []).slice(0, 6);
    if (next6.length) return Math.round(Math.max(...next6.map((h: any) => Number(h?.pop ?? 0))) * 100);
    const pop = forecast?.[0]?.pop;
    return pop != null ? Math.round(Number(pop) * 100) : 0;
  })();


  const currentTime = useMinuteTick();
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(true);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const [currentMetricIndex, setCurrentMetricIndex] = useState(0);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);

  // Home "Farming Reels": ONLY surfaces videos from the official
  // KisanShakti AI YouTube channel (@kisanshaktiai). If the feed is
  // unavailable, the section hides itself — no demo/curated fallback.
  const { data: ytReels = [] } = useYouTubeChannelReels(8);
  const featuredVideos = ytReels as any[];

  // Auto-collapse weather card after 4 seconds
  useEffect(() => {
    if (!hasAutoCollapsed) {
      const collapseTimer = setTimeout(() => {
        setIsWeatherExpanded(false);
        setHasAutoCollapsed(true);
      }, 4000);
      return () => clearTimeout(collapseTimer);
    }
  }, [hasAutoCollapsed]);

  // Rotate metrics in minimized view every 3 seconds
  useEffect(() => {
    if (!isWeatherExpanded) {
      const rotateInterval = setInterval(() => {
        setCurrentMetricIndex((prev) => (prev + 1) % 3);
      }, 3000);
      return () => clearInterval(rotateInterval);
    }
  }, [isWeatherExpanded]);

  // Use consistent data fetching hook (handles online/offline automatically)
  const { lands, isLoading: loading } = useLands();

  // Calculate total area from farmer's lands (memoized)
  const totalArea = useMemo(
    () =>
      lands.reduce((sum, land: any) => {
        const acres = typeof land.area_acres === 'number' ? land.area_acres : parseFloat(String(land.area_acres)) || 0;
        return sum + acres;
      }, 0),
    [lands],
  );

  // Get next crop from lands
  const nextCrop = useMemo(
    () => lands.find((land: any) => land.current_crop)?.current_crop || 'Not planned',
    [lands],
  );

  // Calculate NDVI average from actual land data
  const avgNdvi = useMemo(() => {
    if (lands.length === 0) return 0;
    const ndviValues = lands
      .map((l: any) => l.latest_ndvi ?? l.ndvi_value)
      .filter((v: any) => typeof v === 'number' && v > 0);
    return ndviValues.length > 0
      ? Math.round((ndviValues.reduce((s: number, v: number) => s + v, 0) / ndviValues.length) * 100) / 100
      : 0;
  }, [lands]);

  // Plan-gated locked-paths set (SSOT: useFeatures + resolve_farmer_entitlements)
  const { features: planFeatures } = useFeatures();
  const lockedPaths = useMemo(
    () => new Set(planFeatures.filter((f) => f.locked).map((f) => f.path)),
    [planFeatures],
  );

  // Memoized feature lists — prevents re-creating arrays every render and lets
  // memoized children skip work when nothing semantic changed.
  const mainFeaturesBase = useMemo<HomeFeatureCard[]>(
    () => [
      {
        title: t('home.myLand'),
        icon: MapPin,
        path: '/app/lands',
        description: t('home.features.lands.description'),
        stats:
          lands.length > 0
            ? t('home.features.lands.plots', { count: lands.length })
            : t('home.features.lands.no_plots'),
        color: 'bg-gradient-primary',
        badge: lands.length > 0 ? t('home.badge.active') : t('home.badge.add_land'),
        progress: lands.length > 0 ? Math.min((lands.length / 5) * 100, 100) : 0,
      },
      {
        title: t('home.features.schedule.title'),
        icon: Calendar,
        path: '/app/schedule',
        description: t('home.features.schedule.description'),
        stats: t('home.features.schedule.next_crop', { crop: nextCrop }),
        color: 'bg-gradient-secondary',
        trend: lands.length > 0 ? 'up' : undefined,
        trendValue: lands.length > 0 ? '15%' : undefined,
      },
      {
        title: t('home.aiChat'),
        icon: Bot,
        path: '/app/chat',
        description: t('home.features.chat.description'),
        stats: t('home.features.chat.online'),
        color: 'bg-gradient-accent',
        badge: t('home.badge.ai'),
      },
      {
        title: t('home.market'),
        icon: ShoppingCart,
        path: '/app/market',
        description: t('home.features.market.description'),
        stats: '₹2,125/q',
        color: 'bg-gradient-success',
        trend: 'up',
        trendValue: '+₹50',
      },
    ],
    [t, lands.length, nextCrop],
  );

  const secondaryFeaturesBase = useMemo<HomeFeatureCard[]>(
    () => [
      {
        title: t('home.features.community.title'),
        icon: Users,
        path: '/app/community',
        description: t('home.features.community.description'),
        stats: '1.2k ' + t('home.badge.active').toLowerCase(),
        color: 'bg-secondary/10',
        iconColor: 'text-secondary',
        badge: t('home.badge.new'),
      },
      {
        title: t('home.features.ndvi.title'),
        icon: Satellite,
        path: '/app/ndvi',
        description: t('home.features.ndvi.description'),
        stats: avgNdvi > 0 ? t('home.features.ndvi.score', { score: avgNdvi }) : t('home.features.ndvi.no_data'),
        color: 'bg-primary/10',
        iconColor: 'text-primary',
        progress: avgNdvi > 0 ? avgNdvi * 100 : 0,
      },
      {
        title: t('home.governmentSchemes'),
        icon: FileText,
        path: '/app/schemes',
        description: t('home.features.schemes.description'),
        stats: `5 ${t('home.badge.active')}`,
        color: 'bg-success/10',
        iconColor: 'text-success',
        badge: t('home.badge.updated'),
      },
      {
        title: t('home.features.analytics.title'),
        icon: BarChart3,
        path: '/app/analytics',
        description: t('home.features.analytics.description'),
        stats: t('home.features.analytics.view_report'),
        color: 'bg-destructive/10',
        iconColor: 'text-destructive',
        trend: 'up',
        trendValue: '+12%',
      },
    ],
    [t, avgNdvi],
  );

  // Apply plan-gated `locked` flag from useFeatures (SSOT) onto each card.
  const mainFeatures = useMemo<HomeFeatureCard[]>(
    () => mainFeaturesBase.map((f) => ({ ...f, locked: lockedPaths.has(f.path) })),
    [mainFeaturesBase, lockedPaths],
  );
  const secondaryFeatures = useMemo<HomeFeatureCard[]>(
    () => secondaryFeaturesBase.map((f) => ({ ...f, locked: lockedPaths.has(f.path) })),
    [secondaryFeaturesBase, lockedPaths],
  );

  // Auto-scroll Recent Activity every 5 seconds
  useEffect(() => {
    const len = lands.length > 0 ? Math.min(lands.length, 5) : 3;
    if (len <= 1) return;
    const interval = setInterval(() => {
      setCurrentActivityIndex((prev) => (prev + 1) % len);
    }, 5000);
    return () => clearInterval(interval);
  }, [lands.length]);

  if (loading) {
    return <HomeSkeleton />;
  }

  const farmerName =
    user?.fullName?.split(' ')[0] ||
    (user as any)?.farmerName?.split(' ')[0] ||
    user?.name?.split(' ')[0] ||
    t('home.default_name');
  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative bg-gradient-subtle min-h-full pb-8 px-4 pt-3">
      {/* Inline Weather Card - sits in normal flow so the Expired banner above it stays visible */}
      <motion.div
        data-tour="weather"
        className="relative z-10 mb-3"
        initial={reduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{
          opacity: 1,
          y: 0,
          height: isWeatherExpanded ? 'auto' : '68px',
        }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 22,
          mass: 0.7,
        }}
      >
        <motion.div
          className="backdrop-blur-3xl bg-gradient-to-br from-primary/5 via-card/95 to-accent/5 border border-border/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] rounded-3xl overflow-hidden cursor-pointer relative"
          onClick={() => setIsWeatherExpanded(!isWeatherExpanded)}
          whileHover={reduceMotion ? undefined : { scale: 1.01 }}
          whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        >
          {/* Subtle glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-50 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent_50%)] pointer-events-none" />
          {/* Drag Handle - Futuristic */}
          <motion.div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20"
            whileHover={reduceMotion ? undefined : { scale: 1.3 }}
            whileTap={reduceMotion ? undefined : { scale: 0.8 }}
          >
            <div className="w-12 h-1.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-full shadow-lg backdrop-blur-xl" />
          </motion.div>

          {/* Weather Background Animations — skipped on low-end / reduced-motion */}
          {!reduceMotion && (
            <div className="absolute inset-0 pointer-events-none">
              {currentWeather && (
                <>
                  {/* Sunny animation */}
                  {currentWeather.main === 'Clear' && (
                    <div className="absolute inset-0">
                      <motion.div
                        className="absolute top-4 right-8 w-24 h-24 bg-accent/20 rounded-full blur-2xl"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 4, repeat: Infinity }}
                      />
                    </div>
                  )}

                  {/* Rainy animation */}
                  {(currentWeather.main === 'Rain' || currentWeather.main === 'Drizzle') && (
                    <div className="absolute inset-0 overflow-hidden">
                      {[...Array(8)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute w-0.5 h-6 bg-primary/30 rounded-full"
                          initial={{ top: -20, left: `${Math.random() * 100}%` }}
                          animate={{ top: '100%' }}
                          transition={{
                            duration: 1 + Math.random(),
                            repeat: Infinity,
                            delay: Math.random() * 2,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <AnimatePresence mode="wait">
            {!isWeatherExpanded && (
              <motion.div
                key="minimized"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3 }}
                className="h-[68px] flex items-center relative z-10 px-4 py-2.5"
              >
                <div className="flex items-center justify-between w-full gap-3">
                  {/* Farmer Name with Namaste - 2 lines */}
                  <motion.div
                    className="flex flex-col gap-0.5 bg-primary/10 backdrop-blur-sm rounded-xl px-2.5 py-1.5 flex-1"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <span className="text-xs font-semibold text-foreground">
                        {t('home.namaste', { name: farmerName })}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {t('home.last_synced', { time: formattedTime })}
                    </span>
                  </motion.div>

                  {/* Rotating Single Metric */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMetricIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center gap-1.5 bg-background/60 backdrop-blur-sm rounded-xl px-3 py-2"
                    >
                      {currentMetricIndex === 0 && (
                        <>
                          <Thermometer className="w-4 h-4 text-primary" />
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground">{t('home.stats.temp')}</span>
                            <span className="text-sm font-bold text-foreground">
                              {currentWeather?.temp != null ? Math.round(currentWeather.temp) : '--'}°C
                            </span>

                          </div>
                        </>
                      )}
                      {currentMetricIndex === 1 && (
                        <>
                          <Droplets className="w-4 h-4 text-primary" />
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground">{t('home.stats.humidity')}</span>
                            <span className="text-sm font-bold text-foreground">
                              {currentWeather?.humidity != null ? currentWeather.humidity : '--'}%
                            </span>

                          </div>
                        </>
                      )}
                      {currentMetricIndex === 2 && (
                        <>
                          <Activity className="w-4 h-4 text-primary" />
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground">{t('home.stats.pressure')}</span>
                            <span className="text-sm font-bold text-foreground">
                              {currentWeather?.pressure || '--'} hPa
                            </span>
                          </div>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {/* Expand indicator */}
                  <motion.div
                    animate={reduceMotion ? undefined : { y: [0, 3, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </motion.div>
                </div>
              </motion.div>
            )}

            {isWeatherExpanded && (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="relative z-10 p-3 pt-6"
              >
                {/* Farmer Info & Date - Small at top */}
                <motion.div
                  className="flex items-center justify-between mb-2.5"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="flex flex-col gap-0.5 bg-primary/10 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <span className="text-xs font-semibold text-primary">
                        {t('home.namaste', { name: farmerName })}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {t('home.last_synced', { time: formattedTime })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-background/50 backdrop-blur-sm rounded-xl px-2.5 py-1.5">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground">{formattedDate}</span>
                  </div>
                </motion.div>

                {/* Header - Compact */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-baseline gap-2">
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                      className="text-5xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent"
                    >
                      {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}
                    </motion.span>
                    <div className="flex flex-col">
                      <span className="text-2xl text-muted-foreground font-light">°C</span>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-[10px] text-muted-foreground flex items-center gap-1"
                      >
                        <Thermometer className="w-2.5 h-2.5" />
                        {currentWeather?.feels_like ? Math.round(currentWeather.feels_like) : '--'}°
                      </motion.span>
                    </div>
                  </div>

                  <motion.div
                    initial={{ rotate: -20, scale: 0.7, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 150 }}
                    className="relative flex flex-col items-center gap-1"
                  >
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                    {currentWeather?.main === 'Clear' && <Sun className="w-12 h-12 text-primary relative z-10" />}
                    {currentWeather?.main === 'Clouds' && (
                      <Cloud className="w-12 h-12 text-muted-foreground relative z-10" />
                    )}
                    {(currentWeather?.main === 'Rain' || currentWeather?.main === 'Drizzle') && (
                      <CloudRain className="w-12 h-12 text-primary relative z-10" />
                    )}
                    {currentWeather?.main === 'Snow' && <CloudSnow className="w-12 h-12 text-primary relative z-10" />}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="text-[10px] font-medium text-foreground/80 capitalize relative z-10"
                    >
                      {currentWeather?.description || t('home.loading')}
                    </motion.p>
                  </motion.div>
                </div>

                {/* Weather Details Grid - Compact */}
                <motion.div
                  className="grid grid-cols-3 gap-1.5 pt-2 mt-2 border-t border-border/20"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <motion.div
                    className="flex flex-col items-center gap-1 bg-background/40 backdrop-blur-sm rounded-xl p-2 border border-border/20"
                    whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Wind className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">{t('home.stats.wind')}</span>
                    <span className="text-sm font-bold text-foreground">
                      {currentWeather?.wind_speed ? Math.round(currentWeather.wind_speed * 3.6) : '--'}
                      <span className="text-[10px] font-normal"> km/h</span>
                    </span>
                  </motion.div>

                  <motion.div
                    className="flex flex-col items-center gap-1 bg-background/40 backdrop-blur-sm rounded-xl p-2 border border-border/20"
                    whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Droplets className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">{t('home.stats.humidity')}</span>
                    <span className="text-sm font-bold text-foreground">
                      {currentWeather?.humidity || '--'}
                      <span className="text-[10px] font-normal">%</span>
                    </span>
                  </motion.div>

                  <motion.div
                    className="flex flex-col items-center gap-1 bg-background/40 backdrop-blur-sm rounded-xl p-2 border border-border/20"
                    whileHover={reduceMotion ? undefined : { scale: 1.05, y: -2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">{t('home.stats.pressure')}</span>
                    <span className="text-sm font-bold text-foreground">
                      {currentWeather?.pressure || '--'} <span className="text-[10px] font-normal">hPa</span>
                    </span>
                  </motion.div>
                </motion.div>

                {/* Farm Stats - Compact */}
                <motion.div
                  className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-border/20"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <motion.div
                    className="flex items-center gap-2 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm rounded-xl p-2 border border-primary/20"
                    whileHover={reduceMotion ? undefined : { scale: 1.03, x: 2 }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">{t('home.stats.plots')}</p>
                      <p className="text-sm font-bold text-foreground">{lands.length}</p>
                    </div>
                  </motion.div>
                  <motion.div
                    className="flex items-center gap-2 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm rounded-xl p-2 border border-primary/20"
                    whileHover={reduceMotion ? undefined : { scale: 1.03, x: 2 }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Leaf className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">{t('home.stats.area')}</p>
                      <p className="text-sm font-bold text-foreground">
                        {totalArea.toFixed(1)} <span className="text-[10px] font-normal">ac</span>
                      </p>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Dashboard Content - sits directly below the inline weather card */}
      <div className="pt-1">
        {/* Weather Schedule Alerts - Shows task adjustments due to weather */}
        <WeatherScheduleAlerts className="mb-4" maxAlerts={3} />

        {/* Main Features Grid (memoized) */}
        <HomeFeaturesGrid features={mainFeatures} variant="main" reduceMotion={reduceMotion} />

        {/* Secondary Features (memoized) */}
        <HomeFeaturesGrid features={secondaryFeatures} variant="secondary" reduceMotion={reduceMotion} />

        {/* Recent Activity - Auto Scroll Carousel (memoized) */}
        <HomeRecentActivity
          lands={lands}
          currentActivityIndex={currentActivityIndex}
          currentWeatherDescription={currentWeather?.description}
          currentWeatherTemp={currentWeather?.temp}
          reduceMotion={reduceMotion}
        />

        {/* Alerts Summary Card */}
        <AlertsSummaryCard />

        {/* Video Help Card (lazy-loaded to shrink initial bundle) */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <Suspense fallback={<div className="h-32" aria-hidden />}>
            <VideoHelpCard videos={featuredVideos} onClick={() => navigate('/app/reels')} />
          </Suspense>
        </motion.div>
      </div>
    </div>
  );
}
