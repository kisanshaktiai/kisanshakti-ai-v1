/**
 * ForecastChart — 6-month income vs expense bar chart with profit line overlay.
 * Reads AI-generated rows from `analytics_forecasts` for the selected scope
 * (farm aggregate or single land).
 */
import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatINR } from '@/lib/analytics/formulas';
import { useAnalyticsForecast, type ForecastRow } from '@/hooks/useAnalyticsForecast';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

interface Props {
  landId?: string | null; // null/undefined → farm aggregate
}

function monthLabel(iso: string, lang: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang, { month: 'short', year: '2-digit' });
}

export function ForecastChart({ landId }: Props) {
  const { t, i18n } = useTranslation();
  const { data: rows, isLoading, refresh, dataUpdatedAt } = useAnalyticsForecast(6);

  const scoped = useMemo<ForecastRow[]>(() => {
    if (!rows) return [];
    return landId
      ? rows.filter((r) => r.scope === 'land' && r.land_id === landId)
      : rows.filter((r) => r.scope === 'farm');
  }, [rows, landId]);

  const totalIncome = scoped.reduce((s, r) => s + (Number(r.projected_revenue) || 0), 0);
  const totalExpense = scoped.reduce((s, r) => s + (Number(r.projected_expense) || 0), 0);
  const totalProfit = totalIncome - totalExpense;
  const aiNote = scoped.find((r) => r.ai_reasoning)?.ai_reasoning ?? null;
  const lastUpdated = scoped[0]?.generated_for_month;

  if (!isLoading && scoped.length === 0) {
    return (
      <Card className="bg-card border-border/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground">
              {t('analytics.forecast.title', '6-Month Forecast')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('analytics.forecast.empty', 'No AI forecast yet. Generate one to see projections.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            {refresh.isPending
              ? t('analytics.forecast.generating', 'Generating…')
              : t('analytics.forecast.generate', 'Generate')}
          </button>
        </div>
      </Card>
    );
  }

  const labels = scoped.map((r) => monthLabel(r.forecast_month, i18n.language));
  const income = scoped.map((r) => Math.max(0, Number(r.projected_revenue) || 0));
  const expense = scoped.map((r) => Math.max(0, Number(r.projected_expense) || 0));
  const profit = scoped.map((r) => Number(r.projected_profit) || 0);

  return (
    <Card className="bg-card border-border/60 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">
              {t('analytics.forecast.title', '6-Month Forecast')}
            </h3>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary border-0">
              <Sparkles className="w-2.5 h-2.5 mr-0.5" />
              AI
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('analytics.forecast.subtitle', 'Income vs expense projection — refreshed monthly')}
            {lastUpdated && ` · ${new Date(lastUpdated).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          aria-label={t('common.refresh', 'Refresh')}
          className="w-8 h-8 rounded-full bg-muted text-foreground flex items-center justify-center shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', refresh.isPending && 'animate-spin')} />
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-primary/10 rounded-lg p-2">
          <p className="text-[9px] text-muted-foreground uppercase">{t('analytics.forecast.income', 'Income')}</p>
          <p className="text-xs font-bold text-primary truncate">{formatINR(totalIncome)}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <p className="text-[9px] text-muted-foreground uppercase">{t('analytics.forecast.expense', 'Expense')}</p>
          <p className="text-xs font-bold text-foreground truncate">{formatINR(totalExpense)}</p>
        </div>
        <div className={cn('rounded-lg p-2', totalProfit >= 0 ? 'bg-primary/15' : 'bg-destructive/15')}>
          <p className="text-[9px] text-muted-foreground uppercase">{t('analytics.forecast.profit', 'Profit')}</p>
          <p className={cn('text-xs font-bold truncate', totalProfit >= 0 ? 'text-primary' : 'text-destructive')}>
            {formatINR(totalProfit)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-56">
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: t('analytics.forecast.income', 'Income'),
                data: income,
                backgroundColor: 'hsl(var(--primary) / 0.85)',
                borderRadius: 6,
                borderSkipped: false,
                stack: 'flow',
                order: 2,
              },
              {
                label: t('analytics.forecast.expense', 'Expense'),
                data: expense.map((v) => -v),
                backgroundColor: 'hsl(var(--destructive) / 0.7)',
                borderRadius: 6,
                borderSkipped: false,
                stack: 'flow',
                order: 2,
              },
              {
                type: 'line' as const,
                label: t('analytics.forecast.profit', 'Profit'),
                data: profit,
                borderColor: 'hsl(var(--foreground))',
                backgroundColor: 'hsl(var(--foreground))',
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: 'hsl(var(--background))',
                order: 1,
              } as any,
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: { boxWidth: 10, font: { size: 10 }, color: 'hsl(var(--foreground))' },
              },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const v = Math.abs(Number(ctx.parsed.y) || 0);
                    return `${ctx.dataset.label}: ${formatINR(v * (ctx.dataset.label === t('analytics.forecast.profit', 'Profit') ? Math.sign(Number(ctx.parsed.y) || 0) || 1 : 1))}`;
                  },
                },
              },
            },
            scales: {
              x: {
                stacked: false,
                grid: { display: false },
                ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } },
              },
              y: {
                grid: { color: 'hsl(var(--border) / 0.5)' },
                ticks: {
                  color: 'hsl(var(--muted-foreground))',
                  font: { size: 10 },
                  callback: (v) => {
                    const n = Math.abs(Number(v));
                    if (n >= 1_00_000) return `₹${(Number(v) / 1_00_000).toFixed(1)}L`;
                    if (n >= 1000) return `₹${(Number(v) / 1000).toFixed(0)}k`;
                    return `₹${v}`;
                  },
                },
              },
            },
          }}
        />
      </div>

      {aiNote && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 flex gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[11px] text-foreground leading-snug">{aiNote}</p>
        </div>
      )}
    </Card>
  );
}
