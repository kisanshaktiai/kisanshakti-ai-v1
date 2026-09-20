import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * "Compared to the crop around me." Two bars: my field vs the ring of crop the
 * pipeline measured around it on the same pass (ndvi_intelligence). Neighbours
 * had the same weather, so the difference is the field itself.
 */
export function NeighbourCard({ sky }: { sky: FieldSky }) {
  const { t } = useTranslation();
  const { neighbours: nb, latest } = sky;
  const mine = latest?.ndvi_value != null ? Number(latest.ndvi_value) : null;
  const around = mine != null && nb.delta != null ? mine - nb.delta : null;

  const sentence = (() => {
    switch (nb.state) {
      case 'well_behind': return t('sky.nb.well_behind', 'Your field is clearly behind the crop around it.');
      case 'behind': return t('sky.nb.behind', 'Your field is a little behind the crop around it.');
      case 'ahead': return t('sky.nb.ahead', 'Your field is doing better than the crop around it.');
      case 'with': return t('sky.nb.with', 'Your field is keeping pace with the crop around it.');
      default: return t('sky.nb.unknown', 'Not enough crop nearby was seen clearly to compare yet.');
    }
  })();

  const tone = nb.state === 'well_behind' ? 'text-destructive' : nb.state === 'behind' ? 'text-warning' : nb.state === 'ahead' ? 'text-success' : 'text-foreground';

  return (
    <Card className="rounded-3xl border-border/40">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('sky.nb.title', 'Compared to nearby crop')}</p>
        </div>
        <div className="space-y-2">
          <Bar label={t('sky.nb.mine', 'My field')} value={mine} strong />
          <Bar label={t('sky.nb.around', 'Crop around it')} value={around} />
        </div>
        <p className={cn('text-sm font-medium mt-3', tone)}>{sentence}</p>
        {nb.asOf && <p className="text-[11px] text-muted-foreground mt-1">{t('sky.nb.as_of', 'Seen on {{date}}', { date: nb.asOf })}</p>}
      </CardContent>
    </Card>
  );
}

function Bar({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, Math.round(((value + 0.2) / 1.2) * 100)));
  return (
    <div>
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1"><span>{label}</span>{value == null && <span>—</span>}</div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', strong ? 'bg-primary' : 'bg-primary/40')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
