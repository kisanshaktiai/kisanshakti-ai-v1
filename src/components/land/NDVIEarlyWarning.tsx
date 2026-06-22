import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Bell, 
  Volume2,
  ChevronRight,
  Droplets,
  Bug,
  Thermometer,
  Leaf,
  Info
} from 'lucide-react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import type { NDVIMetadata, NDVIPrediction } from '@/hooks/useNDVIAnalysis';
import { formatNDVI, getScientificHealthStatus, NDVI_THRESHOLDS } from '@/lib/ndviScience';

interface NDVIEarlyWarningProps {
  metadata: NDVIMetadata | null;
  prediction: NDVIPrediction | null;
  ndviValue: number;
  className?: string;
}

export function NDVIEarlyWarning({ metadata, prediction, ndviValue, className }: NDVIEarlyWarningProps) {
  const { t, i18n } = useTranslation();
  const { speak, isSpeaking, stop } = useTextToSpeech({ language: i18n.language === 'hi' ? 'hi-IN' : 'en-US' });

  const alerts = metadata?.alerts || [];
  const riskLevel = prediction?.risk_level || 'medium';
  const healthStatus = getScientificHealthStatus(ndviValue);

  const getAlertIcon = (alert: string) => {
    if (alert.toLowerCase().includes('water') || alert.toLowerCase().includes('moisture')) {
      return <Droplets className="h-4 w-4" />;
    }
    if (alert.toLowerCase().includes('pest') || alert.toLowerCase().includes('disease')) {
      return <Bug className="h-4 w-4" />;
    }
    if (alert.toLowerCase().includes('temperature') || alert.toLowerCase().includes('heat')) {
      return <Thermometer className="h-4 w-4" />;
    }
    if (alert.toLowerCase().includes('vegetation') || alert.toLowerCase().includes('crop')) {
      return <Leaf className="h-4 w-4" />;
    }
    return <AlertCircle className="h-4 w-4" />;
  };

  const getRiskConfig = () => {
    switch (riskLevel) {
      case 'critical':
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bg: 'bg-red-600/10',
          border: 'border-red-600/30',
          label: t('ndvi.risk.critical', 'Critical Risk'),
        };
      case 'high':
        return {
          icon: AlertCircle,
          color: 'text-orange-500',
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/30',
          label: t('ndvi.risk.high', 'High Risk'),
        };
      case 'medium':
        return {
          icon: Bell,
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          label: t('ndvi.risk.medium', 'Medium Risk'),
        };
      default:
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bg: 'bg-green-600/10',
          border: 'border-green-600/30',
          label: t('ndvi.risk.low', 'Low Risk'),
        };
    }
  };

  const riskConfig = getRiskConfig();
  const RiskIcon = riskConfig.icon;

  const speakAlerts = () => {
    if (isSpeaking) {
      stop();
    } else {
      const message = alerts.length > 0 
        ? `${t('ndvi.warning.attention', 'Attention')}: ${alerts.join('. ')}`
        : t('ndvi.warning.no_alerts', 'No current alerts for your crop');
      speak(message);
    }
  };

  return (
    <Card className={cn(
      "relative overflow-hidden border shadow-lg transition-all",
      riskConfig.border,
      className
    )}>
      {/* Animated background pulse for critical alerts */}
      {riskLevel === 'critical' && (
        <motion.div
          className="absolute inset-0 bg-destructive/5"
          animate={{ opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className={cn("p-2 rounded-full", riskConfig.bg)}>
              <RiskIcon className={cn("h-5 w-5", riskConfig.color)} />
            </div>
            {t('ndvi.early_warning.title', 'Early Warning System')}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={speakAlerts}
            className="hover:scale-105 transition-transform"
          >
            <Volume2 className={cn("h-4 w-4", isSpeaking && "text-primary animate-pulse")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* NDVI Value with Scientific Status */}
        <div className="flex items-center justify-between">
          <Badge 
            variant="outline" 
            className={cn("font-semibold text-sm px-3 py-1", riskConfig.color, riskConfig.border)}
          >
            {riskConfig.label}
          </Badge>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              NDVI: <span className={cn("font-bold", healthStatus.textColor)}>{formatNDVI(ndviValue, 3)}</span>
            </span>
            <Badge variant="outline" className={cn("text-xs", healthStatus.textColor, healthStatus.borderColor)}>
              {healthStatus.label}
            </Badge>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            {t('ndvi.early_warning.active_alerts', 'Active Alerts')}
            {alerts.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center text-xs">
                {alerts.length}
              </Badge>
            )}
          </h4>

          <AnimatePresence mode="popLayout">
            {alerts.length > 0 ? (
              <div className="space-y-2">
                {alerts.map((alert, index) => (
                  <motion.div
                    key={alert}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl",
                      riskConfig.bg
                    )}
                  >
                    <div className={cn("mt-0.5", riskConfig.color)}>
                      {getAlertIcon(alert)}
                    </div>
                    <p className="text-sm flex-1">{alert}</p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-success/10"
              >
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-sm text-success">
                  {t('ndvi.early_warning.no_alerts', 'No active alerts - crop is healthy')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recommended Actions */}
        {prediction?.recommended_action_keys && prediction.recommended_action_keys.length > 0 && (
          <div className="pt-3 border-t border-border/50">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              {t('ndvi.early_warning.recommended', 'Recommended Actions')}
            </h4>
            <ul className="space-y-1.5">
              {prediction.recommended_action_keys.slice(0, 3).map((actionKey, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center gap-2 text-sm"
                >
                  <ChevronRight className="h-3 w-3 text-primary flex-shrink-0" />
                  <span>{t(actionKey)}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
