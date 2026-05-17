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
  ArrowLeft, History, RotateCcw, Share2, Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useEnhancedTTS } from '@/hooks/useEnhancedTTS';

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
  type LandBucket = { id: string; land: ProactiveAlert['land']; name: string; count: number; topPriority: string };
  const { landBuckets, hasUnresolved, summary } = useMemo(() => {
    const map = new Map<string, LandBucket>();
    let unresolved = 0;
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    alerts.forEach(a => {
      counts[(a.priority as keyof typeof counts)] = (counts[a.priority as keyof typeof counts] || 0) + 1;
      if (!a.land_id) return;
      if (!a.land) { unresolved++; return; }
      const ex = map.get(a.land_id);
      if (ex) {
        ex.count++;
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
        if ((order[a.priority] ?? 9) < (order[ex.topPriority] ?? 9)) ex.topPriority = a.priority;
      } else {
        map.set(a.land_id, { id: a.land_id, land: a.land, name: a.land.name, count: 1, topPriority: a.priority });
      }
    });

    return {
      landBuckets: Array.from(map.values()).sort((x, y) => y.count - x.count),
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
        {/* Mini Report Summary */}
        <ReportSummary summary={summary} lang={lang} />

        {/* Land filter strip */}
        {(landBuckets.length > 0 || hasUnresolved) && (
          <div className="-mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x">
              <FilterChip
                active={!selectedLandId}
                onClick={() => setLandFilter(null)}
                label={localized(lang, 'सर्व', 'सभी', 'All')}
                count={alerts.length}
                icon={<Filter className="h-3 w-3" />}
              />
              {landBuckets.map(b => (
                <FilterChip
                  key={b.id}
                  active={selectedLandId === b.id}
                  onClick={() => setLandFilter(selectedLandId === b.id ? null : b.id)}
                  label={b.land ? <LandRef land={b.land} showArea={false} /> : b.name}
                  count={b.count}
                  dotColor={PRIORITY_DOT[b.topPriority]}
                />
              ))}
              {hasUnresolved && (
                <FilterChip
                  active={selectedLandId === '__unresolved__'}
                  onClick={() => setLandFilter(selectedLandId === '__unresolved__' ? null : '__unresolved__')}
                  label={localized(lang, 'इतर शेत', 'अन्य भूमि', 'Other lands')}
                  count={summary.unresolved}
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
    <div className="sticky top-0 z-20 bg-background/95 border-b border-border">
      <div className="px-3 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/app/home')} className="h-9 w-9 rounded-xl">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            {t('proactive.title', 'Proactive Alerts')}
            {unreadCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground text-xs px-2">{unreadCount}</Badge>
            )}
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {t('proactive.subtitle', 'AI-powered farm intelligence')}
          </p>
        </div>
        <Button
          variant={showHistory ? 'default' : 'outline'}
          size="sm"
          className="h-8 text-xs gap-1 rounded-full"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? <RotateCcw className="h-3 w-3" /> : <History className="h-3 w-3" />}
          {showHistory
            ? localized(lang, 'सध्याचे', 'वर्तमान', 'Current')
            : localized(lang, 'जुने', 'पुराने', 'History')}
        </Button>
      </div>
    </div>
  );
}

function ReportSummary({ summary, lang }: { summary: any; lang: string }) {
  const total = summary.total || 0;
  const segments = ([
    { tone: 'destructive' as Tone, value: summary.CRITICAL || 0, key: 'CRITICAL' },
    { tone: 'warning' as Tone,     value: summary.HIGH || 0,     key: 'HIGH' },
    { tone: 'primary' as Tone,     value: summary.MEDIUM || 0,   key: 'MEDIUM' },
    { tone: 'success' as Tone,     value: summary.LOW || 0,      key: 'LOW' },
  ] as { tone: Tone; value: number; key: string }[]).filter(s => s.value > 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs text-muted-foreground">
            {localized(lang, 'आजचा अहवाल', 'आज की रिपोर्ट', "Today's report")}
          </div>
          <div className="text-lg font-bold leading-tight">
            {total} {localized(lang, 'सूचना', 'अलर्ट', total === 1 ? 'alert' : 'alerts')}
            <span className="text-muted-foreground font-normal text-sm"> · {summary.lands} {localized(lang, 'शेत', 'भूमि', summary.lands === 1 ? 'land' : 'lands')}</span>
          </div>
        </div>
        <Donut segments={segments} />
      </div>
      {/* Stacked priority bar */}
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
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
        {segments.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-full', toneRail[s.tone])} />
            {s.value} {s.key.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

function Donut({ segments }: { segments: { tone: Tone; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div className="w-12 h-12 rounded-full border-2 border-muted" />;
  }
  const C = 2 * Math.PI * 18;
  let offset = 0;
  const toneColor: Record<Tone, string> = {
    destructive: 'hsl(var(--destructive))',
    warning:     'hsl(var(--warning, var(--primary)))',
    primary:     'hsl(var(--primary))',
    success:     'hsl(var(--success, 142 71% 45%))',
    info:        'hsl(var(--accent))',
    muted:       'hsl(var(--muted-foreground))',
  };
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
      <circle cx="24" cy="24" r="18" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      {segments.map((s, i) => {
        const len = (s.value / total) * C;
        const el = (
          <circle
            key={i}
            cx="24" cy="24" r="18" fill="none"
            stroke={toneColor[s.tone]} strokeWidth="6"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function FilterChip({
  active, onClick, label, count, icon, dotColor,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  count: number;
  icon?: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 snap-start inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-all',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border hover:bg-accent/40',
      )}
    >
      {dotColor && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />}
      {icon}
      <span className="truncate max-w-[140px]">{label}</span>
      <span className={cn(
        'px-1.5 py-0 rounded-full text-[10px]',
        active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
      )}>
        {count}
      </span>
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
