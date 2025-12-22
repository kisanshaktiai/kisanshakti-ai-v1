import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { HistoricalComparison } from '@/hooks/useMarketPriceIntelligence';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw,
  Loader2,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriceComparisonChartProps {
  historicalData: HistoricalComparison;
  selectedCrop?: string;
  isLoading: boolean;
  onFetchComparison: () => void;
}

export function PriceComparisonChart({ 
  historicalData, 
  selectedCrop, 
  isLoading,
  onFetchComparison 
}: PriceComparisonChartProps) {
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState<'week' | 'month' | 'year'>('week');

  const periodData = historicalData[activePeriod];
  const stats = periodData?.stats;
  const chartData = periodData?.data?.map((d: any) => ({
    date: d.price_date?.split('-').slice(1).join('/') || '',
    price: d.modal_price || d.price_per_unit || 0,
    min: d.min_price || 0,
    max: d.max_price || 0,
    market: d.market_location || d.district
  })) || [];

  const getTrendIcon = () => {
    if (!stats) return <Minus className="w-5 h-5" />;
    if (stats.trend === 'up') return <TrendingUp className="w-5 h-5 text-green-500" />;
    if (stats.trend === 'down') return <TrendingDown className="w-5 h-5 text-red-500" />;
    return <Minus className="w-5 h-5 text-yellow-500" />;
  };

  const getTrendColor = () => {
    if (!stats) return 'text-muted-foreground';
    if (stats.trend === 'up') return 'text-green-500';
    if (stats.trend === 'down') return 'text-red-500';
    return 'text-yellow-500';
  };

  if (!selectedCrop) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
      >
        <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {t('market.intelligence.selectCropFirst', 'Select a Crop')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('market.intelligence.selectCropFirstDesc', 'Choose a crop to view historical price comparison')}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t('market.intelligence.priceComparison', 'Price Comparison')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {selectedCrop} • महाराष्ट्र
          </p>
        </div>
        
        <Button 
          onClick={onFetchComparison} 
          variant="outline" 
          className="rounded-xl"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {t('market.intelligence.loadData', 'Load Data')}
        </Button>
      </motion.div>

      {/* Period Tabs */}
      <Tabs value={activePeriod} onValueChange={(v) => setActivePeriod(v as any)}>
        <TabsList className="grid w-full grid-cols-3 h-12 rounded-2xl bg-card/50 p-1">
          <TabsTrigger value="week" className="rounded-xl">
            <Calendar className="w-4 h-4 mr-2" />
            {t('market.intelligence.week', 'Week')}
          </TabsTrigger>
          <TabsTrigger value="month" className="rounded-xl">
            <Calendar className="w-4 h-4 mr-2" />
            {t('market.intelligence.month', 'Month')}
          </TabsTrigger>
          <TabsTrigger value="year" className="rounded-xl">
            <Calendar className="w-4 h-4 mr-2" />
            {t('market.intelligence.year', 'Year')}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Stats Cards */}
      {stats && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div className="p-4 rounded-2xl bg-card/50 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('market.intelligence.avgPrice', 'Avg Price')}
            </p>
            <p className="text-xl font-bold">₹{stats.avgPrice?.toLocaleString('en-IN')}</p>
          </div>
          <div className="p-4 rounded-2xl bg-card/50 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('market.intelligence.priceRange', 'Range')}
            </p>
            <p className="text-lg font-semibold">
              ₹{stats.minPrice?.toLocaleString('en-IN')} - ₹{stats.maxPrice?.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-card/50 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('market.intelligence.trend', 'Trend')}
            </p>
            <div className="flex items-center gap-2">
              {getTrendIcon()}
              <span className={cn("text-lg font-bold", getTrendColor())}>
                {stats.changePercent}%
              </span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-card/50 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {t('market.intelligence.dataPoints', 'Data Points')}
            </p>
            <p className="text-xl font-bold">{stats.dataPoints}</p>
          </div>
        </motion.div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : chartData.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
        >
          <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {t('market.intelligence.noHistoricalData', 'No historical data available')}
          </p>
          <Button onClick={onFetchComparison} className="mt-4 rounded-xl">
            {t('market.intelligence.loadData', 'Load Data')}
          </Button>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-80 bg-card/30 rounded-3xl border border-border/50 p-4"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value) => `₹${value}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  padding: '12px'
                }}
                formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}
    </div>
  );
}
