import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertCircle, BookOpen, Bug, Camera, Check, CheckCircle2, ChevronDown, Clock, Droplets, Leaf, Loader2, Package, Pencil, Scissors, ShieldAlert, Volume2, VolumeX, Zap } from 'lucide-react';
import { differenceInDays, format, isPast, isToday, isTomorrow } from 'date-fns';
import { motion, useReducedMotion } from 'framer-motion';
import { TaskCompletionSection } from './TaskCompletionSection';
import { VideoHelpButton } from './VideoHelpButton';
import ProductRecommendationCard from './ProductRecommendationCard';
import TaskEditDialog from './TaskEditDialog';
import { cn } from '@/lib/utils';
import { buildScheduleTaskPresentation } from '@/lib/scheduleTaskPresentation';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cloudProvider } from '@/services/tts/providers/cloudProvider';
import { toast } from 'sonner';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslation } from 'react-i18next';
import StagePhaseBadge from './StagePhaseBadge';
import type { StagePhase } from '@/hooks/useLandStage';
import { resolveTaskTypeConfig } from '@/lib/taskTypeIcons';

interface Task {
  id: string; task_date: string; task_type: string; task_name: string;
  task_description?: string; status: string; priority: string; weather_dependent: boolean;
  climate_adjusted?: boolean; instructions?: string[]; detailed_steps?: string[]; precautions?: string[];
  resources?: Record<string, any>; completed_at?: string; stage_uuid?: string | null; language?: string;
  product_recommendations?: Array<{ product_name: string; brand?: string; dose_per_acre?: string; price_estimate?: number; product_type?: string; active_ingredient?: string; application_method?: string }>;
}

interface Props {
  layout?: 'basic' | 'stage';
  tasks: Task[]; onTaskClick?: (task: Task) => void; onTaskComplete?: () => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void; onTakePhoto?: (task: Task) => void;
  onEditTask?: (task: Task) => void; stagePhaseOfTask?: (task: { stage_uuid?: string | null }) => StagePhase;
}

const typeConfig = {
  irrigation: { icon: Droplets }, fertilizer: { icon: Leaf }, nutrition: { icon: Leaf },
  pesticide: { icon: Bug }, pest_management: { icon: Bug }, disease_management: { icon: Bug },
  weeding: { icon: Scissors }, weed_management: { icon: Scissors }, harvest: { icon: Package },
  other: { icon: AlertCircle },
};

