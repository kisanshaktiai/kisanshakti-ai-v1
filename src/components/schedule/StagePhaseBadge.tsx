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
    now: 'bg-primary text-primary-foreground border-primary',
    past: 'bg-muted text-foreground border-border',
    upcoming: 'bg-info text-info-foreground border-info',
  };

  return (
    <Badge
      variant="outline"
      className={cn('border-2 px-2 py-0.5 text-xs font-bold', styles[phase], className)}
    >
      {t(`schedule.stage_phase.${phase}`)}
    </Badge>
  );
};

export default StagePhaseBadge;
