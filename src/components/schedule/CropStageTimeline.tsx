import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Leaf, Sprout, Camera, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { buildStageTimeline, initialTimelineStage, type SavedStage } from '@/lib/scheduleStageTimeline';
import type { LandStageInfo } from '@/hooks/useLandStage';
import FarmerTaskTimeline from './FarmerTaskTimeline';

type Props = ComponentProps<typeof FarmerTaskTimeline> & {
  savedStages: SavedStage[];
  landStage?: LandStageInfo;
  onCropPhoto: () => void;
  onRefresh: () => void;
};

/** Read-only stage navigation: no crop phenology, quantities or dates are inferred here. */
export default function CropStageTimeline({ savedStages, landStage, onCropPhoto, onRefresh, ...taskProps }: Props) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const stages = useMemo(() => buildStageTimeline(taskProps.tasks, savedStages, landStage?.stageUuid), [taskProps.tasks, savedStages, landStage?.stageUuid]);
  const [selection, setSelection] = useState<string | null>(null);
  const selectedId = selection && stages.some((s) => s.id === selection) ? selection : initialTimelineStage(stages);
  const selected = stages.find((s) => s.id === selectedId);
  const index = stages.findIndex((s) => s.id === selectedId);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedId, reduceMotion]);
  const labelOf = (stage: (typeof stages)[number], position: number) => {
    if (stage.unassigned) return t('schedule.graphical.unassigned');
    const label = stage.label;
    if (!label || /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(label)) return t('schedule.graphical.stage_number', { number: position + 1 });
    const key = `stage.${label.toLowerCase().trim().replace(/[\s/-]+/g, '_')}`;
    return i18n.exists(key) ? t(key) : label;
  };
  const completed = selected?.tasks.filter((task) => task.status === 'completed').length ?? 0;
  const total = selected?.tasks.length ?? 0;

  return (
    <section className="min-w-0 space-y-3" aria-label={t('schedule.graphical.title')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Sprout className="size-4 text-primary" />{t('schedule.graphical.title')}</h3>
        <div className="flex gap-1">
          <Button variant="quiet" size="icon" className="size-11" title={t('schedule.crop_growth.upload_photo')} aria-label={t('schedule.crop_growth.upload_photo')} onClick={onCropPhoto}><Camera /></Button>
          <Button variant="quiet" size="icon" className="size-11" title={t('schedule.refreshSchedule')} aria-label={t('schedule.refreshSchedule')} onClick={onRefresh}><RefreshCw /></Button>
        </div>
      </div>
      <div ref={railRef} className="flex min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-2" role="group" aria-label={t('schedule.graphical.title')}>
        {stages.map((stage, position) => (
          <div key={stage.id} className="relative w-32 shrink-0 snap-center px-1">
            {position < stages.length - 1 && <div className="absolute left-1/2 right-[-50%] top-7 h-px bg-border" aria-hidden="true" />}
            <Button variant="quiet" aria-pressed={selectedId === stage.id} onClick={(event) => { event.stopPropagation(); setSelection(stage.id); }}
              className={cn('relative h-auto min-h-32 w-full flex-col justify-start gap-1.5 whitespace-normal rounded-lg px-2 py-2 text-center', selectedId === stage.id && 'bg-primary/10 ring-1 ring-inset ring-primary/30')}>
              <motion.span animate={!reduceMotion && stage.current ? { rotate: [-3, 3, -3] } : { rotate: 0 }} transition={{ duration: 3, repeat: Infinity }}
                className={cn('relative flex size-10 items-center justify-center rounded-full border-2 bg-background', stage.current ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
                {stage.tasks.length > 0 && stage.tasks.every((task) => task.status === 'completed') ? <Check className="size-5" /> : position === 0 ? <Sprout className="size-5" /> : <Leaf className="size-5" />}
              </motion.span>
              <span className="text-xs font-semibold leading-snug text-foreground">{labelOf(stage, position)}</span>
              <span className="text-[11px] text-muted-foreground">{stage.dasFrom != null && stage.dasTo != null ? t('schedule.graphical.day_range', { from: stage.dasFrom, to: stage.dasTo }) : t('schedule.timeline.tasks_count', { count: stage.tasks.length })}</span>
              {stage.current && <span className="text-[10px] font-bold text-primary">{t('schedule.graphical.current')}</span>}
            </Button>
          </div>
        ))}
      </div>
      {selected ? <>
        <div className="space-y-2 border-y border-border py-3">
          <div className="flex items-center gap-2">
            <Button variant="quiet" size="icon" className="size-11 shrink-0" disabled={index <= 0} aria-label={t('schedule.graphical.previous')} onClick={() => setSelection(stages[index - 1]?.id ?? null)}><ChevronLeft /></Button>
            <div className="min-w-0 flex-1 text-center"><h4 className="break-words text-base font-bold text-foreground">{labelOf(selected, index)}</h4><p className="mt-1 text-xs text-muted-foreground">{t('schedule.graphical.completed_count', { completed, total })}</p></div>
            <Button variant="quiet" size="icon" className="size-11 shrink-0" disabled={index >= stages.length - 1} aria-label={t('schedule.graphical.next')} onClick={() => setSelection(stages[index + 1]?.id ?? null)}><ChevronRight /></Button>
          </div>
          <Progress value={total ? completed / total * 100 : 0} className="h-1.5" aria-label={t('schedule.graphical.completed_count', { completed, total })} />
          {selected.current && <Badge variant="outline" className="border-primary/30 text-primary">{t('schedule.graphical.current')}</Badge>}
        </div>
        {total ? <FarmerTaskTimeline key={selected.id} {...taskProps} tasks={selected.tasks} layout="stage" /> : <p className="py-8 text-center text-sm text-muted-foreground">{t('schedule.graphical.no_tasks')}</p>}
      </> : <p className="py-6 text-center text-sm text-muted-foreground">{t('schedule.noTasks')}</p>}
    </section>
  );
}