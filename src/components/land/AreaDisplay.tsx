import { Card } from '@/components/ui/card';
import { Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AreaDisplayProps {
  area: {
    sqft: number;
    guntha: number;
    acres: number;
  };
  pointsCount: number;
}

export function AreaDisplay({ area, pointsCount }: AreaDisplayProps) {
  const { t } = useTranslation();

  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 w-[min(92vw,420px)] flex flex-col items-center gap-2"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      {/* Compact top pill: points + acres always visible */}
      <Card className="pointer-events-auto px-3 py-1.5 bg-background/90 backdrop-blur-md shadow-lg rounded-full border border-border/60">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {pointsCount}
          </span>
          <span className="text-muted-foreground">
            {t('lands.map.area.points_marked', { count: pointsCount }).replace(/^\d+\s*/, '')}
          </span>
          {pointsCount >= 3 && (
            <>
              <span className="text-border">•</span>
              <Ruler className="h-3 w-3 text-primary" />
              <span className="text-foreground font-semibold">
                {area.acres.toFixed(3)} {t('lands.map.area.acres')}
              </span>
            </>
          )}
        </div>
      </Card>

      {/* Detailed metrics card — only after polygon closes */}
      {pointsCount >= 3 && (
        <Card className="pointer-events-auto w-full p-2 bg-background/90 backdrop-blur-md shadow-lg rounded-2xl border border-border/60">
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="bg-primary/10 rounded-xl py-1.5">
              <div className="text-sm font-bold text-primary leading-tight">
                {area.sqft.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('lands.map.area.sqft')}</div>
            </div>
            <div className="bg-primary/10 rounded-xl py-1.5">
              <div className="text-sm font-bold text-primary leading-tight">
                {area.guntha.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('lands.map.area.guntha')}</div>
            </div>
            <div className="bg-primary/10 rounded-xl py-1.5">
              <div className="text-sm font-bold text-primary leading-tight">
                {area.acres.toFixed(3)}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('lands.map.area.acres')}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
