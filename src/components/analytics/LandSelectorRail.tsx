import { cn } from '@/lib/utils';
import type { LandAnalytics } from '@/lib/analytics/reportEngine';
import { MapPin, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useSignedSatelliteImage } from '@/hooks/useSignedSatelliteImage';

interface Props {
  perLand: LandAnalytics[];
  selectedId: string | 'all';
  onSelect: (id: string | 'all') => void;
  totalAreaAcres: number;
}

/**
 * lands.ndvi_thumbnail_url holds a storage PATH in the private satellite bucket, not a URL,
 * so it has to be signed before it can be shown. Until it is (or if it cannot be), the map-pin
 * icon behind it stays visible instead of a broken image.
 */
function LandSatelliteThumb({ landId, path }: { landId: string; path: string | null }) {
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const image = useSignedSatelliteImage(path, session?.farmerId, session?.tenantId ?? tenant?.id, landId);
  if (!image.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image.url} alt="" className="absolute inset-0 w-full h-full object-contain bg-muted" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
  );
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
              <div className="relative w-full h-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center mb-1">
                <MapPin className="w-5 h-5 opacity-60" />
                <LandSatelliteThumb landId={a.land.id} path={a.land.ndvi_thumbnail_url} />
              </div>
              <p className="text-[11px] font-bold leading-tight truncate">{a.land.name || '—'}</p>
              <p className="text-[10px] opacity-80 truncate">
                {(a.land.area_acres ?? 0).toFixed(1)} {t('analytics.units.acre', 'ac')} · {a.land.current_crop || t('analytics.no_crop_short', 'fallow')}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
