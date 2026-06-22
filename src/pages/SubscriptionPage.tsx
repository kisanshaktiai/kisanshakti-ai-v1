import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Crown, Sparkles, Leaf, Calendar, MessageSquare, MapPin, Database, Loader2, Receipt } from 'lucide-react';
import { useSubscriptionContext } from '@/contexts/SubscriptionContext';
import { useAuthStore } from '@/stores/authStore';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { PlanBadge } from '@/components/subscription/PlanBadge';
import { UsageMeter } from '@/components/subscription/UsageMeter';
import { useFarmerPlans, type FarmerPlanRow } from '@/hooks/useFarmerPlans';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

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

const FEATURE_LABELS: Record<string, string> = {
  ai_chat: 'AI Crop Advisor',
  satellite_imagery: 'NDVI / Satellite Maps',
  weather_forecast: 'Weather Forecast',
  soil_testing: 'Soil Health Reports',
  community_forum: 'Farmer Community',
  marketplace: 'Marketplace',
  advanced_analytics: 'Advanced Analytics',
  custom_reports: 'Custom Reports',
  drone_monitoring: 'Drone Monitoring',
  predictive_analytics: 'Predictive Analytics',
  white_label_mobile_app: 'White-label App',
  api_access: 'API Access',
};

export default function SubscriptionPage() {
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
      title: '🚀 Upgrade Coming Soon',
      description: `Razorpay/PhonePe checkout for ${plan.name} (₹${plan.price_monthly}/mo) is being finalized. Contact your tenant admin to upgrade now.`,
    });
  };

  const isExpired = subscriptionStatus === 'expired' || (data && !data.valid);
  const isActive = subscriptionStatus === 'active' && !isInGracePeriod;

  return (
    <div className="min-h-full bg-gradient-to-br from-background via-accent/5 to-primary/5 pb-nav-safe">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/70 backdrop-blur-2xl border-b border-border/50">
        <div className="px-3 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">My Subscription</h1>
            <p className="text-xs text-muted-foreground">Manage your plan & usage</p>
          </div>
        </div>
      </div>

      <div className="pt-20 px-4 pb-24 space-y-5 max-w-2xl mx-auto">
        {/* Current Plan Card */}
        <Card className="border bg-gradient-to-br from-primary/10 via-accent/5 to-background shadow-xl border-primary/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Current Plan
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <PlanBadge planName={planName} size="md" />
                  {isActive && (
                    <Badge variant="outline" className="text-success border-success/30 bg-success/5 text-[10px]">
                      ✓ Active
                    </Badge>
                  )}
                  {isInGracePeriod && (
                    <Badge variant="outline" className="text-warning border-warning/30 bg-warning/5 text-[10px]">
                      Grace Period
                    </Badge>
                  )}
                  {isExpired && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{daysRemaining}</p>
                <p className="text-[10px] text-muted-foreground uppercase">days left</p>
              </div>
            </div>

            {data?.end_date && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/30 pt-3">
                <Calendar className="w-3.5 h-3.5" />
                <span>Renews on {format(new Date(data.end_date), 'dd MMM yyyy')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Usage This Month
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageMeter
              label="AI Chat Queries"
              current={aiUsage}
              limit={normalizeLimit(currentLimits.ai_queries_per_month)}
              icon={<MessageSquare className="w-3.5 h-3.5" />}
            />
            <UsageMeter
              label="Lands Registered"
              current={landUsage}
              limit={normalizeLimit(currentLimits.land_limit)}
              icon={<MapPin className="w-3.5 h-3.5" />}
            />
            <UsageMeter
              label="Soil Reports"
              current={soilUsage}
              limit={normalizeLimit(currentLimits.soil_reports_per_month)}
              icon={<Database className="w-3.5 h-3.5" />}
            />
          </CardContent>
        </Card>

        {/* Plan Comparison */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Available Plans</h2>
            <div className="flex items-center bg-muted/50 rounded-full p-1 text-[10px]">
              {(['monthly', 'quarterly', 'annually'] as const).map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={cn(
                    'px-3 py-1 rounded-full font-medium capitalize transition-all',
                    billingCycle === cycle
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground'
                  )}
                >
                  {cycle === 'annually' ? 'Yearly' : cycle}
                </button>
              ))}
            </div>
          </div>

          {loadingPlans ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : plans.length === 0 ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="p-6 text-center space-y-2">
                <Leaf className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">No plans available right now</p>
                <p className="text-xs text-muted-foreground">
                  Please check back shortly or contact your tenant administrator.
                </p>
              </CardContent>
            </Card>
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
                  <Card
                    key={plan.id}
                    className={cn(
                      'border-2 transition-all',
                      isCurrentPlan
                        ? 'border-primary bg-gradient-to-br from-primary/10 to-accent/5 shadow-xl'
                        : 'border-border/50 hover:border-primary/40 hover:shadow-lg'
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-xl flex items-center justify-center',
                              plan.name === 'AI PRO'
                                ? 'bg-gradient-to-br from-warning/20 to-warning/10 text-warning'
                                : plan.name === 'Shakti'
                                ? 'bg-gradient-to-br from-primary/20 to-accent/20 text-primary'
                                : 'bg-success/15 text-success'
                            )}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-base">{plan.name}</h3>
                            <p className="text-[10px] text-muted-foreground capitalize">
                              {plan.plan_type}
                            </p>
                          </div>
                        </div>
                        {isCurrentPlan && (
                          <Badge className="bg-primary text-primary-foreground text-[10px]">
                            Current
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-foreground">
                          ₹{price?.toLocaleString('en-IN') ?? '—'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          /{billingCycle === 'monthly' ? 'mo' : billingCycle === 'quarterly' ? 'qtr' : 'yr'}
                        </span>
                      </div>

                      <ul className="space-y-1.5">
                        {featureKeys.slice(0, 6).map((key) => (
                          <li key={key} className="flex items-center gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-success shrink-0" />
                            <span className="text-foreground/80">
                              {FEATURE_LABELS[key] ?? key.replace(/_/g, ' ')}
                            </span>
                          </li>
                        ))}
                        {featureKeys.length > 6 && (
                          <li className="text-[10px] text-muted-foreground pl-5">
                            +{featureKeys.length - 6} more features
                          </li>
                        )}
                      </ul>

                      <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-2 space-y-0.5">
                        <div>
                          AI Queries:{' '}
                          <span className="font-semibold text-foreground">
                            {plan.limits.ai_queries_per_month}
                          </span>
                        </div>
                        <div>
                          Lands:{' '}
                          <span className="font-semibold text-foreground">
                            {plan.limits.land_limit}
                          </span>
                        </div>
                      </div>

                      {!isCurrentPlan && (
                        <Button
                          className="w-full"
                          variant={plan.name === 'AI PRO' ? 'default' : 'outline'}
                          onClick={() => handleUpgrade(plan)}
                        >
                          Upgrade to {plan.name}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      ₹{p.amount.toLocaleString('en-IN')}{' '}
                      <span className="text-xs text-muted-foreground font-normal">
                        {p.currency}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(p.created_at), 'dd MMM yyyy')} ·{' '}
                      {p.payment_method ?? 'Online'}
                    </p>
                  </div>
                  <Badge
                    variant={p.status === 'success' ? 'default' : 'outline'}
                    className={cn(
                      'text-[10px] capitalize',
                      p.status === 'success' && 'bg-success/15 text-success border-success/30'
                    )}
                  >
                    {p.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Help footer */}
        <div className="text-center text-[10px] text-muted-foreground py-4">
          Need help? Contact your tenant administrator.
        </div>
      </div>
    </div>
  );
}
