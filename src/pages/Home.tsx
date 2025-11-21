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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  
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

  return (
    <div className="relative bg-gradient-subtle min-h-screen">
      {/* Modern Floating Weather Card - Swipeable */}
      <motion.div 
        className="fixed top-16 left-4 right-4 z-30 pointer-events-auto"
        initial={{ opacity: 0, y: -20 }}
        animate={{ 
          opacity: 1, 
          y: 0,
          height: isWeatherExpanded ? "auto" : "56px"
        }}
        transition={{ 
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.1}
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
        <div className={`backdrop-blur-2xl bg-gradient-to-br from-primary/10 via-card/90 to-accent/10 border border-border/50 shadow-2xl rounded-2xl overflow-hidden cursor-pointer`}
          onClick={() => setIsWeatherExpanded(!isWeatherExpanded)}
        >
          {/* Drag Handle */}
          <motion.div 
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20"
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
          >
            <div className="w-8 h-1 bg-foreground/30 backdrop-blur-md rounded-full shadow-sm" />
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-14 flex items-center relative z-10 px-4"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    {currentWeather?.main === 'Clear' && <Sun className="w-6 h-6 text-accent" />}
                    {currentWeather?.main === 'Clouds' && <Cloud className="w-6 h-6 text-muted-foreground" />}
                    {(currentWeather?.main === 'Rain' || currentWeather?.main === 'Drizzle') && <CloudRain className="w-6 h-6 text-primary" />}
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}°C
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {currentWeather?.description || 'Loading...'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                </div>
              </motion.div>
            )}

            {isWeatherExpanded && (
              <motion.div
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative z-10 p-5 pt-6"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="flex items-baseline gap-1 mb-1"
                    >
                      <span className="text-5xl font-bold text-foreground">
                        {currentWeather?.temp ? Math.round(currentWeather.temp) : '--'}
                      </span>
                      <span className="text-2xl text-muted-foreground">°C</span>
                    </motion.div>
                    <p className="text-sm font-medium text-foreground/90 capitalize mb-1">
                      {currentWeather?.description || 'Loading...'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Feels like {currentWeather?.feels_like ? Math.round(currentWeather.feels_like) : '--'}°C
                    </p>
                  </div>

                  <motion.div
                    initial={{ rotate: -20, scale: 0.8 }}
                    animate={{ rotate: 0, scale: 1 }}
                    className="text-primary"
                  >
                    {currentWeather?.main === 'Clear' && <Sun className="w-12 h-12" />}
                    {currentWeather?.main === 'Clouds' && <Cloud className="w-12 h-12" />}
                    {(currentWeather?.main === 'Rain' || currentWeather?.main === 'Drizzle') && <CloudRain className="w-12 h-12" />}
                    {currentWeather?.main === 'Snow' && <CloudSnow className="w-12 h-12" />}
                  </motion.div>
                </div>

                {/* Weather Details Grid */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border/30">
                  <div className="flex flex-col items-center gap-1">
                    <Wind className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Wind</span>
                    <span className="text-sm font-semibold text-foreground">
                      {currentWeather?.wind_speed ? Math.round(currentWeather.wind_speed * 3.6) : '--'} km/h
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <Droplets className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Humidity</span>
                    <span className="text-sm font-semibold text-foreground">
                      {currentWeather?.humidity || '--'}%
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <Thermometer className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Pressure</span>
                    <span className="text-sm font-semibold text-foreground">
                      {currentWeather?.pressure || '--'} hPa
                    </span>
                  </div>
                </div>

                {/* Farm Stats */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border/30">
                  <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Plots</p>
                      <p className="text-sm font-semibold text-foreground">{lands.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
                    <Leaf className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total Area</p>
                      <p className="text-sm font-semibold text-foreground">{totalArea.toFixed(1)} acres</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Hero Section - Simplified Greeting */}
      <div className="pt-32 pb-8 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-6"
        >
          <h2 className="text-2xl font-bold text-foreground">
            🙏 Namaste
          </h2>
          <div className="bg-primary/10 backdrop-blur-sm rounded-full px-3 py-1">
            <p className="text-primary text-sm font-medium">
              {user?.fullName?.split(' ')[0] || user?.farmerName?.split(' ')[0] || user?.name?.split(' ')[0] || t('home.farmer')}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Main Features Grid */}
      <div className="px-4 -mt-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {mainFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link key={`main-${feature.title}`} to={feature.path}>
                <Card className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 overflow-hidden h-full">
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
              </Link>
            );
          })}
        </div>

        {/* Secondary Features */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            More Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {secondaryFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <Link key={`secondary-${feature.title}`} to={feature.path}>
                  <Card className="group hover:shadow-soft transition-all duration-300 hover:border-primary/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", feature.color)}>
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold group-hover:text-primary transition-colors">
                              {feature.title}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                        {feature.badge && (
                          <Badge variant="outline" className="text-xs">
                            {feature.badge}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{feature.stats}</span>
                        {feature.trend && (
                          <div className="flex items-center gap-1">
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
                      {feature.progress && (
                        <Progress value={feature.progress} className="mt-2 h-1" />
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <Card>
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
                        index === 0 ? "bg-success animate-pulse" : 
                        index === 1 ? "bg-accent" : "bg-primary"
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
                    <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
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
                      <div className="w-2 h-2 bg-accent rounded-full" />
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
      </div>
    </div>
  );
}