import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, Droplets, BookOpen, Ban, AlertTriangle, CheckCircle2, Info, Satellite, CloudSun, Sprout } from 'lucide-react';
import { useState, forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslatedTexts } from '@/hooks/useAlertText';

/**
 * The part of an alert card that says what to do and why.
 *
 * What to do comes ONLY from trigger_data.graph_advice — rows of the decision
 * brain's hypothesis → rule graph that the evaluator found applicable to this
 * field's crop, stage, day count, region and sowing method, never a dose. The
 * older trigger_data.solution object (generic text the evaluator wrote when it
 * could not find a rule) is not shown.
 *
 * Why comes from the values the rule was judged on (context, weather,
 * satellite, soil water), copied by the evaluator into trigger_data. Anything
 * missing is left out, never filled in. All words are i18n keys; graph text is
 * English in the DB and is translated on demand.
 */
interface AlertEvidenceSectionProps {
  triggerData: Record<string, any>;
  category: string;
}

type AdviceItem = {
  rule_id: string; cause_name_en: string | null; rule_intent: string | null;
  action_text: string | null; category: string | null;
};

const INTENT_UI: Record<string, { icon: React.ElementType; cls: string }> = {
  block:          { icon: Ban,           cls: 'bg-destructive/10 text-destructive border-destructive/30' },
  warning:        { icon: AlertTriangle, cls: 'bg-warning/15 text-warning-foreground border-warning/30' },
  command:        { icon: CheckCircle2,  cls: 'bg-primary/10 text-primary border-primary/30' },
  recommendation: { icon: Info,          cls: 'bg-muted text-foreground border-border' },
  education:      { icon: BookOpen,      cls: 'bg-muted text-foreground border-border' },
};

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const fmt = (v: number | null, digits = 1) => (v == null ? null : Number.isInteger(v) ? String(v) : v.toFixed(digits));
const stageKey = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');

