import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Leaf, Sprout, Camera, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
    if (i18n.exists(key)) return t(key);
    return /_/.test(label) ? label.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : label;
  };
  const completed = selected?.tasks.filter((task) => task.status === 'completed').length ?? 0;
  const total = selected?.tasks.length ?? 0;

  return (
    <section className="min-w-0 space-y-2" aria-label={t('schedule.graphical.title')}>
      <div className="rounded-2xl border border-border/60 bg-card/80 p-2 shadow-sm">
        <div className="flex items-center gap-1">
          <Button variant="quiet" size="icon" className="size-9 shrink-0 rounded-full" disabled={index <= 0} aria-label={t('schedule.graphical.previous')} onClick={() => setSelection(stages[index - 1]?.id ?? null)}><ChevronLeft className="size-4" /></Button>
          <div className="min-w-0 flex-1 text-center">
            <h4 className="truncate text-sm font-bold text-foreground">{selected ? labelOf(selected, index) : t('schedule.graphical.title')}</h4>
            <p className="text-[11px] text-muted-foreground">{t('schedule.graphical.completed_count', { completed, total })}{selected?.current ? ` · ${t('schedule.graphical.current')}` : ''}</p>
          </div>
          <Button variant="quiet" size="icon" className="size-9 shrink-0 rounded-full" disabled={index >= stages.length - 1} aria-label={t('schedule.graphical.next')} onClick={() => setSelection(stages[index + 1]?.id ?? null)}><ChevronRight className="size-4" /></Button>
          <Button variant="quiet" size="icon" className="size-9 shrink-0 rounded-full" title={t('schedule.crop_growth.upload_photo')} aria-label={t('schedule.crop_growth.upload_photo')} onClick={onCropPhoto}><Camera className="size-4" /></Button>
          <Button variant="quiet" size="icon" className="size-9 shrink-0 rounded-full" title={t('schedule.refreshSchedule')} aria-label={t('schedule.refreshSchedule')} onClick={onRefresh}><RefreshCw className="size-4" /></Button>
        </div>
        <div ref={railRef} className="mt-1.5 flex min-w-0 snap-x gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('schedule.graphical.title')}>
          {stages.map((stage, position) => {
            const active = selectedId === stage.id;
            const done = stage.tasks.length > 0 && stage.tasks.every((task) => task.status === 'completed');
            return (
              <button key={stage.id} type="button" aria-pressed={active} onClick={(event) => { event.stopPropagation(); setSelection(stage.id); }}
                className={cn('flex h-9 shrink-0 snap-center items-center gap-1.5 rounded-full border px-2.5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary/40 bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20' : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/60')}>
                <motion.span animate={!reduceMotion && stage.current ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ duration: 2.4, repeat: Infinity }}
                  className={cn('flex size-5 items-center justify-center rounded-full', stage.current ? 'bg-primary text-primary-foreground' : done ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>
                  {done ? <Check className="size-3" /> : position === 0 ? <Sprout className="size-3" /> : <Leaf className="size-3" />}
                </motion.span>
                <span className="whitespace-nowrap text-xs font-semibold">{labelOf(stage, position)}</span>
                {stage.dasFrom != null && stage.dasTo != null && <span className="whitespace-nowrap text-[10px] text-muted-foreground">{stage.dasFrom}–{stage.dasTo}</span>}
              </button>
            );
          })}
        </div>
        <Progress value={total ? completed / total * 100 : 0} className="mt-1.5 h-1" aria-label={t('schedule.graphical.completed_count', { completed, total })} />
      </div>
      {selected ? (total ? <FarmerTaskTimeline key={selected.id} {...taskProps} tasks={selected.tasks} layout="stage" /> : <p className="py-6 text-center text-sm text-muted-foreground">{t('schedule.graphical.no_tasks')}</p>)
        : <p className="py-6 text-center text-sm text-muted-foreground">{t('schedule.noTasks')}</p>}
    </section>
  );
}
