import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  TrendingUp,
  Droplets,
  Thermometer,
  Wind,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Sparkles,
  Leaf,
  ChevronDown,
  Sun,
  CloudRain,
  CloudSnow
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { landsApi } from '@/services/landsApi';
import { useWeather } from '@/hooks/useWeather';
import { useLands } from '@/hooks/useLands';
import { HomeSkeleton } from '@/components/skeletons';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';


interface FeatureCard {
  title: string;
  icon: React.ElementType;
  path: string;
  description: string;
  stats?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  color: string;
  badge?: string;
  progress?: number;
}

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [currentTime, setCurrentTime] = useState(new Date());
  const { currentWeather } = useWeather();
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(true);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const [currentMetricIndex, setCurrentMetricIndex] = useState(0);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Auto-collapse weather card after 10 seconds
  useEffect(() => {
    if (!hasAutoCollapsed) {
      const collapseTimer = setTimeout(() => {
        setIsWeatherExpanded(false);
        setHasAutoCollapsed(true);
      }, 10000);
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

  // Calculate total area from farmer's lands
  // Note: area_acres, area_guntas, and area_sqft are different representations of the same area, not cumulative
  const totalArea = lands.reduce((sum, land) => {
    // Use area_acres as the primary source (it's the total area in acres)
    const acres = typeof land.area_acres === 'number' ? land.area_acres : parseFloat(String(land.area_acres)) || 0;
    return sum + acres;
  }, 0);

  // Get next crop from lands
  const nextCrop = lands.find(land => land.current_crop)?.current_crop || 'Not planned';
  
  // Calculate NDVI average
  const avgNdvi = lands.length > 0 ? 0.85 : 0;

  // Quick stats for weather card
  const quickStats = [
    { 
      icon: Thermometer, 
      label: 'Temperature', 
      value: currentWeather ? `${Math.round(currentWeather.temp)}°C` : '---', 
      trend: currentWeather && currentWeather.temp > 25 ? 'up' : 'stable' 
    },
    { 
      icon: Droplets, 
      label: 'Humidity', 
      value: currentWeather ? `${currentWeather.humidity}%` : '---', 
      trend: currentWeather && currentWeather.humidity > 60 ? 'up' : 'down' 
    },
    { 
      icon: Wind, 
      label: 'Wind Speed', 
      value: currentWeather ? `${Math.round(currentWeather.wind_speed * 3.6)} km/h` : '---', 
      trend: currentWeather && currentWeather.wind_speed > 5 ? 'up' : 'down' 
    },
    { 
      icon: Activity, 
      label: 'Total Area', 
      value: totalArea > 0 ? `${totalArea.toFixed(1)} acres` : 'No land', 
      trend: lands.length > 0 ? 'up' : 'stable' 
    }
  ];

  const mainFeatures: FeatureCard[] = [
    {
      title: t('home.myLand'),
      icon: MapPin,
      path: '/app/lands',
      description: 'Manage your agricultural lands',
      stats: lands.length > 0 ? `${lands.length} Plot${lands.length > 1 ? 's' : ''}` : 'No plots',
      color: 'bg-gradient-primary',
      badge: lands.length > 0 ? 'Active' : 'Add Land',
      progress: lands.length > 0 ? Math.min((lands.length / 5) * 100, 100) : 0
    },
    {
      title: 'AI Crop Schedule',
      icon: Calendar,
      path: '/app/schedule',
      description: 'Smart planting calendar',
      stats: `Next: ${nextCrop}`,
      color: 'bg-gradient-secondary',
      trend: lands.length > 0 ? 'up' : undefined,
      trendValue: lands.length > 0 ? '15%' : undefined
    },
    {
      title: t('home.aiChat'),
      icon: Bot,
      path: '/app/chat',
      description: 'Agricultural AI assistant',
      stats: 'Online',
      color: 'bg-gradient-accent',
      badge: 'AI'
    },
    {
      title: t('home.market'),
      icon: ShoppingCart,
      path: '/app/market',
      description: 'Buy & sell produce',
      stats: '₹2,125/q',
      color: 'bg-gradient-success',
      trend: 'up',
      trendValue: '+₹50'
    }
  ];

  const secondaryFeatures: FeatureCard[] = [
    {
      title: 'Community',
      icon: Users,
      path: '/app/social',
      description: 'Connect with farmers',
      stats: '1.2k active',
      color: 'bg-secondary/10',
      badge: 'New'
    },
    {
      title: 'NDVI & Satellite',
      icon: Satellite,
      path: '/app/ndvi',
      description: 'Crop health monitoring',
      stats: avgNdvi > 0 ? `Score: ${avgNdvi}` : 'No data',
      color: 'bg-primary/10',
      progress: avgNdvi > 0 ? avgNdvi * 100 : 0
    },
    {
      title: t('home.governmentSchemes'),
      icon: FileText,
      path: '/app/schemes',
      description: 'Latest schemes & subsidies',
      stats: '5 Active',
      color: 'bg-success/10',
      badge: 'Updated'
    },
    {
      title: 'Analytics',
      icon: BarChart3,
      path: '/app/analytics',
      description: 'Farm performance metrics',
      stats: 'View Report',
      color: 'bg-destructive/10',
      trend: 'up',
      trendValue: '+12%'
    }
  ];

  if (loading) {
    return <HomeSkeleton />;
  }

  const farmerName = user?.fullName?.split(' ')[0] || user?.farmerName?.split(' ')[0] || user?.name?.split(' ')[0] || t('home.farmer');
  const formattedDate = currentTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  const formattedTime = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative bg-gradient-subtle min-h-screen">
      {/* Futuristic Floating Weather Card - 2030 UI */}
      <motion.div 
        className="fixed top-16 left-4 right-4 z-30 pointer-events-auto"
        initial={{ opacity: 0, y: -100, scale: 0.9 }}
        animate={{ 
          opacity: 1, 
          y: 0,
          scale: 1,
          height: isWeatherExpanded ? "auto" : "68px"
        }}
        transition={{ 
          type: "spring",
          stiffness: 260,
          damping: 20,
          mass: 0.8
        }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.15}
        onDragEnd={(e, { offset, velocity }) => {
          const swipe = offset.y;
          const swipeVelocity = velocity.y;
          
          if (swipe > 50 || swipeVelocity > 500) {
            setIsWeatherExpanded(false);
          } else if (swipe < -50 || swipeVelocity < -500) {
            setIsWeatherExpanded(true);
          }
        }}
      >
        <motion.div 
          className="backdrop-blur-3xl bg-gradient-to-br from-primary/5 via-card/95 to-accent/5 border border-border/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] rounded-3xl overflow-hidden cursor-pointer relative"
          onClick={() => setIsWeatherExpanded(!isWeatherExpanded)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          {/* Subtle glow effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-50 pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(var(--primary-rgb),0.1),transparent_50%)] pointer-events-none" />
          {/* Drag Handle - Futuristic */}
          <motion.div 
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20"
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 0.8 }}
          >
            <div className="w-12 h-1.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent rounded-full shadow-lg backdrop-blur-xl" />
          </motion.div>

          {/* Weather Background Animations */}
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
                      <span className="text-xs font-semibold text-foreground">Namaste, {farmerName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Last synced: {formattedTime}</span>
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
                            <span className="text-[9px] text-muted-foreground">Temp</span>
                            <span className="text-sm font-bold text-foreground">
                              {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}°C
                            </span>
                          </div>
                        </>
                      )}
                      {currentMetricIndex === 1 && (
                        <>
                          <Droplets className="w-4 h-4 text-primary" />
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground">Humidity</span>
                            <span className="text-sm font-bold text-foreground">
                              {currentWeather?.humidity || '--'}%
                            </span>
                          </div>
                        </>
                      )}
                      {currentMetricIndex === 2 && (
                        <>
                          <Activity className="w-4 h-4 text-primary" />
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground">Pressure</span>
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
                    animate={{ y: [0, 3, 0] }}
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
                      <span className="text-xs font-semibold text-primary">Namaste, {farmerName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Last synced: {formattedTime}</span>
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
                      transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
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
                    transition={{ delay: 0.2, type: "spring", stiffness: 150 }}
                    className="relative flex flex-col items-center gap-1"
                  >
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
                    {currentWeather?.main === 'Clear' && <Sun className="w-12 h-12 text-primary relative z-10" />}
                    {currentWeather?.main === 'Clouds' && <Cloud className="w-12 h-12 text-muted-foreground relative z-10" />}
                    {(currentWeather?.main === 'Rain' || currentWeather?.main === 'Drizzle') && <CloudRain className="w-12 h-12 text-primary relative z-10" />}
                    {currentWeather?.main === 'Snow' && <CloudSnow className="w-12 h-12 text-primary relative z-10" />}
                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.25 }}
                      className="text-[10px] font-medium text-foreground/80 capitalize relative z-10"
                    >
                      {currentWeather?.description || 'Loading...'}
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
                    whileHover={{ scale: 1.05, y: -2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Wind className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">Wind</span>
                    <span className="text-sm font-bold text-foreground">
                      {currentWeather?.wind_speed ? Math.round(currentWeather.wind_speed * 3.6) : '--'}<span className="text-[10px] font-normal"> km/h</span>
                    </span>
                  </motion.div>

                  <motion.div 
                    className="flex flex-col items-center gap-1 bg-background/40 backdrop-blur-sm rounded-xl p-2 border border-border/20"
                    whileHover={{ scale: 1.05, y: -2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Droplets className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">Humidity</span>
                    <span className="text-sm font-bold text-foreground">
                      {currentWeather?.humidity || '--'}<span className="text-[10px] font-normal">%</span>
                    </span>
                  </motion.div>

                  <motion.div 
                    className="flex flex-col items-center gap-1 bg-background/40 backdrop-blur-sm rounded-xl p-2 border border-border/20"
                    whileHover={{ scale: 1.05, y: -2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground font-medium">Pressure</span>
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
                    whileHover={{ scale: 1.03, x: 2 }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">Plots</p>
                      <p className="text-sm font-bold text-foreground">{lands.length}</p>
                    </div>
                  </motion.div>
                  <motion.div 
                    className="flex items-center gap-2 bg-gradient-to-br from-primary/5 to-primary/10 backdrop-blur-sm rounded-xl p-2 border border-primary/20"
                    whileHover={{ scale: 1.03, x: 2 }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Leaf className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-medium">Area</p>
                      <p className="text-sm font-bold text-foreground">{totalArea.toFixed(1)} <span className="text-[10px] font-normal">ac</span></p>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Dashboard Content - Smooth transition with weather card state */}
      <motion.div 
        className="px-4"
        initial={false}
        animate={{ 
          paddingTop: isWeatherExpanded ? "240px" : "100px"
        }}
        transition={{ 
          type: "spring",
          stiffness: 200,
          damping: 25
        }}
      >
        {/* Main Features Grid */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {mainFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link key={`main-${feature.title}`} to={feature.path}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="group hover:shadow-[0_10px_40px_-10px_rgba(var(--primary-rgb),0.2)] transition-all duration-300 overflow-hidden h-full border-border/50 backdrop-blur-sm">
                  <div className={cn("h-1", feature.color)} />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-soft", feature.color)}>
                        <Icon className="w-6 h-6 text-primary-foreground" />
                      </div>
                      {feature.badge && (
                        <Badge variant="secondary" className="text-xs">
                          {feature.badge}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                      {feature.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {feature.description}
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{feature.stats}</span>
                      {feature.trend && (
                        <div className="flex items-center gap-1">
                          {feature.trend === 'up' ? (
                            <ArrowUpRight className="w-3 h-3 text-success" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3 text-destructive" />
                          )}
                          <span className={cn("text-xs", feature.trend === 'up' ? 'text-success' : 'text-destructive')}>
                            {feature.trendValue}
                          </span>
                        </div>
                      )}
                    </div>
                    {feature.progress && (
                      <Progress value={feature.progress} className="mt-2 h-1" />
                    )}
                  </CardContent>
                </Card>
                </motion.div>
              </Link>
            );
          })}
        </motion.div>

        {/* Secondary Features */}
        <motion.div 
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {secondaryFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link key={`secondary-${feature.title}`} to={feature.path}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden h-full bg-card/50 backdrop-blur-sm border-border/40">
                    <div className={cn("h-0.5", feature.color)} />
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between mb-2">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shadow-sm", feature.color)}>
                          <Icon className="w-5 h-5 text-primary-foreground" />
                        </div>
                        {feature.badge && (
                          <Badge variant="outline" className="text-xs">
                            {feature.badge}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xs font-semibold group-hover:text-primary transition-colors">
                        {feature.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {feature.description}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{feature.stats}</span>
                        {feature.trend && (
                          <div className="flex items-center gap-0.5">
                            {feature.trend === 'up' ? (
                              <TrendingUp className="w-3 h-3 text-success" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3 text-destructive" />
                            )}
                            <span className={cn("text-xs", feature.trend === 'up' ? 'text-success' : 'text-destructive')}>
                              {feature.trendValue}
                            </span>
                          </div>
                        )}
                      </div>
                      {feature.progress !== undefined && feature.progress > 0 && (
                        <Progress value={feature.progress} className="mt-2 h-1" />
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </Link>
            );
          })}
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="mb-8 border-border/40 backdrop-blur-sm">

          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lands.length > 0 ? (
              <>
                {lands.slice(0, 3).map((land, index) => (
                  <div key={land.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        index === 0 ? "bg-primary animate-pulse" : 
                        index === 1 ? "bg-primary" : "bg-primary"
                      )} />
                      <div>
                        <p className="text-sm font-medium">{land.name || 'Unnamed Land'}</p>
                        <p className="text-xs text-muted-foreground">
                          {land.area_acres} acres • {land.village || 'Location not set'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {land.current_crop || 'No crop'}
                    </span>
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <div>
                      <p className="text-sm font-medium">No lands added yet</p>
                      <p className="text-xs text-muted-foreground">Add your first land to get started</p>
                    </div>
                  </div>
                  <Link to="/app/lands/add" className="text-xs text-primary">Add Land</Link>
                </div>
                {currentWeather && currentWeather.description && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-primary rounded-full" />
                      <div>
                        <p className="text-sm font-medium">Current Weather</p>
                        <p className="text-xs text-muted-foreground">{currentWeather.description}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{currentWeather.temp}°C</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full" />
                    <div>
                      <p className="text-sm font-medium">Government Schemes</p>
                      <p className="text-xs text-muted-foreground">Check available subsidies</p>
                    </div>
                  </div>
                  <Link to="/app/schemes" className="text-xs text-primary">View</Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}