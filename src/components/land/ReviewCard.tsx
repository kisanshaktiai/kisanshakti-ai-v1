import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Sparkles, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReviewCardState = 'ai' | 'confirmed' | 'empty' | 'manual';

interface Props {
  icon: ReactNode;
  title: string;
  /** One-line summary shown when collapsed / when filled */
  summary?: string | null;
  /** Detailed content (the form fields). When `collapsible`, hidden until expanded. */
  children?: ReactNode;
  state: ReviewCardState;
  onConfirm?: () => void;
  onEdit?: () => void;
  /** Start collapsed; tap title to expand. Useful for optional sections. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  required?: boolean;
  /** When state is 'ai', also render children below the Yes/Change row so
   * fields are reachable without first tapping "Change". Used by Location. */
  alwaysShowChildrenWhenAi?: boolean;
}

const STATE_STYLES: Record<ReviewCardState, string> = {
  ai:        'border-warning/50 dark:border-warning bg-warning-soft/40 dark:bg-warning/20',
  confirmed: 'border-success/50 dark:border-success bg-success-soft/30 dark:bg-success/10',
  empty:     'border-dashed border-border bg-card',
  manual:    'border-border bg-card',
};

export function ReviewCard({
  icon, title, summary, children, state,
  onConfirm, onEdit, collapsible, defaultOpen, required,
  alwaysShowChildrenWhenAi,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);

  return (
    <section
      className={cn(
        'rounded-3xl border p-4 transition-colors',
        STATE_STYLES[state],
      )}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => collapsible && setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-3 text-left',
          collapsible && 'cursor-pointer',
        )}
        aria-expanded={open}
      >
        <div className="shrink-0 h-10 w-10 rounded-2xl bg-background flex items-center justify-center text-xl">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold truncate">{title}</h3>
            {required && <span className="text-destructive text-sm leading-none">*</span>}
            {state === 'confirmed' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-success dark:text-success bg-success-soft dark:bg-success/40 rounded-full px-1.5 py-0.5">
                <Check className="h-2.5 w-2.5" />
                {t('lands.smartConfirm.confirmed', { defaultValue: 'Confirmed' })}
              </span>
            )}
            {state === 'ai' && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-warning dark:text-warning bg-warning-soft dark:bg-warning/40 rounded-full px-1.5 py-0.5">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
          {summary && (
            <p className={cn(
              'text-xs mt-0.5 truncate',
              state === 'empty' ? 'text-muted-foreground italic' : 'text-muted-foreground',
            )}>
              {summary}
            </p>
          )}
        </div>
        {collapsible ? (
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform shrink-0',
              open && 'rotate-180',
            )}
          />
        ) : null}
      </button>

      {/* AI confirm-by-tap row */}
      {state === 'ai' && !open && (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            {t('lands.smartConfirm.aiPrompt', { defaultValue: 'AI guessed this. Looks right?' })}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirm?.(); }}
            className="h-9 px-3 rounded-full bg-success text-white text-xs font-semibold inline-flex items-center gap-1 active:scale-95"
          >
            <Check className="h-3.5 w-3.5" />
            {t('common.yes', { defaultValue: 'Yes' })}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit ? onEdit() : setOpen(true); }}
            className="h-9 px-3 rounded-full bg-card border border-border text-xs font-semibold inline-flex items-center gap-1 active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('common.change', { defaultValue: 'Change' })}
          </button>
        </div>
      )}

      {/* Edit affordance for confirmed/manual */}
      {(state === 'confirmed' || state === 'manual') && !open && collapsible !== false && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit ? onEdit() : setOpen(true); }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary font-medium"
        >
          <Pencil className="h-3 w-3" />
          {t('common.edit', { defaultValue: 'Edit' })}
        </button>
      )}

      {/* Body */}
      {(open || (state === 'ai' && alwaysShowChildrenWhenAi)) && children && (
        <div className="mt-4 space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
