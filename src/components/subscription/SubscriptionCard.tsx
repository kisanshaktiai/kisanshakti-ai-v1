import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { PlanBadge } from './PlanBadge';
import { Calendar, ChevronRight, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact subscription summary card — used on Profile page.
 * Shows plan, status, days remaining, and CTA to subscription page.
 */
export function SubscriptionCard() {
  const navigate = useNavigate();
  const { data, isLoading, planName, daysRemaining, isInGracePeriod, subscriptionStatus } =
    useSubscriptionContext();

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="h-20 animate-pulse bg-muted/30 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const isExpired = subscriptionStatus === 'expired' || (data && !data.valid);
  const isActive = subscriptionStatus === 'active' && !isInGracePeriod;
  const isExpiringSoon = isActive && daysRemaining > 0 && daysRemaining <= 7;

  const accent = isExpired
    ? 'from-destructive/15 to-destructive/5 border-destructive/30'
    : isInGracePeriod || isExpiringSoon
    ? 'from-warning/15 to-warning/5 border-warning/30'
    : 'from-primary/10 to-accent/10 border-primary/20';

  return (
    <Card
      className={cn(
        'border bg-gradient-to-br shadow-lg cursor-pointer transition-all hover:shadow-xl active:scale-[0.99]',
        accent
      )}
      onClick={() => navigate('/app/subscription')}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                My Subscription
              </span>
            </div>

            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <PlanBadge planName={planName} size="md" />
              {isActive && (
                <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/5 text-[10px]">
                  <CheckCircle2 className="w-3 h-3" />
                  Active
                </Badge>
              )}
              {isInGracePeriod && (
                <Badge variant="outline" className="gap-1 text-warning border-warning/30 bg-warning/5 text-[10px]">
                  <AlertTriangle className="w-3 h-3" />
                  Grace Period
                </Badge>
              )}
              {isExpired && (
                <Badge variant="destructive" className="text-[10px]">
                  Expired
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              {isExpired ? (
                <span>Renew to unlock premium features</span>
              ) : daysRemaining > 0 ? (
                <span>
                  <span className="font-semibold text-foreground">{daysRemaining}</span>{' '}
                  {daysRemaining === 1 ? 'day' : 'days'} remaining
                </span>
              ) : (
                <span>Plan expires today</span>
              )}
            </div>
          </div>

          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 -mr-1">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
