import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { phSide, scalePosition, type SoilBand, type SoilReading } from '@/lib/soilInterpretation';

/**
 * Soil visuals: one picture per reading so a farmer sees "where my soil sits"
 * before reading a number. Colours are theme tokens only; band edges come from
 * the governed rating row carried on the reading (never from this file).
 */

export const BAND_TONE: Record<SoilBand, { chip: string; fill: string; text: string }> = {
  low: { chip: 'bg-destructive-soft text-destructive', fill: 'bg-destructive', text: 'text-destructive' },
  medium: { chip: 'bg-warning-soft text-warning-foreground', fill: 'bg-warning', text: 'text-warning-foreground' },
  high: { chip: 'bg-success-soft text-success', fill: 'bg-success', text: 'text-success' },
};

export function useSoilNumber() {
  const { i18n } = useTranslation();
  return (v: number | null, digits = 1) =>
    v === null ? '—' : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits }).format(v);
}

/** Track with a marker. Banded: low / medium / high zones from the governed row. pH: the acid → alkaline colour run with neutral 7 marked. */
export function SoilScale({ reading, kind }: { reading: SoilReading; kind: 'banded' | 'ph' }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const fmt = useSoilNumber();
  const v = reading.value;
  if (v === null) return null;

  let min = 0, max = 1, zones: Array<{ from: number; to: number; cls: string }> = [];
  if (kind === 'ph') {
    min = 3; max = 11;
  } else if (reading.bands) {
    const { lowBelow, highAbove } = reading.bands;
    max = Math.max(highAbove * 1.6, v * 1.1);
    zones = [
      { from: 0, to: lowBelow, cls: 'bg-destructive/25' },
      { from: lowBelow, to: highAbove, cls: 'bg-warning/30' },
      { from: highAbove, to: max, cls: 'bg-success/30' },
    ];
  } else {
    return null; // no governed band → no zoned picture, the value stands alone
  }
  const pos = scalePosition(v, min, max);
  const label = kind === 'ph'
    ? t('soil.scale.phAria', { value: fmt(v), side: t(`soil.side.${phSide(v)}`) })
    : t('soil.scale.bandAria', { value: fmt(v, 2), band: reading.band ? t(`soil.${reading.band}`) : '' });

  return (
    <div className="mt-3" role="img" aria-label={label}>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
        {kind === 'ph' ? (
          <div className="absolute inset-0 bg-gradient-to-r from-destructive/45 via-success/45 to-info/45" />
        ) : zones.map((z) => (
          <div key={z.from} className={cn('absolute inset-y-0', z.cls)}
            style={{ left: `${scalePosition(z.from, min, max)}%`, width: `${scalePosition(z.to, min, max) - scalePosition(z.from, min, max)}%` }} />
        ))}
        {kind === 'ph' && <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${scalePosition(7, min, max)}%` }} />}
      </div>
      <div className="relative h-0">
        <motion.span aria-hidden className="absolute -top-[18px] h-[22px] w-[22px] -translate-x-1/2 rounded-full border-[3px] border-background bg-foreground shadow-md"
          initial={{ left: reduceMotion ? `${pos}%` : '0%' }} animate={{ left: `${pos}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        {kind === 'ph' ? (
          <><span>{t('soil.acidic')}</span><span>{fmt(7, 0)}</span><span>{t('soil.alkaline')}</span></>
        ) : (
          <><span>{t('soil.low')}</span><span>{t('soil.medium')}</span><span>{t('soil.high')}</span></>
        )}
      </div>
    </div>
  );
}

/** One reading: name, big value, its picture, and either its governed verdict or why there is none. */
export function SoilReadingCard({ icon: Icon, title, reading, unit, scale, help, digits = 1, className }: {
  icon: LucideIcon; title: string; reading: SoilReading; unit?: string | null; scale: 'banded' | 'ph';
  help?: string | null; digits?: number; className?: string;
}) {
  const { t } = useTranslation();
  const fmt = useSoilNumber();
  const v = reading.value;
  const why = reading.noVerdictReason && reading.noVerdictReason !== 'no_rating' ? t(`soil.why.${reading.noVerdictReason}`) : null;
  return (
    <div className={cn('rounded-3xl border border-border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10"><Icon className="h-4 w-4 text-primary" /></span>
          {title}
        </p>
        {reading.band && <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', BAND_TONE[reading.band].chip)}>{t(`soil.${reading.band}`)}</span>}
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">
        {v === null ? <span className="text-lg text-muted-foreground">{t('soil.notMeasured')}</span> : fmt(v, digits)}
        {v !== null && unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {scale === 'ph' && v !== null && (
        <p className="mt-1 text-xs text-muted-foreground">{t(`soil.phSay.${phSide(v)}`, { neutral: fmt(7, 0) })}</p>
      )}
      <SoilScale reading={reading} kind={scale} />
      {why && <p className="mt-3 text-xs text-muted-foreground">{why}</p>}
      {help && <p className="mt-2 text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

/** N, P, K side by side as three capsules filled to their governed band; missing values are locked behind a lab test. */
export function NutrientTrio({ readings, lockedLabel }: { readings: Array<{ letter: string; name: string; reading: SoilReading; unit: string }>; lockedLabel: string }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const fmt = useSoilNumber();
  const level = (b: SoilBand | null) => (b === 'low' ? 33 : b === 'medium' ? 66 : b === 'high' ? 100 : 0);
  return (
    <div className="grid grid-cols-3 gap-2">
      {readings.map(({ letter, name, reading, unit }) => {
        const has = reading.value !== null;
        const fill = level(reading.band);
        return (
          <div key={letter} className={cn('flex flex-col items-center rounded-3xl border p-3 text-center', has ? 'border-border bg-card' : 'border-dashed border-border bg-muted/40')}>
            <div className="relative h-24 w-10 overflow-hidden rounded-full bg-muted" role="img"
              aria-label={has ? `${name}: ${fmt(reading.value, 0)} ${unit}${reading.band ? ` — ${t(`soil.${reading.band}`)}` : ''}` : `${name}: ${lockedLabel}`}>
              {has && reading.band && (
                <motion.div className={cn('absolute inset-x-0 bottom-0', BAND_TONE[reading.band].fill)}
                  initial={{ height: reduceMotion ? `${fill}%` : '0%' }} animate={{ height: `${fill}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
              )}
              <span className={cn('absolute inset-x-0 top-2 grid place-items-center text-lg font-black', has ? 'text-foreground' : 'text-muted-foreground')}>
                {has ? letter : <Lock className="h-4 w-4" />}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold text-foreground">{name}</p>
            {has ? (
              <>
                <p className="text-sm font-bold tabular-nums text-foreground">{fmt(reading.value, 0)}<span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</span></p>
                {reading.band
                  ? <span className={cn('mt-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', BAND_TONE[reading.band].chip)}>{t(`soil.${reading.band}`)}</span>
                  : reading.noVerdictReason === 'rating_under_review' && <span className="mt-1 text-[10px] leading-tight text-muted-foreground">{t('soil.why.short_review')}</span>}
              </>
            ) : (
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{lockedLabel}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Sand, silt and clay as one bar, so the soil's make-up reads at a glance. */
export function TextureBar({ shares }: { shares: { sand: number; silt: number; clay: number } }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const fmt = useSoilNumber();
  const parts = [
    { key: 'sand', value: shares.sand, cls: 'bg-warning' },
    { key: 'silt', value: shares.silt, cls: 'bg-chart-2' },
    { key: 'clay', value: shares.clay, cls: 'bg-chart-3' },
  ] as const;
  const label = parts.map((p) => `${t(`soil.${p.key}`)} ${fmt(p.value, 0)}%`).join(', ');
  return (
    <div>
      <div className="flex h-5 w-full overflow-hidden rounded-full" role="img" aria-label={label}>
        {parts.map((p, i) => (
          <motion.div key={p.key} className={cn('h-full', p.cls)} initial={{ width: reduceMotion ? `${p.value}%` : '0%' }}
            animate={{ width: `${p.value}%` }} transition={{ duration: 0.7, delay: reduceMotion ? 0 : i * 0.12, ease: 'easeOut' }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2">
            <span className={cn('h-3 w-3 shrink-0 rounded-full', p.cls)} />
            <div>
              <p className="text-[11px] text-muted-foreground">{t(`soil.${p.key}`)}</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{fmt(p.value, 0)}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
