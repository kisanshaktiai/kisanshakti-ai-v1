import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProactiveAlerts, ProactiveAlert } from '@/hooks/useProactiveAlerts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertEvidenceSection } from '@/components/proactive/AlertEvidenceSection';
import { LandRef } from '@/components/land/LandRef';
import {
  AlertTriangle, Bell, CheckCircle, CloudRain, Bug,
  Droplets, Thermometer, Leaf, Clock, Volume2,
  ChevronRight, Sprout, Wind, X, MessageCircle,
  ArrowLeft, History, RotateCcw, Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useEnhancedTTS } from '@/hooks/useEnhancedTTS';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/hooks/useTenant';
import { toast } from '@/hooks/use-toast';

/** Semantic-token category map (no raw tailwind palette colors). */
type Tone = 'destructive' | 'warning' | 'primary' | 'success' | 'info' | 'muted';
const CATEGORY_TOKEN: Record<string, { icon: React.ElementType; tone: Tone }> = {
  WEATHER_WARNING:   { icon: CloudRain,     tone: 'info' },
  DISEASE_RISK:      { icon: AlertTriangle, tone: 'destructive' },
  PEST_RISK:         { icon: Bug,           tone: 'warning' },
  IRRIGATION:        { icon: Droplets,      tone: 'info' },
  CROP_STRESS:       { icon: Thermometer,   tone: 'warning' },
  FERTILIZER_WINDOW: { icon: Sprout,        tone: 'success' },
  STAGE_ADVISORY:    { icon: Leaf,          tone: 'success' },
  SPRAY_WINDOW:      { icon: Wind,          tone: 'primary' },
  HARVEST_TIMING:    { icon: Sprout,        tone: 'warning' },
  GENERAL:           { icon: Bell,          tone: 'muted' },
};

const toneBg: Record<Tone, string> = {
  destructive: 'bg-destructive/10 text-destructive',
  warning:     'bg-warning/15 text-warning-foreground',
  primary:     'bg-primary/10 text-primary',
  success:     'bg-success/10 text-success',
  info:        'bg-accent/30 text-accent-foreground',
  muted:       'bg-muted text-muted-foreground',
};
const toneRail: Record<Tone, string> = {
  destructive: 'bg-destructive',
  warning:     'bg-warning',
  primary:     'bg-primary',
  success:     'bg-success',
  info:        'bg-accent',
  muted:       'bg-muted-foreground/40',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-destructive',
  HIGH:     'bg-warning',
  MEDIUM:   'bg-primary',
  LOW:      'bg-success',
};

const STATUS_LABEL: Record<string, { mr: string; hi: string; en: string }> = {
  ACTED:     { mr: 'केले',     hi: 'किया',   en: 'Done' },
  DISMISSED: { mr: 'नाकारले',  hi: 'खारिज',  en: 'Dismissed' },
  SEEN:      { mr: 'पाहिले',   hi: 'देखा',   en: 'Seen' },
};

function getLocalizedText(alert: ProactiveAlert, field: 'title' | 'message' | 'action_text', lang: string): string {
  if (lang === 'mr') return (alert as any)[`${field}_mr`] || (alert as any)[`${field}_en`] || '';
  if (lang === 'hi') return (alert as any)[`${field}_hi`] || (alert as any)[`${field}_en`] || '';
  return (alert as any)[`${field}_en`] || '';
}

const localized = (lang: string, mr: string, hi: string, en: string) =>
  lang === 'mr' ? mr : lang === 'hi' ? hi : en;

