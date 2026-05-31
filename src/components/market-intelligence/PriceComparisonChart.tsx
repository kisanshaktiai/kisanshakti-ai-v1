import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { HistoricalComparison } from '@/hooks/useMarketPriceIntelligence';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriceComparisonChartProps {
  historicalData: HistoricalComparison;
  selectedCrop?: string;
  isLoading: boolean;
  onFetchComparison: () => void;
  embedded?: boolean;
}

export function PriceComparisonChart({
  historicalData,
  selectedCrop,
  isLoading,
  onFetchComparison,
  embedded = false,
}: PriceComparisonChartProps) {
  const { t } = useTranslation();
  const [activePeriod, setActivePeriod] = useState<'week' | 'month' | 'year'>('week');

  const periodData = historicalData[activePeriod];
  const stats = periodData?.stats;
  const chartData =
    periodData?.data?.map((d: any) => ({
      date: d.price_date?.split('-').slice(1).join('/') || '',
      price: d.modal_price || d.price_per_unit || 0,
    })) || [];

  const getTrendIcon = () => {
    if (!stats) return <Minus className="w-4 h-4" />;
    if (stats.trend === 'up') return <TrendingUp className="w-4 h-4 text-success" />;
    if (stats.trend === 'down') return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-warning" />;
  };

  if (!selectedCrop) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm font-semibold mb-1">
          {t('market.intelligence.selectCropFirst', 'Select a Crop')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'market.intelligence.selectCropFirstDesc',
            'Choose a crop to view historical price comparison',
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{selectedCrop}</h3>
            <p className="text-xs text-muted-foreground">महाराष्ट्र</p>
          </div>
          <Button
            onClick={onFetchComparison}
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}

      {/* Period segmented control */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-muted">
        {(['week', 'month', 'year'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setActivePeriod(p)}
            className={cn(
              'h-9 rounded-xl text-xs font-semibold transition-colors',
              activePeriod === p
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {t(`market.intelligence.${p}`)}
          </button>
        ))}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-muted/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
              सरासरी
            </p>
            <p className="text-sm font-bold tabular-nums">
              ₹{Math.round(stats.avgPrice || 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
              बदल
            </p>
            <div className="flex items-center gap-1">
              {getTrendIcon()}
              <span className="text-sm font-bold tabular-nums">{stats.changePercent}%</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/50">
            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
              नोंदी
            </p>
            <p className="text-sm font-bold tabular-nums">{stats.dataPoints}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">
            {t('market.intelligence.noHistoricalData', 'No historical data available')}
          </p>
          <Button onClick={onFetchComparison} size="sm" className="rounded-xl h-10">
            {t('market.intelligence.loadData', 'Load Data')}
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-56 rounded-2xl bg-muted/30 p-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => `₹${v}`}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
                formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'Price']}
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
