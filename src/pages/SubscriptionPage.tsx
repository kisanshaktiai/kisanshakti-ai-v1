import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown, Sparkles, Leaf, Calendar, MessageSquare, MapPin, Database, Loader2, Receipt } from 'lucide-react';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useAuthStore } from '@/stores/authStore';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { PlanBadge } from '@/components/subscription/PlanBadge';
import { UsageMeter } from '@/components/subscription/UsageMeter';
import { useFarmerPlans, type FarmerPlanRow } from '@/hooks/useFarmerPlans';
import { InnerPageHeader } from '@/components/profile/InnerPageHeader';
import { IconTile, SectionCard, sectionCardClass } from '@/components/profile/SettingsList';
import { PageShell } from '@/components/layout/PageShell';
import { formatFarmerDate } from '@/lib/dateFormat';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

type PlanRow = FarmerPlanRow;

interface UsageRow {
  metric_name: string;
  quantity: number;
  billing_period_start: string;
  billing_period_end: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  created_at: string;
}

const PLAN_ICONS: Record<string, typeof Leaf> = {
  Kisan: Leaf,
  Shakti: Sparkles,
  'AI PRO': Crown,
};

/** Feature codes from the plan row are named in profile.subscription.feature.<code>. */
const FEATURE_CODES = ['ai_chat', 'satellite_imagery', 'weather_forecast', 'soil_testing', 'community_forum', 'marketplace', 'advanced_analytics', 'custom_reports', 'drone_monitoring', 'predictive_analytics', 'white_label_mobile_app', 'api_access'];

