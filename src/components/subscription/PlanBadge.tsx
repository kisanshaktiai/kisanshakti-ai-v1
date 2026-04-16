import { Crown, Sparkles, Leaf } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PlanBadgeProps {
  planName?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Compact plan badge — used in headers, lists, and cards.
 * Maps Kisan/Shakti/AI PRO to themed icons + colors.
 */
export function PlanBadge({ planName = 'Free', className, size = 'sm' }: PlanBadgeProps) {
  const lower = planName.toLowerCase();

  const config = lower.includes('pro')
    ? { Icon: Crown, gradient: 'from-warning/20 to-warning/10', text: 'text-warning', border: 'border-warning/30' }
    : lower.includes('shakti')
    ? { Icon: Sparkles, gradient: 'from-primary/20 to-accent/20', text: 'text-primary', border: 'border-primary/30' }
    : { Icon: Leaf, gradient: 'from-success/15 to-success/5', text: 'text-success', border: 'border-success/30' };

  const { Icon } = config;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-semibold bg-gradient-to-r border',
        config.gradient,
        config.text,
        config.border,
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className
      )}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {planName}
    </Badge>
  );
}
