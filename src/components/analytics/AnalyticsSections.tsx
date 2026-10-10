/**
 * Analytics cards. Every number here was computed on the server; every word
 * comes from i18n (analytics.*) with numbers interpolated. Colours and type
 * are theme tokens only.
 */
import React, { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler,
} from 'chart.js';
import { Wallet, Sprout, Droplets, TestTube, CheckCircle2, Eye, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import type { LandAnalytics, ExplanationItem } from '@/lib/analytics/reportEngine';
import { formatNumber, formatMoney, formatRange } from '@/lib/analytics/formulas';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const chartBase = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

export function SectionCard({ icon, title, subtitle, children, tone = 'default' }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode; tone?: 'default' | 'primary';
}) {
  return (
    <Card className={cn('bg-card border-border/60 p-4 space-y-3', tone === 'primary' && 'border-primary/40')}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>;
}

function Chip({ label, state }: { label: string; state: 'good' | 'warn' | 'none' }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
      state === 'good' && 'bg-primary/10 text-primary',
      state === 'warn' && 'bg-destructive/10 text-destructive',
      state === 'none' && 'bg-muted text-muted-foreground',
    )}>{label}</span>
  );
}

/** Farmer-language sentence for an explanation code. Unknown codes are not shown. */
function useWhy() {
  const { t, i18n } = useTranslation();
  return (items: ExplanationItem[] | null | undefined): string[] =>
    (items ?? [])
      .map((e) => {
        const key = `analytics.why.${e.code}`;
        const text = t(key, { ...e, defaultValue: '' });
        return text ? String(text) : '';
      })
      .filter(Boolean)
      .map((s) => s.replace(/\{\{date\}\}/g, new Date().toLocaleDateString(i18n.language)));
}

