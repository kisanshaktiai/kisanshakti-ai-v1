import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Droplets, Waves, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldGoogleMap, type MapLegend } from '@/components/land/sky/FieldGoogleMap';
import { GoogleMapsScriptProvider } from '@/components/maps/GoogleMapsScriptProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatSkyDay, type FieldSky, type LayerFrame, type Quarter } from '@/hooks/useFieldSky';
import { useSatelliteLayerConfig } from '@/hooks/useSatelliteLayerConfig';
import { NDVI_COLOR_STOPS, ZONE_CLASS_COLOURS, colourRampCss } from '@/lib/ndviScience';

type LayerCode = 'vigour' | 'moisture' | 'standing';
/** the pipeline's layer_code behind each water layer of the map (satellite_layer_config / satellite_water_layers) */
const WATER_LAYER_CODE: Record<Exclude<LayerCode, 'vigour'>, string> = { moisture: 'canopy_moisture_signal', standing: 'surface_water_trace' };
const PLAY_STEP_MS = 1500;

const sharePct = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100));

/**
 * The farmer's field on the same Google satellite map he drew it on, with the
 * pipeline's picture for the chosen layer laid exactly over it:
 *   growth   → three-colour zone map (lower / normal / higher than the rest of
 *              this field), like a vegetation-zone map; gradient PNG if a pass
 *              predates zone maps
 *   moisture → canopy moisture picture, one per pass the satellite measured it
 *   standing water → only when the pipeline drew evidence pixels
 * Date chips switch the day and the play button runs through the days, oldest
 * to newest. The legend is built from the picture's own colours: zone classes
 * with each class's share of the field, or the layer's colour ramp from
 * satellite_layer_config. The "where to check" quarter follows the layer.
 */
export function FieldSkyMap(props: {
  sky: FieldSky; landId: string; farmerId?: string; tenantId?: string;
  boundary: Array<{ lat: number; lng: number }>; centerLat: number; centerLng: number;
}) {
  const { t, i18n } = useTranslation();
  const { sky } = props;
  const [layer, setLayer] = useState<LayerCode>('vigour');
  const [dateIdx, setDateIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const ramps = useSatelliteLayerConfig().data;

  const layers = useMemo(() => {
    const out: Array<{ code: LayerCode; label: string; icon: typeof Leaf; frames: LayerFrame[]; quarter: Quarter | null }> = [
      { code: 'vigour', label: t('sky.layer.vigour', 'Crop growth'), icon: Leaf, frames: sky.layerFrames.vigour, quarter: sky.zone.level === 'none' ? null : sky.zone.quarter },
    ];
    if (sky.layerFrames.moisture.length) out.push({ code: 'moisture', label: t('sky.layer.moisture', 'Crop moisture'), icon: Droplets, frames: sky.layerFrames.moisture, quarter: sky.zone.water.level === 'none' ? null : sky.zone.water.quarter });
    if (sky.layerFrames.standing.length) out.push({ code: 'standing', label: t('sky.layer.standing', 'Standing water'), icon: Waves, frames: sky.layerFrames.standing, quarter: null });
    return out;
  }, [sky.layerFrames, sky.zone, t]);

  const active = layers.find((l) => l.code === layer) ?? layers[0];
  useEffect(() => { setDateIdx(0); setPlaying(false); }, [layer, props.landId]);
  const frame = active.frames[dateIdx] ?? active.frames[0] ?? null;
  const frameCount = active.frames.length;

  // play: frames are newest-first, so the run goes from the last index down to 0 and stops on the newest day
  useEffect(() => {
    if (!playing) return;
    if (dateIdx <= 0) { setPlaying(false); return; }
    const id = window.setTimeout(() => setDateIdx((i) => Math.max(0, i - 1)), PLAY_STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, dateIdx]);
  // keep the day that is on the map visible in the strip while the days play
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [dateIdx]);
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    setDateIdx(frameCount - 1); setPlaying(true);
  };

  const legend: MapLegend = useMemo(() => {
    if (active.code === 'vigour' && frame?.kind === 'zones') {
      return { kind: 'classes', items: [
        { color: ZONE_CLASS_COLOURS.lower, label: t('sky.legend.lower', 'weaker than the rest'), sharePct: sharePct(frame.shares?.lower) },
        { color: ZONE_CLASS_COLOURS.normal, label: t('sky.legend.normal', 'like the rest'), sharePct: sharePct(frame.shares?.normal) },
        { color: ZONE_CLASS_COLOURS.higher, label: t('sky.legend.higher', 'better than the rest'), sharePct: sharePct(frame.shares?.higher) },
      ] };
    }
    if (active.code === 'vigour') return { kind: 'ramp', css: colourRampCss(NDVI_COLOR_STOPS), low: t('sky.legend.weak', 'weak'), high: t('sky.legend.strong', 'strong') };
    const css = colourRampCss(ramps?.[WATER_LAYER_CODE[active.code]]?.stops ?? []);
    return active.code === 'moisture'
      ? { kind: 'ramp', css, low: t('sky.legend.dry', 'dry'), high: t('sky.legend.moist', 'moist') }
      : { kind: 'ramp', css, low: t('sky.legend.none', 'none'), high: t('sky.legend.water', 'water') };
  }, [active.code, frame, ramps, t]);

  const frameAge = useMemo(() => {
    if (!frame?.date) return null;
    const ms = new Date(new Date().toISOString().slice(0, 10)).getTime() - new Date(frame.date).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null;
  }, [frame?.date]);

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  const dayStrip = (
    <>
        {frameCount ? (
          <div className={cn(fullscreen && 'rounded-2xl bg-background/95 shadow p-2')}>
            {/* which day's picture is on the map, and how old it is */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[13px] min-w-0">
                <span className="font-semibold">{t('sky.map.picture_from', 'Picture from {{date}}', { date: formatSkyDay(frame?.date, i18n.language) })}</span>
                {frameAge != null && <span className="text-muted-foreground ml-2">{t('sky.map.days_ago', '{{days}} days ago', { days: frameAge })}</span>}
              </p>
              {frameCount > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={togglePlay} aria-pressed={playing} className="min-h-11 rounded-xl gap-1.5 shrink-0">
                  {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span className="text-[13px] font-semibold">{playing ? t('sky.map.stop', 'Stop') : t('sky.map.play', 'Play the days')}</span>
                </Button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('sky.map.dates', 'Days the satellite saw the field')}>
              {active.frames.map((f, i) => (
                <button key={f.date + i} ref={i === dateIdx ? activeChipRef : undefined} type="button" onClick={() => { setPlaying(false); setDateIdx(i); }} aria-pressed={i === dateIdx}
                  className={cn('shrink-0 min-h-11 px-3 rounded-xl text-[13px] font-semibold border shadow-sm transition-colors', i === dateIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border/40')}>
                  {formatSkyDay(f.date, i18n.language)}
                </button>))}
            </div>
          </div>
        ) : <p className="text-[13px] text-muted-foreground">{t('sky.map.no_image', 'No picture for this layer yet.')}</p>}
    </>
  );

  return (
    <div className={cn('flex flex-col', fullscreen && 'fixed inset-0 z-[60] bg-background')}>
      {layers.length > 1 && (
        <div className={cn('px-3 pb-2', fullscreen && 'absolute top-2 left-2 right-2 z-[70] px-0 pb-0')}>
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
          fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)} footer={fullscreen ? dayStrip : undefined} />
      </GoogleMapsScriptProvider>

      {!fullscreen && <div className="px-3 pt-2">{dayStrip}</div>}
    </div>
  );
}
