import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Droplets, Waves } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldGoogleMap } from '@/components/land/sky/FieldGoogleMap';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { FieldSky, LayerFrame, Quarter } from '@/hooks/useFieldSky';

type LayerCode = 'vigour' | 'moisture' | 'standing';

function formatDay(iso: string, lang: string) {
  try { return new Intl.DateTimeFormat(lang || undefined, { day: 'numeric', month: 'short' }).format(new Date(iso)); } catch { return iso; }
}

/**
 * The farmer's field on the same Google satellite map he drew it on, with the
 * pipeline's picture for the chosen layer laid exactly over it:
 *   growth   → three-colour zone map (lower / normal / higher than the rest of
 *              this field), like a vegetation-zone map; gradient PNG if a pass
 *              predates zone maps
 *   moisture → canopy moisture picture
 *   standing water → only when the pipeline drew evidence pixels
 * Date chips switch the day. The "where to check" quarter follows the layer.
 */
export function FieldSkyMap(props: {
  sky: FieldSky; landId: string; farmerId?: string; tenantId?: string;
  boundary: Array<{ lat: number; lng: number }>; centerLat: number; centerLng: number;
}) {
  const { t, i18n } = useTranslation();
  const { sky } = props;
  const [layer, setLayer] = useState<LayerCode>('vigour');
  const [dateIdx, setDateIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const layers = useMemo(() => {
    const out: Array<{ code: LayerCode; label: string; icon: typeof Leaf; frames: LayerFrame[]; quarter: Quarter | null }> = [
      { code: 'vigour', label: t('sky.layer.vigour', 'Crop growth'), icon: Leaf, frames: sky.layerFrames.vigour, quarter: sky.zone.level === 'none' ? null : sky.zone.quarter },
    ];
    if (sky.layerFrames.moisture.length) out.push({ code: 'moisture', label: t('sky.layer.moisture', 'Crop moisture'), icon: Droplets, frames: sky.layerFrames.moisture, quarter: sky.zone.water.level === 'none' ? null : sky.zone.water.quarter });
    if (sky.layerFrames.standing.length) out.push({ code: 'standing', label: t('sky.layer.standing', 'Standing water'), icon: Waves, frames: sky.layerFrames.standing, quarter: null });
    return out;
  }, [sky.layerFrames, sky.zone, t]);

  const active = layers.find((l) => l.code === layer) ?? layers[0];
  useEffect(() => { setDateIdx(0); }, [layer, props.landId]);
  const frame = active.frames[dateIdx] ?? active.frames[0] ?? null;

  const legend: [string, string, string] = active.code === 'moisture'
    ? [t('sky.legend.dry', 'dry'), t('sky.legend.ok', 'ok'), t('sky.legend.moist', 'moist')]
    : active.code === 'standing'
      ? [t('sky.legend.none', 'none'), t('sky.legend.some', 'some'), t('sky.legend.water', 'water')]
      : frame?.kind === 'zones'
        ? [t('sky.legend.lower', 'weaker than the rest'), t('sky.legend.normal', 'like the rest'), t('sky.legend.higher', 'better than the rest')]
        : [t('sky.legend.weak', 'weak'), t('sky.legend.fair', 'fair'), t('sky.legend.strong', 'strong')];

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  return (
    <div className={cn('flex flex-col', fullscreen && 'fixed inset-0 z-[60] bg-background')}>
      {layers.length > 1 && (
        <div className={cn('px-3 pb-2', fullscreen && 'absolute top-2 left-2 right-16 z-[70] px-0 pb-0')}>
          <div className="grid gap-1.5 rounded-2xl bg-background/95 shadow p-1" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}>
            {layers.map((l) => { const Icon = l.icon; return (
              <Button key={l.code} type="button" variant={active.code === l.code ? 'secondary' : 'ghost'} onClick={() => setLayer(l.code)} aria-pressed={active.code === l.code}
                className={cn('min-h-11 rounded-xl px-2 text-[13px] font-semibold gap-1.5', active.code === l.code ? 'bg-primary/10 text-foreground' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />{l.label}
              </Button>); })}
          </div>
        </div>
      )}

      {/* The Google Maps script is loaded by the SAME provider the Add-Land / Edit-Land map uses:
          same script id, same key, same libraries. If the farmer opened a land map earlier in this
          session the script is already there and this is instant; the script itself is never billed. */}
      <GoogleMapsScriptProvider loadingComponent={<Skeleton className={cn('w-full', fullscreen ? 'h-screen' : 'h-[calc(100vh-180px)] min-h-[460px] rounded-2xl mx-2')} />}>
        <FieldGoogleMap landId={props.landId} farmerId={props.farmerId} tenantId={props.tenantId} boundary={props.boundary} centerLat={props.centerLat} centerLng={props.centerLng}
          imagePath={frame?.path ?? null} imageBounds={frame?.bounds ?? null} highlightQuarter={active.quarter}
          legend={legend} legendTitle={t('sky.map.legend_title', 'What the colours mean')}
          fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} />
      </GoogleMapsScriptProvider>

      <div className={cn('px-3 pt-2', fullscreen && 'absolute left-2 right-2 z-[70] px-0 bottom-[92px]')}>
        {active.frames.length ? (
          <>
            {!fullscreen && <p className="text-[12px] text-muted-foreground mb-1">{t('sky.map.dates', 'Days the satellite saw the field')}</p>}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {active.frames.map((f, i) => (
                <button key={f.date + i} type="button" onClick={() => setDateIdx(i)} aria-pressed={i === dateIdx}
                  className={cn('shrink-0 min-h-11 px-3 rounded-xl text-[13px] font-semibold border shadow-sm', i === dateIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border/40')}>
                  {formatDay(f.date, i18n.language)}
                </button>))}
            </div>
          </>
        ) : <p className="text-[13px] text-muted-foreground">{t('sky.map.no_image', 'No picture for this layer yet.')}</p>}
      </div>
    </div>
  );
}
