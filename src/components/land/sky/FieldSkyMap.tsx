import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Droplets, Waves, Play, Square } from 'lucide-react';
import { FieldGoogleMap, type MapLegend } from '@/components/land/sky/FieldGoogleMap';
import { useAppScrollRef } from '@/components/layout/ScrollContext';
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
 *
 * Layout (one screen, nothing on top of the field): layer chips → day chips →
 * map (takes all the height left) → legend. The block measures the space left
 * in the app's single scroll container, so it fits whatever the header heights
 * are in the farmer's language and text size. In full screen the day chips and
 * legend float in one card at the bottom of the map.
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

  // Fit the whole block to the space left above the bottom navigation in the app's one scroll
  // container (<main>), so the map tab never scrolls — measured, because header/tab heights change
  // with the farmer's language and text size. The .h-sky-map class is only the first-paint estimate.
  const scrollRef = useAppScrollRef();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // h: room from the block's top to the bottom limit; gap: how far the nav reaches above the space <main>
  // reserves for it — kept as bottom margin so, when a short phone has to scroll, the end still clears the nav
  const [fit, setFit] = useState<{ h: number; gap: number } | null>(null);
  useLayoutEffect(() => {
    if (fullscreen) return;
    const el = rootRef.current; const main = scrollRef?.current;
    if (!el || !main) return;
    const measure = () => {
      if (!el.offsetParent) return; // Map tab hidden: nothing to fit until it is shown again
      const mainRect = main.getBoundingClientRect();
      const padBottom = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      // stop at the content bottom, or at the bottom navigation's real top edge if that is higher
      // (its safe-area padding can make it taller than the padding <main> reserves for it)
      const contentBottom = mainRect.top + main.clientHeight - padBottom;
      const nav = document.querySelector<HTMLElement>('nav[data-tour="nav"]')?.getBoundingClientRect();
      const bottom = nav && nav.height > 0 ? Math.min(contentBottom, nav.top) : contentBottom;
      const h = Math.floor(bottom - el.getBoundingClientRect().top - main.scrollTop);
      const gap = Math.max(0, Math.ceil(contentBottom - bottom));
      if (h > 0) setFit((f) => (f && f.h === h && f.gap === gap ? f : { h, gap }));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(main); ro?.observe(el); // window/rotation/banner change main; showing the tab changes el
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro?.disconnect();
  }, [fullscreen, scrollRef]);

  const layerChips = layers.length > 1 && (
    <div className={cn('flex gap-2 overflow-x-auto scrollbar-hide shrink-0', fullscreen && 'absolute top-2 left-2 right-2 z-[70] rounded-2xl bg-background/95 shadow p-1.5')}>
      {layers.map((l) => { const Icon = l.icon; const on = active.code === l.code; return (
        <button key={l.code} type="button" onClick={() => setLayer(l.code)} aria-pressed={on}
          className={cn('shrink-0 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border text-[13px] font-semibold transition-colors', on ? 'bg-primary/10 border-primary text-foreground' : 'bg-card border-border/60 text-muted-foreground')}>
          <Icon className="h-4 w-4" />{l.label}
        </button>); })}
    </div>
  );

  // play button + the days the satellite saw the field; the chosen day also says how old it is
  const dayRow = frameCount ? (
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      {frameCount > 1 && (
        <button type="button" onClick={togglePlay} aria-pressed={playing}
          aria-label={playing ? t('sky.map.stop', 'Stop') : t('sky.map.play', 'Play the days')} title={playing ? t('sky.map.stop', 'Stop') : t('sky.map.play', 'Play the days')}
          className={cn('shrink-0 h-11 w-11 rounded-full inline-flex items-center justify-center border shadow-sm transition-colors', playing ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-primary border-primary')}>
          {playing ? <Square className="h-4 w-4" /> : <Play className="h-5 w-5" />}
        </button>
      )}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide min-w-0 flex-1" aria-label={t('sky.map.dates', 'Days the satellite saw the field')}>
        {active.frames.map((f, i) => { const on = i === dateIdx; return (
          <button key={f.date + i} ref={on ? activeChipRef : undefined} type="button" onClick={() => { setPlaying(false); setDateIdx(i); }} aria-pressed={on}
            className={cn('shrink-0 min-h-11 px-3 py-1 rounded-xl border text-left leading-tight transition-colors', on ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card text-foreground border-border/60')}>
            <span className="block text-[13px] font-semibold whitespace-nowrap">{formatSkyDay(f.date, i18n.language)}</span>
            {on && frameAge != null && <span className="block text-[11px] opacity-90 whitespace-nowrap">{t('sky.map.days_ago', '{{days}} days ago', { days: frameAge })}</span>}
          </button>); })}
      </div>
    </div>
  ) : <p className="text-[13px] text-muted-foreground shrink-0">{t('sky.map.no_image', 'No picture for this layer yet.')}</p>;

  // the picture's own colours: zone classes as one bar split by each class's share, or the layer's ramp
  const legendView = (
    <div role="group" aria-label={t('sky.map.legend_title', 'What the colours mean')}>
      {legend.kind === 'classes' ? (
        <>
          {legend.items.some((it) => it.sharePct) && (
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              {legend.items.map((it) => (it.sharePct ? <span key={it.label} className="h-full" style={{ width: `${it.sharePct}%`, backgroundColor: it.color }} /> : null))}
            </div>
          )}
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {legend.items.map((it) => (
              <li key={it.label} className="flex items-center gap-1.5 text-[12px] font-medium">
                <i className="h-3 w-3 rounded-full shrink-0 border border-border/40" style={{ backgroundColor: it.color }} />
                <span>{it.label}</span>
                {it.sharePct != null && <span className="tabular-nums font-semibold">{it.sharePct}%</span>}
              </li>))}
          </ul>
        </>
      ) : (
        <>
          {legend.css && <div className="h-2.5 w-full rounded-full border border-border/40" style={{ backgroundImage: legend.css }} aria-hidden />}
          <div className="flex justify-between text-[12px] font-medium mt-1"><span>{legend.low}</span><span>{legend.high}</span></div>
        </>
      )}
    </div>
  );

  return (
    // min-height, not height: on a normal phone the map grows to fill exactly the screen; on a very short
    // phone (where chips + a usable map + legend cannot fit) the block grows instead, so the page scrolls a
    // little and the legend is never hidden under the bottom navigation.
    <div ref={rootRef} style={!fullscreen && fit ? { minHeight: fit.h, marginBottom: fit.gap } : undefined}
      className={cn('flex flex-col', fullscreen ? 'fixed inset-0 z-[60] bg-background' : cn('gap-2 px-3', !fit && 'h-sky-map'))}>
      {layerChips}
      {!fullscreen && dayRow}

      {/* The Google Maps script is loaded by the SAME provider the Add-Land / Edit-Land map uses:
          same script id, same key, same libraries. If the farmer opened a land map earlier in this
          session the script is already there and this is instant; the script itself is never billed. */}
      <GoogleMapsScriptProvider loadingComponent={<Skeleton className={cn('w-full', fullscreen ? 'h-screen' : 'flex-1 min-h-[200px] rounded-2xl')} />}>
        <FieldGoogleMap landId={props.landId} farmerId={props.farmerId} tenantId={props.tenantId} boundary={props.boundary} centerLat={props.centerLat} centerLng={props.centerLng}
          imagePath={frame?.path ?? null} imageBounds={frame?.bounds ?? null} highlightQuarter={active.quarter}
          fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((f) => !f)}
          footer={fullscreen ? <div className="rounded-2xl bg-background/95 shadow p-2.5 flex flex-col gap-2">{dayRow}{legendView}</div> : undefined} />
      </GoogleMapsScriptProvider>

      {/* legend under the map. min-h-16 + pr-16 keep the map's bottom edge and the legend text clear of the
          floating voice button (AppLayout: h-14 w-14 at bottom-24 right-4), which sits over this corner. */}
      {!fullscreen && <div className="shrink-0 min-h-16 pr-16 flex flex-col justify-center">{legendView}</div>}
    </div>
  );
}
