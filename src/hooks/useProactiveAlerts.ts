import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { localDB } from '@/services/localDB';
import { landsApi } from '@/services/landsApi';

export interface ResolvedLand {
  id: string;
  name: string;
  area_acres: number | null;
  current_crop: string | null;
}

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
  land?: ResolvedLand | null;
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

// Track active realtime instances to warn on duplicates
let realtimeInstanceCount = 0;

export function useProactiveAlerts(options?: { skipRealtime?: boolean }) {
  const skipRealtime = options?.skipRealtime ?? false;
  const { user } = useAuthStore();
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const channelRef = useRef<any>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryAttemptRef = useRef(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!user?.id) return;

    // Offline fast-path: read from IndexedDB
    if (!navigator.onLine) {
      try {
        const cached = await localDB.getProactiveAlerts(user.id, showHistory);
        const mapped = cached.map(a => ({ ...a, land_name: a.trigger_data?.land_name || null })) as ProactiveAlert[];
        setAlerts(mapped);
        setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);
      } catch (err) {
        console.warn('[ProactiveAlerts] Offline read failed:', err);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      let query = supabase
        .from('proactive_alerts')
        .select('*')
        .eq('farmer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // Defensive tenant scoping (in addition to RLS)
      if ((user as any)?.tenantId) {
        query = query.eq('tenant_id', (user as any).tenantId);
      }

      if (!showHistory) {
        query = query.in('status', ['PENDING', 'DELIVERED', 'SEEN']);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ProactiveAlerts] Fetch error, falling back to offline cache:', error);
        const cached = await localDB.getProactiveAlerts(user.id, showHistory);
        const mapped = cached.map(a => ({ ...a, land_name: a.trigger_data?.land_name || null })) as ProactiveAlert[];
        setAlerts(mapped);
        setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);
        setLoading(false);
        return;
      }

      // Resolve land details through the SAME path the rest of the app uses
      // (lands-api edge function), because direct supabase.from('lands') is
      // blocked by RLS for our custom session-token auth.
      const landIds = [...new Set((data || []).map((a: any) => a.land_id).filter(Boolean))];
      let landMap: Record<string, ResolvedLand> = {};

      if (landIds.length > 0) {
        let lands: any[] = [];
        try {
          lands = await landsApi.fetchLands();
        } catch (e) {
          console.warn('[ProactiveAlerts] landsApi.fetchLands failed, falling back to localDB:', e);
        }
        if (!lands || lands.length === 0) {
          try {
            lands = await localDB.getLandsByFarmer(user.id);
          } catch {}
        }

        if (lands && lands.length > 0) {
          landMap = Object.fromEntries(
            lands
              .filter((l: any) => landIds.includes(l.id))
              .map((l: any) => [l.id, {
                id: l.id,
                name: l.name,
                area_acres: l.area_acres ?? null,
                current_crop: l.current_crop ?? null,
              }])
          );
        }

        const unresolved = landIds.filter(id => !landMap[id as string]);
        if (unresolved.length > 0) {
          console.info('[ProactiveAlerts] Lands not in current farmer list:', unresolved.length);
        }
      }

      const mapped = (data || []).map((a: any) => {
        const resolved = a.land_id ? landMap[a.land_id] : null;
        let landName: string | null = resolved?.name ?? null;
        if (!landName && a.trigger_data?.land_name) {
          landName = a.trigger_data.land_name;
        }
        return { ...a, land: resolved ?? null, land_name: landName };
      }) as ProactiveAlert[];

      setAlerts(mapped);
      setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);

      // Mirror fresh data to IndexedDB for offline use
      if (data && data.length > 0) {
        try {
          await localDB.saveProactiveAlerts(data.map((a: any) => ({ ...a })));
        } catch (e) {
          console.warn('[ProactiveAlerts] Failed to mirror to localDB:', e);
        }
      }
    } catch (err) {
      console.error('[ProactiveAlerts] Error:', err);
      // Last-resort offline fallback
      try {
        const cached = await localDB.getProactiveAlerts(user.id, showHistory);
        const mapped = cached.map(a => ({ ...a, land_name: a.trigger_data?.land_name || null })) as ProactiveAlert[];
        setAlerts(mapped);
        setUnreadCount(mapped.filter(a => a.status === 'PENDING' || a.status === 'DELIVERED').length);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [user?.id, showHistory]);

  // Realtime subscription with retry-on-error and polling fallback
  useEffect(() => {
    if (!user?.id) return;

    fetchAlerts();

    if (skipRealtime) return;

    realtimeInstanceCount += 1;
    if (realtimeInstanceCount > 1) {
      console.warn(
        `[ProactiveAlerts] ⚠️ Multiple realtime instances detected (${realtimeInstanceCount}). ` +
        `Pass { skipRealtime: true } to all but one.`
      );
    }

    const RETRY_DELAYS = [2000, 5000, 10000];

    const setupChannel = () => {
      const channel = supabase
        .channel(`proactive_alerts:${user.id}:${Date.now()}`)
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

            const title = getAlertTitle(newAlert, lang);
            const message = getAlertMessage(newAlert, lang);
            const priorityEmoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
            const emoji = priorityEmoji[newAlert.priority] || '📢';

            toast({
              title: `${emoji} ${title}`,
              description: message?.substring(0, 100) || '',
              variant: newAlert.priority === 'CRITICAL' ? 'destructive' : 'default',
            });

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
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retryAttemptRef.current = 0;
            console.log('✅ [ProactiveAlerts] Realtime subscribed');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`⚠️ [ProactiveAlerts] Channel ${status}, attempt ${retryAttemptRef.current + 1}`);
            // Cleanup and retry
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
            if (retryAttemptRef.current < RETRY_DELAYS.length) {
              const delay = RETRY_DELAYS[retryAttemptRef.current];
              retryAttemptRef.current += 1;
              retryTimerRef.current = setTimeout(setupChannel, delay);
            } else {
              console.warn('⚠️ [ProactiveAlerts] Realtime exhausted retries — relying on polling');
            }
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    // Polling safety net every 60s when tab visible
    pollTimerRef.current = setInterval(() => {
      if (!document.hidden && navigator.onLine) {
        fetchAlerts();
      }
    }, 60000);

    return () => {
      realtimeInstanceCount = Math.max(0, realtimeInstanceCount - 1);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      retryAttemptRef.current = 0;
    };
  }, [user?.id, fetchAlerts, lang, skipRealtime]);

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
