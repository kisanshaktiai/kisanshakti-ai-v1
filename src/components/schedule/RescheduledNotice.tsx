import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  /** Set by the reconciler when it shifted this task. */
  autoRescheduled?: boolean | null;
  /** Date the task originally sat on, written once by the reconciler. */
  originalDate?: string | null;
  /** Current task date. */
  taskDate?: string | null;
  /** Reconciler reason string, e.g. `stage_drift:4d`. */
  adjustmentReason?: string | null;
  className?: string;
  /** `chip` = badge only, `full` = badge + plain-language explanation. */
  variant?: 'chip' | 'full';
}

/** Parses the reconciler's `stage_drift:<n>d` marker. Presentation only. */
function parseDriftDays(reason?: string | null): number | null {
  if (!reason) return null;
  const m = /stage_drift:(-?\d+)d/.exec(reason);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Shows the farmer WHY a task date moved. Read-only rendering of what the
 * schedule reconciler already wrote — no dates or agronomy computed here.
 */
const RescheduledNotice: React.FC<Props> = ({
  autoRescheduled,
  originalDate,
  taskDate,
  adjustmentReason,
  className,
  variant = 'chip',
}) => {
  const { t } = useTranslation();
  if (!autoRescheduled) return null;

  const original = safeDate(originalDate);
  const current = safeDate(taskDate);

  let drift = parseDriftDays(adjustmentReason);
  if (drift == null && original && current) {
    drift = Math.round((current.getTime() - original.getTime()) / 86400000);
  }

  const explanation =
    drift == null || drift === 0
      ? t('schedule.rescheduled.generic')
      : drift > 0
        ? t('schedule.rescheduled.later', { days: Math.abs(drift) })
        : t('schedule.rescheduled.earlier', { days: Math.abs(drift) });

  const chip = (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold px-1.5 py-0 bg-warning/10 text-warning border-warning/30"
    >
      <CalendarClock className="h-3 w-3 mr-1" />
      {t('schedule.rescheduled.label')}
    </Badge>
  );

  if (variant === 'chip') return <span className={className}>{chip}</span>;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        {chip}
        {original && (
          <span className="text-[10px] text-muted-foreground line-through">
            {t('schedule.rescheduled.was', { date: format(original, 'dd MMM') })}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{explanation}</p>
    </div>
  );
};

export default RescheduledNotice;
