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
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      data-confidence={confidence ?? ''}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3 text-left',
        'rounded-2xl border bg-card transition-colors min-h-[60px] active:scale-[0.98]',
        needsAttention
          ? 'border-destructive/60 bg-destructive/5'
          : isAi
            ? 'border-amber-300 dark:border-amber-800'
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
              <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 rounded-full px-1.5 py-0.5 ml-1">
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
      <Pencil className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