export default function FarmerTaskTimeline({ tasks, onTaskComplete, onTaskUpdate, onTakePhoto, stagePhaseOfTask, layout = 'basic' }: Props) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const reduceMotion = useReducedMotion();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(() => layout === 'stage' ? tasks[0]?.id ?? null : null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);
  // Optional farmer MEASUREMENT; never default to the scheduled water volume.
  const [actualIrrigationLitres, setActualIrrigationLitres] = useState<Record<string, string>>({});
  // The TTS service maps the app language to a device locale itself, so no
  // per-language map is kept here (a map silently sent every unlisted language
  // to en-US, which read Indian-script text with an English voice).
  const { speak, stop, isSpeaking, isSupported, isVoicesLoaded, voiceUnavailable, openVoiceInstall, canInstallVoice } =
    useTextToSpeech({ language: currentLanguage });
  const groupedTasks = useMemo(() => tasks.reduce((acc, task) => { (acc[task.task_date] ||= []).push(task); return acc; }, {} as Record<string, Task[]>), [tasks]);

  // Ask which natural voices exist as soon as the screen opens, so tapping the
  // speaker icon starts speaking instead of waiting for that check.
  useEffect(() => { cloudProvider.warmUp(); }, []);



  const speakTask = (task: Task) => {
    // Only engine support gates playback. The voice inventory is NOT a gate:
    // a handset can speak while reporting no inventory, and gating on it
    // silenced Read Aloud on the schedule screen entirely.
    if (!isSupported) { toast.error(t('schedule.task_card.read_aloud')); return; }
    if (isSpeaking && speakingTaskId === task.id) { stop(); setSpeakingTaskId(null); return; }
    const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
    speak([p.what, ...p.how, ...p.howMuch].filter(Boolean).join('. '));
    setSpeakingTaskId(task.id);
  };

  // When the handset has no voice for this language, say so and offer the
  // system voice installer instead of failing silently.
  useEffect(() => {
    if (!voiceUnavailable) return;
    setSpeakingTaskId(null);
    toast.error(t('schedule.task_card.voice_not_installed', 'Voice not installed on this device'), {
      action: canInstallVoice
        ? { label: t('schedule.task_card.install_voice', 'Install'), onClick: () => { void openVoiceInstall(); } }
        : undefined,
    });
  }, [voiceUnavailable, canInstallVoice, openVoiceInstall, t]);

  const complete = async (taskId: string, completed: boolean) => {
    const irrigationTask = tasks.find((task) => task.id === taskId && task.task_type === 'irrigation');
    const rawLitres = actualIrrigationLitres[taskId]?.trim() ?? '';
    const parsedLitres = rawLitres ? Number(rawLitres) : null;
    if (completed && irrigationTask && rawLitres && (parsedLitres === null || !Number.isFinite(parsedLitres) || parsedLitres <= 0)) {
      toast.error(t('schedule.irrigation.invalid_actual_litres', 'Enter a positive measured volume in litres, or leave blank if unknown.'));
      throw new Error('Invalid measured irrigation volume');
    }
    const actualResources = completed && irrigationTask && parsedLitres != null
      ? { volume_litres: parsedLitres } : null;
    const completedAt = completed ? new Date().toISOString() : undefined;
    onTaskUpdate?.(taskId, { status: completed ? 'completed' : 'pending', completed_at: completedAt });
    try {
      const { schedulesApi } = await import('@/services/schedulesApi');
      const saved = await schedulesApi.setTaskCompletion(taskId, completed, completedAt, actualResources);
      // Recurring irrigation/scouting cards can remain pending after an event.
      // Always render server-confirmed date/status rather than optimistic "done".
      if (saved) onTaskUpdate?.(taskId, saved);
      if (completed && irrigationTask) setActualIrrigationLitres((prev) => ({ ...prev, [taskId]: '' }));
      onTaskComplete?.();
    } catch (error) {
      onTaskUpdate?.(taskId, { status: completed ? 'pending' : 'completed' });
      toast.error(t('schedule.toast.sync_failed'));
      console.error('Task completion sync failed', error);
      throw error;
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={layout === 'basic' ? 'schedule-timeline-title' : undefined}>
      {layout === 'basic' && <header className="flex items-end justify-between gap-3 border-b-2 border-foreground bg-card px-1 pb-3">
        <div>
          <p className="text-xs font-bold text-foreground">{t('schedule.timeline.current_work')}</p>
          <h3 id="schedule-timeline-title" className="text-xl font-extrabold text-card-foreground">{t('schedule.timeline.title')}</h3>
        </div>
        <Badge variant="outline" className="h-8 border-2 border-foreground bg-card px-3 text-sm font-bold text-card-foreground">
          {t('schedule.timeline.tasks_count', { count: tasks.length })}
        </Badge>
      </header>}

      <div className={cn('relative space-y-5', layout === 'basic' && 'pl-7')}>
        {layout === 'basic' && <div className="absolute bottom-0 left-3 top-0 w-1 bg-border" aria-hidden="true" />}
        {Object.entries(groupedTasks).map(([date, dateTasks], groupIndex) => {
          const d = new Date(date);
          const past = isPast(d) && !isToday(d);
          const days = differenceInDays(d, new Date());
          const label = isToday(d) ? t('schedule.timeline.today') : isTomorrow(d) ? t('schedule.timeline.tomorrow') : days > 0 && days <= 7 ? format(d, 'EEEE') : format(d, 'dd MMM');
          return (
            <motion.section key={date} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : groupIndex * 0.03 }} className="relative">
              {layout === 'basic' && <div className={cn('absolute -left-[1.35rem] top-1 z-10 flex size-7 items-center justify-center rounded-full border-4 border-background', isToday(d) ? 'bg-warning text-warning-foreground' : past ? 'bg-success text-success-foreground' : 'bg-card text-card-foreground')}>
                {past ? <Check className="size-3.5" strokeWidth={3} /> : <Clock className="size-3.5" strokeWidth={3} />}
              </div>}
              <div className={cn('mb-2 flex items-center gap-2', layout === 'basic' && 'pl-4')}>
                <h4 className="text-base font-extrabold text-foreground">{label}</h4>
                {layout === 'basic' && <span className="text-xs font-bold text-foreground">{format(d, 'dd MMM')}</span>}
              </div>

              <div className="space-y-3">
                {dateTasks.map((task) => {
                  const config = resolveTaskTypeConfig(typeConfig, task.task_type);
                  const Icon = config.icon;
                  const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
                  const completed = task.status === 'completed';
                  const expired = task.resources?.timeline?.state === 'HISTORICAL_UNCONFIRMED';
                  const overdue = past && task.status === 'pending';
                  const expanded = expandedTaskId === task.id;
                  const precautions = (Array.isArray(task.precautions) ? task.precautions : Array.isArray(task.resources?.precautions) ? task.resources.precautions : []).filter(Boolean);
                  return (
                    <Collapsible key={task.id} open={expanded} onOpenChange={(open) => setExpandedTaskId(open ? task.id : null)}>
                      <article className={cn('relative overflow-hidden rounded-lg border-2 bg-card text-card-foreground', completed ? 'border-success' : expired ? 'border-muted' : overdue ? 'border-destructive' : expanded ? 'border-warning' : 'border-border')}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="h-auto min-h-20 w-full justify-start rounded-none p-0 text-left hover:bg-muted" aria-label={`${p.what}. ${expanded ? t('schedule.timeline.collapse') : t('schedule.timeline.expand')}`}>
                            <span className={cn('self-stretch w-2 shrink-0', completed ? 'bg-success' : expired ? 'bg-muted' : overdue ? 'bg-destructive' : expanded ? 'bg-warning' : 'bg-primary')} aria-hidden="true" />
                            <span className={cn('flex min-w-0 flex-1 items-start gap-3 py-3 pl-3', expired ? 'pr-3' : 'pr-14')}>
                              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-foreground text-background"><Icon className="size-5" /></span>
                              <span className="min-w-0 flex-1 whitespace-normal">
                                <span className="mb-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-base font-extrabold leading-snug text-card-foreground">{p.what}</span>
                                  <StagePhaseBadge phase={stagePhaseOfTask?.(task)} />
                                </span>
                                {!expanded && p.how[0] && <span className="line-clamp-2 block text-sm font-medium leading-relaxed text-card-foreground">{p.how[0]}</span>}
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  <Badge variant={overdue ? 'destructive' : completed ? 'default' : task.priority === 'high' ? 'destructive' : 'secondary'} className="font-bold">
                                    {completed ? t('schedule.timeline.done') : expired ? t('schedule.completion.status', { status: task.status }) : overdue ? t('schedule.task_card.overdue') : t(`schedule.task.${task.priority}`, task.priority)}
                                  </Badge>
                                  {task.weather_dependent && <Badge variant="outline" className="border-2 font-bold"><Droplets className="mr-1 size-3" />{t('schedule.badges.weather')}</Badge>}
                                  {task.climate_adjusted && <Badge variant="outline" className="border-2 font-bold"><Zap className="mr-1 size-3" />{t('schedule.badges.ai_adjusted')}</Badge>}
                                </span>
                              </span>
                              <ChevronDown className={cn(!expired ? 'absolute bottom-3 right-4 size-5' : 'mt-2 size-6', 'shrink-0 text-card-foreground transition-transform', expanded && 'rotate-180')} />
                            </span>
                          </Button>
                        </CollapsibleTrigger>
                        {!expired && (
                          <button
                            type="button"
                            aria-pressed={completed}
                            aria-label={completed ? t('schedule.completion.unmark', 'Mark as not done') : t('schedule.completion.mark_complete', 'Mark complete')}
                            onClick={(event) => { event.stopPropagation(); void complete(task.id, !completed).catch(() => undefined); }}
                            className={cn('absolute right-2 top-2 z-10 flex size-10 items-center justify-center rounded-full border-2 transition-all duration-300 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              completed ? 'border-success bg-success text-success-foreground shadow-md' : 'border-primary/40 bg-background text-primary hover:border-primary hover:bg-primary/10')}
                          >
                            <motion.span key={String(completed)} initial={reduceMotion ? false : { scale: 0.4, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                              <Check className="size-5" strokeWidth={3} />
                            </motion.span>
                          </button>
                        )}

                        <CollapsibleContent>
                          <div className="space-y-4 border-t-2 border-border bg-card p-3" onClick={(event) => event.stopPropagation()}>
                            {p.howMuch.length > 0 && (
                              <section className="grid gap-2 sm:grid-cols-2">
                                {p.howMuch.map((amount, index) => <div key={index} className="rounded-md border-2 border-foreground bg-background p-3"><p className="text-xs font-bold text-foreground">{t('schedule.farmer_task.how_much')}</p><p className="mt-1 text-lg font-extrabold leading-snug text-foreground">{amount}</p></div>)}
                              </section>
                            )}
                            <section aria-labelledby={`steps-${task.id}`}>
                              <h5 id={`steps-${task.id}`} className="mb-2 text-sm font-extrabold text-card-foreground">{t('schedule.farmer_task.how')}</h5>
                              {p.how.length > 0 ? <ol className="space-y-2">{p.how.map((step, index) => <li key={index} className="flex items-start gap-3 rounded-md border border-border bg-background p-3 text-base font-semibold leading-relaxed text-foreground"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">{index + 1}</span><span>{step}</span></li>)}</ol> : <p className="rounded-md border border-border bg-background p-3 text-sm font-semibold text-foreground">{t('schedule.farmer_task.how_not_available')}</p>}
                            </section>
                            {precautions.length > 0 && <section className="overflow-hidden rounded-md border-2 border-warning"><h5 className="flex items-center gap-2 bg-warning px-3 py-2 text-sm font-extrabold text-warning-foreground"><ShieldAlert className="size-5" />{t('schedule.task_card.precautions')}</h5><ul className="space-y-2 bg-card p-3">{precautions.map((item: string, index: number) => <li key={index} className="text-sm font-semibold leading-relaxed text-card-foreground">• {item}</li>)}</ul></section>}
                            {p.needsTranslation && <p className="rounded-md border-2 border-warning bg-warning-soft p-3 text-sm font-bold text-foreground">{t('schedule.farmer_task.translation_pending')}</p>}
                            {p.technicalDetails.length > 0 && <details className="rounded-md border border-border bg-muted p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-foreground"><BookOpen className="size-4" />{t('schedule.farmer_task.technical_details')}</summary><ul className="mt-2 space-y-2">{p.technicalDetails.map((line, index) => <li key={index} className="text-sm leading-relaxed text-foreground">{line}</li>)}</ul></details>}
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {onTakePhoto && <Button type="button" variant="outline" className="min-h-11 gap-2 border-2" onClick={() => onTakePhoto(task)}><Camera className="size-4" />{t('cropGrowth.takePhoto', 'Photo')}</Button>}
                              <Button type="button" variant="outline" className="min-h-11 gap-2 border-2" onClick={() => setEditingTask(task)}><Pencil className="size-4" />{t('schedule.dialog.edit')}</Button>
                              <VideoHelpButton category={task.task_type} taskType={p.what} />
                              <Button type="button" variant="outline" className="min-h-11 gap-2 border-2" onClick={() => speakTask(task)} disabled={!isSupported || !isVoicesLoaded} aria-label={t('schedule.listen')}>
                                {!isVoicesLoaded ? <Loader2 className="size-4 animate-spin" /> : isSpeaking && speakingTaskId === task.id ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}{t('schedule.listen')}
                              </Button>
                            </div>
                            {((task.product_recommendations?.length ?? 0) > 0 || Number(task.resources?.labor_cost) > 0) && <ProductRecommendationCard products={task.product_recommendations || []} landAreaAcres={1} laborCost={task.resources?.labor_cost || 0} laborDays={task.resources?.labor_days || 0} laborWorkers={task.resources?.labor_workers || 0} laborDaysPerAcre={task.resources?.labor_days_per_acre || 0} laborDailyWage={task.resources?.labor_daily_wage || 350} laborDescription={task.resources?.labor_description || ''} />}
                            {!expired && task.task_type === 'irrigation' && task.status !== 'completed' && (
                              <div className="space-y-2 rounded-lg border border-border p-3">
                                <label className="block text-sm font-medium text-foreground" htmlFor={`irrigation-volume-${task.id}`}>
                                  {t('schedule.irrigation.actual_litres_label', 'Actual water applied (litres, optional)')}
                                </label>
                                <input
                                  id={`irrigation-volume-${task.id}`}
                                  type="number" inputMode="decimal" min="0" step="any"
                                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                                  value={actualIrrigationLitres[task.id] ?? ''}
                                  onChange={(event) => setActualIrrigationLitres((prev) => ({ ...prev, [task.id]: event.target.value }))}
                                  placeholder={t('schedule.irrigation.actual_litres_placeholder', 'Leave blank if not measured')}
                                />
                                <p className="text-xs text-muted-foreground">
                                  {t('schedule.irrigation.actual_litres_hint', 'Only enter water you measured. Planned amounts are not actual measurements.')}
                                </p>
                              </div>
                            )}
                            {!expired && <TaskCompletionSection taskId={task.id} status={task.status} completedAt={task.completed_at} onComplete={(id) => complete(id, true)} onUnmark={(id) => complete(id, false)} />}
                          </div>
                        </CollapsibleContent>
                      </article>
                    </Collapsible>
                  );
                })}
              </div>
            </motion.section>
          );
        })}
      </div>
      <TaskEditDialog task={editingTask} open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)} onSave={() => onTaskComplete?.()} />
    </section>
  );
}