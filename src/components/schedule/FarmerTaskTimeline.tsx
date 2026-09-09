import { useMemo, useState } from 'react';
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

export default function FarmerTaskTimeline({ tasks, onTaskComplete, onTaskUpdate, onTakePhoto, stagePhaseOfTask }: Props) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const reduceMotion = useReducedMotion();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);
  const languageMap: Record<string, string> = { hi: 'hi-IN', en: 'en-US', pa: 'pa-IN', mr: 'mr-IN', ta: 'ta-IN' };
  const { speak, stop, isSpeaking, isSupported, isVoicesLoaded } = useTextToSpeech({ language: languageMap[currentLanguage] || 'hi-IN', rate: 0.9 });
  const groupedTasks = useMemo(() => tasks.reduce((acc, task) => { (acc[task.task_date] ||= []).push(task); return acc; }, {} as Record<string, Task[]>), [tasks]);

  const speakTask = (task: Task) => {
    if (!isSupported || !isVoicesLoaded) { toast.error(t('schedule.task_card.read_aloud')); return; }
    if (isSpeaking && speakingTaskId === task.id) { stop(); setSpeakingTaskId(null); return; }
    const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
    speak([p.what, ...p.how, ...p.howMuch].filter(Boolean).join('. '));
    setSpeakingTaskId(task.id);
  };

  const complete = async (taskId: string, completed: boolean) => {
    const completedAt = completed ? new Date().toISOString() : undefined;
    onTaskUpdate?.(taskId, { status: completed ? 'completed' : 'pending', completed_at: completedAt });
    try {
      const { schedulesApi } = await import('@/services/schedulesApi');
      await schedulesApi.setTaskCompletion(taskId, completed, completedAt);
      onTaskComplete?.();
    } catch (error) {
      onTaskUpdate?.(taskId, { status: completed ? 'pending' : 'completed' });
      toast.error(t('schedule.toast.sync_failed'));
      console.error('Task completion sync failed', error);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="schedule-timeline-title">
      <header className="flex items-end justify-between gap-3 border-b-2 border-foreground bg-card px-1 pb-3">
        <div>
          <p className="text-xs font-bold text-foreground">{t('schedule.timeline.current_work')}</p>
          <h3 id="schedule-timeline-title" className="text-xl font-extrabold text-card-foreground">{t('schedule.timeline.title')}</h3>
        </div>
        <Badge variant="outline" className="h-8 border-2 border-foreground bg-card px-3 text-sm font-bold text-card-foreground">
          {t('schedule.timeline.tasks_count', { count: tasks.length })}
        </Badge>
      </header>

      <div className="relative space-y-5 pl-7">
        <div className="absolute bottom-0 left-3 top-0 w-1 bg-border" aria-hidden="true" />
        {Object.entries(groupedTasks).map(([date, dateTasks], groupIndex) => {
          const d = new Date(date);
          const past = isPast(d) && !isToday(d);
          const days = differenceInDays(d, new Date());
          const label = isToday(d) ? t('schedule.timeline.today') : isTomorrow(d) ? t('schedule.timeline.tomorrow') : days > 0 && days <= 7 ? format(d, 'EEEE') : format(d, 'dd MMM');
          return (
            <motion.section key={date} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : groupIndex * 0.03 }} className="relative">
              <div className={cn('absolute -left-[1.35rem] top-1 z-10 flex size-7 items-center justify-center rounded-full border-4 border-background', isToday(d) ? 'bg-warning text-warning-foreground' : past ? 'bg-success text-success-foreground' : 'bg-card text-card-foreground')}>
                {past ? <Check className="size-3.5" strokeWidth={3} /> : <Clock className="size-3.5" strokeWidth={3} />}
              </div>
              <div className="mb-2 flex items-center gap-2 pl-4">
                <h4 className="text-base font-extrabold text-foreground">{label}</h4>
                <span className="text-xs font-bold text-foreground">{format(d, 'dd MMM')}</span>
              </div>

              <div className="space-y-3">
                {dateTasks.map((task) => {
                  const config = resolveTaskTypeConfig(typeConfig, task.task_type);
                  const Icon = config.icon;
                  const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
                  const completed = task.status === 'completed';
                  const overdue = past && task.status === 'pending';
                  const expanded = expandedTaskId === task.id;
                  const precautions = (Array.isArray(task.precautions) ? task.precautions : Array.isArray(task.resources?.precautions) ? task.resources.precautions : []).filter(Boolean);
                  return (
                    <Collapsible key={task.id} open={expanded} onOpenChange={(open) => setExpandedTaskId(open ? task.id : null)}>
                      <article className={cn('overflow-hidden rounded-lg border-2 bg-card text-card-foreground', completed ? 'border-success' : overdue ? 'border-destructive' : expanded ? 'border-warning' : 'border-border')}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="h-auto min-h-20 w-full justify-start rounded-none p-0 text-left hover:bg-muted" aria-label={`${p.what}. ${expanded ? t('schedule.timeline.collapse') : t('schedule.timeline.expand')}`}>
                            <span className={cn('self-stretch w-2 shrink-0', completed ? 'bg-success' : overdue ? 'bg-destructive' : expanded ? 'bg-warning' : 'bg-primary')} aria-hidden="true" />
                            <span className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">
                              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-foreground text-background"><Icon className="size-5" /></span>
                              <span className="min-w-0 flex-1 whitespace-normal">
                                <span className="mb-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-base font-extrabold leading-snug text-card-foreground">{p.what}</span>
                                  <StagePhaseBadge phase={stagePhaseOfTask?.(task)} />
                                </span>
                                {!expanded && p.how[0] && <span className="line-clamp-2 block text-sm font-medium leading-relaxed text-card-foreground">{p.how[0]}</span>}
                                <span className="mt-2 flex flex-wrap gap-1.5">
                                  <Badge variant={overdue ? 'destructive' : completed ? 'default' : task.priority === 'high' ? 'destructive' : 'secondary'} className="font-bold">
                                    {completed ? t('schedule.timeline.done') : overdue ? t('schedule.task_card.overdue') : t(`schedule.task.${task.priority}`, task.priority)}
                                  </Badge>
                                  {task.weather_dependent && <Badge variant="outline" className="border-2 font-bold"><Droplets className="mr-1 size-3" />{t('schedule.badges.weather')}</Badge>}
                                  {task.climate_adjusted && <Badge variant="outline" className="border-2 font-bold"><Zap className="mr-1 size-3" />{t('schedule.badges.ai_adjusted')}</Badge>}
                                </span>
                              </span>
                              <ChevronDown className={cn('mt-2 size-6 shrink-0 text-card-foreground transition-transform', expanded && 'rotate-180')} />
                            </span>
                          </Button>
                        </CollapsibleTrigger>

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
                            <TaskCompletionSection taskId={task.id} status={task.status} completedAt={task.completed_at} onComplete={(id) => complete(id, true)} onUnmark={(id) => complete(id, false)} />
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