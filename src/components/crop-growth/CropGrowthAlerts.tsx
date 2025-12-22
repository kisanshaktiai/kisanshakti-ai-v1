import React from 'react';
import { AlertTriangle, Bell, CheckCircle, Eye, Clock, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Alert {
  id: string;
  land_id: string;
  alert_type: 'observation' | 'action_required' | 'critical_risk';
  alert_category: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  recommended_action?: string;
  action_deadline?: string;
  is_read: boolean;
  is_actioned: boolean;
  created_at: string;
}

interface CropGrowthAlertsProps {
  alerts: Alert[];
  onMarkRead: (alertId: string) => void;
  onMarkActioned: (alertId: string) => void;
  className?: string;
}

export function CropGrowthAlerts({ 
  alerts, 
  onMarkRead, 
  onMarkActioned,
  className 
}: CropGrowthAlertsProps) {
  const { t } = useTranslation();

  if (alerts.length === 0) {
    return (
      <Card className={cn("bg-primary/5", className)}>
        <CardContent className="py-6 text-center">
          <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium">{t('cropGrowth.noAlerts', 'All Clear!')}</p>
          <p className="text-xs text-muted-foreground">
            {t('cropGrowth.noAlertsDesc', 'Your crops are healthy with no issues detected.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getAlertIcon = (type: string, severity: string) => {
    if (type === 'critical_risk' || severity === 'danger') {
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    }
    if (type === 'action_required' || severity === 'warning') {
      return <Bell className="h-5 w-5 text-warning" />;
    }
    return <Eye className="h-5 w-5 text-primary" />;
  };

  const getAlertBg = (type: string, severity: string) => {
    if (type === 'critical_risk' || severity === 'danger') {
      return 'bg-destructive/10 border-destructive/30';
    }
    if (type === 'action_required' || severity === 'warning') {
      return 'bg-warning/10 border-warning/30';
    }
    return 'bg-primary/5 border-primary/20';
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {t('cropGrowth.alerts', 'Alerts')}
          <Badge variant="secondary" className="text-xs">
            {alerts.length}
          </Badge>
        </h3>
      </div>

      {alerts.map((alert) => (
        <Card 
          key={alert.id}
          className={cn(
            "transition-all",
            getAlertBg(alert.alert_type, alert.severity),
            alert.is_read && "opacity-70"
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {getAlertIcon(alert.alert_type, alert.severity)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate">{alert.title}</span>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs shrink-0",
                      alert.alert_type === 'critical_risk' && "border-destructive text-destructive",
                      alert.alert_type === 'action_required' && "border-warning text-warning"
                    )}
                  >
                    {alert.alert_type.replace('_', ' ')}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {alert.message}
                </p>

                {alert.recommended_action && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                    <ChevronRight className="h-3 w-3" />
                    <span className="line-clamp-1">{alert.recommended_action}</span>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                  </span>

                  <div className="flex gap-2">
                    {!alert.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onMarkRead(alert.id)}
                      >
                        {t('cropGrowth.markRead', 'Mark Read')}
                      </Button>
                    )}
                    {!alert.is_actioned && alert.alert_type !== 'observation' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => onMarkActioned(alert.id)}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {t('cropGrowth.done', 'Done')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
