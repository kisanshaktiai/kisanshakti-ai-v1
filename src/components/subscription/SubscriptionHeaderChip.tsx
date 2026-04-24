import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Crown, Sparkles, Leaf, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 2030-ready subscription chip for the app header.
 * - Tier-themed gradient ring + shimmer when active.
 * - Pulsing dot when expiring/grace; destructive ring when expired.
 * - Icon-only mode below 340px viewport.
 * - Optimistic Free fallback if data never arrives within 3s.
 */
export function SubscriptionHeaderChip() {
  const navigate = useNavigate();
  const { data, planName, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();
  const [loadTimeoutHit, setLoadTimeoutHit] = useState(false);
  const [iconOnly, setIconOnly] = useState(false);

  useEffect(() => {
    const check = () => setIconOnly(window.innerWidth < 340);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!isLoading || data) {
      setLoadTimeoutHit(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimeoutHit(true), 3000);
    return () => clearTimeout(timer);
  }, [isLoading, data]);

  if (isLoading && !data && !loadTimeoutHit) {
    return <div className="h-7 w-16 rounded-full bg-muted/40 animate-pulse" />;
  }

  const effectivePlanName = data ? planName : 'Free';
  const isExpired = data ? subscriptionStatus === 'expired' || !data.valid : false;
  const isExpiringSoon =
    !!data && subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;
  const isWarn = isExpired || isInGracePeriod || isExpiringSoon;

  const tier =
    effectivePlanName === 'AI PRO' ? 'pro' : effectivePlanName === 'Shakti' ? 'shakti' : 'free';

  const Icon = tier === 'pro' ? Crown : tier === 'shakti' ? Sparkles : Leaf;

  // Ring gradients per tier (semantic tokens only)
  const ringGradient = isExpired
    ? 'from-destructive/60 to-destructive/30'
    : isInGracePeriod || isExpiringSoon
    ? 'from-warning/60 to-warning/30'
    : tier === 'pro'
    ? 'from-warning/70 via-warning/40 to-warning/70'
    : tier === 'shakti'
    ? 'from-primary/70 via-accent/50 to-primary/70'
    : 'from-success/60 to-success/30';

  const innerTone = isExpired
    ? 'bg-destructive/10 text-destructive'
    : isInGracePeriod || isExpiringSoon
    ? 'bg-warning/10 text-warning'
    : tier === 'pro'
    ? 'bg-gradient-to-r from-warning/15 to-warning/5 text-warning'
    : tier === 'shakti'
    ? 'bg-gradient-to-r from-primary/10 to-accent/10 text-primary'
    : 'bg-success/10 text-success';

  const label = isExpired
    ? 'Expired'
    : isInGracePeriod
    ? `Grace ${daysRemaining}d`
    : isExpiringSoon
    ? `${daysRemaining}d`
    : effectivePlanName;

  const showDot = isWarn;

  return (
    <button
      onClick={() => navigate('/app/subscription')}
      aria-label={`Subscription: ${label}`}
      title={!data ? 'Tap to refresh subscription' : `Plan: ${effectivePlanName}`}
      className={cn(
        'relative shrink-0 rounded-full p-[1.5px] bg-gradient-to-r transition-all',
        'hover:scale-105 active:scale-95 shadow-sm',
        ringGradient,
        !isWarn && tier !== 'free' && 'motion-safe:animate-[gradient-x_4s_ease_infinite] bg-[length:200%_200%]'
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1 rounded-full font-semibold',
          'h-7',
          iconOnly ? 'px-1.5' : 'px-2.5',
          'text-[10px]',
          innerTone
        )}
      >
        {isWarn ? (
          <AlertTriangle className="w-3 h-3 shrink-0" />
        ) : (
          <Icon className="w-3 h-3 shrink-0" />
        )}
        {!iconOnly && <span className="whitespace-nowrap">{label}</span>}
      </span>
      {showDot && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-card',
            isExpired ? 'bg-destructive' : 'bg-warning',
            'motion-safe:animate-ping-slow'
          )}
          style={{ animation: 'photo-pulse 1.8s ease-in-out infinite' }}
        />
      )}
    </button>
  );
}
