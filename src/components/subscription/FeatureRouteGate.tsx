import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEntitlements } from '@/hooks/useEntitlements';
import { toast } from '@/hooks/use-toast';

/**
 * FeatureRouteGate — single client-side enforcement point for plan-gated routes.
 *
 * Purpose: prevent deep links, browser history, push-notification taps, voice
 * navigation, HindenburgMenu, or any other entry path from bypassing per-tile
 * `locked` styling in `useFeatures` / `HomeFeaturesGrid` / `BottomNavigation`.
 *
 * SSOT for "is this route allowed?" = `resolve_farmer_entitlements` (via
 * useEntitlements). When the active feature for the current route resolves
 * `enabled:false` we redirect to `/app/subscription` and show one toast.
 *
 * Routes not in the map are always allowed (account, profile, subscription,
 * notifications, proactive alerts, lands LIST/DETAIL — the land quota is
 * enforced separately by LandLimitGuard + DB trigger on insert).
 */

// Map app routes → entitlement feature codes from resolve_farmer_entitlements
const ROUTE_FEATURE_MAP: Array<{ test: (path: string) => boolean; code: string }> = [
  { test: (p) => p === '/app/chat' || p === '/app/ai-chat', code: 'ai_chat' },
  { test: (p) => p === '/app/market' || p.startsWith('/app/market/'), code: 'marketplace' },
  { test: (p) => p === '/app/weather', code: 'weather_forecast' },
  { test: (p) => p === '/app/community' || p.startsWith('/app/community/'), code: 'community' },
  { test: (p) => p === '/app/ndvi' || /^\/app\/lands\/[^/]+\/ndvi$/.test(p), code: 'ndvi' },
  { test: (p) => /^\/app\/lands\/[^/]+\/soil$/.test(p), code: 'soil_health' },
];

const REASON_KEYS: Record<string, { title: string; body: string }> = {
  feature_disabled: {
    title: 'Premium feature',
    body: 'This feature is not included in your current plan. Upgrade to unlock it.',
  },
  quota_exceeded: {
    title: 'Daily limit reached',
    body: 'You have used your daily quota for this feature. Upgrade for more.',
  },
  feature_unknown: {
    title: 'Premium feature',
    body: 'This feature is not available on your plan.',
  },
};

export function FeatureRouteGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isReady, canUse, farmer } = useEntitlements();
  // Toast dedupe: only fire once per path-per-redirect cycle.
  const lastBlockedPath = useRef<string | null>(null);

  const match = useMemo(
    () => ROUTE_FEATURE_MAP.find((m) => m.test(location.pathname)),
    [location.pathname],
  );

  // Reset dedupe when the user navigates back to an allowed route.
  useEffect(() => {
    if (!match) lastBlockedPath.current = null;
  }, [match]);

  useEffect(() => {
    if (!isReady || !match) return;
    if (location.pathname === '/app/subscription') return;

    const view = canUse(match.code);
    if (view.allowed) return;

    // Avoid emitting the same toast twice for the same blocked path.
    if (lastBlockedPath.current === location.pathname) return;
    lastBlockedPath.current = location.pathname;

    const reason = REASON_KEYS[view.reason ?? 'feature_disabled'] ?? REASON_KEYS.feature_disabled;
    toast({
      title: t(`subscription.gate.${view.reason ?? 'feature_disabled'}.title`, reason.title),
      description: t(`subscription.gate.${view.reason ?? 'feature_disabled'}.body`, {
        defaultValue: reason.body,
        plan: farmer?.plan_name ?? 'Free',
      }),
      variant: 'destructive',
    });
    navigate('/app/subscription', { replace: true });
  }, [isReady, match, location.pathname, canUse, navigate, t, farmer?.plan_name]);

  return <>{children}</>;
}
