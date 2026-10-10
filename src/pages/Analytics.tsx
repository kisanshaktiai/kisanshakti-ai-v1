/**
 * Farm Analytics — what the farmer's crop is costing and likely to bring.
 * Nothing is computed here: figures come from v_land_economics (weekly yield
 * engine) and the land state tables; the date chips only move the NDVI trend.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw, Layers, Sprout, Wallet, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AnalyticsSkeleton } from '@/components/skeletons';
import { useAnalyticsData, type DateRange } from '@/hooks/useAnalyticsData';
import { LandSelectorRail } from '@/components/analytics/LandSelectorRail';
import {
  MoneyHarvestCard, FieldConditionCard, WaterCard, WatchCard, TaskPerfCard, SoilHealthCard, DisclaimerCard,
} from '@/components/analytics/AnalyticsSections';
import { aggregateFarm } from '@/lib/analytics/reportEngine';
import { formatMoney, formatNumber, formatRange } from '@/lib/analytics/formulas';

const RANGES: DateRange[] = ['7d', '30d', 'season', '1y'];

export default function Analytics() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState<DateRange>((params.get('range') as DateRange) || '30d');
  const selectedLandId = params.get('land') || 'all';
  const locale = i18n.language;

  const { data, isLoading, refetch, isFetching } = useAnalyticsData(range);

  const setSelected = (id: string | 'all') => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('land'); else next.set('land', id);
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
  const scope = useMemo(() => (selectedLandId === 'all' ? null : perLand.find((a) => a.land.id === selectedLandId) ?? null), [selectedLandId, perLand]);

  if (isLoading) return <AnalyticsSkeleton />;

  const harvestValue = scope
    ? formatRange(scope.economics?.predicted_total_low_qtl, scope.economics?.predicted_total_high_qtl, 1, locale)
    : formatRange(aggregate.predictedTotalLowQtl, aggregate.predictedTotalHighQtl, 1, locale);
  const incomeValue = scope
    ? (scope.economics?.income_low != null ? `${formatMoney(scope.economics.income_low, locale)} – ${formatMoney(scope.economics.income_high, locale)}` : '—')
    : (aggregate.incomeLow != null ? `${formatMoney(aggregate.incomeLow, locale)} – ${formatMoney(aggregate.incomeHigh, locale)}` : '—');
  const areaValue = `${formatNumber(scope ? scope.land.area_acres ?? 0 : aggregate.totalAreaAcres, 1, locale)} ${t('analytics.units.acre', 'ac')}`;

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="px-3 pt-[env(safe-area-inset-top,8px)] pb-2 flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} aria-label={t('common.back', 'Back')}
            className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-foreground leading-tight truncate">{t('analytics.title', 'Farm Analytics')}</h1>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {scope ? scope.land.name : t('analytics.all_farm', 'All Farm')} · {areaValue}
              {data?.computedAt && ` · ${t('analytics.economics.updated_on', 'Updated {{date}}', { date: new Date(data.computedAt).toLocaleDateString(locale) })}`}
            </p>
          </div>
          <button type="button" onClick={() => refetch()} disabled={isFetching} aria-label={t('common.refresh', 'Refresh')}
            className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-foreground">
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </header>

      <main className="px-3 py-3 space-y-3 pb-24">
        <LandSelectorRail perLand={perLand} selectedId={selectedLandId} onSelect={setSelected} totalAreaAcres={aggregate.totalAreaAcres} />

        <div className="grid grid-cols-2 gap-2">
          <KpiTile icon={<Layers className="w-3.5 h-3.5" />} label={t('analytics.kpi.area', 'Total area')} value={areaValue} />
          <KpiTile icon={<Sprout className="w-3.5 h-3.5" />} label={t('analytics.kpi.crops', 'Active crops')}
            value={scope ? (scope.land.active_schedule_id ? '1' : '0') : String(aggregate.activeCrops)} />
          <KpiTile icon={<TrendingUp className="w-3.5 h-3.5" />} label={t('analytics.economics.expected_harvest', 'Expected harvest')}
            value={harvestValue === '—' ? t('analytics.economics.preparing', 'preparing…') : `${harvestValue} ${t('analytics.units.quintal', 'q')}`} />
          <KpiTile icon={<Wallet className="w-3.5 h-3.5" />} label={t('analytics.economics.expected_income', 'Expected income')}
            value={incomeValue === '—' ? t('analytics.economics.price_not_available', 'price not available yet') : incomeValue} />
        </div>

        {perLand.length === 0 ? (
          <Card className="p-6 text-center bg-card border-border/60">
            <p className="text-sm text-muted-foreground">{t('analytics.empty.message', 'Add land and start tracking activities to see analytics.')}</p>
          </Card>
        ) : scope ? (
          <div className="space-y-3">
            <MoneyHarvestCard a={scope} />
            <FieldConditionCard a={scope} />
            <WaterCard a={scope} />
            <WatchCard a={scope} onOpen={() => navigate('/app/chat')} />
            <TaskPerfCard a={scope} />
            <SoilHealthCard a={scope} />
            <button type="button" onClick={() => navigate(`/app/lands/${scope.land.id}/ndvi`)}
              className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
              {t('analytics.field.open_satellite', 'See the field from the satellite')}
            </button>
            <DisclaimerCard />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="px-1 pb-1 flex gap-1.5">
              {RANGES.map((r) => (
                <button key={r} type="button" onClick={() => setRangeAndUrl(r)}
                  className={cn('flex-1 h-8 rounded-full text-xs font-semibold transition-colors', range === r ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {t(`analytics.range.${r === '1y' ? 'year' : r}`, r)}
                </button>
              ))}
            </div>
            {perLand.map((a) => {
              const e = a.economics;
              const c = a.farmState?.canopy;
              return (
                <Card key={a.land.id} className="bg-card border-border/60 p-3 active:scale-[0.99] transition-transform" onClick={() => setSelected(a.land.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      <Layers className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{a.land.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {a.land.current_crop || t('analytics.no_crop_short', 'fallow')} · {formatNumber(a.land.area_acres ?? 0, 1, locale)} {t('analytics.units.acre', 'ac')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">{t('analytics.economics.expected_harvest', 'Expected harvest')}</p>
                      <p className="text-sm font-bold text-foreground">
                        {e?.predicted_total_qtl != null ? `${formatRange(e.predicted_total_low_qtl, e.predicted_total_high_qtl, 1, locale)} ${t('analytics.units.quintal', 'q')}` : t('analytics.economics.preparing', 'preparing…')}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[10px]">
                    <Mini label={t('analytics.field.growth', 'Growth')}
                      value={c?.vs_expected === 'below' ? t('analytics.canopy.below', 'less than normal') : c?.vs_expected ? t('analytics.canopy.within', 'normal') : '—'}
                      warn={c?.vs_expected === 'below'} />
                    <Mini label={t('analytics.completion', 'Tasks')} value={a.tasks.total ? `${a.tasks.completionRate.toFixed(0)}%` : '—'} />
                    <Mini label={t('analytics.watch.title', 'Watch')} value={String(a.watch.count)} warn={a.watch.count > 0} />
                  </div>
                </Card>
              );
            })}
            <DisclaimerCard />
          </div>
        )}
      </main>
    </div>
  );
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3 bg-card border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      </div>
      <p className="text-base font-bold leading-tight text-foreground">{value}</p>
    </Card>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="bg-muted/40 rounded p-1.5">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('font-bold', warn ? 'text-destructive' : 'text-foreground')}>{value}</p>
    </div>
  );
}
