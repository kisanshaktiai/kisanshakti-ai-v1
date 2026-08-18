import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { StagePhase } from '@/hooks/useLandStage';

interface Props {
  phase?: StagePhase;
  className?: string;
}

const StagePhaseBadge: React.FC<Props> = ({ phase, className }) => {
  const { t } = useTranslation();
  if (!phase || phase === 'unknown') return null;

  const styles: Record<Exclude<StagePhase, 'unknown'>, string> = {
    now: 'bg-primary/15 text-primary border-primary/30',
    past: 'bg-muted text-muted-foreground border-border',
    upcoming: 'bg-info/10 text-info border-info/30',
  };

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-semibold px-1.5 py-0', styles[phase], className)}
    >
      {t(`schedule.stage_phase.${phase}`)}
    </Badge>
  );
};

export default StagePhaseBadge;
