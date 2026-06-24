import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Infinity as InfinityIcon } from 'lucide-react';

interface UsageMeterProps {
  label: string;
  current: number;
  limit: number | 'unlimited';
  icon?: React.ReactNode;
  unit?: string;
}

/**
 * Visual usage indicator with progress bar.
 * Color shifts to warning at 75%, destructive at 90%.
 */
export function UsageMeter({ label, current, limit, icon, unit = '' }: UsageMeterProps) {
  const isUnlimited = limit === 'unlimited';
  const numericLimit = isUnlimited ? Infinity : Number(limit);
  const percent = isUnlimited ? 0 : Math.min(100, Math.round((current / numericLimit) * 100));

  const barColorClass =
    percent >= 90
      ? '[&>div]:bg-destructive'
      : percent >= 75
      ? '[&>div]:bg-warning'
      : '[&>div]:bg-primary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1 font-semibold text-foreground">
          <span>{current}{unit}</span>
          <span className="text-muted-foreground">/</span>
          {isUnlimited ? (
            <InfinityIcon className="w-3.5 h-3.5 text-success" />
          ) : (
            <span>{limit}{unit}</span>
          )}
        </div>
      </div>
      {!isUnlimited && (
        <Progress
          value={percent}
          className={cn('h-1.5 [&>div]:transition-colors', barColorClass)}
        />
      )}
    </div>
  );
}
