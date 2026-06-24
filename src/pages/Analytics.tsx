/**
 * Farm Analytics — per-land, real-data, mobile-first.
 *
 * Every metric is computed from real DB rows via `useAnalyticsData` +
 * `reportEngine`. No hardcoded yields, prices, water, or weather.
 * Theme colours only — no hex literals in this file or its sections.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Layers, Sprout, Wallet, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AnalyticsSkeleton } from '@/components/skeletons';
import { useAnalyticsData, type DateRange } from '@/hooks/useAnalyticsData';
import { LandSelectorRail } from '@/components/analytics/LandSelectorRail';
import {
  CropStageCard,
  WaterWeatherCard,
  SoilHealthCard,
  TaskPerfCard,
  FinancialCard,
  MarketPulseCard,
  RecommendationsCard,
  DisclaimerCard,
} from '@/components/analytics/AnalyticsSections';
import { ForecastChart } from '@/components/analytics/ForecastChart';
import { HarvestHistoryCard } from '@/components/analytics/HarvestHistoryCard';
import { aggregateFarm } from '@/lib/analytics/reportEngine';
import { formatINR, formatNumber } from '@/lib/analytics/formulas';

const RANGES: { value: DateRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'season', label: 'Season' },
  { value: 'year', label: '1Y' },
];

export default function Analytics() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<DateRange>((params.get('range') as DateRange) || '30d');
  const selectedLandId = params.get('land') || 'all';

  const { data, isLoading, refetch, isFetching } = useAnalyticsData(range);

  const setSelected = (id: string | 'all') => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('land');
    else next.set('land', id);
    setParams(next, { replace: true });
  };
  const setRangeAndUrl = (r: DateRange) => {
    setRange(r);
    const next = new URLSearchParams(params);
    next.set('range', r);
    setParams(next, { replace: true });
  };

  const perLand = data?.perLand ?? [];
  const aggregate = data?.aggregate ?? aggregateFarm([]);

  // Selected scope (all → aggregate; single → its analytics)
  const scope = useMemo(() => {
    if (selectedLandId === 'all') return null;
    return perLand.find((a) => a.land.id === selectedLandId) ?? null;
  }, [selectedLandId, perLand]);

  if (isLoading) return <AnalyticsSkeleton />;

  return (
    <div className="min-h-full bg-background">
      {/* Compact header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-3 pt-[env(safe-area-inset-top,8px)] pb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t('common.back', 'Back')}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">
              {t('analytics.title', 'Farm Analytics')}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {scope ? scope.land.name : t('analytics.all_farm', 'All Farm')} ·{' '}
              {formatNumber(scope ? scope.land.area_acres || 0 : aggregate.totalAreaAcres, 1)} ac
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t('common.refresh', 'Refresh')}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-foreground"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        </div>
        {/* Date range chips */}
        <div className="px-3 pb-2 flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRangeAndUrl(r.value)}
              className={cn(
                'flex-1 h-8 rounded-full text-xs font-semibold transition-colors',
                range === r.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {t(`analytics.range.${r.value}`, r.label)}
            </button>
          ))}
        </div>
      </header>

      <main className="px-3 py-3 space-y-3 pb-24">
        {/* Land selector */}
        <LandSelectorRail
          perLand={perLand}
          selectedId={selectedLandId as string | 'all'}
          onSelect={setSelected}
          totalAreaAcres={aggregate.totalAreaAcres}
        />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2">
          <KpiTile
            icon={<Layers className="w-4 h-4" />}
            label={t('analytics.kpi.area', 'Total area')}
            value={`${formatNumber(scope ? scope.land.area_acres || 0 : aggregate.totalAreaAcres, 1)} ac`}
          />
          <KpiTile
            icon={<Sprout className="w-4 h-4" />}
            label={t('analytics.kpi.crops', 'Active crops')}
            value={scope ? (scope.land.current_crop ? '1' : '0') : String(aggregate.activeCrops)}
          />
          <KpiTile
            icon={<TrendingUp className="w-4 h-4" />}
            label={t('analytics.kpi.revenue', 'Projected revenue')}
            value={formatINR(scope ? scope.projectedRevenue : aggregate.projectedRevenue)}
          />
          <KpiTile
            icon={<Wallet className="w-4 h-4" />}
            label={t('analytics.kpi.profit', 'Projected profit')}
            value={formatINR(scope ? scope.projectedProfit : aggregate.projectedProfit)}
            accent={(scope ? scope.projectedProfit : aggregate.projectedProfit) >= 0}
          />
        </div>

        {/* Per-land sections OR all-farm grid */}
        {perLand.length === 0 ? (
          <Card className="p-6 text-center bg-card border-border/60">
            <p className="text-sm font-semibold text-foreground mb-1">
              {t('analytics.empty.title', 'No data available')}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {t('analytics.empty.message', 'Add land and start tracking activities to see analytics.')}
            </p>
            <Button size="sm" onClick={() => navigate('/app/lands/add')}>
              {t('analytics.empty.cta', 'Add Land')}
            </Button>
          </Card>
        ) : scope ? (
          <div className="space-y-3">
            <ForecastChart landId={scope.land.id} />
            <RecommendationsCard a={scope} />
            <CropStageCard a={scope} />
            <WaterWeatherCard a={scope} />
            <SoilHealthCard a={scope} />
            <TaskPerfCard a={scope} />
            <FinancialCard a={scope} />
            <MarketPulseCard a={scope} />
            <HarvestHistoryCard landId={scope.land.id} />
            <DisclaimerCard />
          </div>
        ) : (
          <div className="space-y-3">
            <ForecastChart landId={null} />
            <HarvestHistoryCard landId={null} />
            {perLand.map((a) => (
              <Card
                key={a.land.id}
                className="bg-card border-border/60 p-3 active:scale-[0.99] transition-transform"
                onClick={() => setSelected(a.land.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    {a.land.ndvi_thumbnail_url ? (
                      <img src={a.land.ndvi_thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Layers className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{a.land.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {a.land.current_crop || t('analytics.no_crop_short', 'fallow')} ·{' '}
                      {formatNumber(a.land.area_acres || 0, 1)} ac
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase">{t('analytics.kpi.profit', 'Profit')}</p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        a.projectedProfit >= 0 ? 'text-primary' : 'text-destructive',
                      )}
                    >
                      {formatINR(a.projectedProfit)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[10px]">
                  <Mini label={t('analytics.kpi.ndvi', 'NDVI')} value={a.latestNdvi != null ? Math.round(a.latestNdvi * 100) + '%' : '—'} />
                  <Mini label={t('analytics.completion', 'Tasks')} value={a.tasks.total ? a.tasks.completionRate.toFixed(0) + '%' : '—'} />
                  <Mini label={t('analytics.kpi.yield', 'Yield')} value={formatNumber(a.expectedYieldQuintals, 0) + ' q'} />
                </div>
              </Card>
            ))}
            <DisclaimerCard />
          </div>
        )}
      </main>
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-3 bg-card border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <p className="text-[10px] text-muted-foreground uppercase leading-tight">{label}</p>
      </div>
      <p className={cn('text-base font-bold leading-tight', accent === false ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded p-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground">{value}</p>
    </div>
  );
}
