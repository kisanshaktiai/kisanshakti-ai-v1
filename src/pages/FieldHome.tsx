import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, CalendarCheck, CloudRain, Droplet, Plus, Volume2, VolumeX } from 'lucide-react';
import { useLands } from '@/hooks/useLands';
import { useWeather } from '@/hooks/useWeather';
import { useFieldSky } from '@/hooks/useFieldSky';
import { useProactiveAlerts, isLiveAlert } from '@/hooks/useProactiveAlerts';
import { alertSourceText, useTranslatedTexts, FARM_ADVICE_TEXT } from '@/hooks/useAlertText';
import { useCropNames } from '@/hooks/useCropNames';
import { useSpeech } from '@/hooks/useSpeech';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { FieldScene, type FieldPin } from '@/living/FieldScene';
import { normaliseRing, ringFromBoundary, sunProgress } from '@/living/fieldGeometry';
import { chooseBrief, topAlert, type BriefTone } from '@/living/fieldBrief';
import { useTodayTasks } from '@/living/useTodayTasks';
import { LandBar } from '@/living/LandBar';
import { useChosenLand } from '@/living/useChosenLand';
import '@/living/living.css';

interface HomeLand {
  id: string; name?: string | null; is_active?: boolean | null; boundary_polygon_old?: unknown;
  current_crop?: string | null; current_crop_id?: string | null;
}

const TONE_CLASS: Record<BriefTone, string> = {
  do: 'bg-primary text-primary-foreground', warn: 'bg-warning/15 text-warning', stop: 'bg-destructive/10 text-destructive',
  ok: 'bg-success/15 text-success', idle: 'bg-foreground/5 text-muted-foreground',
};

/**
 * Field home: the selected land drawn from its own boundary, with the sky,
 * crop stage and water state the app already holds, and one sentence.
 *
 * Data (all through hooks that already exist):
 *   lands                     useLands        -> lands-api edge function (lands row, boundary_polygon_old)
 *   temperature, rain, sun    useWeather      -> weather_current / forecast
 *   stage, crop on field,
 *   irrigation flag           useFieldSky     -> lands stage cache, crop_stage_master, weather edge function (land_weather_state)
 *   alerts                    useProactiveAlerts -> proactive_alerts
 *   today's tasks             useTodayTasks   -> schedules-api (crop_schedules, schedule_tasks)
 */
