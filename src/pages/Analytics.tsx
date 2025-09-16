import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
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

  // Mock data - replace with actual data from your backend
  const cropData = {
    labels: ['Rice', 'Wheat', 'Cotton', 'Sugarcane'],
    datasets: [{
      data: [30, 25, 20, 25],
      backgroundColor: [
        'hsl(var(--success))',
        'hsl(var(--warning))',
        'hsl(var(--info))',
        'hsl(var(--primary))',
      ],
      borderWidth: 0,
    }]
  };

  const marketData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    datasets: [{
      label: 'Rice',
      data: [2200, 2250, 2180, 2300, 2350],
      borderColor: 'hsl(var(--success))',
      backgroundColor: 'hsl(var(--success) / 0.1)',
      tension: 0.4,
    }, {
      label: 'Wheat',
      data: [1800, 1850, 1820, 1900, 1950],
      borderColor: 'hsl(var(--primary))',
      backgroundColor: 'hsl(var(--primary) / 0.1)',
      tension: 0.4,
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
        backgroundColor: 'hsl(var(--popover))',
        titleColor: 'hsl(var(--popover-foreground))',
        bodyColor: 'hsl(var(--popover-foreground))',
        borderColor: 'hsl(var(--border))',
        borderWidth: 1,
      }
    },
  };

  const speakCard = (text: string) => {
    speak(text);
  };

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
            value="4"
            subtitle={t('analytics.cropsGrown', 'Active Crops')}
            icon={<Wheat className="h-5 w-5 text-success" />}
            color="bg-success"
            onClick={() => navigate('/app/analytics/crops')}
            onSpeak={() => speakCard('You have 4 active crops growing')}
          >
            <div className="h-32">
              <Pie data={cropData} options={chartOptions} />
            </div>
          </AnalyticsCard>

          {/* Land Utilization */}
          <AnalyticsCard
            title={t('analytics.landUtilization', '📏 Land Usage')}
            value="75%"
            subtitle={t('analytics.landUsed', '15 of 20 acres active')}
            icon={<Ruler className="h-5 w-5 text-primary" />}
            color="bg-primary"
            onClick={() => navigate('/app/analytics/land')}
            onSpeak={() => speakCard('75 percent of your land is being utilized')}
          >
            <Progress value={75} className="h-2 mt-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{t('analytics.active', 'Active')}: 15</span>
              <span>{t('analytics.idle', 'Idle')}: 5</span>
            </div>
          </AnalyticsCard>
        </div>

        {/* Water & Irrigation */}
        <AnalyticsCard
          title={t('analytics.waterIrrigation', '💧 Water & Irrigation')}
          value={t('analytics.optimal', 'Optimal')}
          subtitle={t('analytics.waterUsage', '2,500L used today')}
          icon={<Droplets className="h-5 w-5 text-info" />}
          color="bg-info"
          trend={{ value: 12, isPositive: true }}
          onClick={() => navigate('/app/analytics/water')}
          onSpeak={() => speakCard('Water usage is optimal at 2500 liters today')}
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
          value="₹4,50,000"
          subtitle={t('analytics.perSeason', 'This season estimate')}
          icon={<Wallet className="h-5 w-5 text-success" />}
          color="bg-success"
          onClick={() => navigate('/app/analytics/income')}
          onSpeak={() => speakCard('Expected income this season is 4 lakh 50 thousand rupees')}
        >
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center">
              <p className="text-2xl">🌾</p>
              <p className="text-xs font-medium">₹2.5L</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">🌽</p>
              <p className="text-xs font-medium">₹1.2L</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">🥔</p>
              <p className="text-xs font-medium">₹80K</p>
            </div>
          </div>
        </AnalyticsCard>

        {/* Tentative Expenses */}
        <AnalyticsCard
          title={t('analytics.expenses', '💵 Tentative Expenses')}
          value="₹1,85,000"
          subtitle={t('analytics.perAcre', '₹9,250 per acre')}
          icon={<IndianRupee className="h-5 w-5 text-warning" />}
          color="bg-warning"
          onClick={() => navigate('/app/analytics/expenses')}
          onSpeak={() => speakCard('Estimated expenses are 1 lakh 85 thousand rupees')}
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
                <span className="text-sm font-medium text-success">+ ₹4,50,000</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t('analytics.expenses', 'Expenses')}</span>
                <span className="text-sm font-medium text-destructive">- ₹1,85,000</span>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{t('analytics.netProfit', 'Net Profit')}</span>
                  <span className="text-lg font-bold text-primary">₹2,65,000</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}