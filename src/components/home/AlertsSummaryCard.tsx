import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronRight, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { alertSourceText, useTranslatedTexts } from '@/hooks/useAlertText';

interface AlertSummary {
  id: string;
  title_en: string;
  title_mr: string | null;
  title_hi: string | null;
  [langColumn: string]: unknown;
  priority: string;
  alert_category: string;
  created_at: string;
  land_id: string | null;
  land_name?: string;
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  CRITICAL: { color: 'bg-destructive text-destructive-foreground', label: '🔴' },
  HIGH: { color: 'bg-warning text-warning-foreground', label: '🟠' },
  MEDIUM: { color: 'bg-warning-soft text-warning', label: '🟡' },
  LOW: { color: 'bg-success text-success-foreground', label: '🟢' },
};

export function AlertsSummaryCard() {
  const { user } = useAuthStore();
  const { i18n, t } = useTranslation();
  const lang = i18n.language || 'en';
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const fetchRecentAlerts = async () => {
      console.log('[AlertsSummaryCard] Fetching alerts for farmer:', user.id);
      
      // Live = open status and not past expiry (same rule as the alerts screen).
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('proactive_alerts')
        .select('*')
        .eq('farmer_id', user.id)
        .in('status', ['PENDING', 'DELIVERED', 'SEEN'])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('[AlertsSummaryCard] Query error:', error);
        return;
      }
      if (!data || data.length === 0) {
        console.log('[AlertsSummaryCard] No alerts found for this farmer');
        return;
      }
      console.log('[AlertsSummaryCard] Found', data.length, 'alerts');

      // Count total unread
      const { count } = await supabase
        .from('proactive_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('farmer_id', user.id)
        .in('status', ['PENDING', 'DELIVERED'])
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

      setTotalUnread(count || 0);

      // Land name from the alert itself: a direct lands read returns no rows
      // under the farmer session token (RLS), so names never showed here.
      setAlerts(data.map((a) => ({
        ...a,
        land_name: (a.trigger_data as { land_name?: string } | null)?.land_name ?? undefined,
      })) as AlertSummary[]);
    };

    fetchRecentAlerts();
  }, [user?.id]);

  const titleSources = alerts.map((a) => alertSourceText(a, 'title', lang));
  const { tr } = useTranslatedTexts(titleSources.filter((x) => x.needsTranslation).map((x) => x.text), lang);

  if (alerts.length === 0) return null;

  const getTitle = (a: AlertSummary) => {
    const src = alertSourceText(a, 'title', lang);
    return src.needsTranslation ? tr(src.text) : src.text;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="mb-4"
    >
      <Card className="border-destructive/20 bg-destructive/5 overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-foreground">
                {t('alerts.recent_alerts', 'Recent Alerts')}
              </span>
              {totalUnread > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <Link 
              to="/app/proactive-alerts" 
              className="text-xs text-primary flex items-center gap-0.5 font-medium"
            >
              {t('alerts.view_all', 'View All')}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-1.5">
            {alerts.map((alert) => {
              const config = priorityConfig[alert.priority] || priorityConfig.LOW;
              return (
                <Link 
                  key={alert.id} 
                  to={alert.land_id ? `/app/proactive-alerts?landId=${alert.land_id}` : '/app/proactive-alerts'}
                  className="flex items-center gap-2 p-2 rounded-lg bg-background/60 hover:bg-background/80 transition-colors"
                >
                  <span className="text-sm">{config.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {getTitle(alert)}
                    </p>
                    {alert.land_name && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />
                        {alert.land_name}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn("text-[9px] px-1 py-0", config.color)}>
                    {t(`proactive.priority.${alert.priority.toLowerCase()}`, alert.priority)}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
