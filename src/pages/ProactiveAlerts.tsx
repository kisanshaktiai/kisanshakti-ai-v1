import { useState } from 'react';
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
  ChevronRight, Sprout, Wind, X, MessageCircle, MapPin,
  ArrowLeft, History, RotateCcw
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

const STATUS_LABELS: Record<string, { mr: string; hi: string; en: string; color: string }> = {
  ACTED: { mr: '✅ केले', hi: '✅ किया', en: '✅ Done', color: 'bg-green-100 text-green-700' },
  DISMISSED: { mr: '❌ नाकारले', hi: '❌ खारिज', en: '❌ Dismissed', color: 'bg-gray-100 text-gray-600' },
  SEEN: { mr: '👁️ पाहिले', hi: '👁️ देखा', en: '👁️ Seen', color: 'bg-blue-100 text-blue-600' },
};

export default function ProactiveAlerts() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { alerts, loading, unreadCount, showHistory, setShowHistory, markSeen, markActed, dismissAlert } = useProactiveAlerts({ skipRealtime: true });
  const { speak, isSpeaking, stop } = useEnhancedTTS();
  const lang = i18n.language || 'en';
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);

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

  const handleWhatsAppShare = (alert: ProactiveAlert) => {
    const title = getLocalizedText(alert, 'title', lang);
    const message = getLocalizedText(alert, 'message', lang);
    const action = getLocalizedText(alert, 'action_text', lang);
    const landName = alert.land_name ? ` (${alert.land_name})` : '';
    const appName = 'KisanShakti AI';
    const fullMessage = `🌾 *${appName}*${landName}\n\n⚠️ *${title}*\n\n${message}${action ? `\n\n✅ ${action}` : ''}`;
    const encoded = encodeURIComponent(fullMessage);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
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

  if (alerts.length === 0 && !showHistory) {
    return (
      <div className="min-h-full bg-gradient-to-br from-background via-accent/5 to-primary/5 pb-nav-safe">
        {/* Sticky sub-header (sticks to top of <main> scroller, below global header) */}
        <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/40">
          <div className="px-3 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/app/home')} className="h-9 w-9 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex-1">
                <h1 className="text-lg font-bold flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  {t('proactive.title', 'Proactive Alerts')}
                </h1>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1 rounded-full" onClick={() => setShowHistory(true)}>
                <History className="h-3 w-3" />
                {lang === 'mr' ? 'जुने' : lang === 'hi' ? 'पुराने' : 'History'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t('proactive.allClear')}</h2>
          <p className="text-muted-foreground text-sm max-w-xs">{t('proactive.noAlerts')}</p>
        </div>
      </div>
    );
  }

  // Build unique lands by land_id (not land_name — multiple lands can share a name)
  const landMap = new Map<string, { id: string; name: string; count: number }>();
  alerts.forEach(a => {
    if (!a.land_id) return;
    const existing = landMap.get(a.land_id);
    if (existing) {
      existing.count++;
    } else {
      landMap.set(a.land_id, { id: a.land_id, name: a.land_name || a.land_id.slice(0, 6), count: 1 });
    }
  });
  const uniqueLands = Array.from(landMap.values());
  // If multiple lands share the same name, append a suffix to differentiate
  const nameCount = new Map<string, number>();
  uniqueLands.forEach(l => nameCount.set(l.name, (nameCount.get(l.name) || 0) + 1));
  const landLabels = new Map<string, string>();
  const nameIndex = new Map<string, number>();
  uniqueLands.forEach(l => {
    if ((nameCount.get(l.name) || 0) > 1) {
      const idx = (nameIndex.get(l.name) || 0) + 1;
      nameIndex.set(l.name, idx);
      landLabels.set(l.id, `${l.name} #${idx}`);
    } else {
      landLabels.set(l.id, l.name);
    }
  });

  const sortedAlerts = [...alerts]
    .filter(a => !selectedLandId || a.land_id === selectedLandId)
    .sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const pA = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 2;
      const pB = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 2;
      if (pA !== pB) return pA - pB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="min-h-full bg-gradient-to-br from-background via-accent/5 to-primary/5 pb-nav-safe">
      {/* Sticky sub-header */}
      <div className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border/40">
        <div className="px-3 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/home')}
              className="h-9 w-9 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                {t('proactive.title', 'Proactive Alerts')}
                {unreadCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-xs px-2">{unreadCount}</Badge>
                )}
              </h1>
              <p className="text-[11px] text-muted-foreground">{t('proactive.subtitle', 'AI-powered farm intelligence')}</p>
            </div>
            <Button
              variant={showHistory ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs gap-1 rounded-full"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <RotateCcw className="h-3 w-3" /> : <History className="h-3 w-3" />}
              {showHistory
                ? (lang === 'mr' ? 'सध्याचे' : lang === 'hi' ? 'वर्तमान' : 'Current')
                : (lang === 'mr' ? 'जुने' : lang === 'hi' ? 'पुराने' : 'History')
              }
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-4 px-4 pb-4 space-y-4">

      {/* Land filter chips */}
      {uniqueLands.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setSelectedLandId(null)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              !selectedLandId ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-accent'
            )}
          >
            {lang === 'mr' ? 'सर्व' : lang === 'hi' ? 'सभी' : 'All'} ({alerts.length})
          </button>
          {uniqueLands.map(land => (
            <button
              key={land.id}
              onClick={() => setSelectedLandId(selectedLandId === land.id ? null : land.id)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1',
                selectedLandId === land.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:bg-accent'
              )}
            >
              <MapPin className="h-3 w-3" />
              {landLabels.get(land.id) || land.name} ({land.count})
            </button>
          ))}
        </div>
      )}

      {/* History banner */}
      {showHistory && (
        <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <History className="h-3 w-3" />
          {lang === 'mr' ? 'सर्व जुन्या सूचना दाखवत आहे' : lang === 'hi' ? 'सभी पुरानी सूचनाएं दिखा रहा है' : 'Showing all alerts including history'}
        </div>
      )}

      <AnimatePresence>
        {sortedAlerts.map((alert, index) => {
          const config = CATEGORY_CONFIG[alert.alert_category] || CATEGORY_CONFIG.GENERAL;
          const badgeClass = PRIORITY_BADGE_CLASS[alert.priority] || PRIORITY_BADGE_CLASS.MEDIUM;
          const Icon = config.icon;
          const title = getLocalizedText(alert, 'title', lang);
          const message = getLocalizedText(alert, 'message', lang);
          const actionText = getLocalizedText(alert, 'action_text', lang);
          const isUnread = alert.status === 'PENDING' || alert.status === 'DELIVERED';
          const isHistorical = alert.status === 'ACTED' || alert.status === 'DISMISSED';
          const statusLabel = STATUS_LABELS[alert.status];

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
                  isHistorical && 'opacity-70',
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn('text-[10px] px-1.5 py-0', badgeClass)}>
                          {getPriorityLabel(alert.priority)}
                        </Badge>
                        {alert.land_name && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {alert.land_name}
                          </span>
                        )}
                        {statusLabel && isHistorical && (
                          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', statusLabel.color)}>
                            {statusLabel[lang as 'mr' | 'hi' | 'en'] || statusLabel.en}
                          </Badge>
                        )}
                        {/* Rule traceability */}
                        {alert.rule_id && (
                          <span className="text-[9px] text-muted-foreground/50">
                            #{alert.rule_id}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isHistorical && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-50"
                        onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
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
                      {/* WhatsApp Share - compact icon */}
                      <Button variant="outline" size="icon" className="h-7 w-7 rounded-full text-green-600 border-green-200 hover:bg-green-50"
                        onClick={(e) => { e.stopPropagation(); handleWhatsAppShare(alert); }}
                        title="Share on WhatsApp"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </Button>
                      {/* Ask AI deeplink CTA */}
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-full"
                        onClick={(e) => { e.stopPropagation(); handleAskAI(alert); }}>
                        <MessageCircle className="h-3 w-3" />
                        {t('proactive.askAI', 'Ask AI')}
                      </Button>
                      {!isHistorical && alert.status !== 'ACTED' && (
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
    </div>
  );
}
