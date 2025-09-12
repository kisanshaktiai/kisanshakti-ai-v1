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
  Leaf
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const mainFeatures: FeatureCard[] = [
    {
      title: t('home.myLand'),
      icon: MapPin,
      path: '/app/lands',
      description: 'Manage your agricultural lands',
      stats: '3 Plots',
      color: 'bg-gradient-primary',
      badge: 'Active',
      progress: 75
    },
    {
      title: 'AI Crop Schedule',
      icon: Calendar,
      path: '/app/lands',
      description: 'Smart planting calendar',
      stats: 'Next: Wheat',
      color: 'bg-gradient-secondary',
      trend: 'up',
      trendValue: '15%'
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
      title: t('home.weather'),
      icon: Cloud,
      path: '/app/weather',
      description: 'Real-time forecasts',
      stats: '28°C',
      color: 'bg-accent/10',
      trend: 'down',
      trendValue: '-2°C'
    },
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
      path: '/app/lands',
      description: 'Crop health monitoring',
      stats: 'Good',
      color: 'bg-primary/10',
      progress: 85
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
      path: '/app/lands',
      description: 'Farm performance metrics',
      stats: 'View Report',
      color: 'bg-destructive/10',
      trend: 'up',
      trendValue: '+12%'
    }
  ];

  // Quick stats for the hero section
  const quickStats = [
    { icon: Thermometer, label: 'Temperature', value: '28°C', trend: 'stable' },
    { icon: Droplets, label: 'Humidity', value: '65%', trend: 'up' },
    { icon: Wind, label: 'Wind Speed', value: '12 km/h', trend: 'down' },
    { icon: Activity, label: 'Soil Health', value: 'Good', trend: 'up' }
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section with Welcome */}
      <div className="relative overflow-hidden bg-gradient-earth p-6 rounded-b-3xl shadow-elegant">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-muted-foreground flex items-center gap-2">
                <Leaf className="w-4 h-4" />
                {currentTime.toLocaleDateString('en-IN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {quickStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="bg-card/80 backdrop-blur-sm rounded-xl p-3 border border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                    </div>
                    {stat.trend === 'up' && <ArrowUpRight className="w-3 h-3 text-success" />}
                    {stat.trend === 'down' && <ArrowDownRight className="w-3 h-3 text-destructive" />}
                  </div>
                  <p className="text-lg font-semibold mt-1">{stat.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Features Grid */}
      <div className="p-4 -mt-6">
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
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <div>
                  <p className="text-sm font-medium">Wheat field analyzed</p>
                  <p className="text-xs text-muted-foreground">NDVI Score: 0.85</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">2h ago</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-accent rounded-full" />
                <div>
                  <p className="text-sm font-medium">Weather alert</p>
                  <p className="text-xs text-muted-foreground">Rain expected tomorrow</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">5h ago</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-primary rounded-full" />
                <div>
                  <p className="text-sm font-medium">New scheme available</p>
                  <p className="text-xs text-muted-foreground">PM-KISAN update</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">1d ago</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}