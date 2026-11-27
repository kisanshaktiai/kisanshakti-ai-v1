import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

interface InnerPageHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Optional control at the right edge (for example a Save button). */
  action?: ReactNode;
}

/**
 * Back button + title for the pages opened from Profile. Pass it to
 * PageShell's `stickyHeader`, so it sits flush under the app header instead
 * of covering it.
 */
export function InnerPageHeader({ title, subtitle, onBack, action }: InnerPageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('common.back')}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold leading-tight text-foreground">{title}</h1>
        {subtitle && <p className="truncate text-xs leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
