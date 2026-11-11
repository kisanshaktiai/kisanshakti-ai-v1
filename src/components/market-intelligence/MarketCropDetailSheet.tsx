import { useEffect, useMemo, useState } from 'react';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2, Package, MapPin } from 'lucide-react';
import type { MarketPrice, HistoricalComparison, AIAnalysis } from '@/hooks/useMarketPriceIntelligence';
import { AISellingAdvisor } from './AISellingAdvisor';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Period = 'week' | 'month' | 'year';
const PERIOD_LABEL: Record<Period, string> = { week: '७ दिवस', month: '३० दिवस', year: '१ वर्ष' };

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const modalOf = (p: Partial<MarketPrice>) => Number(p.modal_price || p.price_per_unit || 0);

/** Aggregate many mandi rows into one point per day (avg modal + min/max band). */
export function aggregateDaily(rows: Partial<MarketPrice>[]) {
  const byDate = new Map<string, { sum: number; n: number; min: number; max: number }>();
  for (const r of rows) {
    const m = modalOf(r);
    if (!r.price_date || m <= 0) continue;
    const lo = Number(r.min_price || m);
    const hi = Number(r.max_price || m);
    const e = byDate.get(r.price_date) || { sum: 0, n: 0, min: Infinity, max: 0 };
    e.sum += m; e.n += 1; e.min = Math.min(e.min, lo); e.max = Math.max(e.max, hi);
    byDate.set(r.price_date, e);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      price: Math.round(e.sum / e.n),
      band: [Math.round(e.min), Math.round(e.max)] as [number, number],
    }));
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  price: MarketPrice | null;
  allPrices: MarketPrice[];
  historicalData: HistoricalComparison;
  historicalCrop: string | null;
  aiAnalysis: AIAnalysis | null;
  isLoading: boolean;
  onLoadHistory: (crop: string) => void;
  onGetAdvice: (crop: string) => void;
}

const EMPTY_HISTORY: HistoricalComparison = {};

