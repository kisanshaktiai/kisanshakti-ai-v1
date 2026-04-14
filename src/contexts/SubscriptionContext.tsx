import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscription, SubscriptionState, SUBSCRIPTION_QUERY_KEY } from '@/hooks/useSubscription';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';

const SubscriptionContext = createContext<SubscriptionState | null>(null);

interface SubscriptionProviderProps {
  children: ReactNode;
}

/**
 * SubscriptionProvider wraps the app with subscription state.
 * Includes Supabase Realtime listener for live plan updates (Phase 5).
 */
export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const subscriptionState = useSubscription();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const farmerId = user?.id;

  // Phase 5: Realtime subscription sync
  useEffect(() => {
    if (!farmerId) return;

    const channel = supabase
      .channel(`subscription:${farmerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'farmer_subscriptions',
          filter: `farmer_id=eq.${farmerId}`,
        },
        (payload) => {
          console.log('🔔 [Subscription] Realtime update received:', payload);
          queryClient.invalidateQueries({ queryKey: [SUBSCRIPTION_QUERY_KEY] });
        }
      )
      .subscribe((status) => {
        console.log('📡 [Subscription] Realtime channel status:', status);
      });

    return () => {
      console.log('📡 [Subscription] Unsubscribing realtime channel');
      supabase.removeChannel(channel);
    };
  }, [farmerId, queryClient]);

  return (
    <SubscriptionContext.Provider value={subscriptionState}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Hook to access subscription state from any component.
 */
export function useSubscriptionContext(): SubscriptionState {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscriptionContext must be used within a SubscriptionProvider');
  }
  return context;
}

/**
 * SubscriptionGate — declarative feature gating component.
 * Shows children if farmer has the required feature, otherwise shows fallback/upgrade prompt.
 * 
 * Usage:
 * <SubscriptionGate feature="ai_chat" fallback={<UpgradePrompt />}>
 *   <AIChatComponent />
 * </SubscriptionGate>
 */
interface SubscriptionGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function SubscriptionGate({ feature, children, fallback }: SubscriptionGateProps) {
  const { hasFeature, isLoading, data } = useSubscriptionContext();

  // While loading, show children (optimistic access)
  if (isLoading) return <>{children}</>;

  // If no subscription data yet, show children (graceful degradation)
  if (!data) return <>{children}</>;

  // Check feature access
  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  // Show fallback or default upgrade prompt
  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
      <div className="text-4xl">🔒</div>
      <h3 className="text-lg font-semibold text-foreground">
        Premium Feature
      </h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        This feature requires an upgraded plan. Contact your administrator to upgrade.
      </p>
      <div className="text-xs text-muted-foreground">
        Current plan: <span className="font-medium">{data.plan_name || 'Free'}</span>
      </div>
    </div>
  );
}
