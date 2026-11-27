import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Camera, Check, ChevronRight, Cloud, CloudRain, Droplets, RefreshCw, Sun, Sunrise, Sunset, Volume2, VolumeX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLands } from '@/hooks/useLands';
import { useWeather } from '@/hooks/useWeather';
import { useSpeech } from '@/hooks/useSpeech';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { schedulesApi } from '@/services/schedulesApi';
import { TaskPhotoUploadDialog } from '@/components/schedule/TaskPhotoUploadDialog';
import { LandBar, type BarLand } from '@/living/LandBar';
import { useChosenLand } from '@/living/useChosenLand';
import { useTodayTasks, type LandTask } from '@/living/useTodayTasks';
import { sunProgress } from '@/living/fieldGeometry';
import { ARC_H, ARC_W, arcPath, arcPoint, indiaDay, nextDays, rainSegments } from '@/living/dayArc';
import '@/living/living.css';

type DayLand = BarLand & { is_active?: boolean | null };

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(1)}%`;
const weatherIcon = (main: string | undefined): LucideIcon => (/rain|drizzle|thunder/i.test(main ?? '') ? CloudRain : /cloud|mist|haze|fog/i.test(main ?? '') ? Cloud : Sun);

/**
 * Day: today drawn as the sun's path, with the hours that may rain, and the work of the chosen day.
 *
 * Data (existing paths only):
 *   lands                useLands              -> lands-api
 *   sunrise, sunset,
 *   hourly rain chance,
 *   7-day forecast       useWeather            -> weather_current / forecast
 *   tasks                useTodayTasks         -> schedules-api (crop_schedules, schedule_tasks)
 *   mark done            schedulesApi.setTaskCompletion -> schedules-api POST /tasks/:id/complete
 *   photo                TaskPhotoUploadDialog (unchanged)
 * A task has a date but no time of day in the database, so tasks are listed under the arc, not placed on it.
 */
export default function DayView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const numLocale = `${lang}-u-nu-latn`;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const now = useMinuteTick();

  const { lands: rawLands, isLoading: landsLoading } = useLands();
  const lands = rawLands as DayLand[];
  const { land, choose } = useChosenLand(lands);
  const { currentWeather, forecast, hourlyForecast } = useWeather(undefined, land?.id);
  const { allTasks, schedule, hasSchedule, isLoading: tasksLoading, isError: tasksError, refetch } = useTodayTasks(land?.id);
  const { speak, stop, isSpeaking } = useSpeech();

  const days = useMemo(() => nextDays(now.getTime(), 7), [now]);
  const today = days[0];
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : today;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [photoTask, setPhotoTask] = useState<LandTask | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, LandTask[]>();
    for (const task of allTasks) {
      const key = String(task.task_date).slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return map;
  }, [allTasks]);
  const dayTasks = byDay.get(day) ?? [];
  const forecastOf = (d: string) => (forecast as Array<{ dt: number; weather?: Array<{ main: string }> }> | undefined)?.find((f) => indiaDay(f.dt < 1e12 ? f.dt * 1000 : f.dt) === d);

  const sunAt = sunProgress(now.getTime(), currentWeather?.sunrise, currentWeather?.sunset);
  const rain = useMemo(() => rainSegments(hourlyForecast as Array<{ dt: number; pop?: number }> | undefined, currentWeather?.sunrise, currentWeather?.sunset), [hourlyForecast, currentWeather?.sunrise, currentWeather?.sunset]);
  const clock = (v: number | null | undefined) => (v == null ? null : new Date(v < 1e12 ? v * 1000 : v).toLocaleTimeString(numLocale, { hour: 'numeric', minute: '2-digit' }));
  const pendingToday = (byDay.get(today) ?? []).filter((x) => x.status !== 'completed').length;

  // Same call the schedule timeline makes for work done today; the row the server returns is what is shown.
  const markDone = async (task: LandTask) => {
    setSavingId(task.id);
    try {
      await schedulesApi.setTaskCompletion(task.id, true, new Date().toISOString(), null);
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['schedules'] })]);
    } catch {
      toast({ title: t('schedule.toast.sync_failed'), variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const listen = (task: LandTask) => {
    if (isSpeaking && speakingId === task.id) { stop(); setSpeakingId(null); return; }
    setSpeakingId(task.id);
    void speak([task.task_name, task.task_description].filter(Boolean).join('. '), lang);
  };

  const sun = sunAt == null ? null : arcPoint(sunAt);

  return (
    <div className="lf-home">
      <LandBar lands={lands} land={land} onChoose={choose} />

      <div className="lf-scene lf-scene-day">
        <div className="lf-stage" style={{ aspectRatio: `${ARC_W} / ${ARC_H}`, ['--lf-ar' as string]: `${ARC_W} / ${ARC_H}` }}>
          <svg viewBox={`0 0 ${ARC_W} ${ARC_H}`} role="img" aria-label={t('living.day.label')}>
            <path d={arcPath(0, 1)} fill="none" stroke="hsl(var(--foreground) / 0.08)" strokeWidth="22" strokeLinecap="round" />
            {sunAt != null && sunAt > 0.01 && <path d={arcPath(0, sunAt)} fill="none" stroke="hsl(var(--primary) / 0.35)" strokeWidth="22" strokeLinecap="round" />}
            {rain.map((s, i) => <path key={i} d={arcPath(s.from, s.to)} fill="none" stroke={`hsl(var(--info) / ${(0.25 + 0.75 * s.chance).toFixed(2)})`} strokeWidth="10" />)}
            <path d={`M12 236 H${ARC_W - 12}`} stroke="hsl(var(--foreground) / 0.25)" strokeWidth="2" strokeLinecap="round" />
            {sun && (
              <g>
                <circle cx={sun.x} cy={sun.y} r="30" fill="hsl(var(--accent) / 0.35)" />
                <circle cx={sun.x} cy={sun.y} r="19" fill="hsl(var(--accent))" stroke="hsl(var(--tertiary, var(--accent)))" strokeWidth="2.5" />
              </g>
            )}
          </svg>
          <div className="lf-at text-center" style={{ left: '50%', top: pct(150, ARC_H) }}>
            <div className="lf-cap text-muted-foreground">{t('living.day.now')}</div>
            <div className="lf-stat" style={{ fontSize: 'clamp(34px, 11vw, 52px)' }}>{now.toLocaleTimeString(numLocale, { hour: 'numeric', minute: '2-digit' })}</div>
            {hasSchedule && !tasksLoading && !tasksError && (
              <div className="lf-lab text-primary">{pendingToday > 0 ? t('living.pins.tasks', { count: pendingToday }) : t('living.day.nothing_today')}</div>
            )}
          </div>
          {clock(currentWeather?.sunrise) && <div className="lf-at lf-cap flex items-center gap-1 text-muted-foreground" style={{ left: pct(40, ARC_W), top: pct(252, ARC_H) }}><Sunrise size={16} aria-hidden />{clock(currentWeather?.sunrise)}</div>}
          {clock(currentWeather?.sunset) && <div className="lf-at lf-cap flex items-center gap-1 text-muted-foreground" style={{ left: pct(ARC_W - 40, ARC_W), top: pct(252, ARC_H) }}>{clock(currentWeather?.sunset)}<Sunset size={16} aria-hidden /></div>}
        </div>
      </div>
      {rain.length > 0 && (
        <div className="lf-cap flex items-center gap-2 text-info" style={{ padding: '0 var(--lf-gut) 6px' }}>
          <span aria-hidden className="inline-block h-2.5 w-6 rounded-full bg-info" />{t('living.day.rain_legend')}
        </div>
      )}

      <div className="flex gap-0.5" style={{ padding: '0 var(--lf-gut)' }} role="tablist" aria-label={t('living.day.week')}>
        {days.map((d) => {
          const date = new Date(`${d}T12:00:00+05:30`);
          const list = byDay.get(d) ?? [];
          const open = list.filter((x) => x.status !== 'completed').length;
          const Icon = weatherIcon(forecastOf(d)?.weather?.[0]?.main);
          const selected = d === day;
          return (
            <button key={d} type="button" role="tab" aria-selected={selected} onClick={() => setPickedDay(d)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[18px] py-1.5 ${selected ? 'bg-foreground text-background' : ''}`} style={{ minHeight: 'calc(var(--lf-tap) + 26px)' }}>
              <span className="lf-cap w-full truncate text-center opacity-75">{date.toLocaleDateString(numLocale, { weekday: 'short', timeZone: 'Asia/Kolkata' })}</span>
              <b className="lf-head" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{date.toLocaleDateString(numLocale, { day: 'numeric', timeZone: 'Asia/Kolkata' })}</b>
              <Icon size={18} aria-hidden className={selected ? '' : 'text-muted-foreground'} />
              <span className="flex h-1.5 gap-[3px]" aria-hidden>
                {Array.from({ length: Math.min(3, open) }, (_, i) => <i key={i} className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-accent' : 'bg-primary'}`} />)}
                {open === 0 && list.length > 0 && <i className="h-1.5 w-1.5 rounded-full bg-success" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3" style={{ padding: '12px var(--lf-gut) 16px' }}>
        {!land && !landsLoading && (
          <Notice text={t('living.brief.no_land')} action={t('living.add_land')} onAction={() => navigate('/app/lands/add')} />
        )}
        {land && (landsLoading || tasksLoading) && <Notice text={t('living.brief.loading')} />}
        {land && !tasksLoading && tasksError && <Notice tone="warn" text={t('living.brief.cannot_load')} action={t('living.day.retry')} icon={RefreshCw} onAction={() => void refetch()} />}
        {land && !tasksLoading && !tasksError && !hasSchedule && (
          <Notice text={t('living.day.no_schedule')} action={t('living.day.make_schedule')} onAction={() => navigate('/app/schedule')} />
        )}
        {hasSchedule && !tasksLoading && !tasksError && dayTasks.length === 0 && <Notice tone="ok" text={t('living.day.nothing_this_day')} />}

        {dayTasks.map((task) => {
          const done = task.status === 'completed';
          const Icon = task.task_type === 'irrigation' ? Droplets : CalendarCheck;
          const speakingThis = isSpeaking && speakingId === task.id;
          return (
            <article key={task.id} className="rounded-[var(--lf-r)] border border-border bg-card shadow-sm" style={{ padding: 'clamp(12px, 3.6vw, 18px)' }}>
              <div className="flex items-start gap-3">
                <span className={`lf-tile ${done ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary'}`}>{done ? <Check size={26} aria-hidden /> : <Icon size={26} aria-hidden />}</span>
                <div className="min-w-0 flex-1">
                  {done && <span className="lf-pill lf-pill-sm bg-success/15 text-success"><Check size={14} aria-hidden />{t('living.day.done')}</span>}
                  <h3 className="lf-head" style={{ overflowWrap: 'anywhere' }}>{task.task_name}</h3>
                  {task.task_description && <p className="lf-lab font-normal text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.task_description}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {!done && day <= today && (
                  <button type="button" disabled={savingId === task.id} onClick={() => void markDone(task)}
                    className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground disabled:opacity-60" style={{ minHeight: 'var(--lf-tap)', fontSize: 'var(--lf-fs-body)' }}>
                    <Check size={20} aria-hidden /><span className="truncate">{t('living.day.mark_done')}</span>
                  </button>
                )}
                <button type="button" className="lf-round bg-primary/10 text-primary" aria-pressed={speakingThis} aria-label={t(speakingThis ? 'living.stop' : 'living.listen')} onClick={() => listen(task)}>
                  {speakingThis ? <VolumeX size={22} aria-hidden /> : <Volume2 size={22} aria-hidden />}
                </button>
                {schedule && land && user?.id && user?.tenantId && (
                  <button type="button" className="lf-round bg-primary/10 text-primary" aria-label={t('living.ask.photo')} onClick={() => setPhotoTask(task)}>
                    <Camera size={22} aria-hidden />
                  </button>
                )}
              </div>
            </article>
          );
        })}

        <button type="button" onClick={() => navigate('/app/schedule')} className="flex items-center justify-center gap-1 rounded-full border border-border bg-card font-bold text-primary" style={{ minHeight: 'var(--lf-tap)', fontSize: 'var(--lf-fs-lab)' }}>
          {t('living.day.full_schedule')}<ChevronRight size={18} aria-hidden />
        </button>
      </div>

      {photoTask && schedule && land && user?.id && user?.tenantId && (
        <TaskPhotoUploadDialog isOpen onClose={() => setPhotoTask(null)} taskId={photoTask.id} taskType={photoTask.task_type ?? undefined} taskName={photoTask.task_name ?? undefined}
          scheduleId={schedule.id} landId={land.id} farmerId={user.id} tenantId={user.tenantId} cropName={schedule.crop_name ?? undefined} onUploadComplete={() => setPhotoTask(null)} />
      )}
    </div>
  );
}

function Notice({ text, action, onAction, tone = 'idle', icon: Icon }: { text: string; action?: string; onAction?: () => void; tone?: 'idle' | 'ok' | 'warn'; icon?: LucideIcon }) {
  const cls = tone === 'ok' ? 'bg-success/10 text-success' : tone === 'warn' ? 'bg-warning/15 text-warning' : 'bg-foreground/5 text-foreground';
  return (
    <div className={`flex flex-col items-start gap-3 rounded-[var(--lf-r)] ${cls}`} style={{ padding: 'clamp(12px, 3.6vw, 18px)' }}>
      <p className="lf-head">{text}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} className="lf-pill bg-primary text-primary-foreground">{Icon && <Icon size={16} aria-hidden />}{action}</button>
      )}
    </div>
  );
}
