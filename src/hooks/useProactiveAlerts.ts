import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export interface ProactiveAlert {
  id: string;
  land_id: string | null;
  alert_category: string;
  priority: string;
  title_mr: string | null;
  title_hi: string | null;
  title_en: string;
  message_mr: string | null;
  message_hi: string | null;
  message_en: string;
  action_text_mr: string | null;
  action_text_hi: string | null;
  action_text_en: string | null;
  risk_score: number;
  status: string;
  created_at: string;
  rule_id: string | null;
  trigger_data: Record<string, any>;
  decision_reasoning: string | null;
  land_name?: string | null;
}

export function useProactiveAlerts() {
  const { user } = useAuthStore();
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<any>(null);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch alerts with land name via a join
      const { data, error } = await supabase
        .from('proactive_alerts')
        .select('*, lands:land_id(name)')
        .eq('farmer_id', user.id)
        .in('status', ['PENDING', 'DELIVERED', 'SEEN'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[ProactiveAlerts] Fetch error:', error);
        // Fallback without join
        const { data: fallbackData } = await supabase
          .from('proactive_alerts')
          .select('*')
          .eq('farmer_id', user.id)
          .in('status', ['PENDING', 'DELIVERED', 'SEEN'])
          .order('created_at', { ascending: false })
          .limit(50);
        
        if (fallbackData) {
          setAlerts(fallbackData as ProactiveAlert[]);
          setUnreadCount(fallbackData.filter((a: any) => a.status === 'PENDING' || a.status === 'DELIVERED').length);
        }
        return;
      }

      // Map land name from join
      const mapped = (data || []).map((a: any) => ({
        ...a,
        land_name: a.lands?.name || null,
        lands: undefined,
      })) as ProactiveAlert[];

      setAlerts(mapped);
      setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);
    } catch (err) {
      console.error('[ProactiveAlerts] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Realtime subscription (G7)
  useEffect(() => {
    if (!user?.id) return;

    fetchAlerts();

    // Subscribe to new alerts via Supabase realtime
    const channel = supabase
      .channel(`proactive_alerts:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proactive_alerts',
          filter: `farmer_id=eq.${user.id}`,
        },
        (payload) => {
          const newAlert = payload.new as ProactiveAlert;
          setAlerts(prev => [newAlert, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user?.id, fetchAlerts]);

  const markSeen = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'SEEN', seen_at: new Date().toISOString() } as any)
      .eq('id', alertId);

    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'SEEN' } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markActed = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'ACTED', acted_at: new Date().toISOString() } as any)
      .eq('id', alertId);

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const dismissAlert = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'DISMISSED' } as any)
      .eq('id', alertId);

    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  return { alerts, loading, unreadCount, markSeen, markActed, dismissAlert, refetch: fetchAlerts };
}