export default function FieldHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const navigate = useNavigate();
  const cropNameOf = useCropNames();
  const now = useMinuteTick();

  const { lands: rawLands, isLoading: landsLoading, isError: landsError } = useLands();
  const lands = rawLands as HomeLand[];
  const { land, choose } = useChosenLand(lands);

  const { currentWeather, forecast, hourlyForecast, loading: weatherLoading } = useWeather(undefined, land?.id);
  const sky = useFieldSky(land?.id ?? null);
  const { alerts: allAlerts, loading: alertsLoading } = useProactiveAlerts({ skipRealtime: true });
  const { tasks, isLoading: tasksLoading, isError: tasksError } = useTodayTasks(land?.id);
  const { speak, stop, isSpeaking, isLoading: speechLoading } = useSpeech();

  const alerts = useMemo(() => allAlerts.filter((a) => a.land_id === land?.id && isLiveAlert(a)), [allAlerts, land?.id]);
  const lead = topAlert(alerts);
  const leadSource = lead ? alertSourceText(lead, 'title', lang) : null;
  const { tr } = useTranslatedTexts(leadSource?.needsTranslation ? [leadSource.text] : [], lang, FARM_ADVICE_TEXT);

  const ring = useMemo(() => {
    const raw = ringFromBoundary(land?.boundary_polygon_old);
    return raw ? normaliseRing(raw) : null;
  }, [land?.boundary_polygon_old]);

  const stageProgress = sky.cropActive && sky.stage.index != null && sky.stage.ladder.length > 1
    ? sky.stage.index / (sky.stage.ladder.length - 1)
    : null;
  const irrigationNeeded = sky.cropActive ? sky.water.irrigationNeeded : null;

  // Rain chance: the same rule the old home used (highest chance in the next 6 hours, else today's).
  const rainChance = (() => {
    const next6 = (hourlyForecast ?? []).slice(0, 6) as Array<{ pop?: number }>;
    if (next6.length) return Math.round(Math.max(...next6.map((h) => Number(h?.pop ?? 0))) * 100);
    const pop = (forecast as Array<{ pop?: number }> | undefined)?.[0]?.pop;
    return pop != null ? Math.round(Number(pop) * 100) : null;
  })();
  const sunAt = sunProgress(now.getTime(), currentWeather?.sunrise, currentWeather?.sunset);
  // Night is said only when the sun times are known and now is outside them.
  const night = sunAt == null && currentWeather?.sunrise != null && currentWeather?.sunset != null;
  const weatherMain = String(currentWeather?.main ?? '');
  const raining = /rain|drizzle|thunder/i.test(weatherMain);
  const cloudy = raining || Number(currentWeather?.clouds ?? 0) >= 40;

  const brief = chooseBrief({
    hasLand: !!land,
    loading: landsLoading || alertsLoading || tasksLoading || sky.loading,
    failed: landsError || tasksError || !!sky.error,
    alerts, tasks, cropActive: sky.cropActive, irrigationNeeded,
  });
  const briefText = (() => {
    if (brief.kind === 'alert') return leadSource ? (leadSource.needsTranslation ? tr(leadSource.text) : leadSource.text) : '';
    if (brief.kind === 'task') return brief.more > 0 ? t('living.brief.task_today_more', { task: brief.taskName, count: brief.more }) : t('living.brief.task_today', { task: brief.taskName });
    return t(`living.brief.${brief.key}`);
  })();

  const pins: FieldPin[] = [];
  if (tasks.length) pins.push({ key: 'tasks', icon: CalendarCheck, tone: 'do', label: t('living.pins.tasks', { count: tasks.length }), onSelect: () => navigate('/app/schedule') });
  if (alerts.length) pins.push({ key: 'alerts', icon: AlertTriangle, tone: brief.kind === 'alert' && brief.tone === 'stop' ? 'stop' : 'warn', label: t('living.pins.alerts', { count: alerts.length }), onSelect: () => navigate('/app/proactive-alerts') });

  const cropLabel = land?.current_crop ? cropNameOf(land.current_crop, land.current_crop_id) : null;
  const landLabel = land ? [land.name || t('home.unnamed_land'), cropLabel].filter(Boolean).join(' · ') : t('living.brief.no_land');
  const briefAction = brief.kind === 'alert' ? '/app/proactive-alerts' : brief.kind === 'task' ? '/app/schedule' : brief.kind === 'key' && brief.key === 'no_land' ? '/app/lands/add' : null;

  return (
    <div className="lf-home">
      <LandBar lands={lands} land={land} onChoose={choose} />

      <div className={`lf-scene ${night ? 'lf-scene-night' : ''}`}>
        <button type="button" className="lf-now" onClick={() => navigate('/app/weather')} aria-label={t('home.weather')}>
          {currentWeather?.temp != null
            ? <div className="lf-stat">{Math.round(Number(currentWeather.temp))}°</div>
            : <div className="lf-stat text-muted-foreground">{weatherLoading ? '…' : '–'}</div>}
          {rainChance != null && (
            <div className="lf-lab lf-hide-short flex items-center gap-1 text-info"><CloudRain size={16} aria-hidden />{t('living.scene.rain', { percent: rainChance })}</div>
          )}
        </button>
        <FieldScene
          ring={ring}
          stageProgress={stageProgress}
          irrigationNeeded={irrigationNeeded}
          sun={sunAt}
          night={night}
          cloudy={cloudy}
          raining={raining}
          pins={pins}
          stageLabel={sky.cropActive && sky.stage.das != null ? t('living.scene.day', { day: sky.stage.das }) : null}
          waterLabel={irrigationNeeded == null ? null : t(irrigationNeeded ? 'living.scene.water_low' : 'living.scene.water_ok')}
          ariaLabel={t('living.scene.label', { land: landLabel })}
        />
      </div>

      <div className="lf-brief">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="lf-who"><span className="lf-spark" aria-hidden />{t('living.brief.who')}</div>
            <p>{briefText}</p>
          </div>
          {briefText && brief.kind !== 'key' && (
            <button type="button" className="lf-round bg-primary text-primary-foreground" aria-pressed={isSpeaking} aria-label={t(isSpeaking ? 'living.stop' : 'living.listen')} disabled={speechLoading}
              onClick={() => (isSpeaking ? stop() : speak(briefText, lang))}>
              {isSpeaking ? <VolumeX size={24} aria-hidden /> : <Volume2 size={24} aria-hidden />}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {briefAction && (
            <button type="button" className={`lf-pill ${TONE_CLASS[brief.tone]}`} onClick={() => navigate(briefAction)}>
              {brief.kind === 'key' ? <Plus size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}
              {t(brief.kind === 'key' ? 'living.add_land' : 'home.view')}
            </button>
          )}
          {tasks.length > 0 && brief.kind !== 'task' && (
            <button type="button" className="lf-pill lf-hide-short bg-primary/10 text-primary" onClick={() => navigate('/app/schedule')}>
              <CalendarCheck size={16} aria-hidden />{t('living.pins.tasks', { count: tasks.length })}
            </button>
          )}
          {alerts.length > 0 && brief.kind !== 'alert' && (
            <button type="button" className="lf-pill lf-hide-short bg-warning/15 text-warning" onClick={() => navigate('/app/proactive-alerts')}>
              <AlertTriangle size={16} aria-hidden />{t('living.pins.alerts', { count: alerts.length })}
            </button>
          )}
          {land && sky.cropActive && irrigationNeeded === true && brief.kind !== 'key' && (
            <span className="lf-pill lf-hide-short bg-info/10 text-info"><Droplet size={16} aria-hidden />{t('living.scene.water_low')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
