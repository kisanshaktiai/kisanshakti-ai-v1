import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CloudRain, Droplets, Layers, Pencil, Satellite, Sun, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLands } from '@/hooks/useLands';
import { useWeather } from '@/hooks/useWeather';
import { useFieldSky, stageKey } from '@/hooks/useFieldSky';
import { useSpeech } from '@/hooks/useSpeech';
import { useAuthStore } from '@/stores/authStore';
import { loadSoilState, resolveSoilSources } from '@/services/soil/soilReport';
import { bestReadings } from '@/lib/soilBestReadings';
import { soilVerdictLines } from '@/components/soil/SoilVerdictCard';
import { LandBar, type BarLand } from '@/living/LandBar';
import { useChosenLand } from '@/living/useChosenLand';
import '@/living/living.css';

type CoreLand = BarLand & { is_active?: boolean | null };
type Tone = 'ok' | 'warn' | 'do' | 'idle';
const TONE: Record<Tone, string> = { ok: 'bg-success/15 text-success', warn: 'bg-warning/15 text-warning', do: 'bg-primary text-primary-foreground', idle: 'bg-foreground/5 text-muted-foreground' };

/**
 * Land: the chosen land read top to bottom like a core sample — sky, crop, water, soil.
 *
 * Data (existing paths only):
 *   sky    useWeather                 -> weather_current / forecast
 *   crop   useFieldSky                -> lands stage cache, crop_stage_master, satellite verdict (sky.state)
 *   water  useFieldSky().water        -> weather edge function (land_weather_state.irrigation_needed)
 *   soil   loadSoilState + bestReadings + soilVerdictLines -> saved soil reports, read against the governed bands
 * Each band opens the existing page that holds the full detail.
 */
