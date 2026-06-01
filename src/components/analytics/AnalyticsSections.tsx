import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Sprout,
  Droplets,
  TestTube,
  CheckCircle2,
  Wallet,
  LineChart,
  Lightbulb,
  CloudRain,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
} from 'chart.js';
import { Line, Bar, Doughnut, Radar } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import type { LandAnalytics } from '@/lib/analytics/reportEngine';
import { formatINR, formatNumber, nutrientLevel } from '@/lib/analytics/formulas';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Tooltip,
  Legend,
  Filler,
);

const chartBase = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
};

function SectionCard({
  icon,
  title,
  subtitle,
  children,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <Card className="bg-card border-border/60 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className={cn(empty && 'opacity-70')}>{children}</div>
    </Card>
  );
}

function EmptyHint({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground italic">{label}</p>
  );
}

export function CropStageCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  const ndvi = a.latestNdvi;
  const ndviPct = ndvi != null ? Math.max(0, Math.min(100, Math.round(ndvi * 100))) : null;
  return (
    <SectionCard
      icon={<Sprout className="w-4 h-4" />}
      title={t('analytics.sections.crop_stage', 'Crop & Stage')}
      subtitle={a.land.current_crop || t('analytics.no_crop', 'No active crop')}
    >
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-muted/40 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.crop_stage_label', 'Stage')}</p>
          <p className="text-sm font-bold text-foreground truncate">{a.land.crop_stage || '—'}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.harvest_in', 'Harvest in')}</p>
          <p className="text-sm font-bold text-foreground">
            {a.land.expected_harvest_date
              ? Math.max(0, Math.round((new Date(a.land.expected_harvest_date).getTime() - Date.now()) / 86_400_000)) + ' d'
              : '—'}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">NDVI</p>
          <p className="text-sm font-bold text-foreground">{ndviPct != null ? ndviPct + '%' : '—'}</p>
        </div>
      </div>
      {a.ndviTrend.length > 1 && (
        <div className="h-24 mt-3">
          <Line
            data={{
              labels: a.ndviTrend.map((p) => p.date.slice(5)),
              datasets: [
                {
                  data: a.ndviTrend.map((p) => p.value),
                  borderColor: 'hsl(var(--primary))',
                  backgroundColor: 'hsl(var(--primary) / 0.15)',
                  tension: 0.4,
                  fill: true,
                  borderWidth: 2,
                  pointRadius: 0,
                },
              ],
            }}
            options={{ ...chartBase, scales: { x: { display: false }, y: { display: false, min: 0, max: 1 } } }}
          />
        </div>
      )}
    </SectionCard>
  );
}

