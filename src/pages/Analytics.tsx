import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { landsApi } from '@/services/landsApi';
import { supabase } from '@/utils/supabase';
import { AnalyticsSkeleton } from '@/components/skeletons';
import { useLands } from '@/hooks/useLands';
import {
  TrendingUp,
  TrendingDown,
  Volume2,
  Wheat,
  Ruler,
  Droplets,
  Heart,
  Cloud,
  IndianRupee,
  Wallet,
  Sprout,
  TestTube,
  Users,
  ChevronRight,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale,
} from 'chart.js';
import { Pie, Bar, Line, Doughnut } from 'react-chartjs-2';
import { cn } from '@/lib/utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  RadialLinearScale
);

interface AnalyticsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
  children?: React.ReactNode;
  onSpeak?: () => void;
}

const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
  onClick,
  children,
  onSpeak
}) => {
  return (
    <Card
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]",
        "bg-card/90 backdrop-blur-md border-border/50"
      )}
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 w-32 h-32 opacity-10">
        <div className={cn("w-full h-full rounded-full blur-3xl", color)} />
      </div>
      
      <div className="p-4 relative">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("p-2.5 rounded-xl", color, "bg-opacity-20")}>
            {icon}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onSpeak?.();
            }}
          >
            <Volume2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {trend && (
          <div className="flex items-center gap-1 mt-3">
            {trend.isPositive ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            <span className={cn(
              "text-xs font-medium",
              trend.isPositive ? "text-success" : "text-destructive"
            )}>
              {trend.value}%
            </span>
          </div>
        )}

        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}

        {onClick && (
          <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </Card>
  );
};

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { speak, isSpeaking } = useTextToSpeech({ 
    language: i18n.language === 'hi' ? 'hi-IN' : 'en-US' 
  });
  
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<any>({
    lands: [],
    crops: {},
    totalArea: 0,
    activeArea: 0,
    waterUsage: 0,
    soilHealth: 'Good',
    weatherData: {},
    marketPrices: {},
    expectedIncome: 0,
    tentativeExpenses: 0
  });

  // Use consistent data fetching hook (handles online/offline automatically)
  const { lands: landsFromHook, isLoading: landsLoading } = useLands();

  useEffect(() => {
    loadAnalyticsData();
  }, [user, tenant, landsFromHook]);
  
  const loadAnalyticsData = async () => {
    if (!user || !tenant) return;
    
    setIsLoading(landsLoading);
    try {
      // Use lands from hook (consistent with other pages)
      const lands = landsFromHook;
      
      // Calculate analytics from real data
      const totalArea = lands.reduce((sum, land) => sum + (land.area_acres || 0), 0);
      const activeArea = lands.filter(land => land.current_crop).reduce((sum, land) => sum + (land.area_acres || 0), 0);
      
      // Count crops
      const cropCount: Record<string, number> = {};
      lands.forEach(land => {
        if (land.current_crop) {
          cropCount[land.current_crop] = (cropCount[land.current_crop] || 0) + 1;
        }
      });
      
      // Calculate estimated income (₹25,000 per acre average)
      const expectedIncome = totalArea * 25000;
      
      // Calculate estimated expenses (₹10,000 per acre average)
      const tentativeExpenses = totalArea * 10000;
      
      setAnalyticsData({
        lands,
        crops: cropCount,
        totalArea,
        activeArea,
        waterUsage: activeArea * 125, // 125L per acre average
        soilHealth: 'Good',
        weatherData: { temp: 28, humidity: 65, rainChance: 40 },
        marketPrices: { rice: 2350, wheat: 1950 },
        expectedIncome,
        tentativeExpenses
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: t('error.loadingAnalytics'),
        description: t('error.tryAgain'),
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic crop data from real tenant data
  const cropLabels = Object.keys(analyticsData.crops);
  const cropValues = Object.values(analyticsData.crops);
  const cropData = {
    labels: cropLabels.length > 0 ? cropLabels : ['No Crops'],
    datasets: [{
      data: cropValues.length > 0 ? cropValues : [1],
      backgroundColor: [
        'hsl(142 76% 36%)', // Green
        'hsl(38 92% 50%)',  // Yellow
        'hsl(199 89% 48%)', // Blue
        'hsl(0 84% 60%)',   // Red
        'hsl(30 41% 48%)',  // Brown
      ],
      borderWidth: 2,
      borderColor: 'hsl(0 0% 100%)',
    }]
  };

  const marketData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{
      label: 'Rice',
      data: [2200, 2250, 2180, 2300, analyticsData.marketPrices.rice || 2350],
      borderColor: 'hsl(142 76% 36%)',
      backgroundColor: 'hsla(142, 76%, 36%, 0.1)',
      tension: 0.4,
      borderWidth: 2,
    }, {
      label: 'Wheat',
      data: [1800, 1850, 1820, 1900, analyticsData.marketPrices.wheat || 1950],
      borderColor: 'hsl(199 89% 48%)',
      backgroundColor: 'hsla(199, 89%, 48%, 0.1)',
      tension: 0.4,
      borderWidth: 2,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'hsl(0 0% 100%)',
        titleColor: 'hsl(140 25% 15%)',
        bodyColor: 'hsl(140 25% 15%)',
        borderColor: 'hsl(142 20% 90%)',
        borderWidth: 1,
      }
    },
    scales: {
      x: {
        ticks: {
          color: 'hsl(140 25% 15%)',
        },
        grid: {
          color: 'hsla(142, 20%, 90%, 0.3)',
        }
      },
      y: {
        ticks: {
          color: 'hsl(140 25% 15%)',
        },
        grid: {
          color: 'hsla(142, 20%, 90%, 0.3)',
        }
      }
    }
  };

  const speakCard = (text: string) => {
    speak(text);
  };

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-primary/5">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="px-4 py-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            📊 {t('analytics.title', 'Farm Analytics')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('analytics.subtitle', 'Your farming insights at a glance')}
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-20">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Crop Distribution */}
          <AnalyticsCard
            title={t('analytics.cropDistribution', '🌾 Crop Distribution')}
            value={cropLabels.length.toString()}
            subtitle={t('analytics.cropsGrown', 'Active Crops')}
            icon={<Wheat className="h-5 w-5 text-success" />}
            color="bg-success"
            onClick={() => navigate('/app/analytics/crops')}
            onSpeak={() => speakCard(`You have ${cropLabels.length} active crops growing`)}
          >
            <div className="h-32">
              <Pie data={cropData} options={{...chartOptions, plugins: {...chartOptions.plugins}}} />
            </div>
          </AnalyticsCard>

          {/* Land Utilization */}
          <AnalyticsCard
            title={t('analytics.landUtilization', '📏 Land Usage')}
            value={`${analyticsData.totalArea > 0 ? Math.round((analyticsData.activeArea / analyticsData.totalArea) * 100) : 0}%`}
            subtitle={t('analytics.landUsed', `${analyticsData.activeArea} of ${analyticsData.totalArea} acres active`)}
            icon={<Ruler className="h-5 w-5 text-primary" />}
            color="bg-primary"
            onClick={() => navigate('/app/analytics/land')}
            onSpeak={() => speakCard(`${Math.round((analyticsData.activeArea / analyticsData.totalArea) * 100)} percent of your land is being utilized`)}
          >
            <Progress value={analyticsData.totalArea > 0 ? (analyticsData.activeArea / analyticsData.totalArea) * 100 : 0} className="h-2 mt-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{t('analytics.active', 'Active')}: {analyticsData.activeArea}</span>
              <span>{t('analytics.idle', 'Idle')}: {analyticsData.totalArea - analyticsData.activeArea}</span>
            </div>
          </AnalyticsCard>
        </div>

        {/* Water & Irrigation */}
        <AnalyticsCard
          title={t('analytics.waterIrrigation', '💧 Water & Irrigation')}
          value={t('analytics.optimal', 'Optimal')}
          subtitle={t('analytics.waterUsage', `${analyticsData.waterUsage}L used today`)}
          icon={<Droplets className="h-5 w-5 text-info" />}
          color="bg-info"
          trend={{ value: 12, isPositive: true }}
          onClick={() => navigate('/app/analytics/water')}
          onSpeak={() => speakCard(`Water usage is optimal at ${analyticsData.waterUsage} liters today`)}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span>{t('analytics.usage', 'Usage')}</span>
                <span>65%</span>
              </div>
              <Progress value={65} className="h-2" />
            </div>
          </div>
        </AnalyticsCard>

        {/* Soil Health */}
        <AnalyticsCard
          title={t('analytics.soilHealth', '🌱 Soil Health Index')}
          value={t('analytics.good', 'Good')}
          subtitle={t('analytics.soilPH', 'pH: 6.8 | Nitrogen: High')}
          icon={<Heart className="h-5 w-5 text-warning" />}
          color="bg-warning"
          onClick={() => navigate('/app/analytics/soil')}
          onSpeak={() => speakCard('Soil health is good with pH 6.8')}
        >
          <div className="flex gap-2 mt-2">
            <div className="flex-1 text-center p-2 bg-success/10 rounded-lg">
              <p className="text-xs text-muted-foreground">N</p>
              <p className="text-sm font-bold text-success">High</p>
            </div>
            <div className="flex-1 text-center p-2 bg-warning/10 rounded-lg">
              <p className="text-xs text-muted-foreground">P</p>
              <p className="text-sm font-bold text-warning">Med</p>
            </div>
            <div className="flex-1 text-center p-2 bg-destructive/10 rounded-lg">
              <p className="text-xs text-muted-foreground">K</p>
              <p className="text-sm font-bold text-destructive">Low</p>
            </div>
          </div>
        </AnalyticsCard>

        {/* Weather Impact */}
        <AnalyticsCard
          title={t('analytics.weatherImpact', '🌦️ Weather Impact')}
          value={t('analytics.favorable', 'Favorable')}
          subtitle={t('analytics.rainExpected', 'Light rain expected')}
          icon={<Cloud className="h-5 w-5 text-info" />}
          color="bg-info"
          onClick={() => navigate('/app/weather')}
          onSpeak={() => speakCard('Weather is favorable with light rain expected')}
        >
          <div className="flex items-center gap-4 mt-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t('analytics.temp', 'Temp')}</p>
              <p className="text-lg font-bold">28°C</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t('analytics.humidity', 'Humidity')}</p>
              <p className="text-lg font-bold">65%</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{t('analytics.rain', 'Rain')}</p>
              <p className="text-lg font-bold">40%</p>
            </div>
          </div>
        </AnalyticsCard>

        {/* Market Trends */}
        <AnalyticsCard
          title={t('analytics.marketTrends', '💰 Market Trends')}
          value="₹2,350"
          subtitle={t('analytics.ricePrice', 'Rice price per quintal')}
          icon={<BarChart3 className="h-5 w-5 text-success" />}
          color="bg-success"
          trend={{ value: 5.2, isPositive: true }}
          onClick={() => navigate('/app/market')}
          onSpeak={() => speakCard('Rice price is 2350 rupees per quintal, up 5.2 percent')}
        >
          <div className="h-24">
            <Line data={marketData} options={chartOptions} />
          </div>
        </AnalyticsCard>

        {/* Expected Income */}
        <AnalyticsCard
          title={t('analytics.expectedIncome', '💵 Expected Income')}
          value={`₹${analyticsData.expectedIncome.toLocaleString('en-IN')}`}
          subtitle={t('analytics.perSeason', 'This season estimate')}
          icon={<Wallet className="h-5 w-5 text-success" />}
          color="bg-success"
          onClick={() => navigate('/app/analytics/income')}
          onSpeak={() => speakCard(`Expected income this season is ${analyticsData.expectedIncome} rupees`)}
        >
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="text-2xl">🌾</p>
              <p className="text-xs font-medium">₹{Math.round(analyticsData.expectedIncome * 0.5 / 1000)}K</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">🌽</p>
              <p className="text-xs font-medium">₹{Math.round(analyticsData.expectedIncome * 0.3 / 1000)}K</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">🥔</p>
              <p className="text-xs font-medium">₹{Math.round(analyticsData.expectedIncome * 0.2 / 1000)}K</p>
            </div>
          </div>
        </AnalyticsCard>

        {/* Tentative Expenses */}
        <AnalyticsCard
          title={t('analytics.expenses', '💵 Tentative Expenses')}
          value={`₹${analyticsData.tentativeExpenses.toLocaleString('en-IN')}`}
          subtitle={t('analytics.perAcre', `₹${Math.round(analyticsData.tentativeExpenses / (analyticsData.totalArea || 1)).toLocaleString('en-IN')} per acre`)}
          icon={<IndianRupee className="h-5 w-5 text-warning" />}
          color="bg-warning"
          onClick={() => navigate('/app/analytics/expenses')}
          onSpeak={() => speakCard(`Estimated expenses are ${analyticsData.tentativeExpenses} rupees`)}
        >
          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="text-center">
              <div className="p-2 bg-primary/10 rounded-lg mb-1">
                <Sprout className="h-4 w-4 mx-auto text-primary" />
              </div>
              <p className="text-[10px] text-muted-foreground">{t('analytics.seeds', 'Seeds')}</p>
              <p className="text-xs font-bold">₹35K</p>
            </div>
            <div className="text-center">
              <div className="p-2 bg-info/10 rounded-lg mb-1">
                <Droplets className="h-4 w-4 mx-auto text-info" />
              </div>
              <p className="text-[10px] text-muted-foreground">{t('analytics.irrigation', 'Water')}</p>
              <p className="text-xs font-bold">₹40K</p>
            </div>
            <div className="text-center">
              <div className="p-2 bg-success/10 rounded-lg mb-1">
                <TestTube className="h-4 w-4 mx-auto text-success" />
              </div>
              <p className="text-[10px] text-muted-foreground">{t('analytics.fertilizer', 'Fertilizer')}</p>
              <p className="text-xs font-bold">₹60K</p>
            </div>
            <div className="text-center">
              <div className="p-2 bg-warning/10 rounded-lg mb-1">
                <Users className="h-4 w-4 mx-auto text-warning" />
              </div>
              <p className="text-[10px] text-muted-foreground">{t('analytics.labor', 'Labor')}</p>
              <p className="text-xs font-bold">₹50K</p>
            </div>
          </div>
        </AnalyticsCard>

        {/* Summary Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                {t('analytics.profitEstimate', 'Profit Estimate')}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => speakCard('Estimated profit is 2 lakh 65 thousand rupees')}
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('analytics.income', 'Income')}</span>
                <span className="text-sm font-medium text-success">+ ₹{analyticsData.expectedIncome.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('analytics.expenses', 'Expenses')}</span>
                <span className="text-sm font-medium text-destructive">- ₹{analyticsData.tentativeExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{t('analytics.netProfit', 'Net Profit')}</span>
                  <span className="text-lg font-bold text-primary">₹{(analyticsData.expectedIncome - analyticsData.tentativeExpenses).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}