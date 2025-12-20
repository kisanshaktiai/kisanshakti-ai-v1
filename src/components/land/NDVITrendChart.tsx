import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Leaf, Droplets, Layers, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface NDVITrendChartProps {
  data: Array<{
    date: string;
    ndvi: number;
    evi: number;
    ndwi: number;
    savi: number;
  }>;
  selectedIndex?: 'ndvi' | 'evi' | 'ndwi' | 'savi';
}

const indexConfig = {
  ndvi: { label: 'NDVI', color: '#10b981', icon: Leaf, description: 'Vegetation Health' },
  evi: { label: 'EVI', color: '#8b5cf6', icon: Activity, description: 'Enhanced Vegetation' },
  ndwi: { label: 'NDWI', color: '#3b82f6', icon: Droplets, description: 'Water Content' },
  savi: { label: 'SAVI', color: '#f59e0b', icon: Layers, description: 'Soil-Adjusted' },
};

export function NDVITrendChart({ data, selectedIndex: initialIndex = 'ndvi' }: NDVITrendChartProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<keyof typeof indexConfig>(initialIndex);
  
  const config = indexConfig[selectedIndex];
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate trend
  const latestValue = sortedData[sortedData.length - 1]?.[selectedIndex] ?? 0;
  const previousValue = sortedData[sortedData.length - 2]?.[selectedIndex] ?? 0;
  const trend = latestValue - previousValue;

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/95 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-xl">
          <p className="text-xs text-muted-foreground mb-1">{formatDate(label)}</p>
          <p className="text-lg font-bold" style={{ color: config.color }}>
            {payload[0].value.toFixed(3)}
          </p>
          <p className="text-xs text-muted-foreground">{config.label}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-0 shadow-xl rounded-3xl overflow-hidden w-full max-w-full">
      <CardHeader className="pb-2 px-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl shrink-0" style={{ backgroundColor: `${config.color}20` }}>
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: config.color }} />
            </div>
            <span className="truncate">Trend Analysis</span>
          </CardTitle>
          <div className="shrink-0">
            {trend > 0.001 ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[10px] sm:text-xs px-2">
                <TrendingUp className="h-3 w-3 mr-0.5 sm:mr-1" />
                <span className="hidden xs:inline">Improving</span>
                <span className="xs:hidden">↑</span>
              </Badge>
            ) : trend < -0.001 ? (
              <Badge className="bg-red-500/10 text-red-600 border-0 text-[10px] sm:text-xs px-2">
                <TrendingDown className="h-3 w-3 mr-0.5 sm:mr-1" />
                <span className="hidden xs:inline">Declining</span>
                <span className="xs:hidden">↓</span>
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground border-0 text-[10px] sm:text-xs px-2">
                <Minus className="h-3 w-3 mr-0.5 sm:mr-1" />
                <span className="hidden xs:inline">Stable</span>
                <span className="xs:hidden">—</span>
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
        {/* Index Selector - Horizontal scroll on small screens */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(Object.keys(indexConfig) as Array<keyof typeof indexConfig>).map((key) => {
            const idx = indexConfig[key];
            const Icon = idx.icon;
            return (
              <Button
                key={key}
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIndex(key)}
                className={cn(
                  "shrink-0 h-8 px-2.5 sm:px-3 rounded-lg transition-all",
                  selectedIndex === key && "bg-background shadow-sm"
                )}
              >
                <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" style={{ color: selectedIndex === key ? idx.color : undefined }} />
                <span className="text-[10px] sm:text-xs whitespace-nowrap">{idx.label}</span>
              </Button>
            );
          })}
        </div>

        {/* Chart */}
        <motion.div
          key={selectedIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="h-48 sm:h-64 w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sortedData} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${selectedIndex}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={config.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[0, 1]}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                tickFormatter={(v) => v.toFixed(1)}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey={selectedIndex} 
                stroke={config.color}
                strokeWidth={2}
                fill={`url(#gradient-${selectedIndex})`}
                dot={{ fill: config.color, strokeWidth: 0, r: 2 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Summary Stats - Responsive grid */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-border/30">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-[9px] sm:text-xs text-muted-foreground truncate">Latest</p>
            <p className="text-sm sm:text-lg font-bold truncate" style={{ color: config.color }}>
              {latestValue.toFixed(2)}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-[9px] sm:text-xs text-muted-foreground truncate">Average</p>
            <p className="text-sm sm:text-lg font-bold truncate">
              {(sortedData.reduce((acc, d) => acc + (d[selectedIndex] || 0), 0) / sortedData.length).toFixed(2)}
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-[9px] sm:text-xs text-muted-foreground truncate">Points</p>
            <p className="text-sm sm:text-lg font-bold">{sortedData.length}</p>
          </div>
        </div>

        {/* Description - Collapsible on mobile */}
        <div className="p-2.5 sm:p-3 bg-muted/30 rounded-xl">
          <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium" style={{ color: config.color }}>{config.label}</span>
            {' - '}{config.description}
            <span className="hidden sm:inline">
              {selectedIndex === 'ndvi' && '. Scientific thresholds: Excellent ≥0.65 | Healthy ≥0.50 | Moderate ≥0.35 | Poor ≥0.20'}
              {selectedIndex === 'evi' && '. Enhanced sensitivity in high biomass regions.'}
              {selectedIndex === 'ndwi' && '. Negative values indicate water stress.'}
              {selectedIndex === 'savi' && '. Optimized for areas with exposed soil.'}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}