export function WaterWeatherCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  const rain = a.weather?.rain_24h_mm ?? null;
  return (
    <SectionCard
      icon={<CloudRain className="w-4 h-4" />}
      title={t('analytics.sections.water_weather', 'Water & Weather')}
      subtitle={a.weather?.observation_time ? new Date(a.weather.observation_time).toLocaleString() : t('analytics.no_weather', 'No live weather')}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.water_need', 'Water need / wk')}</p>
          <p className="text-base font-bold text-foreground">{formatNumber(a.waterRequirementL)} L</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.rain_24h', 'Rain (24h)')}</p>
          <p className="text-base font-bold text-foreground">{rain != null ? rain.toFixed(1) + ' mm' : '—'}</p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.temp', 'Temperature')}</p>
          <p className="text-base font-bold text-foreground">
            {a.weather?.temperature_celsius != null ? a.weather.temperature_celsius.toFixed(0) + '°C' : '—'}
          </p>
        </div>
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.humidity', 'Humidity')}</p>
          <p className="text-base font-bold text-foreground">
            {a.weather?.humidity_percent != null ? a.weather.humidity_percent.toFixed(0) + '%' : '—'}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

export function SoilHealthCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  const s = a.soil;
  if (!s) {
    return (
      <SectionCard icon={<TestTube className="w-4 h-4" />} title={t('analytics.sections.soil', 'Soil Health')} empty>
        <EmptyHint label={t('analytics.soil_empty', 'No soil test data. Run a soil test for accurate insights.')} />
      </SectionCard>
    );
  }
  const data = {
    labels: ['N', 'P', 'K', 'pH', 'OC'],
    datasets: [
      {
        data: [
          Math.min(100, ((s.nitrogen_kg_per_ha || 0) / 560) * 100),
          Math.min(100, ((s.phosphorus_kg_per_ha || 0) / 22) * 100),
          Math.min(100, ((s.potassium_kg_per_ha || 0) / 280) * 100),
          ((s.ph_level || 0) / 14) * 100,
          Math.min(100, ((s.organic_carbon || 0) / 1.5) * 100),
        ],
        backgroundColor: 'hsl(var(--primary) / 0.25)',
        borderColor: 'hsl(var(--primary))',
        borderWidth: 2,
      },
    ],
  };
  return (
    <SectionCard
      icon={<TestTube className="w-4 h-4" />}
      title={t('analytics.sections.soil', 'Soil Health')}
      subtitle={s.test_date ? t('analytics.tested_on', 'Tested {{date}}', { date: new Date(s.test_date).toLocaleDateString() }) : undefined}
    >
      <div className="h-36">
        <Radar
          data={data}
          options={{
            ...chartBase,
            scales: { r: { suggestedMin: 0, suggestedMax: 100, ticks: { display: false }, grid: { color: 'hsl(var(--border))' }, angleLines: { color: 'hsl(var(--border))' } } },
          }}
        />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap text-[10px]">
        {(['N', 'P', 'K'] as const).map((n) => {
          const val = n === 'N' ? s.nitrogen_kg_per_ha : n === 'P' ? s.phosphorus_kg_per_ha : s.potassium_kg_per_ha;
          const level = nutrientLevel(val ?? null, n);
          return (
            <Badge
              key={n}
              variant="secondary"
              className={cn(
                'border-0',
                level === 'low' && 'bg-destructive/15 text-destructive',
                level === 'high' && 'bg-primary/15 text-primary',
                level === 'medium' && 'bg-muted text-foreground',
              )}
            >
              {n}: {val != null ? Math.round(val) : '—'} ({level})
            </Badge>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function TaskPerfCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  return (
    <SectionCard
      icon={<CheckCircle2 className="w-4 h-4" />}
      title={t('analytics.sections.tasks', 'Task Performance')}
      subtitle={t('analytics.tasks_total', '{{n}} tasks', { n: a.tasks.total })}
      empty={a.tasks.total === 0}
    >
      {a.tasks.total === 0 ? (
        <EmptyHint label={t('analytics.tasks_empty', 'No scheduled tasks yet.')} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{t('analytics.completion', 'Completion')}</span>
            <span className="text-sm font-bold text-foreground">{a.tasks.completionRate.toFixed(0)}%</span>
          </div>
          <Progress value={a.tasks.completionRate} className="h-2" />
          <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[11px]">
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground">{t('analytics.on_time', 'On time')}</p>
              <p className="font-bold text-foreground">{a.tasks.onTimeRate.toFixed(0)}%</p>
            </div>
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground">{t('analytics.delayed', 'Delayed')}</p>
              <p className="font-bold text-destructive">{a.tasks.delayed}</p>
            </div>
            <div className="bg-muted/40 rounded p-2">
              <p className="text-muted-foreground">{t('analytics.pending', 'Pending')}</p>
              <p className="font-bold text-foreground">{a.tasks.pending}</p>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function FinancialCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  const cats = a.finance.projectedExpenseBreakdown.slice(0, 6);
  const hasAny = cats.length > 0 || a.projectedRevenue > 0 || a.finance.totalExpense > 0;
  const sourceBadge =
    a.finance.expenseSource === 'actual'
      ? t('analytics.expense_source_actual', 'Actuals')
      : a.finance.expenseSource === 'mixed'
        ? t('analytics.expense_source_mixed', 'Actuals + CoC baseline')
        : t('analytics.expense_source_projected', 'Crop CoC baseline');
  return (
    <SectionCard
      icon={<Wallet className="w-4 h-4" />}
      title={t('analytics.sections.financial', 'Financial')}
      subtitle={t('analytics.financial_subtitle', 'Per-crop projection · {{src}}', { src: sourceBadge })}
      empty={!hasAny}
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-muted/40 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.expenses_projected', 'Expenses (proj.)')}</p>
          <p className="text-sm font-bold text-foreground">{formatINR(a.finance.projectedExpense)}</p>
          {a.finance.totalExpense > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t('analytics.actuals', 'Actual')}: {formatINR(a.finance.totalExpense)}
            </p>
          )}
        </div>
        <div className="bg-muted/40 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.projected_revenue', 'Projected revenue')}</p>
          <p className="text-sm font-bold text-foreground">{formatINR(a.projectedRevenue)}</p>
        </div>
        <div className="col-span-2 bg-primary/10 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.projected_profit', 'Projected profit')}</p>
          <p className={cn('text-base font-bold', a.projectedProfit >= 0 ? 'text-primary' : 'text-destructive')}>
            {formatINR(a.projectedProfit)}
          </p>
        </div>
      </div>
      {cats.length > 0 ? (
        <div className="h-32">
          <Doughnut
            data={{
              labels: cats.map((c) => t(`analytics.financial.${c.category}`, c.category)),
              datasets: [
                {
                  data: cats.map((c) => c.amount),
                  backgroundColor: [
                    'hsl(var(--primary))',
                    'hsl(var(--primary) / 0.75)',
                    'hsl(var(--primary) / 0.55)',
                    'hsl(var(--primary) / 0.4)',
                    'hsl(var(--muted-foreground))',
                    'hsl(var(--muted-foreground) / 0.6)',
                  ],
                  borderColor: 'hsl(var(--card))',
                  borderWidth: 2,
                },
              ],
            }}
            options={{ ...chartBase, plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 10, font: { size: 10 }, color: 'hsl(var(--foreground))' } } } }}
          />
        </div>
      ) : (
        <EmptyHint label={t('analytics.finance_empty', 'No expense records logged for this period.')} />
      )}
    </SectionCard>
  );
}

export function MarketPulseCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  return (
    <SectionCard
      icon={<LineChart className="w-4 h-4" />}
      title={t('analytics.sections.market', 'Market Pulse')}
      subtitle={a.land.current_crop || undefined}
      empty={!a.marketPrice}
    >
      {a.marketPrice ? (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-foreground">{formatINR(a.marketPrice)}</p>
            <span className="text-xs text-muted-foreground">/ {t('analytics.per_quintal', 'quintal')}</span>
          </div>
          {a.marketSource && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {t('analytics.market_source', 'Source')}: {a.marketSource}
            </p>
          )}
        </>
      ) : (
        <EmptyHint label={t('analytics.market_empty', 'No recent market price available for this crop.')} />
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        {t('analytics.expected_yield', 'Expected yield')}: <span className="text-foreground font-semibold">{formatNumber(a.expectedYieldQuintals, 1)} q</span>
      </div>
    </SectionCard>
  );
}

export function DisclaimerCard() {
  const { t } = useTranslation();
  return (
    <Card className="bg-muted/40 border-dashed border-border/60 p-3">
      <div className="flex gap-2">
        <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[11px] font-bold text-foreground mb-1">
            {t('analytics.disclaimer.title', 'Projection notice')}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {t(
              'analytics.disclaimer.body',
              'These numbers are forecasts based on your land data, NDVI, weather and mandi prices. Actual results may vary with soil condition, water stress, pest or disease attacks, rainfall and labour rates. Use this as guidance — not a guarantee.',
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function RecommendationsCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  const items = useMemo(() => a.recommendations, [a.recommendations]);
  if (!items.length) {
    return (
      <SectionCard icon={<Lightbulb className="w-4 h-4" />} title={t('analytics.sections.recommendations', 'Smart Recommendations')}>
        <p className="text-xs text-muted-foreground">{t('analytics.all_good', 'No urgent actions. Keep monitoring.')}</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard icon={<Lightbulb className="w-4 h-4" />} title={t('analytics.sections.recommendations', 'Smart Recommendations')}>
      <ul className="space-y-2">
        {items.map((key) => (
          <li key={key} className="flex items-start gap-2 text-sm text-foreground">
            <AlertTriangle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <span>{t(`analytics.${key}`, defaultRec(key))}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function defaultRec(key: string): string {
  switch (key) {
    case 'recommendations.low_ndvi':
      return 'Vegetation index is low — inspect for nutrient or pest stress.';
    case 'recommendations.irrigate_soon':
      return 'Soil likely dry — plan irrigation within 1–2 days.';
    case 'recommendations.low_nitrogen':
      return 'Nitrogen is low — schedule a top-dressing of urea.';
    case 'recommendations.tasks_delayed':
      return 'You have delayed tasks. Catch up to avoid yield loss.';
    case 'recommendations.ph_out_of_range':
      return 'Soil pH is out of crop’s ideal range. Consider lime or gypsum.';
    case 'recommendations.no_market_price':
      return 'No recent mandi price for this crop — revenue projection unavailable.';
    default:
      return key;
  }
}
