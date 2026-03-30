import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

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

function getAlertTitle(alert: ProactiveAlert, lang: string): string {
  if (lang === 'mr') return alert.title_mr || alert.title_en || '';
  if (lang === 'hi') return alert.title_hi || alert.title_en || '';
  return alert.title_en || '';
}

function getAlertMessage(alert: ProactiveAlert, lang: string): string {
  if (lang === 'mr') return alert.message_mr || alert.message_en || '';
  if (lang === 'hi') return alert.message_hi || alert.message_en || '';
  return alert.message_en || '';
}

export function useProactiveAlerts() {
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const channelRef = useRef<any>(null);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Build query — include historical if toggled
      let query = supabase
        .from('proactive_alerts')
        .select('*')
        .eq('farmer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!showHistory) {
        query = query.in('status', ['PENDING', 'DELIVERED', 'SEEN']);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ProactiveAlerts] Fetch error:', error);
        setLoading(false);
        return;
      }

      // Fetch land names separately for reliability (avoids RLS join issues)
      const landIds = [...new Set((data || []).map((a: any) => a.land_id).filter(Boolean))];
      let landNameMap: Record<string, string> = {};

      if (landIds.length > 0) {
        const { data: lands } = await supabase
          .from('lands')
          .select('id, name')
          .in('id', landIds);

        if (lands && lands.length > 0) {
          landNameMap = Object.fromEntries(lands.map((l: any) => [l.id, l.name]));
        }
      }

      const mapped = (data || []).map((a: any) => {
        // Primary: from lands table. Fallback: extract from trigger_data
        let landName = a.land_id ? landNameMap[a.land_id] || null : null;
        if (!landName && a.trigger_data?.land_name) {
          landName = a.trigger_data.land_name;
        }
        // Secondary fallback: parse from solution problem text
        if (!landName && a.trigger_data?.solution?.problem_en) {
          const match = a.trigger_data.solution.problem_en.match(/on\s+(\S+)\s+\(/);
          if (match) landName = match[1];
        }
        return { ...a, land_name: landName };
      }) as ProactiveAlert[];

      setAlerts(mapped);
      setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);
    } catch (err) {
      console.error('[ProactiveAlerts] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, showHistory]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    fetchAlerts();

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

          // Localized toast notification
          const title = getAlertTitle(newAlert, lang);
          const message = getAlertMessage(newAlert, lang);
          const priorityEmoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
          const emoji = priorityEmoji[newAlert.priority] || '📢';

          toast({
            title: `${emoji} ${title}`,
            description: message?.substring(0, 100) || '',
            variant: newAlert.priority === 'CRITICAL' ? 'destructive' : 'default',
          });

          // For CRITICAL alerts, prompt WhatsApp share
          if (newAlert.priority === 'CRITICAL') {
            const landName = newAlert.land_name ? ` (${newAlert.land_name})` : '';
            const msg = `🌾 *KisanShakti AI*${landName}\n\n🔴 *${title}*\n\n${message}`;
            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
            setTimeout(() => {
              if (window.confirm(
                lang === 'mr' ? 'गंभीर सूचना! WhatsApp वर पाठवायचे?' :
                lang === 'hi' ? 'गंभीर सूचना! WhatsApp पर भेजें?' :
                'Critical alert! Share on WhatsApp?'
              )) {
                window.open(waUrl, '_blank');
              }
            }, 1500);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user?.id, fetchAlerts, lang]);

  const markSeen = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'SEEN', seen_at: new Date().toISOString() } as any)
      .eq('id', alertId);

    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'SEEN' } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markActed = useCallback(async (alertId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('proactive_alerts')
      .update({ status: 'ACTED', acted_at: now } as any)
      .eq('id', alertId);

    // Fix 5: Log feedback for learning loop
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      const responseTimeMs = Date.now() - new Date(alert.created_at).getTime();
      console.log(`[ProactiveFeedback] ACTED on rule=${alert.rule_id}, responseTime=${Math.round(responseTimeMs / 1000)}s`);
    }

    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'ACTED' } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [alerts]);

  const dismissAlert = useCallback(async (alertId: string) => {
    await supabase
      .from('proactive_alerts')
      .update({ status: 'DISMISSED' } as any)
      .eq('id', alertId);

    // Fix 5: Log dismissal for confidence adjustment
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      console.log(`[ProactiveFeedback] DISMISSED rule=${alert.rule_id}, category=${alert.alert_category}`);
    }

    setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, status: 'DISMISSED' } : a));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [alerts]);

  return {
    alerts,
    loading,
    unreadCount,
    showHistory,
    setShowHistory,
    markSeen,
    markActed,
    dismissAlert,
    refetch: fetchAlerts,
  };
}
