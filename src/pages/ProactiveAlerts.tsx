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
  ArrowLeft, History, RotateCcw, Share2, Satellite,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion';
import { useEnhancedTTS } from '@/hooks/useEnhancedTTS';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/hooks/useTenant';
import { toast } from '@/hooks/use-toast';
import { useAnchorClarification } from '@/hooks/useAnchorClarification';
import { AnchorClarificationCard } from '@/components/land/AnchorClarificationCard';
import { useLandNdvi, LandNdviReading } from '@/hooks/useLandNdvi';
import { formatNdviValue, ndviRatio, ndviTone, type NdviTone } from '@/lib/ndviColor';
import { alertSourceText, useTranslatedTexts, type AlertTextField } from '@/hooks/useAlertText';

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

const PRIORITY_TONE: Record<string, Tone> = { CRITICAL: 'destructive', HIGH: 'warning', MEDIUM: 'primary', LOW: 'muted' };

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-destructive',
  HIGH:     'bg-warning',
  MEDIUM:   'bg-primary',
  LOW:      'bg-success',
};

/** Satellite crop-health colour for a land: only a fresh, quality-passed reading
 *  (v_ndvi_decision_grade.is_fresh) colours a card; an old picture stays neutral.
 *  Colours come from ndviTone(), which mixes the theme tokens only. */
const healthTone = (reading?: LandNdviReading): NdviTone | null =>
  reading?.isFresh ? ndviTone(reading.ndvi) : null;

/** Motion timings shared by the cards (ms → s): reveal 420, wash 720. */
const MOTION = { reveal: 0.42, wash: 0.72, ease: [0.22, 1, 0.36, 1] as const };

/** Alerts built by evaluator v128+ carry trigger_data.graph_advice; only their
 *  action text is decision-graph output, so older rows' action text is not shown. */
const hasGraphAdvice = (a: ProactiveAlert) => !!a.trigger_data && 'graph_advice' in a.trigger_data;

/** "3 hours ago" in the app language (Intl), not English for everyone. */
function relativeTime(iso: string, lang: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]];
  let v = diffSec;
  for (const [unit, size] of steps) {
    if (Math.abs(v) < size) {
      try { return new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(Math.round(v), unit); }
      catch { return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round(v), unit); }
    }
    v /= size;
  }
  return '';
}

