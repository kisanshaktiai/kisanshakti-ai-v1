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
  ChevronDown
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
import { ModernWeatherCard } from '@/components/weather/ModernWeatherCard';


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
  const { currentWeather } = useWeather();
  
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
  
  // Calculate NDVI average (placeholder - will be replaced with actual NDVI data)
  const avgNdvi = lands.length > 0 ? 0.85 : 0;

  // Main features cards
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
      {/* Modern Floating Weather Card */}
      <ModernWeatherCard />

      {/* Hero Section - Simplified */}
      <motion.div 
        className="relative overflow-hidden bg-gradient-primary rounded-b-[2rem] shadow-elegant border-b border-border/50 pt-6 pb-32"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="relative z-10 px-4">
          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-2"
          >
            <h2 className="text-2xl font-bold text-primary-foreground">
              🙏 Namaste
            </h2>
            <div className="bg-background/20 backdrop-blur-sm rounded-full px-3 py-1">
              <p className="text-primary-foreground/90 text-sm font-medium">
                {user?.fullName?.split(' ')[0] || user?.farmerName?.split(' ')[0] || user?.name?.split(' ')[0] || t('home.farmer')}
              </p>
            </div>
          </motion.div>

          {/* Farm Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-4 text-primary-foreground/80 text-sm"
          >
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{lands.length} {lands.length === 1 ? 'Plot' : 'Plots'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Leaf className="w-4 h-4" />
              <span>{totalArea.toFixed(1)} acres</span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Main Features Grid */}
      <div className="p-4 -mt-24">
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