import React from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets } from 'lucide-react';

interface IrrigationGaugeProps {
  /** Currently depleted soil water in the root zone (mm). */
  depletionMm?: number | null;
  /** Readily available water (mm) — the irrigation trigger threshold. */
  rawMm?: number | null;
  /** Total available water (mm) — full bucket. */
  tawMm?: number | null;
  /** Crop evapotranspiration for the day (mm). */
  etcMm?: number | null;
}

/**
 * Soil-water bucket gauge. Shows how full the root zone is and how close the
 * crop is to the FAO-56 readily-available-water trigger.
 */
export function IrrigationGauge({ depletionMm, rawMm, tawMm, etcMm }: IrrigationGaugeProps) {
  const { t } = useTranslation();

  const taw = Number(tawMm ?? 0);
  const raw = Number(rawMm ?? 0);
  const depletion = Math.max(0, Number(depletionMm ?? 0));

  if (!taw) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('farmIntel.no_data')}</p>
      </div>
    );
  }

  const remaining = Math.max(0, taw - depletion);
  const fillPct = Math.min(100, Math.round((remaining / taw) * 100));
  const triggerPct = Math.min(100, Math.round(((taw - raw) / taw) * 100));
  const needsIrrigation = depletion >= raw && raw > 0;

  const statusKey = needsIrrigation
    ? 'farmIntel.irrigation.status_now'
    : fillPct < 60
      ? 'farmIntel.irrigation.status_soon'
      : 'farmIntel.irrigation.status_ok';

  const barColor = needsIrrigation ? 'bg-destructive' : fillPct < 60 ? 'bg-warning' : 'bg-primary';

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t('farmIntel.irrigation.title')}
          </span>
        </div>
        <span
          className={`text-xs font-semibold ${needsIrrigation ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {t(statusKey)}
        </span>
      </div>

      {/* Bucket */}
      <div className="relative h-24 w-full overflow-hidden rounded-lg border border-border/60 bg-muted">
        <div
          className={`absolute bottom-0 left-0 w-full transition-all duration-500 ${barColor}`}
          style={{ height: `${fillPct}%` }}
        />
        {/* Trigger line */}
        <div
          className="absolute left-0 w-full border-t-2 border-dashed border-foreground/40"
          style={{ bottom: `${triggerPct}%` }}
        >
          <span className="absolute -top-4 right-1 text-[10px] font-medium text-foreground/70">
            {t('farmIntel.irrigation.trigger')}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-foreground drop-shadow">{fillPct}%</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label={t('farmIntel.irrigation.available')} value={`${remaining.toFixed(0)} mm`} />
        <Metric label={t('farmIntel.irrigation.depleted')} value={`${depletion.toFixed(0)} mm`} />
        <Metric
          label={t('farmIntel.irrigation.crop_use')}
          value={etcMm != null ? `${Number(etcMm).toFixed(1)} mm` : '—'}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
