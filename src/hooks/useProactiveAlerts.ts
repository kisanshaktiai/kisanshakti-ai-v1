import { useState, useEffect, useCallback } from 'react';
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
}

export function useProactiveAlerts() {
  const { user } = useAuthStore();
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('proactive_alerts')
        .select('*')
        .eq('farmer_id', user.id)
        .in('status', ['PENDING', 'DELIVERED', 'SEEN'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[ProactiveAlerts] Fetch error:', error);
        return;
      }

      setAlerts((data as ProactiveAlert[]) || []);
      setUnreadCount((data || []).filter((a: any) => a.status === 'PENDING' || a.status === 'DELIVERED').length);
    } catch (err) {
      console.error('[ProactiveAlerts] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const markSeen = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'SEEN', seen_at: new Date().toISOString() })
      .eq('id', alertId);
    
    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'SEEN' } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markActed = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'ACTED', acted_at: new Date().toISOString() })
      .eq('id', alertId);
    
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const dismissAlert = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'DISMISSED' })
      .eq('id', alertId);
    
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  return { alerts, loading, unreadCount, markSeen, markActed, dismissAlert, refetch: fetchAlerts };
}
