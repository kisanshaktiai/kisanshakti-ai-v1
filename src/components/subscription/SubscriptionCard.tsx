import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { PlanBadge } from './PlanBadge';
import { ChevronRight, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { IconTile, sectionCardClass } from '@/components/profile/SettingsList';
import { cn } from '@/lib/utils';

/**
 * Compact subscription summary card — used on Profile page.
 * Shows plan, status, days remaining, and CTA to subscription page.
 */
export function SubscriptionCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, planName, daysRemaining, isInGracePeriod, subscriptionStatus } =
    useSubscriptionContext();

  if (isLoading) {
    return (
      <div className={cn(sectionCardClass, 'p-4')}>
        <div className="h-14 animate-pulse rounded-xl bg-muted/50" />
      </div>
    );
  }

  const isExpired = subscriptionStatus === 'expired' || (data && !data.valid);
  const isActive = subscriptionStatus === 'active' && !isInGracePeriod;
  const isExpiringSoon = isActive && daysRemaining > 0 && daysRemaining <= 7;

  const accent = isExpired
    ? 'border-destructive/40 bg-destructive/5'
    : isInGracePeriod || isExpiringSoon
    ? 'border-warning/50 bg-warning/5'
    : 'border-primary/25 bg-primary/5';
  const tone = isExpired ? 'destructive' : isInGracePeriod || isExpiringSoon ? 'warning' : 'primary';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${t('profile.subscription.title')}. ${t('common.subscription.tap_to_manage')}`}
      className={cn(
        sectionCardClass,
        'flex min-h-[72px] cursor-pointer items-center gap-3 px-4 py-3 transition-colors active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        accent
      )}
      onClick={() => navigate('/app/subscription')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate('/app/subscription');
        }
      }}
    >
      <IconTile icon={Sparkles} tone={tone} />

      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-muted-foreground">
          {t('profile.subscription.title')}
        </span>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PlanBadge planName={planName} size="md" />
          {isActive && (
            <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-xs text-success hover:bg-success/10">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('profile.subscription.active')}
            </Badge>
          )}
          {isInGracePeriod && (
            <Badge variant="outline" className="gap-1 border-warning/50 bg-warning/15 text-xs text-foreground hover:bg-warning/15">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {t('profile.subscription.grace')}
            </Badge>
          )}
          {isExpired && (
            <Badge variant="destructive" className="text-xs">
              {t('profile.subscription.expired')}
            </Badge>
          )}
        </div>

        <span className="mt-1 block text-sm leading-snug text-muted-foreground">
          {isExpired
            ? t('profile.subscription.renew_hint')
            : daysRemaining > 0
            ? t('common.subscription.days_remaining', { d: daysRemaining })
            : t('profile.subscription.expires_today')}
        </span>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
