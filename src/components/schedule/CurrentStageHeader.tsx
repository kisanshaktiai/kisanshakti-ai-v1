import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sprout, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LandStageInfo } from '@/hooks/useLandStage';

interface Props {
  stage?: LandStageInfo | null;
  /** True when the land's strongly-observed stage is absent from the task list's stage span. */
  disagreement?: boolean;
  className?: string;
}

/**
 * Reads the stage from the land SSOT only — this component never computes a stage.
 */
const CurrentStageHeader: React.FC<Props> = ({ stage, disagreement, className }) => {
  const { t } = useTranslation();
  if (!stage?.stageLabel) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <Card className="border-primary/20 bg-primary/5">
        <div className="flex items-center gap-2 p-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <Sprout className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">{t('schedule.current_stage.label')} </span>
            <span className="font-semibold">{stage.stageLabel}</span>
          </p>
        </div>
      </Card>

      {disagreement && (
        <Card className="border-info/30 bg-info/5">
          <div className="flex items-start gap-2 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('schedule.current_stage.mismatch')}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default CurrentStageHeader;
