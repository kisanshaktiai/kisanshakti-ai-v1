/**
 * HourlyForecastChart - Modern line chart for hourly temperature forecast
 * 
 * UX IMPROVEMENT: Replaces simple card list with interactive line chart
 * - Clear temperature trends visible at a glance
 * - Responsive and accessible
 * - Optimized for small mobile screens
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';

interface HourlyForecastChartProps {
  hourlyForecast: any[];
}

export const HourlyForecastChart: React.FC<HourlyForecastChartProps> = ({ hourlyForecast }) => {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    return hourlyForecast.slice(0, 12).map((hour, index) => ({
      time: index === 0 ? t('weather.hourly.now') : format(new Date(hour.dt * 1000), 'ha'),
      temp: Math.round(hour.temp),
      feelsLike: Math.round(hour.feels_like),
      pop: Math.round(hour.pop * 100),
      rawDt: hour.dt
    }));
  }, [hourlyForecast, t]);


  if (!hourlyForecast || hourlyForecast.length === 0) {
    return null;
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg">
          <p className="text-xs font-semibold mb-1">{payload[0].payload.time}</p>
          <p className="text-xs text-primary">Temp: {payload[0].value}°C</p>
          <p className="text-xs text-muted-foreground">Feels: {payload[0].payload.feelsLike}°C</p>
          {payload[0].payload.pop > 0 && (
            <p className="text-xs text-blue-500">Rain: {payload[0].payload.pop}%</p>
          )}
        </div>
      );
    }
    return null;
  };

  const minTemp = Math.min(...chartData.map(d => d.temp)) - 2;
  const maxTemp = Math.max(...chartData.map(d => d.temp)) + 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="px-4 py-3"
    >
      <Card className="bg-card/80 backdrop-blur-sm border-border/50 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Hourly Forecast
            </span>
            <span className="text-xs text-muted-foreground">Next 12 hours</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[minTemp, maxTemp]}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}°`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="temp"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#tempGradient)"
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
};