export default function SubscriptionPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, planName, daysRemaining, isInGracePeriod, subscriptionStatus, isLoading } =
    useSubscriptionContext();

  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'annually'>('monthly');

  // Server-filtered, cached, RLS-protected farmer plans only
  const { data: plansData, isLoading: loadingPlans } = useFarmerPlans();
  const plans: PlanRow[] = (plansData ?? []).filter((p) => p.plan_category === 'farmer');

  useEffect(() => {
    if (!user?.id || !user?.tenantId) return;
    const client = supabaseWithAuth(user.id, user.tenantId);

    (async () => {
      const anyClient = client as any;
      try {
        const usageRes = await anyClient
          .from('subscription_usage_logs')
          .select('metric_name, quantity, billing_period_start, billing_period_end')
          .eq('farmer_id', user.id)
          .gte('billing_period_end', new Date().toISOString())
          .limit(50);

        const paymentRes = await anyClient
          .from('payment_records')
          .select('id, amount, currency, status, payment_method, created_at')
          .eq('farmer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (usageRes?.data) setUsage(usageRes.data as UsageRow[]);
        if (paymentRes?.data) setPayments(paymentRes.data as PaymentRow[]);
      } catch (e) {
        console.warn('[Subscription] Load error:', e);
      }
    })();
  }, [user?.id, user?.tenantId]);

  const currentLimits = (data?.limits ?? {}) as Record<string, number | string>;
  const normalizeLimit = (val: number | string | undefined): number | 'unlimited' => {
    if (val === 'unlimited') return 'unlimited';
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };
  const aiUsage = usage.find((u) => u.metric_name === 'ai_chat_limit')?.quantity ?? 0;
  const landUsage = usage.find((u) => u.metric_name === 'land_limit')?.quantity ?? 0;
  const soilUsage = usage.find((u) => u.metric_name === 'soil_reports_per_month')?.quantity ?? 0;

  const handleUpgrade = (plan: PlanRow) => {
    toast({
      title: t('profile.subscription.upgrade_soon_title'),
      description: t('profile.subscription.upgrade_soon_desc', { plan: plan.name }),
    });
  };

  const isExpired = subscriptionStatus === 'expired' || (data && !data.valid);
  const isActive = subscriptionStatus === 'active' && !isInGracePeriod;

  // Dates in the app language (lib/dateFormat), not date-fns English.
  const formatDate = (value: string) => formatFarmerDate(new Date(value), (i18n.language || 'en').split('-')[0]);

  return (
    <PageShell
      padding="none"
      spacing="none"
      stickyHeader={
        <InnerPageHeader
          title={t('profile.subscription.title')}
          subtitle={t('profile.subscription.subtitle')}
          onBack={() => navigate(-1)}
        />
      }
    >
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4">
        {/* Current Plan Card */}
        <section className={cn(sectionCardClass, 'border-primary/25 bg-primary/5 p-4')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                {t('profile.subscription.current_plan')}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <PlanBadge planName={planName} size="md" />
                {isActive && (
                  <Badge variant="outline" className="border-success/40 bg-success/10 text-xs text-success hover:bg-success/10">
                    {t('profile.subscription.active')}
                  </Badge>
                )}
                {isInGracePeriod && (
                  <Badge variant="outline" className="border-warning/50 bg-warning/15 text-xs text-foreground hover:bg-warning/15">
                    {t('profile.subscription.grace')}
                  </Badge>
                )}
                {isExpired && <Badge variant="destructive" className="text-xs">{t('profile.subscription.expired')}</Badge>}
              </div>
            </div>
            <div className="shrink-0 rounded-2xl bg-card px-4 py-2 text-center shadow-soft">
              <p className="text-2xl font-bold leading-none text-primary">{daysRemaining}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('profile.subscription.days_left')}</p>
            </div>
          </div>

          {data?.end_date && (
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('profile.subscription.renews_on', { date: formatDate(data.end_date) })}</span>
            </div>
          )}
        </section>

        {/* Usage Card */}
        <SectionCard title={t('profile.subscription.usage_title')} icon={Database} contentClassName="space-y-4">
          <UsageMeter
            label={t('profile.subscription.ai_queries')}
            current={aiUsage}
            limit={normalizeLimit(currentLimits.ai_queries_per_month)}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
          />
          <UsageMeter
            label={t('profile.subscription.lands')}
            current={landUsage}
            limit={normalizeLimit(currentLimits.land_limit)}
            icon={<MapPin className="w-3.5 h-3.5" />}
          />
          <UsageMeter
            label={t('profile.subscription.soil_reports')}
            current={soilUsage}
            limit={normalizeLimit(currentLimits.soil_reports_per_month)}
            icon={<Database className="w-3.5 h-3.5" />}
          />
        </SectionCard>

        {/* Plan Comparison */}
        <div className="space-y-3">
          <h2 className="px-1 pt-1 text-base font-bold text-foreground">{t('profile.subscription.available_plans')}</h2>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
            {(['monthly', 'quarterly', 'annually'] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                aria-pressed={billingCycle === cycle}
                onClick={() => setBillingCycle(cycle)}
                className={cn(
                  'h-10 rounded-full px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  billingCycle === cycle
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground'
                )}
              >
                {t(cycle === 'annually' ? 'profile.subscription.yearly' : cycle === 'quarterly' ? 'profile.subscription.quarterly' : 'profile.subscription.monthly')}
              </button>
            ))}
          </div>

          {loadingPlans ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Leaf className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-base font-semibold text-foreground">{t('profile.subscription.no_plans')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('profile.subscription.no_plans_hint')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {plans.map((plan) => {
                const Icon = PLAN_ICONS[plan.name] ?? Leaf;
                const isCurrentPlan = planName === plan.name;
                const price =
                  billingCycle === 'monthly'
                    ? plan.price_monthly
                    : billingCycle === 'quarterly'
                    ? plan.price_quarterly
                    : plan.price_annually;
                const featureKeys = Object.keys(plan.features ?? {}).filter(
                  (k) => plan.features[k] === true
                );

                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'space-y-3 rounded-2xl border-2 p-4 text-card-foreground shadow-soft',
                      isCurrentPlan ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <IconTile
                        icon={Icon}
                        tone={plan.name === 'AI PRO' ? 'warning' : plan.name === 'Shakti' ? 'primary' : 'success'}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold leading-snug text-foreground">{plan.name}</h3>
                        <p className="text-sm capitalize leading-snug text-muted-foreground">
                          {plan.plan_type}
                        </p>
                      </div>
                      {isCurrentPlan && (
                        <Badge className="shrink-0 bg-primary text-xs text-primary-foreground">
                          {t('profile.subscription.current_plan')}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        ₹{price?.toLocaleString('en-IN') ?? '—'}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {t(billingCycle === 'monthly' ? 'profile.subscription.per_month' : billingCycle === 'quarterly' ? 'profile.subscription.per_quarter' : 'profile.subscription.per_year')}
                      </span>
                    </div>

                    <ul className="space-y-2">
                      {featureKeys.slice(0, 6).map((key) => (
                        <li key={key} className="flex items-start gap-2 text-sm leading-snug">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          <span className="text-foreground">
                            {FEATURE_CODES.includes(key) ? t(`profile.subscription.feature.${key}`) : key.replace(/_/g, ' ')}
                          </span>
                        </li>
                      ))}
                      {featureKeys.length > 6 && (
                        <li className="pl-6 text-sm text-muted-foreground">
                          {t('profile.subscription.more_features', { count: featureKeys.length - 6 })}
                        </li>
                      )}
                    </ul>

                    <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-xs leading-snug text-muted-foreground">{t('profile.subscription.ai_queries')}</p>
                        <p className="font-semibold text-foreground">{plan.limits.ai_queries_per_month}</p>
                      </div>
                      <div className="rounded-xl bg-muted/50 px-3 py-2">
                        <p className="text-xs leading-snug text-muted-foreground">{t('profile.subscription.lands')}</p>
                        <p className="font-semibold text-foreground">{plan.limits.land_limit}</p>
                      </div>
                    </div>

                    {!isCurrentPlan && (
                      <Button
                        className="h-12 w-full text-base"
                        variant={plan.name === 'AI PRO' ? 'default' : 'outline'}
                        onClick={() => handleUpgrade(plan)}
                      >
                        {t('profile.subscription.upgrade_to', { plan: plan.name })}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <SectionCard title={t('profile.subscription.payment_history')} icon={Receipt} contentClassName="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"
              >
                <div className="min-w-0">
                  <p className="text-base font-semibold text-foreground">
                    ₹{p.amount.toLocaleString('en-IN')}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {p.currency}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(p.created_at)} ·{' '}
                    {p.payment_method ?? t('profile.subscription.online')}
                  </p>
                </div>
                <Badge
                  variant={p.status === 'success' ? 'default' : 'outline'}
                  className={cn(
                    'shrink-0 text-xs capitalize',
                    p.status === 'success' && 'border-success/40 bg-success/10 text-success hover:bg-success/10'
                  )}
                >
                  {p.status}
                </Badge>
              </div>
            ))}
          </SectionCard>
        )}

        {/* Help footer */}
        <p className="py-2 text-center text-sm text-muted-foreground">
          {t('profile.subscription.help')}
        </p>
      </div>
    </PageShell>
  );
}
