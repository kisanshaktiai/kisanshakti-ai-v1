import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Crown, Sparkles, Leaf, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact subscription chip for the app header.
 * Always visible — gives farmers a one-tap entry to /app/subscription.
 * Color-coded by status (active/grace/expired) and plan tier.
 *
 * Resilience: if loading >3s with no data, render an optimistic "Free"
 * chip instead of an indefinite skeleton.
 */
export function SubscriptionHeaderChip() {
  const navigate = useNavigate();
  const { data, planName, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();
  const [loadTimeoutHit, setLoadTimeoutHit] = useState(false);

  useEffect(() => {
    if (!isLoading || data) {
      setLoadTimeoutHit(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimeoutHit(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading, data]);

  // Show skeleton only briefly
  if (isLoading && !data && !loadTimeoutHit) {
    return <div className="h-7 w-16 rounded-full bg-muted/40 animate-pulse" />;
  }

  // Optimistic fallback: render "Free" chip if data never arrived
  const effectivePlanName = data ? planName : 'Free';
  const isExpired = data ? (subscriptionStatus === 'expired' || !data.valid) : false;
  const isExpiringSoon =
    !!data && subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;

  const Icon =
    effectivePlanName === 'AI PRO' ? Crown : effectivePlanName === 'Shakti' ? Sparkles : Leaf;

  const tone = isExpired
    ? 'bg-destructive/15 text-destructive border-destructive/30'
    : isInGracePeriod || isExpiringSoon
    ? 'bg-warning/15 text-warning border-warning/30'
    : effectivePlanName === 'AI PRO'
    ? 'bg-gradient-to-r from-warning/20 to-warning/10 text-warning border-warning/30'
    : effectivePlanName === 'Shakti'
    ? 'bg-gradient-to-r from-primary/15 to-accent/15 text-primary border-primary/30'
    : 'bg-success/15 text-success border-success/30';

  const label = isExpired
    ? 'Expired'
    : isInGracePeriod
    ? `Grace ${daysRemaining}d`
    : isExpiringSoon
    ? `${daysRemaining}d left`
    : effectivePlanName;

  return (
    <button
      onClick={() => navigate('/app/subscription')}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold',
        'transition-all hover:scale-105 active:scale-95 shadow-sm',
        tone
      )}
      aria-label="View subscription"
      title={!data ? 'Tap to refresh subscription' : undefined}
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
