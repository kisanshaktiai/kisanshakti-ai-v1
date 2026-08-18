import React from 'react';
import { Card } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PendingSectionsNoticeProps {
  /** Section keys the agronomic database could not cover (e.g. ["fertilizer"]). */
  missingSections?: string[] | null;
  /** Optional coverage map — falsy values are treated as pending sections. */
  coverage?: Record<string, boolean> | null;
  className?: string;
}

/**
 * Renders explicit "pending" placeholders for schedule sections that have no
 * database-backed agronomy yet. Never fabricates a task or a dose.
 */
const PendingSectionsNotice: React.FC<PendingSectionsNoticeProps> = ({
  missingSections,
  coverage,
  className,
}) => {
  const { t } = useTranslation();

  const sections = React.useMemo(() => {
    if (missingSections?.length) return Array.from(new Set(missingSections));
    if (coverage) {
      return Object.entries(coverage)
        .filter(([, ok]) => ok === false)
        .map(([key]) => key);
    }
    return [];
  }, [missingSections, coverage]);

  if (!sections.length) return null;

  return (
    <div className={className}>
      <Card className="bg-muted/40 border-border/60 rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-xs font-semibold text-foreground">
            {t('schedule.section_pending.title')}
          </p>
        </div>
        <ul className="space-y-1.5 pl-1">
          {sections.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />
              <span className="text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  `schedule.section_pending.${key}`,
                  t('schedule.section_pending.generic'),
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default PendingSectionsNotice;
