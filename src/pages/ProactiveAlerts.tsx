import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useProactiveAlerts, ProactiveAlert } from '@/hooks/useProactiveAlerts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertEvidenceSection } from '@/components/proactive/AlertEvidenceSection';
import { 
  AlertTriangle, Bell, CheckCircle, CloudRain, Bug, 
  Droplets, Thermometer, Leaf, Clock, Volume2, 
  ChevronRight, Sprout, Wind, X, MessageCircle, MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useEnhancedTTS } from '@/hooks/useEnhancedTTS';

const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  WEATHER_WARNING: { icon: CloudRain, color: 'text-blue-600', bgColor: 'bg-blue-50 border-blue-200' },
  DISEASE_RISK: { icon: AlertTriangle, color: 'text-red-600', bgColor: 'bg-red-50 border-red-200' },
  PEST_RISK: { icon: Bug, color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200' },
  IRRIGATION: { icon: Droplets, color: 'text-cyan-600', bgColor: 'bg-cyan-50 border-cyan-200' },
  CROP_STRESS: { icon: Thermometer, color: 'text-amber-600', bgColor: 'bg-amber-50 border-amber-200' },
  FERTILIZER_WINDOW: { icon: Sprout, color: 'text-green-600', bgColor: 'bg-green-50 border-green-200' },
  STAGE_ADVISORY: { icon: Leaf, color: 'text-emerald-600', bgColor: 'bg-emerald-50 border-emerald-200' },
  SPRAY_WINDOW: { icon: Wind, color: 'text-indigo-600', bgColor: 'bg-indigo-50 border-indigo-200' },
  HARVEST_TIMING: { icon: Sprout, color: 'text-yellow-600', bgColor: 'bg-yellow-50 border-yellow-200' },
  GENERAL: { icon: Bell, color: 'text-gray-600', bgColor: 'bg-gray-50 border-gray-200' },
};

const PRIORITY_BADGE_CLASS: Record<string, string> = {
  CRITICAL: 'bg-red-500 text-white',
  HIGH: 'bg-orange-500 text-white',
  MEDIUM: 'bg-yellow-500 text-white',
  LOW: 'bg-green-500 text-white',
};

function getLocalizedText(alert: ProactiveAlert, field: 'title' | 'message' | 'action_text', lang: string): string {
  if (lang === 'mr') return (alert as any)[`${field}_mr`] || (alert as any)[`${field}_en`] || '';
  if (lang === 'hi') return (alert as any)[`${field}_hi`] || (alert as any)[`${field}_en`] || '';
  return (alert as any)[`${field}_en`] || '';
}

export default function ProactiveAlerts() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { alerts, loading, unreadCount, markSeen, markActed, dismissAlert } = useProactiveAlerts();
  const { speak, isSpeaking, stop } = useEnhancedTTS();
  const lang = i18n.language || 'en';
  const [selectedLand, setSelectedLand] = useState<string | null>(null);

  const handleSpeak = (alert: ProactiveAlert) => {
    if (isSpeaking) { stop(); return; }
    const title = getLocalizedText(alert, 'title', lang);
    const message = getLocalizedText(alert, 'message', lang);
    const action = getLocalizedText(alert, 'action_text', lang);
    speak(`${title}. ${message}. ${action}`, lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN');
  };

  const handleAskAI = (alert: ProactiveAlert) => {
    const category = alert.alert_category.replace(/_/g, ' ').toLowerCase();
    const landName = alert.land_name || (lang === 'mr' ? 'माझे शेत' : lang === 'hi' ? 'मेरा खेत' : 'my field');
    const queryTemplates: Record<string, string> = {
      mr: `${landName} वर ${category} बद्दल अधिक सांगा`,
      hi: `${landName} पर ${category} के बारे में बताएं`,
      en: `Tell me more about ${category} on ${landName}`,
    };
    const query = queryTemplates[lang] || queryTemplates.en;
    navigate(`/app/chat?q=${encodeURIComponent(query)}`);
  };

  const getPriorityLabel = (priority: string): string => {
    const emoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
    return `${emoji[priority] || '⚪'} ${t(`proactive.priority.${priority.toLowerCase()}`, priority)}`;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <CheckCircle className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t('proactive.allClear')}</h2>
        <p className="text-muted-foreground text-sm max-w-xs">{t('proactive.noAlerts')}</p>
      </div>
    );
  }

  const sortedAlerts = [...alerts].sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
    const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
    if (pA !== pB) return pA - pB;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t('proactive.title')}
            {unreadCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-xs px-2">{unreadCount}</Badge>
            )}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t('proactive.subtitle')}</p>
        </div>
      </div>

      <AnimatePresence>
        {sortedAlerts.map((alert, index) => {
          const config = CATEGORY_CONFIG[alert.alert_category] || CATEGORY_CONFIG.GENERAL;
          const badgeClass = PRIORITY_BADGE_CLASS[alert.priority] || PRIORITY_BADGE_CLASS.MEDIUM;
          const Icon = config.icon;
          const title = getLocalizedText(alert, 'title', lang);
          const message = getLocalizedText(alert, 'message', lang);
          const actionText = getLocalizedText(alert, 'action_text', lang);
          const isUnread = alert.status === 'PENDING' || alert.status === 'DELIVERED';

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className={cn(
                  'border-l-4 transition-all',
                  config.bgColor,
                  isUnread && 'shadow-md',
                  alert.priority === 'CRITICAL' && 'border-l-red-500 ring-1 ring-red-200',
                  alert.priority === 'HIGH' && 'border-l-orange-500',
                  alert.priority === 'MEDIUM' && 'border-l-yellow-500',
                  alert.priority === 'LOW' && 'border-l-green-500',
                )}
                onClick={() => isUnread && markSeen(alert.id)}
              >
                <CardContent className="p-4">
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                      alert.priority === 'CRITICAL' ? 'bg-red-100' : 'bg-white/80'
                    )}>
                      <Icon className={cn('h-5 w-5', config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm leading-tight line-clamp-2">{title}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                          onClick={(e) => { e.stopPropagation(); handleSpeak(alert); }}>
                          <Volume2 className={cn('h-4 w-4', isSpeaking ? 'text-primary animate-pulse' : 'text-muted-foreground')} />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] px-1.5 py-0', badgeClass)}>
                          {getPriorityLabel(alert.priority)}
                        </Badge>
                        {alert.land_name && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {alert.land_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-50"
                      onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{message}</p>

                  {/* Action */}
                  {actionText && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 rounded-lg px-3 py-2">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      <span>{actionText}</span>
                    </div>
                  )}

                  {/* Why this alert? (evidence section) */}
                  <AlertEvidenceSection 
                    triggerData={alert.trigger_data || {}} 
                    reasoning={alert.decision_reasoning} 
                  />

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </span>

                    <div className="flex gap-2">
                      {/* Ask AI deeplink CTA */}
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-full"
                        onClick={(e) => { e.stopPropagation(); handleAskAI(alert); }}>
                        <MessageCircle className="h-3 w-3" />
                        {t('proactive.askAI', 'Ask AI')}
                      </Button>
                      {alert.status !== 'ACTED' && (
                        <Button variant="default" size="sm" className="h-7 text-xs gap-1 rounded-full"
                          onClick={(e) => { e.stopPropagation(); markActed(alert.id); }}>
                          <CheckCircle className="h-3 w-3" />
                          {t('proactive.done')}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
