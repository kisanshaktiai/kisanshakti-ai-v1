import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Droplets, Leaf, Bug, Scissors, Package, AlertCircle, CheckCircle2, Clock, Zap, ChevronDown, Volume2, VolumeX, Loader2, Camera, Pencil, BookOpen, AlertTriangle } from 'lucide-react';
import { format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { motion } from 'framer-motion';
import { TaskCompletionSection } from './TaskCompletionSection';
import { VideoHelpButton } from './VideoHelpButton';
import ProductRecommendationCard from './ProductRecommendationCard';
import TaskEditDialog from './TaskEditDialog';
import { cn } from '@/lib/utils';
import { formatQuantity } from '@/lib/scheduleFormat';
import { buildScheduleTaskPresentation } from '@/lib/scheduleTaskPresentation';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { toast } from 'sonner';
import { useLanguageStore } from '@/stores/languageStore';
import { useTranslation } from 'react-i18next';
import StagePhaseBadge from './StagePhaseBadge';
import RescheduledNotice from './RescheduledNotice';
import type { StagePhase } from '@/hooks/useLandStage';
import { resolveTaskTypeConfig } from '@/lib/taskTypeIcons';

interface Task {
  id: string; task_date: string; task_type: string; task_name: string;
  task_description?: string; status: string; priority: string; weather_dependent: boolean;
  climate_adjusted?: boolean; auto_rescheduled?: boolean | null; original_date?: string | null;
  adjustment_reason?: string | null; reschedule_reason?: string | null;
  instructions?: string[]; precautions?: string[]; resources?: Record<string, any>;
  product_recommendations?: Array<{ product_name: string; brand?: string; dose_per_acre?: string; price_estimate?: number; product_type?: string; active_ingredient?: string; application_method?: string }>;
  duration_hours?: number; estimated_cost?: number; currency?: string; completed_at?: string;
  stage_uuid?: string | null; language?: string;
}

interface Props {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  onTaskComplete?: () => void;
  onTaskUpdate?: (taskId: string, updates: Partial<Task>) => void;
  onTakePhoto?: (task: Task) => void;
  onEditTask?: (task: Task) => void;
  stagePhaseOfTask?: (task: { stage_uuid?: string | null }) => StagePhase;
}

const typeConfig = {
  irrigation: { icon: Droplets, color: 'from-info to-info', bg: 'bg-info-soft dark:bg-info/20', border: 'border-info/30 dark:border-info' },
  fertilizer: { icon: Leaf, color: 'from-success to-success', bg: 'bg-success-soft dark:bg-success/20', border: 'border-success/30 dark:border-success' },
  nutrition: { icon: Leaf, color: 'from-success to-success', bg: 'bg-success-soft dark:bg-success/20', border: 'border-success/30 dark:border-success' },
  pesticide: { icon: Bug, color: 'from-warning to-warning', bg: 'bg-warning-soft dark:bg-warning/20', border: 'border-warning/30 dark:border-warning' },
  pest_management: { icon: Bug, color: 'from-warning to-warning', bg: 'bg-warning-soft dark:bg-warning/20', border: 'border-warning/30 dark:border-warning' },
  disease_management: { icon: Bug, color: 'from-warning to-warning', bg: 'bg-warning-soft dark:bg-warning/20', border: 'border-warning/30 dark:border-warning' },
  weeding: { icon: Scissors, color: 'from-primary to-primary', bg: 'bg-primary-soft dark:bg-primary/20', border: 'border-primary/30 dark:border-primary' },
  weed_management: { icon: Scissors, color: 'from-primary to-primary', bg: 'bg-primary-soft dark:bg-primary/20', border: 'border-primary/30 dark:border-primary' },
  harvest: { icon: Package, color: 'from-warning to-warning', bg: 'bg-warning-soft dark:bg-warning/20', border: 'border-warning/30 dark:border-warning' },
  other: { icon: AlertCircle, color: 'from-muted-foreground to-muted-foreground/60', bg: 'bg-muted dark:bg-muted/40', border: 'border-border dark:border-border' },
};

export default function FarmerTaskTimeline({ tasks, onTaskClick, onTaskComplete, onTaskUpdate, onTakePhoto, onEditTask, stagePhaseOfTask }: Props) {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [speakingTaskId, setSpeakingTaskId] = useState<string | null>(null);
  const languageMap: Record<string, string> = { hi: 'hi-IN', en: 'en-US', pa: 'pa-IN', mr: 'mr-IN', ta: 'ta-IN' };
  const { speak, stop, isSpeaking, isSupported, isVoicesLoaded } = useTextToSpeech({ language: languageMap[currentLanguage] || 'hi-IN', rate: 0.9 });

  const groupedTasks = useMemo(() => tasks.reduce((acc, task) => { (acc[task.task_date] ||= []).push(task); return acc; }, {} as Record<string, Task[]>), [tasks]);

  const taskTypeLabel = (type: string) => {
    const keys: Record<string, string> = {
      irrigation: 'schedule.stages.irrigation', fertilizer: 'schedule.task_card.product_details', nutrition: 'schedule.task_card.product_details',
      pesticide: 'schedule.stages.pest_control', pest_management: 'schedule.stages.pest_control', disease_management: 'schedule.stages.pest_control',
      weeding: 'schedule.stages.weeding', weed_management: 'schedule.stages.weeding', sowing: 'schedule.stages.sowing', harvest: 'schedule.stages.harvest'
    };
    return t(keys[type?.toLowerCase()] || 'schedule.task_card.description');
  };

  const speakTask = (task: Task) => {
    if (!isSupported || !isVoicesLoaded) { toast.error(t('schedule.task_card.read_aloud', 'Read aloud')); return; }
    if (isSpeaking && speakingTaskId === task.id) { stop(); setSpeakingTaskId(null); return; }
    const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
    const text = [p.what, ...p.how, ...p.howMuch].filter(Boolean).join('. ');
    speak(text); setSpeakingTaskId(task.id);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">{t('schedule.timeline.title')}</h3>
        <Badge variant="outline" className="font-mono text-xs">{t('schedule.timeline.tasks_count', { count: tasks.length })}</Badge>
      </div>
      <div className="relative pl-8 space-y-8">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-accent to-primary/20" />
        {Object.entries(groupedTasks).map(([date, dateTasks], groupIndex) => {
          const d = new Date(date); const past = isPast(d) && !isToday(d);
          const label = isToday(d) ? t('schedule.timeline.today') : isTomorrow(d) ? t('schedule.timeline.tomorrow') : differenceInDays(d, new Date()) > 0 && differenceInDays(d, new Date()) <= 7 ? format(d, 'EEEE') : format(d, 'EEE, dd MMM');
          return (
            <motion.div key={date} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: groupIndex * 0.05 }} className="relative">
              <div className="absolute -left-[1.875rem] top-3"><div className={cn('w-6 h-6 rounded-full flex items-center justify-center', isToday(d) ? 'bg-primary animate-pulse' : 'bg-muted')}><Clock className="h-3.5 w-3.5 text-white" /></div></div>
              <div className="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/70 border border-border"><span className="font-bold text-sm">{label}</span><Badge variant="secondary" className="text-[10px] h-5">{dateTasks.length}</Badge></div>
              <div className="space-y-3">
                {dateTasks.map((task, taskIndex) => {
                  const config = resolveTaskTypeConfig(typeConfig, task.task_type); const Icon = config.icon;
                  const p = buildScheduleTaskPresentation(task as any, t, currentLanguage);
                  const completed = task.status === 'completed'; const overdue = past && task.status === 'pending'; const expanded = expandedTaskId === task.id;
                  return (
                    <Collapsible key={task.id} open={expanded} onOpenChange={(open) => setExpandedTaskId(open ? task.id : null)}>
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: groupIndex * 0.05 + taskIndex * 0.03 }} className={cn('group relative overflow-hidden rounded-xl border-2', completed && 'bg-success/5 border-success/20 opacity-70', overdue && !completed && 'bg-destructive/5 border-destructive/30', !completed && !overdue && `${config.bg} ${config.border}`)}>
                        <CollapsibleTrigger asChild>
                          <div className="relative p-4 cursor-pointer">
                            <div className="flex items-start gap-4">
                              <div className={cn('shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br shadow-lg flex items-center justify-center', config.color)}><Icon className="h-5 w-5 text-white" /></div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 mb-2 min-w-0"><h4 className={cn('font-semibold text-sm', completed ? 'line-through text-muted-foreground' : 'text-foreground')}>{p.what || taskTypeLabel(task.task_type)}</h4><StagePhaseBadge phase={stagePhaseOfTask?.(task)} /></div>
                                  <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                                </div>
                                {!expanded && p.how[0] && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{p.how[0]}</p>}
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'default' : 'secondary'} className="text-[10px] h-5">{task.priority}</Badge>
                                  {task.weather_dependent && <Badge variant="outline" className="text-[10px] h-5 gap-1"><Droplets className="h-2.5 w-2.5" />{t('schedule.badges.weather')}</Badge>}
                                  {task.climate_adjusted && <Badge className="text-[10px] h-5 gap-1"><Zap className="h-2.5 w-2.5" />{t('schedule.badges.ai_adjusted')}</Badge>}
                                  {completed && <Badge className="text-[10px] h-5 gap-1"><CheckCircle2 className="h-2.5 w-2.5" />{t('schedule.timeline.done')}</Badge>}
                                  {overdue && !completed && <Badge variant="destructive" className="text-[10px] h-5">{t('schedule.task_card.overdue')}</Badge>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap justify-end gap-2">
                              {onTakePhoto && <Button type="button" size="sm" onClick={() => onTakePhoto(task)} className="gap-2"><Camera className="h-4 w-4" />{t('cropGrowth.takePhoto', 'Photo')}</Button>}
                              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTask(task)} className="gap-2"><Pencil className="h-4 w-4" />{t('schedule.dialog.edit')}</Button>
                              <VideoHelpButton category={task.task_type} taskType={p.what} />
                              <Button type="button" variant="ghost" size="sm" onClick={() => speakTask(task)} disabled={!isSupported || !isVoicesLoaded} className="gap-2">
                                {isSpeaking && speakingTaskId === task.id ? <><VolumeX className="h-4 w-4" />{t('schedule.close')}</> : !isVoicesLoaded ? <><Loader2 className="h-4 w-4 animate-spin" />{t('schedule.loading.syncing', 'Loading...')}</> : <><Volume2 className="h-4 w-4" />{t('schedule.listen')}</>}
                              </Button>
                            </div>

                            <div className="rounded-xl bg-primary/5 border border-primary/15 p-3 space-y-3">
                              <div><h5 className="text-[10px] font-semibold text-primary uppercase tracking-wide">{t('schedule.task_card.description')}</h5><p className="text-sm font-semibold mt-1">{p.what}</p></div>
                              {p.how.length > 0 && <div><h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('schedule.task_card.instructions')}</h5><ol className="list-decimal list-inside space-y-1 mt-1">{p.how.map((x, i) => <li key={i} className="text-sm text-muted-foreground">{x}</li>)}</ol></div>}
                              {p.howMuch.length > 0 && <div><h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{t('schedule.task_card.quantity')}</h5><div className="space-y-1 mt-1">{p.howMuch.map((x, i) => <p key={i} className="text-sm text-muted-foreground p-2 rounded-lg bg-info/5 border border-info/20">{x}</p>)}</div></div>}
                              {p.technicalDetails.length > 0 && <details className="pt-1"><summary className="cursor-pointer text-xs font-medium flex items-center gap-2"><BookOpen className="h-4 w-4" />{t('schedule.task_card.based_on')}</summary><div className="mt-2 space-y-1">{p.technicalDetails.map((x, i) => <p key={i} className="text-xs text-muted-foreground">{x}</p>)}</div></details>}
                              {!p.how.length && !p.howMuch.length && <p className="text-sm text-muted-foreground italic">{t('schedule.task_card.no_details')}</p>}
                            </div>

                            {(Array.isArray(task.product_recommendations) && task.product_recommendations.length > 0) || Number(task.resources?.labor_cost) > 0 ? <ProductRecommendationCard products={task.product_recommendations || []} landAreaAcres={1} laborCost={task.resources?.labor_cost || 0} laborDays={task.resources?.labor_days || 0} laborWorkers={task.resources?.labor_workers || 0} laborDaysPerAcre={task.resources?.labor_days_per_acre || 0} laborDailyWage={task.resources?.labor_daily_wage || 350} laborDescription={task.resources?.labor_description || ''} /> : null}

                            <TaskCompletionSection taskId={task.id} status={task.status} completedAt={task.completed_at} onComplete={(id) => complete(id, true)} onUnmark={(id) => complete(id, false)} />
                          </div>
                        </CollapsibleContent>
                      </motion.div>
                    </Collapsible>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
      <TaskEditDialog task={editingTask} open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)} onSave={() => onTaskComplete?.()} />
    </div>
  );
}