export function MarketCropDetailSheet({
  open, onOpenChange, price, allPrices, historicalData, historicalCrop, aiAnalysis, isLoading, onLoadHistory, onGetAdvice,
}: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const crop = price?.crop_name || '';
  // Never render another crop's history under this crop's name.
  const cropHistory = historicalCrop === crop ? historicalData : EMPTY_HISTORY;

  useEffect(() => {
    if (open && crop) onLoadHistory(crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, crop]);

  // Mandi feeds can lag; jump to the shortest period that actually has a trend.
  useEffect(() => {
    const has = (k: Period) => aggregateDaily(cropHistory[k]?.data || []).length >= 2;
    if (!has(period)) {
      const best = (['month', 'week', 'year'] as Period[]).find(has);
      if (best) setPeriod(best);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropHistory]);

  const series = useMemo(() => aggregateDaily(cropHistory[period]?.data || []), [cropHistory, period]);
  const first = series[0]?.price || 0;
  const last = series[series.length - 1]?.price || 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const trend = Math.abs(change) < 1 ? 'stable' : change > 0 ? 'up' : 'down';

  const mandis = useMemo(() => {
    const latest = new Map<string, MarketPrice>();
    for (const p of allPrices) {
      if (p.crop_name !== crop) continue;
      const prev = latest.get(p.market_location);
      if (!prev || p.price_date > prev.price_date) latest.set(p.market_location, p);
    }
    return [...latest.values()].sort((a, b) => modalOf(b) - modalOf(a)).slice(0, 6);
  }, [allPrices, crop]);

  if (!price) return null;
  const modal = modalOf(price);
  const lo = Number(price.min_price || modal);
  const hi = Number(price.max_price || modal);
  const pos = hi > lo ? ((modal - lo) / (hi - lo)) * 100 : 50;
  const unit = price.unit || 'क्विंटल';

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendCls = trend === 'up' ? 'bg-success/15 text-success' : trend === 'down' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground';
  const trendText = trend === 'up' ? 'भाव वाढत आहेत' : trend === 'down' ? 'भाव कमी होत आहेत' : 'भाव स्थिर आहेत';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] bg-background">
        <div className="overflow-y-auto px-4 pb-8">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-xl font-bold">{crop}{price.variety ? ` • ${price.variety}` : ''}</DrawerTitle>
            <DrawerDescription className="flex flex-wrap items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> {price.market_location} • {price.price_date}
            </DrawerDescription>
          </DrawerHeader>

          {/* Big price + gauge */}
          <div className="border-b border-border pb-4 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">सर्वसाधारण दर</p>
                <p className="flex flex-wrap items-baseline gap-1 text-3xl font-extrabold tabular-nums text-foreground">{rupee(modal)}<span className="text-sm font-medium text-muted-foreground"> / {unit}</span></p>
              </div>
              {price.arrival != null && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Package className="w-3.5 h-3.5" /> आवक</p>
                  <p className="text-base font-bold tabular-nums">{Number(price.arrival).toLocaleString('en-IN')} {unit}</p>
                </div>
              )}
            </div>
            <div>
              <div className="relative h-2.5 rounded-full bg-muted">
                <div className="absolute -top-1 h-[18px] w-[18px] rounded-full bg-primary border-2 border-background shadow" style={{ left: `calc(${pos}% - 9px)` }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5 tabular-nums">
                <span className="text-muted-foreground">किमान <b className="text-foreground">{rupee(lo)}</b></span>
                <span className="text-muted-foreground">कमाल <b className="text-foreground">{rupee(hi)}</b></span>
              </div>
            </div>
          </div>

          {/* Trend chart */}
          <div className="mt-4 border-b border-border pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold">भावाचा आलेख</h3>
              {series.length > 1 && (
                <span className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold', trendCls)}>
                  <TrendIcon className="w-3.5 h-3.5" /> {change > 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted mb-3">
              {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
                <Button variant="quiet" key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p}
                  className={cn('h-10 rounded-md px-2 text-xs font-semibold', period === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                  {PERIOD_LABEL[p]}
                </Button>
              ))}
            </div>
            {isLoading && series.length === 0 ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : series.length < 2 ? (
              <p className="h-32 flex items-center justify-center text-sm text-muted-foreground text-center">या कालावधीसाठी पुरेशी माहिती नाही</p>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mktBand" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={48}
                        tickFormatter={(v) => (v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`)} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))' }}
                        formatter={(v: number | number[], name: string) =>
                          name === 'band' && Array.isArray(v) ? [`${rupee(v[0])} – ${rupee(v[1])}`, 'किमान–कमाल'] : [rupee(v as number), 'सरासरी']}
                      />
                      <Area dataKey="band" stroke="none" fill="url(#mktBand)" />
                      <Line dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{trendText} • रेषा = सरासरी दर, छटा = किमान–कमाल</p>
              </>
            )}
          </div>

          {/* Mandi comparison */}
          {mandis.length > 1 && (
            <div className="mt-4 border-b border-border pb-4">
              <h3 className="text-sm font-bold mb-1">कोणत्या बाजारात जास्त भाव?</h3>
              <p className="text-xs text-muted-foreground mb-3">सर्वात वरचा बाजार = सर्वोत्तम दर</p>
              <div style={{ height: mandis.length * 40 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mandis.map((m) => ({ name: m.market_location, price: modalOf(m) }))} layout="vertical" margin={{ left: 0, right: 56 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                    <Bar dataKey="price" radius={[0, 8, 8, 0]} barSize={22}
                      label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--foreground))', formatter: (v: number) => rupee(v) }}>
                      {mandis.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? 'hsl(var(--success))' : 'hsl(var(--primary) / 0.45)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* AI advice */}
          <div className="mt-4">
            <AISellingAdvisor analysis={aiAnalysis} selectedCrop={crop} isLoading={isLoading} onGetAdvice={() => onGetAdvice(crop)} embedded />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
