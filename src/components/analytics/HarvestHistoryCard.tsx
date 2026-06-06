import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Trophy, Clock, Wheat, Share2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useHarvestHistory, aggregate, type HarvestHistoryRow } from '@/hooks/useHarvestHistory';
import { formatNumber } from '@/lib/analytics/formulas';

interface Props {
  landId?: string | null;
}

/**
 * Step 6 — Post-harvest analytics.
 *
 * Aggregates completed harvests for the current farmer (or a single land),
 * showing totals, season-over-season comparison, top-yielding plot and
 * recent history. All values derived from real crop_schedules rows.
 */
export function HarvestHistoryCard({ landId }: Props) {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useHarvestHistory(landId);
  const agg = useMemo(() => aggregate(rows || []), [rows]);

  if (isLoading) {
    return (
      <Card className="p-4 bg-card border-border/60">
        <div className="h-24 animate-pulse bg-muted/40 rounded" />
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="p-4 bg-card border-border/60">
        <div className="flex items-center gap-2 mb-1">
          <History className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">
            {t('analytics.harvest_history.title', 'Harvest history')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'analytics.harvest_history.empty',
            'No completed harvests yet. Confirm a harvest to start tracking yields.',
          )}
        </p>
      </Card>
    );
  }

  const seasonPair = agg.bySeason.slice(0, 2);
  const sov =
    seasonPair.length === 2 && seasonPair[1].yieldQtl > 0
      ? ((seasonPair[0].yieldQtl - seasonPair[1].yieldQtl) / seasonPair[1].yieldQtl) * 100
      : null;

  return (
    <Card className="p-4 bg-card border-border/60 space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">
          {t('analytics.harvest_history.title', 'Harvest history')}
        </p>
        <Badge variant="secondary" className="ml-auto">
          {agg.totalHarvests}
        </Badge>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat
          label={t('analytics.harvest_history.total_yield', 'Total yield')}
          value={`${formatNumber(agg.totalYieldQtl, 1)} q`}
        />
        <Stat
          label={t('analytics.harvest_history.avg_per_acre', 'Avg / acre')}
          value={agg.avgYieldPerAcreQtl != null ? `${formatNumber(agg.avgYieldPerAcreQtl, 1)} q` : '—'}
        />
        <Stat
          label={t('analytics.harvest_history.avg_days', 'Avg days')}
          value={agg.avgDaysToHarvest != null ? `${Math.round(agg.avgDaysToHarvest)}d` : '—'}
          icon={<Clock className="w-3 h-3" />}
        />
      </div>

      {/* Season comparison */}
      {sov != null && (
        <div className="rounded-md bg-muted/40 p-2 text-xs">
          <span className="text-muted-foreground">
            {t('analytics.harvest_history.sov', '{{a}} vs {{b}}', {
              a: seasonPair[0].season,
              b: seasonPair[1].season,
            })}
            :{' '}
          </span>
          <span className={cn('font-semibold', sov >= 0 ? 'text-primary' : 'text-destructive')}>
            {sov >= 0 ? '+' : ''}
            {sov.toFixed(1)}%
          </span>
          <span className="text-muted-foreground ml-1">
            ({formatNumber(seasonPair[0].yieldQtl, 1)} q vs {formatNumber(seasonPair[1].yieldQtl, 1)} q)
          </span>
        </div>
      )}

      {/* Top performer */}
      {agg.bestRow && agg.bestRow.yield_per_acre_qtl != null && (
        <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 p-2">
          <Trophy className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <p className="font-semibold text-foreground truncate">
              {agg.bestRow.crop_name || '—'} • {agg.bestRow.land_name}
            </p>
            <p className="text-muted-foreground">
              {formatNumber(agg.bestRow.yield_per_acre_qtl, 1)} q/ac •{' '}
              {agg.bestRow.actual_harvest_date || ''}
            </p>
          </div>
        </div>
      )}

      {/* Recent rows */}
      <div className="space-y-1.5">
        {rows.slice(0, 5).map((r) => (
          <HarvestRow key={r.schedule_id} row={r} />
        ))}
      </div>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-muted/40 rounded-md p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground uppercase">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-bold text-foreground leading-tight mt-0.5">{value}</p>
    </div>
  );
}

function HarvestRow({ row }: { row: HarvestHistoryRow }) {
  const { t } = useTranslation();
  const auto =
    row.harvest_response &&
    typeof row.harvest_response === 'object' &&
    (row.harvest_response as any).source === 'auto-confirm';

  const shareUrl = useMemo(() => {
    const parts = [
      `🌾 ${row.crop_name || ''}`,
      row.land_name ? `• ${row.land_name}` : '',
      row.actual_yield_quintals != null ? `\n${row.actual_yield_quintals} q` : '',
      row.area_acres ? ` on ${row.area_acres} ac` : '',
      row.actual_harvest_date ? `\n${row.actual_harvest_date}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `https://wa.me/?text=${encodeURIComponent(parts)}`;
  }, [row]);

  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-border/40 first:border-t-0">
      <Wheat className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {row.crop_name || '—'}
          <span className="text-muted-foreground"> • {row.land_name}</span>
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {row.actual_harvest_date || ''}
          {row.actual_yield_quintals != null ? ` • ${row.actual_yield_quintals} q` : ''}
          {row.yield_per_acre_qtl != null
            ? ` • ${formatNumber(row.yield_per_acre_qtl, 1)} q/ac`
            : ''}
          {auto ? ` • ${t('analytics.harvest_history.auto', 'auto')}` : ''}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        asChild
        aria-label={t('analytics.harvest_history.share', 'Share on WhatsApp')}
      >
        <a href={shareUrl} target="_blank" rel="noopener noreferrer">
          <Share2 className="w-3.5 h-3.5" />
        </a>
      </Button>
    </div>
  );
}
