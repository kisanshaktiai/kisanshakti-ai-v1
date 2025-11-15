import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Droplets, Sprout, Bug, Cloud, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Alert {
  id: string;
  alert_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  action_required: string;
  is_read: boolean;
  is_actioned: boolean;
  created_at: string;
  expires_at: string;
}

const alertIcons: Record<string, any> = {
  irrigation: Droplets,
  fertilizer: Sprout,
  pest_control: Bug,
  disease: AlertTriangle,
  weather_warning: Cloud,
  soil_health: Sprout,
};

const priorityColors: Record<string, string> = {
  low: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
  medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-700 border-red-500/20',
};

export function AIScheduleAlerts({ farmerId, landId }: { farmerId?: string; landId?: string }) {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [farmerId, landId]);

  const fetchAlerts = async () => {
    try {
      let query = supabase
        .from('farmer_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .gte('expires_at', new Date().toISOString());

      if (farmerId) query = query.eq('farmer_id', farmerId);
      if (landId) query = query.eq('land_id', landId);

      const { data, error } = await query.limit(20);

      if (error) throw error;
      setAlerts((data as Alert[]) || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (alertId: string) => {
    try {
      await supabase
        .from('farmer_alerts')
        .update({ is_read: true })
        .eq('id', alertId);
      
      setAlerts(alerts.map(a => a.id === alertId ? { ...a, is_read: true } : a));
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const markAsActioned = async (alertId: string) => {
    try {
      await supabase
        .from('farmer_alerts')
        .update({ is_actioned: true, actioned_at: new Date().toISOString() })
        .eq('id', alertId);
      
      setAlerts(alerts.map(a => a.id === alertId ? { ...a, is_actioned: true } : a));
      toast.success('Alert marked as completed');
    } catch (error) {
      console.error('Error marking alert as actioned:', error);
      toast.error('Failed to update alert');
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await supabase
        .from('farmer_alerts')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', alertId);
      
      setAlerts(alerts.filter(a => a.id !== alertId));
      toast.success('Alert dismissed');
    } catch (error) {
      console.error('Error dismissing alert:', error);
    }
  };

  const unreadCount = alerts.filter(a => !a.is_read).length;
  const criticalCount = alerts.filter(a => a.priority === 'critical' && !a.is_actioned).length;

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading alerts...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      {alerts.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-primary" />
            <span className="font-medium">
              {unreadCount} new alert{unreadCount !== 1 && 's'}
              {criticalCount > 0 && ` · ${criticalCount} critical`}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => alerts.forEach(a => !a.is_read && markAsRead(a.id))}
          >
            Mark all as read
          </Button>
        </div>
      )}

      {/* Alerts List */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p>All clear! No active alerts.</p>
          </Card>
        ) : (
          alerts.map((alert) => {
            const Icon = alertIcons[alert.alert_type] || AlertTriangle;
            
            return (
              <Card
                key={alert.id}
                className={`p-4 transition-all ${
                  !alert.is_read ? 'border-l-4 border-l-primary bg-primary/5' : ''
                } ${alert.is_actioned ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-5 h-5 ${
                        alert.priority === 'critical' ? 'text-destructive' : 
                        alert.priority === 'high' ? 'text-orange-500' : 
                        'text-primary'
                      }`} />
                      <h4 className="font-semibold">{alert.title}</h4>
                      <Badge variant="outline" className={priorityColors[alert.priority]}>
                        {alert.priority}
                      </Badge>
                      {alert.is_actioned && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700">
                          ✓ Done
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-3">{alert.message}</p>
                    
                    {alert.action_required && (
                      <div className="p-3 bg-accent/50 rounded-md mb-3">
                        <p className="text-sm font-medium mb-1">Action Required:</p>
                        <p className="text-sm">{alert.action_required}</p>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{new Date(alert.created_at).toLocaleDateString()}</span>
                      {alert.expires_at && (
                        <span>Expires: {new Date(alert.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {!alert.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => markAsRead(alert.id)}
                        title="Mark as read"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                    {!alert.is_actioned && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => markAsActioned(alert.id)}
                      >
                        Done
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => dismissAlert(alert.id)}
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