export default function LandCore() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { lands: rawLands, isLoading: landsLoading } = useLands();
  const lands = rawLands as CoreLand[];
  const { land, choose } = useChosenLand(lands);
  const { currentWeather, forecast, hourlyForecast } = useWeather(undefined, land?.id);
  const sky = useFieldSky(land?.id ?? null);
  const { speak, stop, isSpeaking } = useSpeech();

  const soil = useQuery({
    queryKey: ['land-soil-summary', land?.id, session?.farmerId, session?.tenantId],
    enabled: !!land?.id && !!session?.farmerId && !!session?.tenantId,
    queryFn: () => loadSoilState(land!.id, session!.farmerId!, session!.tenantId!),
    retry: 1, staleTime: 60_000,
  });
  const readings = bestReadings(resolveSoilSources(soil.data), soil.data?.ratings);
  const anySoil = [readings.ph, readings.oc, readings.n, readings.p, readings.k].some((x) => x.reading.value !== null);
  const soilLines = anySoil ? soilVerdictLines({ ph: readings.ph.reading, oc: readings.oc.reading, n: readings.n.reading, p: readings.p.reading, k: readings.k.reading }, t, lang) : [];

  const rainChance = (() => {
    const next6 = (hourlyForecast ?? []).slice(0, 6) as Array<{ pop?: number }>;
    if (next6.length) return Math.round(Math.max(...next6.map((h) => Number(h?.pop ?? 0))) * 100);
    const pop = (forecast as Array<{ pop?: number }> | undefined)?.[0]?.pop;
    return pop != null ? Math.round(Number(pop) * 100) : null;
  })();

  const landName = land?.name || t('home.unnamed_land');
  const stageName = sky.stage.stageName ? t(stageKey(sky.stage.stageName), sky.stage.stageName) : null;
  const ladder = sky.stage.ladder;
  const stageAt = sky.cropActive ? sky.stage.index : null;
  const irrigation = sky.cropActive ? sky.water.irrigationNeeded : null;

  const skyText = currentWeather?.temp != null ? `${Math.round(Number(currentWeather.temp))}°` : '–';
  const cropHead = !sky.cropActive ? t('living.brief.no_crop') : stageName ? t('sky.state.stage_line', { das: sky.stage.das ?? '–', stage: stageName }) : sky.stage.das != null ? t('living.scene.day', { day: sky.stage.das }) : t('living.land.stage_unknown');
  const cropLine = sky.loading ? null : t(`sky.state.${sky.state}`, { land: landName });
  const cropTone: Tone = sky.state === 'as_expected' || sky.state === 'above_band' ? 'ok' : sky.state === 'slower' || sky.state === 'something_wrong' ? 'warn' : 'idle';
  const waterHead = irrigation == null ? t('living.land.water_unknown') : t(irrigation ? 'living.scene.water_low' : 'living.scene.water_ok');
  const soilHead = soil.isPending ? t('living.brief.loading') : soil.isError ? t('soil.loadError') : soilLines[0] ?? t('soil.summaryEmpty');

  const spoken = [`${t('home.weather')}: ${skyText}`, cropHead, cropLine, waterHead, ...soilLines].filter(Boolean).join('. ');

  if (!land) {
    return (
      <div className="lf-home">
        <LandBar lands={lands} land={null} onChoose={choose} />
        <div style={{ padding: '12px var(--lf-gut)' }}>
          <p className="lf-head rounded-[var(--lf-r)] bg-foreground/5" style={{ padding: 'clamp(12px, 3.6vw, 18px)' }}>{t(landsLoading ? 'living.brief.loading' : 'living.brief.no_land')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lf-home">
      <LandBar lands={lands} land={land} onChoose={choose} />

      <div className="flex min-h-0 flex-1 flex-col" style={{ padding: '6px var(--lf-gut) 0' }}>
        <Band first flex={1.1} bg="hsl(var(--info) / 0.14)" onOpen={() => navigate('/app/weather')} label={t('living.land.sky')}
          graphic={<Sun size={34} aria-hidden className="text-accent" style={{ fill: 'hsl(var(--accent))' }} />}
          head={skyText} pill={rainChance != null ? { tone: 'idle', icon: CloudRain, text: t('living.scene.rain', { percent: rainChance }) } : null} />

        <Band flex={2} bg="hsl(var(--primary) / 0.08)" onOpen={() => navigate(`/app/lands/${land.id}`)} label={t('living.land.crop')}
          graphic={(
            <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" className="absolute inset-0 h-full w-full" aria-hidden>
              {(() => {
                const count = Math.min(6, Math.max(3, ladder.length || 3));
                const at = stageAt == null || ladder.length < 2 ? -1 : Math.round((stageAt / (ladder.length - 1)) * (count - 1));
                return Array.from({ length: count }, (_, i) => {
                  const x = 12 + (i * 76) / (count - 1);
                  const h = 18 + (i / (count - 1)) * 58;
                  const stroke = i <= at ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.2)';
                  return (
                    <g key={i} fill="none" stroke={stroke} strokeWidth={i === at ? 4.5 : 3} strokeLinecap="round">
                      <path d={`M${x} 96 V${96 - h} M${x} ${96 - h * 0.55} q-7 -3 -8 -11 M${x} ${96 - h * 0.75} q7 -3 8 -11`} />
                      {i === at && <circle cx={x} cy={96 - h - 7} r="4" fill="hsl(var(--accent))" stroke="hsl(var(--primary))" strokeWidth="2" />}
                    </g>
                  );
                });
              })()}
            </svg>
          )}
          head={cropHead} line={sky.cropActive ? cropLine : null}
          pill={sky.cropActive && sky.stage.next?.name ? { tone: cropTone === 'warn' ? 'warn' : 'idle', icon: ChevronRight, text: t('living.land.next_stage', { stage: t(stageKey(sky.stage.next.name), sky.stage.next.name) }) } : null} />

        <Band flex={1} bg="hsl(var(--tertiary, var(--secondary)) / 0.45)" onOpen={() => navigate('/app/weather')} label={t('living.land.water')}
          graphic={irrigation == null ? null : <div className="absolute inset-x-0 bottom-0 bg-info/75" style={{ height: irrigation ? '22%' : '70%' }} aria-hidden />}
          head={waterHead} pill={irrigation === true ? { tone: 'do', icon: Droplets, text: t('living.brief.water_needed') } : null} />

        <Band last flex={1.4} bg="hsl(var(--tertiary, var(--secondary)) / 0.7)" onOpen={() => navigate(`/app/lands/${land.id}/soil`)} label={t('living.land.soil')}
          graphic={<Layers size={30} aria-hidden className="text-card" />}
          head={soilHead} line={soilLines[1] ?? null}
          pill={!soil.isPending && !soil.isError ? { tone: anySoil ? 'idle' : 'do', icon: ChevronRight, text: t(anySoil ? 'lands.details.open_soil_report' : 'lands.details.add_soil_test') } : null} />
      </div>

      <div className="flex items-center gap-2" style={{ padding: '12px var(--lf-gut) var(--lf-dock-pad)' }}>
        <button type="button" onClick={() => navigate('/app/lands')} className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full bg-primary font-bold text-primary-foreground" style={{ minHeight: 'var(--lf-tap)', fontSize: 'var(--lf-fs-lab)' }}>
          <span className="truncate">{t('living.land.all_lands')}</span><ChevronRight size={18} aria-hidden />
        </button>
        <button type="button" className="lf-round bg-primary/10 text-primary" aria-label={t('living.land.satellite')} onClick={() => navigate(`/app/lands/${land.id}/ndvi`)}><Satellite size={22} aria-hidden /></button>
        <button type="button" className="lf-round bg-primary/10 text-primary" aria-label={t('living.land.edit')} onClick={() => navigate(`/app/lands/${land.id}/edit`)}><Pencil size={22} aria-hidden /></button>
        <button type="button" className="lf-round bg-primary/10 text-primary" aria-pressed={isSpeaking} aria-label={t(isSpeaking ? 'living.stop' : 'living.listen')} onClick={() => (isSpeaking ? stop() : void speak(spoken, lang))}>
          {isSpeaking ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

interface BandProps {
  flex: number; bg: string; label: string; head: string; line?: string | null; graphic: ReactNode;
  pill?: { tone: Tone; icon: LucideIcon; text: string } | null; onOpen: () => void; first?: boolean; last?: boolean;
}

/** One layer of the core: a slice of the column on the left, its plain-word reading on the right. The whole row opens the detail page. */
function Band({ flex, bg, label, head, line, graphic, pill, onOpen, first, last }: BandProps) {
  const edge = '2px solid hsl(var(--foreground) / 0.75)';
  const PillIcon = pill?.icon;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-stretch text-start" style={{ flex: `${flex} 0 auto`, minHeight: 'calc(var(--lf-tap) + 20px)', gap: 'clamp(10px, 3.4vw, 16px)' }}>
      <span className="relative grid shrink-0 place-items-center overflow-hidden" style={{ width: '30%', background: bg, borderLeft: edge, borderRight: edge, borderTop: first ? edge : undefined, borderBottom: last ? edge : undefined, borderRadius: first ? '28px 28px 0 0' : last ? '0 0 28px 28px' : undefined }}>
        {graphic}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center py-1.5" style={{ borderTop: first ? undefined : '1.5px dashed hsl(var(--border))' }}>
        <span className="lf-cap text-muted-foreground">{label}</span>
        <span className="lf-head" style={{ overflowWrap: 'anywhere' }}>{head}</span>
        {line && <span className="lf-lab lf-hide-short font-normal text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{line}</span>}
        {pill && PillIcon && <span className={`lf-pill lf-pill-sm mt-1 self-start ${TONE[pill.tone]}`} style={{ maxWidth: '100%' }}><PillIcon size={14} aria-hidden className="shrink-0" /><span className="truncate">{pill.text}</span></span>}
      </span>
    </button>
  );
}