export default function ProactiveAlerts() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { alerts, loading, unreadCount, showHistory, setShowHistory, markSeen, markActed, dismissAlert } =
    useProactiveAlerts({ skipRealtime: true });
  const { speak, isSpeaking, stop } = useEnhancedTTS();
  const lang = i18n.language || 'en';
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [answeringAlertId, setAnsweringAlertId] = useState<string | null>(null);

  // One-tap germination answer → record_germination via edge function.
  const handleGerminationAnswer = async (alert: ProactiveAlert, confirmed: boolean) => {
    if (!alert.land_id) return;
    setAnsweringAlertId(alert.id);
    try {
      const { data, error } = await supabase.functions.invoke('proactive-question-seed', {
        body: {
          action: 'germination_answer',
          alertId: alert.id,
          landId: alert.land_id,
          confirmed,
          language: lang,
        },
        headers: { 'x-farmer-id': user?.id || '', 'x-tenant-id': tenant?.id || '' },
      });
      if (error) throw error;
      const msg = (data as any)?.message;
      if (msg) toast({ description: msg });
      markActed(alert.id);
      if ((data as any)?.needs_diagnosis) handleAskAI(alert);
    } catch (e) {
      console.error('[proactive] germination answer failed', e);
    } finally {
      setAnsweringAlertId(null);
    }
  };

  // URL-synced land filter (instant deep-link from home AlertsSummaryCard)
  const urlLandId = searchParams.get('landId');
  const [selectedLandId, setSelectedLandId] = useState<string | null>(urlLandId);
  useEffect(() => { setSelectedLandId(urlLandId); }, [urlLandId]);

  const setLandFilter = (id: string | null) => {
    setSelectedLandId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set('landId', id); else next.delete('landId');
    setSearchParams(next, { replace: true });
  };

  const handleSpeak = (alert: ProactiveAlert) => {
    if (isSpeaking) { stop(); return; }
    const title = getLocalizedText(alert, 'title', lang);
    const message = getLocalizedText(alert, 'message', lang);
    const action = getLocalizedText(alert, 'action_text', lang);
    speak(`${title}. ${message}. ${action}`, lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN');
  };

  const handleAskAI = (alert: ProactiveAlert) => {
    const params = new URLSearchParams({ fromAlert: alert.id, seedSession: 'new' });
    if (alert.land_id) params.set('landId', alert.land_id);
    navigate(`/app/chat?${params.toString()}`);
  };

  const handleShare = (alert: ProactiveAlert) => {
    const title = getLocalizedText(alert, 'title', lang);
    const message = getLocalizedText(alert, 'message', lang);
    const action = getLocalizedText(alert, 'action_text', lang);
    const landName = alert.land?.name ? ` (${alert.land.name})` : '';
    const full = `🌾 *KisanShakti AI*${landName}\n\n⚠️ *${title}*\n\n${message}${action ? `\n\n✅ ${action}` : ''}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(full)}`, '_blank');
  };

  // ---- Aggregations --------------------------------------------------------
  type PriCounts = { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  type LandBucket = {
    id: string;
    land: ProactiveAlert['land'];
    name: string;
    count: number;
    topPriority: string;
    counts: PriCounts;
  };
  const { landBuckets, hasUnresolved, summary } = useMemo(() => {
    const map = new Map<string, LandBucket>();
    let unresolved = 0;
    const counts: PriCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;

    alerts.forEach(a => {
      const p = a.priority as keyof PriCounts;
      if (counts[p] !== undefined) counts[p] += 1;
      if (!a.land_id) return;
      if (!a.land) { unresolved++; return; }
      const ex = map.get(a.land_id);
      if (ex) {
        ex.count++;
        if (ex.counts[p] !== undefined) ex.counts[p] += 1;
        if ((order[a.priority] ?? 9) < (order[ex.topPriority] ?? 9)) ex.topPriority = a.priority;
      } else {
        const bucketCounts: PriCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        if (bucketCounts[p] !== undefined) bucketCounts[p] += 1;
        map.set(a.land_id, {
          id: a.land_id, land: a.land, name: a.land.name,
          count: 1, topPriority: a.priority, counts: bucketCounts,
        });
      }
    });

    return {
      landBuckets: Array.from(map.values()).sort((x, y) => {
        const po = (order[x.topPriority] ?? 9) - (order[y.topPriority] ?? 9);
        return po !== 0 ? po : y.count - x.count;
      }),
      hasUnresolved: unresolved > 0,
      summary: { total: alerts.length, lands: map.size, ...counts, unresolved },
    };
  }, [alerts]);

  const sortedAlerts = useMemo(() => {
    return [...alerts]
      .filter(a => {
        if (!selectedLandId) return true;
        if (selectedLandId === '__unresolved__') return a.land_id && !a.land;
        return a.land_id === selectedLandId;
      })
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
        const pA = order[a.priority] ?? 2;
        const pB = order[b.priority] ?? 2;
        if (pA !== pB) return pA - pB;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [alerts, selectedLandId]);

  // ---- Loading skeleton ----------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-full bg-background pb-nav-safe">
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Empty state ---------------------------------------------------------
  if (alerts.length === 0 && !showHistory) {
    return (
      <div className="min-h-full bg-background pb-nav-safe">
        <Header
          t={t} lang={lang} navigate={navigate}
          showHistory={false} setShowHistory={setShowHistory}
          unreadCount={0}
        />
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <CheckCircle className="h-10 w-10 text-success" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t('proactive.allClear', 'All clear')}</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t('proactive.noAlerts', 'No active alerts right now. We will notify you the moment something needs attention.')}
          </p>
        </div>
      </div>
    );
  }

  // ---- Main ---------------------------------------------------------------
  return (
    <div className="min-h-full bg-background pb-nav-safe">
      <Header
        t={t} lang={lang} navigate={navigate}
        showHistory={showHistory} setShowHistory={setShowHistory}
        unreadCount={unreadCount}
      />

      <div className="px-4 pt-3 pb-6 space-y-4">
        {/* Ambiguous nursery/transplant dates — ask for one date before we reason */}
        {clarifications.map(c => (
          <AnchorClarificationCard key={c.land_id} item={c} onSubmit={submitSowingDate} />
        ))}

        {/* Mini Report Summary */}
        <ReportSummary summary={summary} lang={lang} />

        {/* Land cards row — AI-chat style */}
        {(landBuckets.length > 0 || hasUnresolved) && (
          <div className="-mx-4">
            <div className="flex gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
              <LandCard
                active={!selectedLandId}
                onClick={() => setLandFilter(null)}
                emoji="📋"
                name={localized(lang, 'सर्व शेत', 'सभी भूमि', 'All lands')}
                subtitle={`${summary.lands || 0} ${localized(lang, 'शेत', 'भूमि', 'lands')}`}
                count={alerts.length}
                counts={{
                  CRITICAL: summary.CRITICAL || 0,
                  HIGH: summary.HIGH || 0,
                  MEDIUM: summary.MEDIUM || 0,
                  LOW: summary.LOW || 0,
                }}
                lang={lang}
              />
              {landBuckets.map(b => (
                <LandCard
                  key={b.id}
                  active={selectedLandId === b.id}
                  onClick={() => setLandFilter(selectedLandId === b.id ? null : b.id)}
                  land={b.land || undefined}
                  name={b.name}
                  subtitle={b.land?.area_acres ? `${b.land.area_acres.toFixed(2)} ac` : undefined}
                  count={b.count}
                  counts={b.counts}
                  topPriority={b.topPriority}
                  lang={lang}
                />
              ))}
              {hasUnresolved && (
                <LandCard
                  active={selectedLandId === '__unresolved__'}
                  onClick={() => setLandFilter(selectedLandId === '__unresolved__' ? null : '__unresolved__')}
                  emoji="🌾"
                  name={localized(lang, 'इतर शेत', 'अन्य भूमि', 'Other lands')}
                  count={summary.unresolved}
                  counts={{ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }}
                  lang={lang}
                />
              )}
            </div>
          </div>
        )}

        {/* History banner */}
        {showHistory && (
          <div className="bg-muted/60 rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <History className="h-3 w-3" />
            {localized(lang, 'सर्व जुन्या सूचना दाखवत आहे', 'सभी पुरानी सूचनाएं दिखा रहा है', 'Showing all alerts including history')}
          </div>
        )}

        {/* Filtered empty */}
        {sortedAlerts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Bell className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {localized(lang, 'या शेतासाठी कोणतीही सूचना नाही', 'इस भूमि के लिए कोई अलर्ट नहीं', 'No alerts for this land')}
            </p>
          </div>
        )}

        {/* Alerts */}
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {sortedAlerts.map((alert) => {
              const cat = CATEGORY_TOKEN[alert.alert_category] || CATEGORY_TOKEN.GENERAL;
              const Icon = cat.icon;
              const title = getLocalizedText(alert, 'title', lang);
              const message = getLocalizedText(alert, 'message', lang);
              const actionText = getLocalizedText(alert, 'action_text', lang);
              const isUnread = alert.status === 'PENDING' || alert.status === 'DELIVERED';
              const isHistorical = alert.status === 'ACTED' || alert.status === 'DISMISSED';
              const isCritical = alert.priority === 'CRITICAL';
              const statusLabel = STATUS_LABEL[alert.status];

              return (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18 }}
                >
                  <Card
                    onClick={() => isUnread && markSeen(alert.id)}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all',
                      isHistorical && 'opacity-70',
                      isCritical && 'ring-1 ring-destructive/40',
                    )}
                  >
                    {/* Left priority rail */}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute left-0 top-0 bottom-0 w-1',
                        toneRail[isCritical ? 'destructive' : cat.tone],
                      )}
                    />

                    <CardContent className="p-3 pl-4">
                      <div className="flex items-start gap-3">
                        {/* Icon bubble */}
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', toneBg[cat.tone])}>
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-sm leading-snug text-foreground line-clamp-2 flex-1">
                              {title}
                            </h3>
                            <button
                              className={cn(
                                'shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors',
                                isSpeaking ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent',
                              )}
                              onClick={(e) => { e.stopPropagation(); handleSpeak(alert); }}
                              aria-label="Speak"
                            >
                              <Volume2 className={cn('h-4 w-4', isSpeaking && 'animate-pulse')} />
                            </button>
                          </div>

                          {/* Meta row: priority • land • time */}
                          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-muted-foreground">
                            <Badge variant="outline" className={cn('h-5 px-1.5 gap-1 border-transparent', toneBg[isCritical ? 'destructive' : cat.tone])}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[alert.priority] || 'bg-muted-foreground')} />
                              <span className="text-[10px] font-medium uppercase tracking-wide">
                                {t(`proactive.priority.${alert.priority.toLowerCase()}`, alert.priority)}
                              </span>
                            </Badge>
                            {alert.land ? (
                              <LandRef land={alert.land} showArea className="text-[11px]" />
                            ) : alert.land_id ? (
                              <span className="italic">
                                🌾 {localized(lang, '(अज्ञात शेत)', '(अज्ञात भूमि)', '(unknown land)')}
                              </span>
                            ) : null}
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                            </span>
                            {statusLabel && isHistorical && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-border bg-muted">
                                {statusLabel[lang as 'mr' | 'hi' | 'en'] || statusLabel.en}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Message */}
                      <p className="text-sm text-foreground/85 mt-2.5 leading-relaxed">{message}</p>

                      {/* Action highlight */}
                      {actionText && (
                        <div className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-primary bg-primary/8 rounded-xl px-3 py-2">
                          <ChevronRight className="h-4 w-4 shrink-0 mt-px" />
                          <span className="leading-snug">{actionText}</span>
                        </div>
                      )}

                      {/* Evidence */}
                      <AlertEvidenceSection
                        triggerData={alert.trigger_data || {}}
                        reasoning={alert.decision_reasoning}
                      />

                      {/* One-tap germination question (DB-authored options) */}
                      {(alert.trigger_data as any)?.question?.type === 'GERMINATION_CHECK' &&
                        alert.status !== 'ACTED' && (
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {((alert.trigger_data as any).question.options || []).map((opt: any) => (
                              <Button
                                key={opt.key}
                                size="sm"
                                variant={opt.confirmed ? 'default' : 'outline'}
                                disabled={answeringAlertId === alert.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGerminationAnswer(alert, opt.confirmed === true);
                                }}
                                className="rounded-full h-8 text-xs"
                              >
                                {opt[`label_${lang}`] || opt.label_en || opt.key}
                              </Button>
                            ))}
                          </div>
                        )}

                      {/* Action chips */}
                      <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/60">
                        <ChipButton onClick={(e) => { e.stopPropagation(); handleAskAI(alert); }} icon={<MessageCircle className="h-3.5 w-3.5" />}>
                          {t('proactive.askAI', 'Ask AI')}
                        </ChipButton>
                        <ChipButton onClick={(e) => { e.stopPropagation(); handleShare(alert); }} icon={<Share2 className="h-3.5 w-3.5" />}>
                          {localized(lang, 'शेअर', 'शेयर', 'Share')}
                        </ChipButton>
                        <div className="flex-1" />
                        {!isHistorical && (
                          <ChipButton
                            onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                            icon={<X className="h-3.5 w-3.5" />}
                            variant="ghost"
                          >
                            {localized(lang, 'नाकार', 'खारिज', 'Dismiss')}
                          </ChipButton>
                        )}
                        {!isHistorical && alert.status !== 'ACTED' && (
                          <ChipButton
                            onClick={(e) => { e.stopPropagation(); markActed(alert.id); }}
                            icon={<CheckCircle className="h-3.5 w-3.5" />}
                            variant="primary"
                          >
                            {t('proactive.done', 'Done')}
                          </ChipButton>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function Header({
  t, lang, navigate, showHistory, setShowHistory, unreadCount,
}: any) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/home')} className="h-8 w-8 rounded-lg shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <Bell className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-sm font-bold truncate">
            {t('proactive.title', 'Proactive Alerts')}
          </h1>
          {unreadCount > 0 && (
            <Badge className="bg-destructive text-destructive-foreground text-[10px] h-4 px-1.5 shrink-0">{unreadCount}</Badge>
          )}
        </div>
        <Button
          variant={showHistory ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[11px] gap-1 rounded-full px-2.5 shrink-0"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? <RotateCcw className="h-3 w-3" /> : <History className="h-3 w-3" />}
          {showHistory
            ? localized(lang, 'सध्या', 'अभी', 'Current')
            : localized(lang, 'जुने', 'पुराने', 'History')}
        </Button>
      </div>
    </div>
  );
}

function ReportSummary({ summary, lang }: { summary: any; lang: string }) {
  const total = summary.total || 0;
  const segments = ([
    { tone: 'destructive' as Tone, value: summary.CRITICAL || 0, key: 'CRITICAL', short: 'C' },
    { tone: 'warning' as Tone,     value: summary.HIGH || 0,     key: 'HIGH',     short: 'H' },
    { tone: 'primary' as Tone,     value: summary.MEDIUM || 0,   key: 'MEDIUM',   short: 'M' },
    { tone: 'success' as Tone,     value: summary.LOW || 0,      key: 'LOW',      short: 'L' },
  ] as { tone: Tone; value: number; key: string; short: string }[]).filter(s => s.value > 0);

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-3">
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="text-xl font-bold leading-none">{total}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {localized(lang, 'सूचना', 'अलर्ट', total === 1 ? 'alert' : 'alerts')}
        </span>
      </div>
      <span className="text-muted-foreground/40 text-xs">·</span>
      <div className="text-[11px] text-muted-foreground shrink-0">
        {summary.lands} {localized(lang, 'शेत', 'भूमि', summary.lands === 1 ? 'land' : 'lands')}
      </div>
      <div className="flex-1 min-w-0">
        {total > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
            {segments.map(s => (
              <div
                key={s.key}
                style={{ width: `${(s.value / total) * 100}%` }}
                className={cn(toneRail[s.tone])}
                title={`${s.key}: ${s.value}`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {segments.map(s => (
          <span key={s.key} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
            <span className={cn('w-1.5 h-1.5 rounded-full', toneRail[s.tone])} />
            {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}



function LandCard({
  active, onClick, land, emoji, name, subtitle, count, counts, topPriority, lang,
}: {
  active: boolean;
  onClick: () => void;
  land?: { name?: string | null; area_acres?: number | null; current_crop?: string | null; crop_emoji?: string | null };
  emoji?: string;
  name: string;
  subtitle?: string;
  count: number;
  counts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  topPriority?: string;
  lang: string;
}) {
  const cropToEmoji = (crop?: string | null): string => {
    if (!crop) return '🌾';
    const c = crop.toLowerCase();
    if (c.includes('sugarcane') || c.includes('ऊस')) return '🎋';
    if (c.includes('cotton') || c.includes('कापूस')) return '🪶';
    if (c.includes('rice') || c.includes('धान')) return '🍚';
    if (c.includes('wheat') || c.includes('गहू')) return '🌾';
    if (c.includes('tomato')) return '🍅';
    if (c.includes('onion') || c.includes('कांदा')) return '🧅';
    if (c.includes('grape') || c.includes('द्राक्ष')) return '🍇';
    return '🌾';
  };
  const displayEmoji = emoji ?? land?.crop_emoji ?? cropToEmoji(land?.current_crop);

  const dotSegs = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)
    .map(k => ({ k, v: counts[k] }))
    .filter(s => s.v > 0);

  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 snap-start w-[118px] rounded-xl border px-2.5 py-2 text-left transition-all flex flex-col gap-1.5',
        active
          ? 'bg-primary/10 border-primary ring-1 ring-primary/40 shadow-sm'
          : 'bg-card border-border hover:bg-accent/30',
      )}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-base leading-none" aria-hidden>{displayEmoji}</span>
        <span className={cn(
          'min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center justify-center leading-none',
          count === 0 ? 'bg-muted text-muted-foreground' :
          topPriority === 'CRITICAL' ? 'bg-destructive text-destructive-foreground' :
          topPriority === 'HIGH' ? 'bg-warning text-warning-foreground' :
          'bg-primary text-primary-foreground',
        )}>
          {count}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-foreground truncate leading-tight">{name}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground truncate leading-tight">{subtitle}</div>}
      </div>
      {dotSegs.length > 0 && (
        <div className="flex items-center gap-1 -mt-0.5">
          {dotSegs.map(s => (
            <span key={s.k} className="inline-flex items-center gap-0.5">
              <span className={cn('w-1 h-1 rounded-full', PRIORITY_DOT[s.k])} />
              <span className="text-[9px] text-muted-foreground font-medium leading-none">{s.v}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function ChipButton({
  children, onClick, icon, variant = 'default',
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'ghost';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium transition-colors',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'default' && 'bg-muted text-foreground hover:bg-accent/60',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
