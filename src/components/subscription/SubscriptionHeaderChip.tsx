import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Crown, Sparkles, Leaf, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact subscription chip for the app header.
 * Shows ONLY plan name (no days) to preserve header space for brand.
 */
export function SubscriptionHeaderChip() {
  const navigate = useNavigate();
  const { data, planName, isInGracePeriod, subscriptionStatus, isLoading } =
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

  if (isLoading && !data && !loadTimeoutHit) {
    return <div className="h-6 w-12 rounded-full bg-muted/40 animate-pulse" />;
  }

  const effectivePlanName = data ? planName : 'Free';
  const isExpired = data ? subscriptionStatus === 'expired' || !data.valid : false;
  const isWarn = isExpired || isInGracePeriod;

  const tier =
    effectivePlanName === 'AI PRO' ? 'pro' : effectivePlanName === 'Shakti' ? 'shakti' : 'free';

  const PlanIcon = tier === 'pro' ? Crown : tier === 'shakti' ? Sparkles : Leaf;
  const StateIcon = isWarn ? AlertTriangle : PlanIcon;

  const innerTone = isExpired
    ? 'bg-destructive text-destructive-foreground'
    : isInGracePeriod
    ? 'bg-warning text-warning-foreground'
    : tier === 'pro'
    ? 'bg-warning text-warning-foreground'
    : tier === 'shakti'
    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
    : 'bg-success text-success-foreground';

  // Short label: plan name only, abbreviated for space
  const shortLabel = isExpired
    ? 'Expired'
    : effectivePlanName === 'AI PRO'
    ? 'Pro'
    : effectivePlanName;

  return (
    <button
      onClick={() => navigate('/app/subscription')}
      aria-label={`Subscription: ${shortLabel}`}
      title={`Plan: ${effectivePlanName}`}
      className={cn(
        'relative shrink-0 rounded-full transition-all',
        'hover:scale-105 active:scale-95'
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1 rounded-full font-semibold',
          'h-6 px-2 text-[10px] leading-none',
          innerTone
        )}
      >
        <StateIcon className="w-3 h-3 shrink-0" />
        <span className="whitespace-nowrap">{shortLabel}</span>
      </span>
      {isWarn && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-card',
            isExpired ? 'bg-destructive' : 'bg-warning'
          )}
        />
      )}
    </button>
  );
}
