import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Droplets, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { cn } from '@/lib/utils';
import type { FieldSky } from '@/hooks/useFieldSky';

type LayerCode = 'vigour' | 'moisture' | 'standing_water';

/**
 * One map, several layers. All overlays are pipeline PNGs georeferenced to the
 * same polygon bbox, so they share NDVIMapView; only the storage path and the
 * three-word legend change. A layer is offered only when it has evidence
 * (standing water is hidden once the pipeline draws no evidence pixels —
 * on a closed rice canopy MNDWI cannot see water under the leaves).
 */
export function FieldSkyMap(props: {
  sky: FieldSky; landId: string; boundary: Array<{ lat: number; lng: number }>; centerLat: number; centerLng: number;
  areaAcres?: number; currentCrop?: string; landThumbnailUrl?: string | null; landThumbnailDate?: string | null;
}) {
  const { t } = useTranslation();
  const { sky } = props;
  const [layer, setLayer] = useState<LayerCode>('vigour');

  const layers = useMemo(() => {
    const out: Array<{ code: LayerCode; label: string; icon: typeof Leaf; path: string | null; legend: [string, string, string] }> = [
      { code: 'vigour', label: t('sky.layer.vigour', 'Crop growth'), icon: Leaf, path: null, legend: [t('sky.legend.weak', 'weak'), t('sky.legend.fair', 'fair'), t('sky.legend.strong', 'strong')] },
    ];
    if (sky.water.canopyImagePath) out.push({ code: 'moisture', label: t('sky.layer.moisture', 'Crop moisture'), icon: Droplets, path: sky.water.canopyImagePath, legend: [t('sky.legend.dry', 'dry'), t('sky.legend.ok', 'ok'), t('sky.legend.moist', 'moist')] });
    if (sky.water.surfaceImagePath && (sky.water.surfaceEvidencePx ?? 0) > 0) out.push({ code: 'standing_water', label: t('sky.layer.standing', 'Standing water'), icon: Waves, path: sky.water.surfaceImagePath, legend: [t('sky.legend.none', 'none'), t('sky.legend.some', 'some'), t('sky.legend.water', 'water')] });
    return out;
  }, [sky.water.canopyImagePath, sky.water.surfaceImagePath, sky.water.surfaceEvidencePx, t]);

  const active = layers.find(l => l.code === layer) ?? layers[0];

  return (
    <div className="flex flex-col">
      {layers.length > 1 && (
        <div className="px-3 pb-2">
          <div className="grid gap-1.5 rounded-2xl bg-muted/40 p-1" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}>
            {layers.map(l => { const Icon = l.icon; return (
              <Button key={l.code} type="button" variant={active.code === l.code ? 'secondary' : 'ghost'} onClick={() => setLayer(l.code)} aria-pressed={active.code === l.code}
                className={cn('min-h-11 rounded-xl px-2 text-xs font-semibold gap-1.5', active.code === l.code ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />{l.label}
              </Button>); })}
          </div>
        </div>
      )}
      <NDVIMapView landId={props.landId} boundary={props.boundary} centerLat={props.centerLat} centerLng={props.centerLng} areaAcres={props.areaAcres}
        currentCrop={props.currentCrop} landThumbnailUrl={props.landThumbnailUrl} landThumbnailDate={props.landThumbnailDate}
        overlayAssetPath={active.code === 'vigour' ? null : active.path} />
      <div className="px-3 pt-2 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-warning" />{active.legend[0]}</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-success/60" />{active.legend[1]}</span>
          <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-success" />{active.legend[2]}</span>
        </div>
        <span className="text-muted-foreground">{t('sky.map.blocks', '10 m blocks · nothing smoothed')}</span>
      </div>
      <p className="px-3 pt-1 text-[11px] text-muted-foreground">{t('sky.map.north_hint', 'Top of the map is north. Your field is outlined.')}</p>
    </div>
  );
}
