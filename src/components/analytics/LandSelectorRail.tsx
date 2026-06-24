import { cn } from '@/lib/utils';
import type { LandAnalytics } from '@/lib/analytics/reportEngine';
import { MapPin, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  perLand: LandAnalytics[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  totalAreaAcres: number;
}

export function LandSelectorRail({ perLand, selectedId, onSelect, totalAreaAcres }: Props) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
      <div className="flex gap-2 pb-1">
        <button
          type="button"
          onClick={() => onSelect('all')}
          className={cn(
            'shrink-0 w-28 rounded-2xl border p-2 text-left transition-colors',
            selectedId === 'all'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-foreground border-border/60',
          )}
        >
          <div className="w-full h-14 rounded-lg bg-primary/15 flex items-center justify-center mb-1">
            <Layers className="w-5 h-5" />
          </div>
          <p className="text-[11px] font-bold leading-tight">{t('analytics.all_farm', 'All Farm')}</p>
          <p className="text-[10px] opacity-80">{totalAreaAcres.toFixed(1)} ac</p>
        </button>
        {perLand.map((a) => {
          const active = a.land.id === selectedId;
          return (
            <button
              key={a.land.id}
              type="button"
              onClick={() => onSelect(a.land.id)}
              className={cn(
                'shrink-0 w-28 rounded-2xl border p-2 text-left transition-colors',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-foreground border-border/60',
              )}
            >
              <div className="w-full h-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center mb-1">
                {a.land.ndvi_thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.land.ndvi_thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <MapPin className="w-5 h-5 opacity-60" />
                )}
              </div>
              <p className="text-[11px] font-bold leading-tight truncate">{a.land.name || '—'}</p>
              <p className="text-[10px] opacity-80 truncate">
                {(a.land.area_acres ?? 0).toFixed(1)} ac · {a.land.current_crop || t('analytics.no_crop_short', 'fallow')}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
