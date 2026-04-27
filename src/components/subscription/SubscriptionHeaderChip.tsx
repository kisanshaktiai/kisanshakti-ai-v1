import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { Crown, Sparkles, Leaf, AlertTriangle, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * 2030-ready subscription chip for the app header.
 * - Solid filled pill with foreground tokens for high contrast.
 * - Rotating label: alternates between plan name and days remaining.
 * - Tier-themed gradient ring + warning state.
 */
export function SubscriptionHeaderChip() {
  const navigate = useNavigate();
  const { data, planName, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();
  const [loadTimeoutHit, setLoadTimeoutHit] = useState(false);
  const [iconOnly, setIconOnly] = useState(false);
  const [showDays, setShowDays] = useState(false);

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

  const effectivePlanName = data ? planName : 'Free';
  const isExpired = data ? subscriptionStatus === 'expired' || !data.valid : false;
  const isExpiringSoon =
    !!data && subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;
  const isWarn = isExpired || isInGracePeriod || isExpiringSoon;

  const tier =
    effectivePlanName === 'AI PRO' ? 'pro' : effectivePlanName === 'Shakti' ? 'shakti' : 'free';

  // Rotate between plan name and days every 4s when meaningful.
  const canRotate =
    !isExpired && !!data && daysRemaining > 0 && (subscriptionStatus === 'active' || isInGracePeriod);

  useEffect(() => {
    if (!canRotate) {
      setShowDays(false);
      return;
    }
    const id = setInterval(() => setShowDays((s) => !s), 4000);
    return () => clearInterval(id);
  }, [canRotate]);

  if (isLoading && !data && !loadTimeoutHit) {
    return <div className="h-7 w-20 rounded-full bg-muted/40 animate-pulse" />;
  }

  const PlanIcon = tier === 'pro' ? Crown : tier === 'shakti' ? Sparkles : Leaf;
  const StateIcon = isWarn ? AlertTriangle : showDays ? Clock : PlanIcon;

  // Ring gradients per tier
  const ringGradient = isExpired
    ? 'from-destructive/70 to-destructive/40'
    : isInGracePeriod || isExpiringSoon
    ? 'from-warning/70 to-warning/40'
    : tier === 'pro'
    ? 'from-warning/80 via-warning/50 to-warning/80'
    : tier === 'shakti'
    ? 'from-primary/80 via-accent/60 to-primary/80'
    : 'from-success/70 to-success/40';

  // Solid filled pill — high contrast (foreground tokens)
  const innerTone = isExpired
    ? 'bg-destructive text-destructive-foreground'
    : isInGracePeriod || isExpiringSoon
    ? 'bg-warning text-warning-foreground'
    : tier === 'pro'
    ? 'bg-warning text-warning-foreground'
    : tier === 'shakti'
    ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground'
    : 'bg-success text-success-foreground';

  // Determine visible label
  const planLabel = effectivePlanName;
  const daysLabel = isInGracePeriod
    ? `Grace ${daysRemaining}d`
    : `${daysRemaining}d left`;

  const staticLabel = isExpired ? 'Expired' : null;
  const visibleLabel = staticLabel ?? (canRotate ? (showDays ? daysLabel : planLabel) : planLabel);
  const labelKey = staticLabel ? 'static' : showDays ? 'days' : 'plan';

  return (
    <button
      onClick={() => navigate('/app/subscription')}
      aria-label={`Subscription: ${visibleLabel}`}
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
          'text-[11px]',
          innerTone
        )}
      >
        <StateIcon className="w-3 h-3 shrink-0" />
        {!iconOnly && (
          <span className="relative inline-block min-w-[42px] h-4 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={labelKey}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="absolute inset-0 whitespace-nowrap leading-4"
              >
                {visibleLabel}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </span>
      {isWarn && (
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-card',
            isExpired ? 'bg-destructive' : 'bg-warning'
          )}
          style={{ animation: 'photo-pulse 1.8s ease-in-out infinite' }}
        />
      )}
    </button>
  );
}
