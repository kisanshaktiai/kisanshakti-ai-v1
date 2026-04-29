import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldChipProps {
  icon?: React.ReactNode;
  label: string;
  value: string | null | undefined;
  confidence?: number; // 0..1
  source?: string;
  onClick?: () => void;
  required?: boolean;
  placeholder?: string;
}

function dotsForConfidence(c?: number) {
  if (c == null) return null;
  const filled = Math.max(1, Math.min(5, Math.round(c * 5)));
  const tone =
    c >= 0.8 ? 'bg-green-500' :
    c >= 0.5 ? 'bg-amber-500' :
               'bg-red-500';
  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            i < filled ? tone : 'bg-muted',
          )}
        />
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground">
        {Math.round(c * 100)}%
      </span>
    </span>
  );
}

export function FieldChip({
  icon, label, value, confidence, source, onClick, required, placeholder,
}: FieldChipProps) {
  const needsAttention = required && !value;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3.5',
        'rounded-2xl border bg-card text-left transition-colors',
        'min-h-[56px] active:scale-[0.98]',
        needsAttention
          ? 'border-destructive/60 bg-destructive/5'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && <span className="text-xl shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center text-xs text-muted-foreground">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
            {dotsForConfidence(confidence)}
          </div>
          <div className={cn(
            'text-sm font-medium truncate mt-0.5',
            !value && 'text-muted-foreground italic font-normal',
          )}>
            {value || placeholder || 'Tap to set'}
          </div>
          {source && value && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
              via {source}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {value && confidence && confidence >= 0.8 && (
          <Check className="h-4 w-4 text-green-600" />
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
