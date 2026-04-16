import { useNavigate } from 'react-router-dom';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Top-of-app warning banner — only renders during expiring/grace/expired states.
 * Dismissible per session via local state.
 */
export function SubscriptionStatusBanner() {
  const navigate = useNavigate();
  const { data, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || dismissed || !data) return null;

  const isExpired = subscriptionStatus === 'expired' || !data.valid;
  const isExpiringSoon =
    subscriptionStatus === 'active' && daysRemaining > 0 && daysRemaining <= 7;

  if (!isExpired && !isInGracePeriod && !isExpiringSoon) return null;

  const tone = isExpired
    ? 'bg-destructive/10 border-destructive/30 text-destructive-foreground'
    : 'bg-warning/10 border-warning/30 text-warning-foreground';

  const message = isExpired
    ? 'Your plan has expired. Renew to restore premium features.'
    : isInGracePeriod
    ? `Grace period: ${daysRemaining} days left before features lock.`
    : `Your plan expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}.`;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b text-xs animate-fade-in',
        tone
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
      <p className="flex-1 font-medium text-foreground">{message}</p>
      <Button
        size="sm"
        variant="default"
        className="h-7 text-[11px] px-2.5"
        onClick={() => navigate('/app/subscription')}
      >
        Renew
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded hover:bg-foreground/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
