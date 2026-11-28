import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Layers, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface AreaDisplayProps {
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  pointsCount: number;
  /** Shown in the pill until the first point is marked (the land's name when editing). */
  title?: string;
  onBack: () => void;
  mapType: 'hybrid' | 'roadmap';
  onToggleMapType: () => void;
}

/**
 * The map screen's top bar: back, the status pill (what is marked and the
 * area so far), and the satellite/map toggle. One row, so nothing sits on
 * top of anything else; Google's own controls in that corner are turned off.
 * The three-unit card appears under it once the shape is closed.
 */
export function AreaDisplay({ area, pointsCount, title, onBack, mapType, onToggleMapType }: AreaDisplayProps) {
  const { t } = useTranslation();
  const round = 'h-11 w-11 shrink-0 rounded-full bg-background/95 backdrop-blur-md shadow-lg border-border/60';

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-30 flex flex-col items-center gap-2 px-3"
      style={{ top: 'calc(var(--safe-top) + 12px)' }}
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-2">
        <Button variant="outline" size="icon" onClick={onBack} aria-label={t('common.back')} className={round}>
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <Card className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border border-border/60 bg-background/95 px-3 shadow-lg backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            {pointsCount === 0 && title ? (
              <span className="truncate text-foreground">{title}</span>
            ) : (
              <>
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {pointsCount}
                </span>
                <span className="truncate text-muted-foreground">
                  {t('lands.map.area.points_marked', { count: pointsCount }).replace(/^\d+\s*/, '')}
                </span>
                {pointsCount >= 3 && (
                  <>
                    <Ruler className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="whitespace-nowrap font-semibold text-foreground">
                      {area.acres.toFixed(2)} {t('lands.map.area.acres')}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </Card>

        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMapType}
          aria-label={t(mapType === 'hybrid' ? 'lands.map.layers.show_map' : 'lands.map.layers.show_satellite')}
          aria-pressed={mapType === 'hybrid'}
          className={cn(round, mapType === 'hybrid' && 'text-primary')}
        >
          <Layers className="h-5 w-5" />
        </Button>
      </div>

      {pointsCount >= 3 && (
        <Card className="pointer-events-auto w-full max-w-md rounded-2xl border border-border/60 bg-background/95 p-2 shadow-lg backdrop-blur-md">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            {[
              { value: area.sqft.toLocaleString(), unit: t('lands.map.area.sqft') },
              { value: area.guntha.toFixed(2), unit: t('lands.map.area.guntha') },
              { value: area.acres.toFixed(3), unit: t('lands.map.area.acres') },
            ].map(({ value, unit }) => (
              <div key={unit} className="rounded-xl bg-primary/10 py-1.5">
                <div className="text-sm font-bold leading-tight text-primary tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{unit}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
