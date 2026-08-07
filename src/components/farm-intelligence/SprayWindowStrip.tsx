import React from 'react';
import { useTranslation } from 'react-i18next';
import { SprayCan } from 'lucide-react';

interface SprayWindowStripProps {
  /** Hourly suitability labels, starting at the current hour. */
  window?: unknown;
  /** 0..1 overall spray suitability score for today. */
  score?: number | null;
}

type Suitability = 'good' | 'caution' | 'avoid';

const CLASS_MAP: Record<Suitability, string> = {
  good: 'bg-primary',
  caution: 'bg-warning',
  avoid: 'bg-destructive',
};

function normalize(v: unknown): Suitability {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('good') || s === 'ok' || s === 'safe') return 'good';
  if (s.startsWith('caut') || s === 'marginal') return 'caution';
  return 'avoid';
}

/** 24-hour (or shorter) spray-suitability strip. */
export function SprayWindowStrip({ window: windowData, score }: SprayWindowStripProps) {
  const { t } = useTranslation();

  const slots: Suitability[] = Array.isArray(windowData)
    ? (windowData as unknown[]).map(normalize)
    : [];

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">{t('farmIntel.no_data')}</p>
      </div>
    );
  }

  const startHour = new Date().getHours();
  const bestIdx = slots.findIndex((s) => s === 'good');

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SprayCan className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{t('farmIntel.spray.title')}</span>
        </div>
        {score != null && (
          <span className="text-xs font-medium text-muted-foreground">
            {t('farmIntel.spray.score', { value: Math.round(Number(score) * 100) })}
          </span>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {slots.map((s, i) => (
          <div key={i} className="flex min-w-[28px] flex-col items-center gap-1">
            <div className={`h-8 w-full rounded-sm ${CLASS_MAP[s]}`} aria-label={t(`farmIntel.spray.${s}`)} />
            <span className="text-[10px] text-muted-foreground">{(startHour + i) % 24}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {bestIdx >= 0
          ? t('farmIntel.spray.best_window', { hour: (startHour + bestIdx) % 24 })
          : t('farmIntel.spray.no_window')}
      </p>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {(['good', 'caution', 'avoid'] as Suitability[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${CLASS_MAP[s]}`} />
            {t(`farmIntel.spray.${s}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