export const AlertEvidenceSection = forwardRef<HTMLDivElement, AlertEvidenceSectionProps>(
  function AlertEvidenceSection({ triggerData, category }, ref) {
    const { t, i18n } = useTranslation();
    const lang = i18n.language || 'en';
    const reduceMotion = useReducedMotion();
    const [adviceOpen, setAdviceOpen] = useState(false);
    const [evidenceOpen, setEvidenceOpen] = useState(false);

    const advice: AdviceItem[] = Array.isArray(triggerData?.graph_advice?.items) ? triggerData.graph_advice.items : [];
    const hasGraphField = triggerData && 'graph_advice' in triggerData;
    // Graph text is translated only when the farmer opens the section.
    const adviceTexts = adviceOpen ? advice.flatMap((a) => [a.action_text ?? '', a.cause_name_en ?? '']).filter(Boolean) : [];
    const { tr, pending } = useTranslatedTexts(adviceTexts, lang);

    const stageLabel = (s: string | null | undefined) => (s ? t(`sky.stage.${stageKey(s)}`, s.replace(/_/g, ' ').toLowerCase()) : null);
    const ctx = triggerData?.context ?? null;
    // Litres are shown only on alerts built by evaluator v128+ (they carry graph_advice),
    // which attaches them on a verified water state; older rows computed them regardless.
    const irrigation = category === 'IRRIGATION' && hasGraphField ? triggerData?.irrigation : null;

    // Soil-water rows belong to water and crop-stress alerts only.
    const showsWater = category === 'IRRIGATION' || category === 'CROP_STRESS';
    const rows = buildEvidenceRows(triggerData, t, lang, stageLabel).filter((r) => showsWater || r.group !== 'water');
    const waterUnverified = showsWater && triggerData?.derived?.water_state_verified === false;

    return (
      <div ref={ref} className="mt-3 space-y-2">
        {/* === WHAT TO DO — decision-graph rows only === */}
        {advice.length > 0 && (
          <Collapsible open={adviceOpen} onOpenChange={setAdviceOpen}>
            <CollapsibleTrigger className="w-full flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-left">
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-foreground">{t('alerts.advice.title', 'What the crop knowledge base says')}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {t('alerts.advice.count', { count: advice.length, defaultValue: '{{count}} steps for this stage' })}
                  {ctx?.stage && ctx?.das != null && ` · ${t('alerts.advice.basis', { stage: stageLabel(ctx.stage), das: ctx.das, defaultValue: '{{stage}}, day {{das}}' })}`}
                </span>
              </span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', adviceOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {pending && <p className="text-[11px] text-muted-foreground px-1">{t('alerts.advice.translating', 'Translating…')}</p>}
              {advice.map((a, i) => (
                <motion.div key={a.rule_id} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : i * 0.05 }}>
                  <AdviceCard item={a} text={tr(a.action_text ?? '')} cause={a.cause_name_en ? tr(a.cause_name_en) : null} />
                </motion.div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
        {/* linked rule, but nothing in the graph applies to this crop/stage/region */}
        {triggerData?.graph_advice && advice.length === 0 && (
          <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <BookOpen className="h-4 w-4 shrink-0 mt-px" />{t('alerts.advice.none', 'The knowledge base has no specific step for this stage. Walk the field and ask if something looks wrong.')}
          </p>
        )}

        {/* === WATERING PLAN — FAO-56, IRRIGATION alerts on a verified water state only === */}
        {irrigation && (
          <div className="rounded-xl border border-info/40 bg-background p-3 space-y-2 text-foreground">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-info/15 grid place-items-center"><Droplets className="h-4 w-4 text-info" /></span>
              <p className="flex-1 text-sm font-bold">{t('alerts.water.title', 'Watering plan')}</p>
              {irrigation.urgency && (
                <Badge className={cn('px-2 py-0.5 text-xs font-bold', irrigation.urgency === 'IMMEDIATE' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground')}>
                  {t(`alerts.water.urgency_${irrigation.urgency}`, String(irrigation.urgency))}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('alerts.water.total', 'Total water')} value={`${Number(irrigation.water_liters_total).toLocaleString(lang)} L`} />
              <Stat label={t('alerts.water.per_acre', 'Per acre')} value={`${Number(irrigation.water_liters_per_acre).toLocaleString(lang)} L`} />
              <Stat label={t('alerts.water.duration', 'Time')} value={t('alerts.water.hours', { value: irrigation.duration_hours, defaultValue: '{{value}} h' })} />
              <Stat label={t('alerts.water.method', 'Method')} value={t(`alerts.water.method_${String(irrigation.method).toUpperCase()}`, String(irrigation.method))} />
            </div>
          </div>
        )}

        {/* === WHY — the values the rule was judged on === */}
        {(rows.length > 0 || waterUnverified) && (
          <Collapsible open={evidenceOpen} onOpenChange={setEvidenceOpen}>
            <CollapsibleTrigger className="flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground">
              <Eye className="h-4 w-4" />
              <span>{t('alerts.evidence.title', 'Why this alert?')}</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', evidenceOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              <div className="rounded-xl border border-border bg-card p-3 space-y-3 text-sm">
                {waterUnverified && (
                  <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-2 py-2 text-xs text-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-px" />
                    {t('alerts.evidence.water_unverified', 'We have no record of watering on this field, so this soil-water estimate is not confirmed. If you watered recently, the field may be fine.')}
                  </p>
                )}
                {groupRows(rows).map(([group, items]) => (
                  <div key={group}>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      {GROUP_ICON[group]}{t(`alerts.evidence.${group}`, group)}
                    </p>
                    <dl className="divide-y divide-border/50">
                      {items.map((r) => (
                        <div key={r.key} className="flex items-start justify-between gap-3 py-1.5">
                          <dt className="text-muted-foreground">{r.label}</dt>
                          <dd className="text-right font-semibold text-foreground">{r.value}{r.note && <span className="block text-[11px] font-normal text-muted-foreground">{r.note}</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  });

function AdviceCard({ item, text, cause }: { item: AdviceItem; text: string; cause: string | null }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const intent = String(item.rule_intent ?? 'recommendation').toLowerCase();
  const ui = INTENT_UI[intent] ?? INTENT_UI.recommendation;
  const Icon = ui.icon;
  const long = text.length > 220;
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', ui.cls)}>
          <Icon className="h-3.5 w-3.5" />{t(`alerts.advice.intent_${intent}`, t('alerts.advice.intent_recommendation', 'Advice'))}
        </span>
        {cause && <span className="text-[11px] text-muted-foreground">{cause}</span>}
      </div>
      <p className={cn('mt-2 text-sm leading-relaxed text-foreground whitespace-pre-line', !expanded && long && 'line-clamp-4')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 min-h-9 text-xs font-semibold text-primary">
          {expanded ? t('alerts.advice.read_less', 'Show less') : t('alerts.advice.read_more', 'Read more')}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

// ---- evidence rows -----------------------------------------------------------

type Group = 'stage' | 'weather' | 'satellite' | 'water' | 'episode';
type Row = { group: Group; key: string; label: string; value: string; note?: string };
const GROUP_ICON: Record<Group, React.ReactElement> = {
  stage: <Sprout className="h-3.5 w-3.5" />, weather: <CloudSun className="h-3.5 w-3.5" />,
  satellite: <Satellite className="h-3.5 w-3.5" />, water: <Droplets className="h-3.5 w-3.5" />,
  episode: <AlertTriangle className="h-3.5 w-3.5" />,
};

function groupRows(rows: Row[]): Array<[Group, Row[]]> {
  const order: Group[] = ['stage', 'weather', 'satellite', 'water', 'episode'];
  return order.map((g) => [g, rows.filter((r) => r.group === g)] as [Group, Row[]]).filter(([, r]) => r.length > 0);
}

function dayLabel(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short' });
}

/** Rows from the structured evidence (v128 alerts); older alerts fall back to their flat numeric keys. */
function buildEvidenceRows(
  td: Record<string, any>, t: (k: string, o?: any) => string, lang: string,
  stageLabel: (s: string | null | undefined) => string | null,
): Row[] {
  const rows: Row[] = [];
  const push = (group: Group, key: string, label: string, value: string | null, note?: string | null) => {
    if (value == null || value === '') return;
    rows.push({ group, key, label, value, note: note ?? undefined });
  };
  const ctx = td?.context;
  if (ctx?.stage) {
    push('stage', 'stage', t('alerts.evidence.stage', 'Crop stage'),
      ctx.das != null ? t('alerts.evidence.stage_value', { stage: stageLabel(ctx.stage), das: ctx.das, defaultValue: '{{stage}} · day {{das}}' }) : stageLabel(ctx.stage));
  }

  const w = td?.weather_obs ?? { temp: td?.temp, humidity: td?.humidity, rain_mm: td?.rain_mm, wind: td?.wind };
  const station = num(w?.distance_km) != null && num(w?.age_hours) != null
    ? t('alerts.evidence.station', { km: fmt(num(w.distance_km)), hours: fmt(num(w.age_hours)), defaultValue: 'From a weather station {{km}} km away, {{hours}} h old' })
    : null;
  push('weather', 'temp', t('alerts.evidence.temp', 'Temperature'), fmt(num(w?.temp)) && `${fmt(num(w?.temp))} °C`, station);
  push('weather', 'humidity', t('alerts.evidence.humidity', 'Humidity'), fmt(num(w?.humidity), 0) && `${fmt(num(w?.humidity), 0)} %`);
  push('weather', 'rain', t('alerts.evidence.rain_hour', 'Rain in the last hour'), fmt(num(w?.rain_mm)) && `${fmt(num(w?.rain_mm))} mm`);
  push('weather', 'wind', t('alerts.evidence.wind', 'Wind'), fmt(num(w?.wind)) && `${fmt(num(w?.wind))} km/h`);
  push('weather', 'rain72', t('alerts.evidence.rain_72h', 'Chance of rain (3 days)'), fmt(num(w?.rain_probability_72h), 0) && `${fmt(num(w?.rain_probability_72h), 0)} %`);

  const n = td?.ndvi_evidence ?? { value: td?.ndvi, previous: td?.ndvi_previous };
  const nv = num(n?.value), np = num(n?.previous);
  if (nv != null) {
    const age = num(n?.age_days);
    const note = [dayLabel(n?.date, lang) && t('alerts.evidence.picture_date', { date: dayLabel(n?.date, lang), defaultValue: 'Picture from {{date}}' }),
      age != null && t('alerts.evidence.picture_age', { days: age, defaultValue: '{{days}} days old' })].filter(Boolean).join(' · ');
    push('satellite', 'ndvi', t('alerts.evidence.ndvi', 'Crop greenness (NDVI)'), nv.toFixed(2), note || null);
  }
  if (np != null) {
    push('satellite', 'ndvi_prev', t('alerts.evidence.ndvi_previous', 'Earlier reading'), np.toFixed(2),
      dayLabel(n?.previous_date, lang) && t('alerts.evidence.picture_date', { date: dayLabel(n?.previous_date, lang), defaultValue: 'Picture from {{date}}' }));
  }
  if (nv != null && np != null && np - nv > 0) {
    const gap = num(n?.pass_gap_days);
    push('satellite', 'drop', t('alerts.evidence.ndvi_drop', 'Fall in greenness'), (np - nv).toFixed(2),
      gap != null ? t('alerts.evidence.pass_gap', { days: gap, defaultValue: '{{days}} days between the two pictures' }) : null);
  }

  const d = td?.derived;
  const used = num(d?.root_depletion), taw = num(d?.taw_mm), raw = num(d?.raw_mm);
  if (used != null && taw != null) {
    push('water', 'depletion', t('alerts.evidence.root_depletion', 'Water used from the root zone'),
      t('alerts.evidence.water_value', { used: fmt(used), total: fmt(taw), defaultValue: '{{used}} of {{total}} mm' }),
      d?.as_of ? t('alerts.evidence.water_as_of', { date: dayLabel(d.as_of, lang), defaultValue: 'Worked out for {{date}}' }) : null);
  }
  if (raw != null) push('water', 'raw', t('alerts.evidence.readily_available', 'Crop starts to feel short at'), `${fmt(raw)} mm`);

  const ep = td?.episode;
  if (ep?.phase) push('episode', 'phase', t('alerts.evidence.episode', 'Disease weather'), t(`alerts.evidence.phase_${String(ep.phase).toLowerCase()}`, String(ep.phase)));
  return rows;
}
