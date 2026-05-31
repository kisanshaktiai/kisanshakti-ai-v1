import { Pencil, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldChipProps {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  /** 0..1 — kept on data attribute for QA, no longer rendered as visible dots */
  confidence?: number;
  source?: string;
  onClick?: () => void;
  required?: boolean;
  placeholder?: string;
}

export function FieldChip({
  icon, label, value, confidence, source, onClick, required, placeholder,
}: FieldChipProps) {
  const needsAttention = required && !value;
  const isAi = !!value && source && source !== 'farmer';
  const handle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onClick?.();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle(e); } }}
      data-confidence={confidence ?? ''}
      aria-label={`${label}${value ? `: ${value}` : ''}. Tap to edit.`}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 text-left cursor-pointer',
        'rounded-2xl border bg-card transition-colors min-h-[60px] active:scale-[0.98] select-none',
        needsAttention
          ? 'border-destructive/60 bg-destructive/5'
          : isAi
            ? 'border-warning/50 dark:border-warning'
            : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <span className="text-xl shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span>{label}</span>
            {required && <span className="text-destructive">*</span>}
            {isAi && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-warning dark:text-warning bg-warning-soft dark:bg-warning/40 rounded-full px-1.5 py-0.5 ml-1">
                <Sparkles className="h-2.5 w-2.5" />
                AI
              </span>
            )}
          </div>
          <div className={cn(
            'text-sm font-medium truncate mt-0.5',
            !value && 'text-muted-foreground italic font-normal',
          )}>
            {value || placeholder || 'Tap to set'}
          </div>
        </div>
      </div>
      {/* Explicit Edit affordance — 44px tap target inside the chip */}
      <button
        type="button"
        onClick={handle}
        aria-label={`Edit ${label}`}
        className={cn(
          'shrink-0 h-11 w-11 rounded-xl inline-flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-muted active:scale-90 transition',
          isAi && 'text-warning dark:text-warning',
        )}
        tabIndex={-1}
      >
        <Pencil className="h-5 w-5" />
      </button>
    </div>
  );
}