// ─── 1. Money & harvest ────────────────────────────────────────────────────
export function MoneyHarvestCard({ a }: { a: LandAnalytics }) {
  const { t, i18n } = useTranslation();
  const why = useWhy();
  const e = a.economics;
  const locale = i18n.language;
  const hasEstimate = e?.predicted_total_qtl != null;
  const trend = e?.explanation?.find((x) => x.code.startsWith('trend_'))?.code;
  const TrendIcon = trend === 'trend_up' ? TrendingUp : trend === 'trend_down' ? TrendingDown : Minus;

  return (
    <SectionCard
      icon={<Wallet className="w-4 h-4" />}
      title={t('analytics.economics.title', 'Your crop, in money')}
      subtitle={e?.computed_at
        ? t('analytics.economics.updated_on', 'Updated {{date}}', { date: new Date(e.computed_at).toLocaleDateString(locale) })
        : undefined}
      tone="primary"
    >
      {!hasEstimate ? (
        <Hint>{t('analytics.economics.not_ready', 'The estimate for this field is being prepared. It will appear here by itself once the field data is in.')}</Hint>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground">{t('analytics.economics.spent_so_far', 'Spent so far')}</p>
              <p className="text-base font-bold text-foreground">
                {e!.spent_rows > 0 ? formatMoney(e!.spent_confirmed, locale) : t('analytics.economics.nothing_recorded', 'nothing recorded yet')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">{t('analytics.economics.more_till_harvest', 'More till harvest')}</p>
              <p className="text-base font-bold text-foreground">
                {e!.estimate_rows > 0 ? formatMoney(e!.estimated_remaining, locale) : t('analytics.economics.not_available', 'not available yet')}
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-primary/5 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">{t('analytics.economics.expected_harvest', 'Expected harvest')}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold text-foreground">
                {formatRange(e!.predicted_total_low_qtl, e!.predicted_total_high_qtl, 1, locale)}{' '}
                <span className="text-sm font-medium text-muted-foreground">{t('analytics.units.quintal', 'q')}</span>
              </p>
              {trend && <TrendIcon className={cn('w-4 h-4', trend === 'trend_down' ? 'text-destructive' : 'text-primary')} />}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('analytics.economics.expected_income', 'Expected income')}:{' '}
              <span className="font-semibold text-foreground">
                {e!.income_low != null
                  ? `${formatMoney(e!.income_low, locale)} – ${formatMoney(e!.income_high, locale)}`
                  : t('analytics.economics.price_not_available', 'price not available yet')}
              </span>
            </p>
          </div>
          {why(e!.explanation).slice(0, 2).map((line, i) => <Hint key={i}>{line}</Hint>)}
          <div className="flex flex-wrap gap-1.5">
            <Chip
              label={t('analytics.factor.canopy', 'Crop growth')}
              state={e!.factors?.canopy ? (e!.factors.canopy.vs_expected === 'below' ? 'warn' : 'good') : 'none'}
            />
            {['water', 'thermal', 'soil', 'pest'].map((f) => (
              <Chip key={f} label={t(`analytics.factor.${f}`, f)} state={e!.factors?.[f] ? (e!.factors[f].value < 1 ? 'warn' : 'good') : 'none'} />
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ─── 2. Field condition ────────────────────────────────────────────────────
export function FieldConditionCard({ a }: { a: LandAnalytics }) {
  const { t, i18n } = useTranslation();
  const fs = a.farmState;
  const c = fs?.canopy ?? null;
  const canopyWord = c?.vs_expected === 'below'
    ? t('analytics.canopy.below', 'less than normal')
    : c?.vs_expected === 'above'
      ? t('analytics.canopy.above', 'more than normal')
      : c?.vs_expected ? t('analytics.canopy.within', 'normal') : null;
  const stageLabel = fs?.growth_stage ? t(`analytics.stage.${fs.growth_stage}`, fs.growth_stage) : null;

  return (
    <SectionCard
      icon={<Sprout className="w-4 h-4" />}
      title={t('analytics.field.title', 'How the crop is doing')}
      subtitle={a.land.current_crop || t('analytics.no_crop', 'No active crop')}
    >
      {!fs ? (
        <Hint>{t('analytics.field.no_state', 'Field data is not in yet.')}</Hint>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.field.stage', 'Stage')}</p>
            <p className="text-sm font-bold text-foreground truncate">{stageLabel ?? '—'}</p>
            {fs.das != null && <p className="text-[10px] text-muted-foreground">{t('analytics.field.days_since_sowing', '{{n}} days', { n: fs.das })}</p>}
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.field.growth', 'Growth')}</p>
            <p className={cn('text-sm font-bold', c?.vs_expected === 'below' ? 'text-destructive' : 'text-foreground')}>{canopyWord ?? '—'}</p>
            {c?.date && <p className="text-[10px] text-muted-foreground">{t('analytics.field.satellite_on', 'satellite {{date}}', { date: new Date(c.date).toLocaleDateString(i18n.language) })}</p>}
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.field.harvest', 'Harvest')}</p>
            <p className="text-sm font-bold text-foreground">
              {a.economics?.expected_harvest_date ? new Date(a.economics.expected_harvest_date).toLocaleDateString(i18n.language) : '—'}
            </p>
          </div>
        </div>
      )}
      {a.ndviTrend.length > 1 && (
        <div className="h-20">
          <Line
            data={{
              labels: a.ndviTrend.map((p) => new Date(p.date).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' })),
              datasets: [{
                data: a.ndviTrend.map((p) => p.value),
                borderColor: 'hsl(var(--primary))', backgroundColor: 'hsl(var(--primary) / 0.15)',
                fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
              }],
            }}
            options={{ ...chartBase, scales: { x: { display: false }, y: { display: false, min: 0, max: 1 } } }}
          />
        </div>
      )}
    </SectionCard>
  );
}

// ─── 3. Water ──────────────────────────────────────────────────────────────
export function WaterCard({ a }: { a: LandAnalytics }) {
  const { t, i18n } = useTranslation();
  const w = a.weather;
  return (
    <SectionCard
      icon={<Droplets className="w-4 h-4" />}
      title={t('analytics.water.title', 'Water')}
      subtitle={w ? t('analytics.water.as_of', 'as of {{date}}', { date: new Date(w.metric_date).toLocaleDateString(i18n.language) }) : undefined}
    >
      {!w ? (
        <Hint>{t('analytics.water.no_data', 'Water data for this field is not in yet.')}</Hint>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.water.crop_use_today', 'Crop used today')}</p>
            <p className="text-sm font-bold text-foreground">{formatNumber(w.etc_mm, 1, i18n.language)} <span className="text-[10px] font-normal">{t('analytics.units.mm', 'mm')}</span></p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.water.rain_today', 'Rain today')}</p>
            <p className="text-sm font-bold text-foreground">{formatNumber(w.total_rainfall_mm, 1, i18n.language)} <span className="text-[10px] font-normal">{t('analytics.units.mm', 'mm')}</span></p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t('analytics.water.soil_short_by', 'Soil short by')}</p>
            <p className="text-sm font-bold text-foreground">{formatNumber(w.root_depletion_mm, 0, i18n.language)} <span className="text-[10px] font-normal">{t('analytics.units.mm', 'mm')}</span></p>
          </div>
        </div>
      )}
      <Hint>{t('analytics.water.see_farm_today', 'Whether to irrigate is decided on the Farm Today screen.')}</Hint>
    </SectionCard>
  );
}

// ─── 4. Watch (open decisions, de-duplicated) ──────────────────────────────
export function WatchCard({ a, onOpen }: { a: LandAnalytics; onOpen: () => void }) {
  const { t } = useTranslation();
  const cats = Object.entries(a.watch.byCategory);
  return (
    <SectionCard icon={<Eye className="w-4 h-4" />} title={t('analytics.watch.title', 'Things to watch')}>
      {a.watch.count === 0 ? (
        <Hint>{t('analytics.watch.none', 'Nothing open for this field right now.')}</Hint>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {cats.map(([cat, n]) => (
              <Chip key={cat} label={`${t(`analytics.watch.category.${cat}`, cat)} · ${n}`} state={n > 0 ? 'warn' : 'none'} />
            ))}
          </div>
          <button type="button" onClick={onOpen} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
            {t('analytics.watch.open_farm_today', 'See them on Farm Today')}
          </button>
        </>
      )}
    </SectionCard>
  );
}

// ─── 5. Tasks ──────────────────────────────────────────────────────────────
export function TaskPerfCard({ a }: { a: LandAnalytics }) {
  const { t } = useTranslation();
  return (
    <SectionCard icon={<CheckCircle2 className="w-4 h-4" />} title={t('analytics.sections.tasks', 'Task Performance')}
      subtitle={t('analytics.tasks_total', '{{n}} tasks', { n: a.tasks.total })}>
      {a.tasks.total === 0 ? (
        <Hint>{t('analytics.tasks_empty', 'No tasks yet')}</Hint>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('analytics.completion', 'Completion')}</span>
            <span className="text-sm font-bold text-foreground">{a.tasks.completionRate.toFixed(0)}%</span>
          </div>
          <Progress value={a.tasks.completionRate} className="h-2" />
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div><p className="text-muted-foreground">{t('analytics.on_time', 'On time')}</p><p className="font-bold text-foreground">{a.tasks.onTimeRate.toFixed(0)}%</p></div>
            <div><p className="text-muted-foreground">{t('analytics.delayed', 'Delayed')}</p><p className="font-bold text-destructive">{a.tasks.delayed}</p></div>
            <div><p className="text-muted-foreground">{t('analytics.pending', 'Pending')}</p><p className="font-bold text-foreground">{a.tasks.pending}</p></div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── 6. Soil (source-aware) ────────────────────────────────────────────────
export function SoilHealthCard({ a }: { a: LandAnalytics }) {
  const { t, i18n } = useTranslation();
  const s = a.soil;
  if (!s) {
    return (
      <SectionCard icon={<TestTube className="w-4 h-4" />} title={t('analytics.sections.soil', 'Soil Health')}>
        <Hint>{t('analytics.soil_empty', 'No soil data yet')}</Hint>
      </SectionCard>
    );
  }
  const isTest = !!s.test_date && !!s.source && !/soilgrids|model|estimate/i.test(s.source);
  return (
    <SectionCard icon={<TestTube className="w-4 h-4" />} title={t('analytics.sections.soil', 'Soil Health')}
      subtitle={isTest
        ? t('analytics.tested_on', 'Tested {{date}}', { date: new Date(s.test_date!).toLocaleDateString(i18n.language) })
        : t('analytics.soil.estimated', 'Estimated from soil maps — not a lab test')}>
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['ph', s.ph_level, 1], ['n', s.nitrogen_kg_per_ha, 0], ['p', s.phosphorus_kg_per_ha, 0], ['k', s.potassium_kg_per_ha, 0]] as const).map(([k, v, d]) => (
          <div key={k} className="rounded-lg bg-muted/40 p-2">
            <p className="text-[10px] text-muted-foreground">{t(`analytics.soil.${k}`, k.toUpperCase())}</p>
            <p className="text-sm font-bold text-foreground">{formatNumber(v, d, i18n.language)}</p>
          </div>
        ))}
      </div>
      {!isTest && <Hint><AlertTriangle className="inline w-3 h-3 mr-1" />{t('analytics.soil.get_tested', 'A soil test from the lab will make this exact.')}</Hint>}
    </SectionCard>
  );
}

export const DisclaimerCard = forwardRef<HTMLDivElement>(function DisclaimerCard(_, ref) {
  const { t } = useTranslation();
  return (
    <Card ref={ref} className="bg-muted/40 border-border/60 p-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t('analytics.disclaimer.body', '')}</p>
    </Card>
  );
});