export default function ProactiveAlerts() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { alerts, loading, unreadCount, showHistory, setShowHistory, markSeen, markActed, dismissAlert } =
    useProactiveAlerts({ skipRealtime: true });
  const { speak, isSpeaking, stop } = useEnhancedTTS();
  const reduceMotion = useReducedMotion();
  const lang = i18n.language || 'en';
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [answeringAlertId, setAnsweringAlertId] = useState<string | null>(null);
  const { clarifications, submitSowingDate } = useAnchorClarification();
  const ambiguousLandIds = useMemo(
    () => new Set(clarifications.map(c => c.land_id)),
    [clarifications],
  );

  // Satellite crop health per land → colours the card (green when NDVI is high, amber/red when low).
  const alertLandIds = useMemo(
    () => alerts.map(a => a.land_id).filter(Boolean) as string[],
    [alerts],
  );
  const ndviByLand = useLandNdvi(alertLandIds);

  // Text in the app language: the row's own column, else English translated once.
  const toTranslate = useMemo(() => alerts.flatMap((a) =>
    (['title', 'message', 'action_text'] as AlertTextField[])
      .filter((f) => f !== 'action_text' || hasGraphAdvice(a))
      .map((f) => alertSourceText(a, f, lang))
      .filter((x) => x.needsTranslation)
      .map((x) => x.text)), [alerts, lang]);
  const { tr } = useTranslatedTexts(toTranslate, lang);
  const textOf = (a: ProactiveAlert, f: AlertTextField) => {
    if (f === 'action_text' && !hasGraphAdvice(a)) return '';
    const src = alertSourceText(a, f, lang);
    return src.needsTranslation ? tr(src.text) : src.text;
  };

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
    const title = textOf(alert, 'title');
    const message = textOf(alert, 'message');
    const action = textOf(alert, 'action_text');
    // The speech engine maps the app language to a device locale itself.
    speak([title, message, action].filter(Boolean).join('. '), lang);
  };

  const handleAskAI = (alert: ProactiveAlert) => {
    const params = new URLSearchParams({ fromAlert: alert.id, seedSession: 'new' });
    if (alert.land_id) params.set('landId', alert.land_id);
    navigate(`/app/chat?${params.toString()}`);
  };

  const handleShare = (alert: ProactiveAlert) => {
    const title = textOf(alert, 'title');
    const message = textOf(alert, 'message');
    const action = textOf(alert, 'action_text');
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

  // Newest first, like the home card and the offline cache; priority only breaks a tie.
  // (Priority-first put a 3-day-old CRITICAL above an alert raised minutes ago.)
  const sortedAlerts = useMemo(() => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
    return [...alerts]
      .filter(a => {
        if (!selectedLandId) return true;
        if (selectedLandId === '__unresolved__') return a.land_id && !a.land;
        return a.land_id === selectedLandId;
      })
      .sort((a, b) => {
        const byTime = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byTime !== 0) return byTime;
        return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
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
          t={t} navigate={navigate}
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
        t={t} navigate={navigate}
        showHistory={showHistory} setShowHistory={setShowHistory}
        unreadCount={unreadCount}
      />

      <div className="px-4 pt-3 pb-6 space-y-4">
        {/* Ambiguous nursery/transplant dates — ask for one date before we reason */}
        {clarifications.map(c => (
          <AnchorClarificationCard key={c.land_id} item={c} onSubmit={submitSowingDate} />
        ))}

        {/* Mini Report Summary */}
        <ReportSummary summary={summary} />

        {/* Land cards row — AI-chat style */}
        {(landBuckets.length > 0 || hasUnresolved) && (
          <div className="-mx-4">
            <div className="flex gap-2.5 overflow-x-auto px-4 pb-2 scrollbar-hide snap-x snap-mandatory">
              <LandCard
                active={!selectedLandId}
                onClick={() => setLandFilter(null)}
                emoji="📋"
                name={t('alerts.title_all_lands', 'All lands')}
                subtitle={t('alerts.land_count', { count: summary.lands || 0, defaultValue: '{{count}} lands' })}
                count={alerts.length}
                counts={{
                  CRITICAL: summary.CRITICAL || 0,
                  HIGH: summary.HIGH || 0,
                  MEDIUM: summary.MEDIUM || 0,
                  LOW: summary.LOW || 0,
                }}
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
                  ndvi={ndviByLand.get(b.id)}
                />
              ))}
              {hasUnresolved && (
                <LandCard
                  active={selectedLandId === '__unresolved__'}
                  onClick={() => setLandFilter(selectedLandId === '__unresolved__' ? null : '__unresolved__')}
                  emoji="🌾"
                  name={t('alerts.other_lands', 'Other lands')}
                  count={summary.unresolved}
                  counts={{ CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }}
                />
              )}
            </div>
          </div>
        )}

        {/* History banner */}
        {showHistory && (
          <div className="bg-muted/60 rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <History className="h-3 w-3" />
            {t('alerts.history_banner', 'Showing all alerts, including old ones')}
          </div>
        )}

        {/* Filtered empty */}
        {sortedAlerts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Bell className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('alerts.no_alerts_for_land', 'No alerts for this land')}
            </p>
          </div>
        )}

        {/* Alerts */}
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {sortedAlerts.map((alert, index) => {
              const cat = CATEGORY_TOKEN[alert.alert_category] || CATEGORY_TOKEN.GENERAL;
              const Icon = cat.icon;
              const title = textOf(alert, 'title');
              const message = textOf(alert, 'message');
              const actionText = textOf(alert, 'action_text');
              const isUnread = alert.status === 'PENDING' || alert.status === 'DELIVERED';
              const isHistorical = !['PENDING', 'DELIVERED', 'SEEN'].includes(alert.status);
              const isCritical = alert.priority === 'CRITICAL';
              const reading: LandNdviReading | undefined = alert.land_id ? ndviByLand.get(alert.land_id) : undefined;
              // Rail and badge follow priority (how urgent); the card wash follows the land's
              // satellite crop health (how the crop looks); the icon keeps the category's colour.
              const railTone: Tone = PRIORITY_TONE[alert.priority] ?? 'muted';
              const health = healthTone(reading);

              return (
                <motion.div
                  key={alert.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: MOTION.reveal, ease: MOTION.ease, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.05 }}
                >
                  <Card
                    onClick={() => isUnread && markSeen(alert.id)}
                    style={health ? { backgroundColor: health.surface, borderColor: health.border } : undefined}
                    className={cn(
                      'relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors duration-500',
                      isHistorical && 'opacity-70',
                      isCritical && !isHistorical && 'ring-1 ring-destructive/40',
                    )}
                  >
                    {/* Crop-health wash: grows in once from the top corner; finished state when motion is reduced */}
                    {health && (
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ background: `radial-gradient(130% 90% at 100% 0%, ${health.softSurface}, transparent 65%)` }}
                        initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: MOTION.wash, ease: MOTION.ease, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.05 }}
                      />
                    )}
                    {/* Left rail: the alert's own priority */}
                    <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-1.5', toneRail[railTone])} />
                    {isUnread && !reduceMotion && (
                      <motion.span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-1.5', toneRail[railTone])}
                        animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 2.4, repeat: 2 }} />
                    )}

                    <CardContent className="relative p-3 pl-4">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', toneBg[cat.tone])}>
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-[15px] leading-snug text-foreground line-clamp-2 flex-1">{title}</h3>
                            <button
                              className={cn(
                                'shrink-0 h-9 w-9 rounded-full flex items-center justify-center transition-colors',
                                isSpeaking ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground hover:bg-accent',
                              )}
                              onClick={(e) => { e.stopPropagation(); handleSpeak(alert); }}
                              aria-label={t('alerts.speak', 'Read aloud')}
                            >
                              <Volume2 className={cn('h-4 w-4', isSpeaking && 'animate-pulse')} />
                            </button>
                          </div>

                          {/* Meta: priority • land • time • status */}
                          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-muted-foreground">
                            <Badge variant="outline" className={cn('h-5 px-1.5 gap-1 border-transparent', toneBg[railTone])}>
                              <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[alert.priority] || 'bg-muted-foreground')} />
                              <span className="text-[10px] font-medium uppercase tracking-wide">
                                {t(`proactive.priority.${alert.priority.toLowerCase()}`, alert.priority)}
                              </span>
                            </Badge>
                            {alert.land ? (
                              <LandRef land={alert.land} showArea className="text-[11px]" />
                            ) : alert.land_id ? (
                              <span className="italic">🌾 {alert.land_name || t('alerts.unknown_land', '(unknown land)')}</span>
                            ) : null}
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-3 w-3" />
                              {relativeTime(alert.created_at, lang)}
                            </span>
                            {isHistorical && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-border bg-muted">
                                {t(`alerts.status.${alert.status.toLowerCase()}`, alert.status)}
                              </Badge>
                            )}
                          </div>
                          {alert.land_id && <NdviChip reading={reading} lang={lang} tone={health} reduceMotion={!!reduceMotion} />}
                        </div>
                      </div>

                      <p className="text-[15px] text-foreground mt-2.5 leading-relaxed">{message}</p>

                      {/* Action — only when it is decision-graph output (v128+ alerts) */}
                      {actionText && (
                        <div className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-xl px-3 py-2">
                          <ChevronRight className="h-4 w-4 shrink-0 mt-px" />
                          <span className="leading-snug">{actionText}</span>
                        </div>
                      )}

                      <AlertEvidenceSection triggerData={alert.trigger_data || {}} category={alert.alert_category} />

                      {/* One-tap germination question (DB-authored options) */}
                      {(alert.trigger_data as any)?.question?.type === 'GERMINATION_CHECK' &&
                        alert.status !== 'ACTED' &&
                        !(alert.land_id && ambiguousLandIds.has(alert.land_id)) && (
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
                                className="rounded-full h-9 text-xs"
                              >
                                {opt[`label_${lang}`] || opt.label_en || opt.key}
                              </Button>
                            ))}
                          </div>
                        )}

                      <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border/60">
                        <ChipButton onClick={(e) => { e.stopPropagation(); handleAskAI(alert); }} icon={<MessageCircle className="h-3.5 w-3.5" />}>
                          {t('proactive.askAI', 'Ask AI')}
                        </ChipButton>
                        <ChipButton onClick={(e) => { e.stopPropagation(); handleShare(alert); }} icon={<Share2 className="h-3.5 w-3.5" />}>
                          {t('alerts.share', 'Share')}
                        </ChipButton>
                        <div className="flex-1" />
                        {!isHistorical && (
                          <ChipButton
                            onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                            icon={<X className="h-3.5 w-3.5" />}
                            variant="ghost"
                          >
                            {t('alerts.dismiss', 'Dismiss')}
                          </ChipButton>
                        )}
                        {!isHistorical && (
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

/** The land's newest quality-passed satellite reading, with its date and a crop-health meter;
 *  marked old (and left uncoloured) when the DB says it is not fresh. */
function NdviChip({ reading, lang, tone, reduceMotion }: {
  reading: LandNdviReading | undefined; lang: string; tone: NdviTone | null; reduceMotion: boolean;
}) {
  const { t } = useTranslation();
  if (!reading) {
    return <p className="mt-1 text-[11px] text-muted-foreground">🛰️ {t('alerts.ndvi_none', 'No recent satellite picture')}</p>;
  }
  const date = new Date(`${reading.date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short' });
  const label = t('alerts.ndvi_chip', { value: formatNdviValue(reading.ndvi), date, defaultValue: 'Satellite {{value}} · {{date}}' });
  return (
    <div className="mt-1.5 space-y-1">
      <p className="inline-flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Satellite className="h-3 w-3" style={tone ? { color: tone.color } : undefined} />
        <span className="font-semibold text-foreground">{label}</span>
        {!reading.isFresh && <span className="rounded-full bg-muted px-1.5 py-0.5">{t('alerts.ndvi_old', 'old picture')}</span>}
      </p>
      <NdviMeter ndvi={reading.ndvi} tone={tone} reduceMotion={reduceMotion} label={label} />
    </div>
  );
}

/** Slim crop-health bar on the same red→amber→green scale as the card wash. */
function NdviMeter({ ndvi, tone, reduceMotion, label, className }: {
  ndvi: number; tone: NdviTone | null; reduceMotion: boolean; label: string; className?: string;
}) {
  const pct = Math.max(6, Math.round(ndviRatio(ndvi) * 100));
  return (
    <div role="img" aria-label={label} className={cn('h-1.5 w-full max-w-[160px] rounded-full bg-muted overflow-hidden', className)}>
      <motion.div
        className={cn('h-full rounded-full', !tone && 'bg-muted-foreground/40')}
        style={tone ? { backgroundColor: tone.color } : undefined}
        initial={reduceMotion ? false : { width: '0%' }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: MOTION.wash, ease: MOTION.ease, delay: reduceMotion ? 0 : 0.15 }}
      />
    </div>
  );
}

function Header({
  t, navigate, showHistory, setShowHistory, unreadCount,
}: any) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/home')} className="h-9 w-9 rounded-lg shrink-0">
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
          className="h-8 text-[11px] gap-1 rounded-full px-2.5 shrink-0"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? <RotateCcw className="h-3 w-3" /> : <History className="h-3 w-3" />}
          {showHistory ? t('alerts.current', 'Current') : t('alerts.history', 'History')}
        </Button>
      </div>
    </div>
  );
}

function ReportSummary({ summary }: { summary: any }) {
  const { t } = useTranslation();
  const total = summary.total || 0;
  const segments = ([
    { tone: 'destructive' as Tone, value: summary.CRITICAL || 0, key: 'CRITICAL' },
    { tone: 'warning' as Tone,     value: summary.HIGH || 0,     key: 'HIGH' },
    { tone: 'primary' as Tone,     value: summary.MEDIUM || 0,   key: 'MEDIUM' },
    { tone: 'success' as Tone,     value: summary.LOW || 0,      key: 'LOW' },
  ] as { tone: Tone; value: number; key: string }[]).filter(s => s.value > 0);

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-3">
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="text-xl font-bold leading-none">{total}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {t('alerts.alerts_count', { count: total, defaultValue: 'alerts' })}
        </span>
      </div>
      <span className="text-muted-foreground/40 text-xs">·</span>
      <div className="text-[11px] text-muted-foreground shrink-0">
        {t('alerts.land_count', { count: summary.lands || 0, defaultValue: '{{count}} lands' })}
      </div>
      <div className="flex-1 min-w-0">
        {total > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
            {segments.map(s => (
              <div key={s.key} style={{ width: `${(s.value / total) * 100}%` }} className={cn(toneRail[s.tone])} title={`${s.key}: ${s.value}`} />
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

/** Crop codes are English data identifiers; the emoji is decoration only. */
const CROP_EMOJI: Array<[string, string]> = [
  ['sugarcane', '🎋'], ['cotton', '🪶'], ['rice', '🍚'], ['paddy', '🍚'], ['wheat', '🌾'],
  ['tomato', '🍅'], ['onion', '🧅'], ['grape', '🍇'], ['maize', '🌽'],
];

function LandCard({
  active, onClick, land, emoji, name, subtitle, count, counts, topPriority, ndvi,
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
  ndvi?: LandNdviReading;
}) {
  const reduceMotion = useReducedMotion();
  const crop = String(land?.current_crop ?? '').toLowerCase();
  const displayEmoji = emoji ?? land?.crop_emoji ?? CROP_EMOJI.find(([k]) => crop.includes(k))?.[1] ?? '🌾';
  const health = healthTone(ndvi);

  const dotSegs = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)
    .map(k => ({ k, v: counts[k] }))
    .filter(s => s.v > 0);

  return (
    <motion.button
      onClick={onClick}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      style={health && !active ? { backgroundColor: health.surface, borderColor: health.border } : undefined}
      className={cn(
        'shrink-0 snap-start w-[118px] rounded-xl border px-2.5 py-2 text-left transition-colors duration-500 flex flex-col gap-1.5 min-h-11',
        active ? 'ring-2 ring-primary/50 shadow-sm bg-primary/10 border-primary' : 'bg-card border-border hover:bg-accent/30',
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
      {ndvi && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[9px] leading-none text-muted-foreground">
            <Satellite className="h-2.5 w-2.5" style={health ? { color: health.color } : undefined} />
            <span className={cn('font-semibold', ndvi.isFresh ? 'text-foreground' : 'text-muted-foreground')}>NDVI {formatNdviValue(ndvi.ndvi)}</span>
          </div>
          <NdviMeter ndvi={ndvi.ndvi} tone={health} reduceMotion={!!reduceMotion} label={`NDVI ${formatNdviValue(ndvi.ndvi)}`} className="h-1" />
        </div>
      )}
    </motion.button>
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
        'inline-flex items-center gap-1 h-9 px-3 rounded-full text-xs font-medium transition-colors',
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
