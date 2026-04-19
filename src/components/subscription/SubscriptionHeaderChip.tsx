import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Crown, Sparkles, Leaf, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact subscription chip for the app header.
 * Always visible — gives farmers a one-tap entry to /app/subscription.
 * Color-coded by status (active/grace/expired) and plan tier.
 */
export function SubscriptionHeaderChip() {
  const navigate = useNavigate();
  const { data, planName, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();

  if (isLoading) {
    return (
      <div className="h-7 w-16 rounded-full bg-muted/40 animate-pulse" />
    );
  }

  const isExpired = subscriptionStatus === 'expired' || (data && !data.valid);
  const isExpiringSoon =
    subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;

  // Pick icon by plan tier
  const Icon =
    planName === 'AI PRO' ? Crown : planName === 'Shakti' ? Sparkles : Leaf;

  // Pick color by status
  const tone = isExpired
    ? 'bg-destructive/15 text-destructive border-destructive/30'
    : isInGracePeriod || isExpiringSoon
    ? 'bg-warning/15 text-warning border-warning/30'
    : planName === 'AI PRO'
    ? 'bg-gradient-to-r from-warning/20 to-warning/10 text-warning border-warning/30'
    : planName === 'Shakti'
    ? 'bg-gradient-to-r from-primary/15 to-accent/15 text-primary border-primary/30'
    : 'bg-success/15 text-success border-success/30';

  const label = isExpired
    ? 'Expired'
    : isInGracePeriod
    ? `Grace ${daysRemaining}d`
    : isExpiringSoon
    ? `${daysRemaining}d left`
    : planName;

  return (
    <button
      onClick={() => navigate('/app/subscription')}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold',
        'transition-all hover:scale-105 active:scale-95 shadow-sm',
        tone
      )}
      aria-label="View subscription"
    >
      {(isExpired || isExpiringSoon || isInGracePeriod) ? (
        <AlertTriangle className="w-3 h-3" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
