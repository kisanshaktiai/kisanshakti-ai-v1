import { useEffect, useState } from 'react';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';
import { Tile, TileIcon, TileChevron } from '../tileBase';

interface Props {
  crop?: string;
  district?: string;
  onClick: () => void;
}

export function PriceTrendTile({ crop, district, onClick }: Props) {
  const intel = useMarketPriceIntelligence();
  const [points, setPoints] = useState<number[]>([]);
  const [trend, setTrend] = useState<'up' | 'down' | 'flat'>('flat');

  useEffect(() => {
    if (!crop) return;
    intel
      .getHistoricalComparison({ crop, district, periods: ['week'] })
      .then((c) => {
        const arr = c?.week?.data || [];
        const series = arr
          .map((d: any) => d.modal_price || d.price_per_unit)
          .filter((v: number) => !!v)
          .slice(0, 7)
          .reverse();
        setPoints(series);
        if (series.length >= 2) {
          setTrend(series[series.length - 1] > series[0] ? 'up' : series[series.length - 1] < series[0] ? 'down' : 'flat');
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, district]);

  const isUp = trend === 'up';
  const tone = trend === 'down' ? 'down' : 'accent';

  return (
    <Tile onClick={onClick} ariaLabel="Price trend">
      <TileIcon tone={tone as any}>
        <Activity className="w-5 h-5" />
      </TileIcon>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          7 दिन रुझान · Trend
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isUp ? (
            <TrendingUp className="w-4 h-4" style={{ color: 'hsl(var(--market-up))' }} />
          ) : trend === 'down' ? (
            <TrendingDown className="w-4 h-4" style={{ color: 'hsl(var(--market-down))' }} />
          ) : null}
          <p className="text-xl font-extrabold" style={{ color: 'hsl(var(--market-ink))' }}>
            {points.length ? capitalize(trend) : '—'}
          </p>
        </div>
        <MiniSpark points={points} up={isUp} />
      </div>
      <TileChevron />
    </Tile>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MiniSpark({ points, up }: { points: number[]; up: boolean }) {
  if (!points.length) {
    return (
      <p className="text-[11px] mt-0.5" style={{ color: 'hsl(var(--market-ink-soft))' }}>
        अपनी फसल जोड़ें
      </p>
    );
  }
  const w = 80;
  const h = 22;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / Math.max(points.length - 1, 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - ((p - min) / range) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="mt-1.5" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={up ? 'hsl(var(--market-up))' : 'hsl(var(--market-down))'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
