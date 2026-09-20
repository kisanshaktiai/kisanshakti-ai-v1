import { useTranslation } from 'react-i18next';
import { Droplets } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * "Water in the field." Not an index: a sentence built from the FAO-56 water
 * balance the `weather` edge function derives (irrigation_needed, water
 * deficit, effective rain, balance status) confirmed or contradicted by the
 * satellite moisture signal (NDMI).
 * The sentence strengthens only as independent sources agree.
 */
export function WaterCard({ sky }: { sky: FieldSky }) {
  const { t } = useTranslation();
  const w = sky.water;
  const level: 'ok' | 'watch' | 'warn' = w.agreeing >= 3 ? 'warn' : w.agreeing >= 1 ? 'watch' : 'ok';

  const sentence = (() => {
    if (level === 'warn') return t('sky.water.warn', 'Soil water is running low and the crop\'s moisture signal has fallen since the last view. Check for wilting and irrigate if you can.');
    if (level === 'watch') {
      if (w.irrigationNeeded) return t('sky.water.depleted', 'The soil water balance says the field needs water. The satellite has not seen a change yet.');
      if (w.ndmiDrop != null && w.ndmiDrop >= 0.05) return t('sky.water.ndmi_drop', 'The crop\'s moisture signal fell since the last view. Keep an eye on the field this week.');
      return t('sky.water.watch', 'One sign of drying, not confirmed yet. Keep an eye on the field.');
    }
    if (w.asOf || w.ndmi != null) return t('sky.water.ok', 'No sign of water shortage right now.');
    return t('sky.water.none', 'Not enough weather and satellite data yet to judge water.');
  })();

  return (
    <Card className={cn('rounded-3xl border', level === 'warn' ? 'border-warning/40 bg-warning/5' : 'border-border/40')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Droplets className={cn('h-4 w-4', level === 'warn' ? 'text-warning' : 'text-info')} />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('sky.water.title', 'Water in the field')}</p>
        </div>
        <p className="text-sm font-medium leading-snug">{sentence}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip on={w.ndmiDrop != null && w.ndmiDrop >= 0.05} label={t('sky.water.chip_sat', 'satellite moisture')} />
          <Chip on={w.irrigationNeeded === true} label={t('sky.water.chip_soil', 'soil water')} />
          <Chip on={w.rainMm != null && w.rainMm < 1} label={t('sky.water.chip_rain', 'no recent rain')} />
          {w.surfaceEvidencePx != null && w.surfaceEvidencePx > 0 && <Chip on label={t('sky.water.chip_standing', 'standing water seen')} />}
        </div>
        {w.asOf && <p className="text-[11px] text-muted-foreground mt-2">{t('sky.water.as_of', 'Weather balance as of {{date}}', { date: w.asOf.slice(0, 10) })}</p>}
      </CardContent>
    </Card>
  );
}

function Chip({ on, label }: { on: boolean; label: string }) {
  return <span className={cn('text-[11px] px-2 py-0.5 rounded-full border', on ? 'bg-warning/15 border-warning/40 text-foreground' : 'bg-muted/40 border-border/40 text-muted-foreground')}>{label}</span>;
}
