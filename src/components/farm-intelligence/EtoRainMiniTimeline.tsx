import React from 'react';
import { useTranslation } from 'react-i18next';
import { CloudRain } from 'lucide-react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { TimelineSeries } from '@/services/envIntelligenceApi';

interface EtoRainMiniTimelineProps {
  series?: TimelineSeries[];
  isLoading?: boolean;
}

/** Compact past+forecast timeline: daily rain bars with an ET0 demand line. */
export function EtoRainMiniTimeline({ series, isLoading }: EtoRainMiniTimelineProps) {
  const { t, i18n } = useTranslation();

  const et0 = series?.find((s) => s.property === 'ET0');
  const rain = series?.find((s) => s.property === 'RAIN');

  const byDay = new Map<string, { day: string; et0: number; rain: number; forecast: boolean }>();
  const add = (s: TimelineSeries | undefined, key: 'et0' | 'rain') => {
    for (const p of s?.points ?? []) {
      const day = p.valid_time.slice(0, 10);
      const row = byDay.get(day) ?? { day, et0: 0, rain: 0, forecast: false };
      row[key] += Number(p.value ?? 0);
      row.forecast = row.forecast || p.is_forecast;
      byDay.set(day, row);
    }
  };
  add(et0, 'et0');
  add(rain, 'rain');

  const data = [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({
      ...r,
      label: new Date(`${r.day}T00:00:00`).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
      }),
    }));

  const todayIdx = data.findIndex((d) => d.day === new Date().toISOString().slice(0, 10));

  // Farmer role receives no ET0 by visibility policy — hide the line, its
  // legend entry and its axis contribution entirely (no empty line, no gap).
  const hasEt0 = (et0?.points?.length ?? 0) > 0;


  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CloudRain className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{t('farmIntel.timeline.title')}</span>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('farmIntel.no_data')}</p>
      ) : (
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={32} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => [
                  `${Number(value).toFixed(1)} mm`,
                  name === 'rain' ? t('farmIntel.timeline.rain') : t('farmIntel.timeline.et0'),
                ]}
              />
              {todayIdx >= 0 && (
                <ReferenceLine
                  x={data[todayIdx].label}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                />
              )}
              <Bar dataKey="rain" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="et0"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          {t('farmIntel.timeline.rain')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-warning" />
          {t('farmIntel.timeline.et0')}
        </span>
      </div>
    </div>
  );
}
