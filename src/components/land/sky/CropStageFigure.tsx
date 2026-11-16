import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Droplets, Flame, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stageKey, type FieldSky, type StageStep } from '@/hooks/useFieldSky';

/** Length of the season replay. A UI timing only — every agronomic value below comes from the data. */
const REPLAY_MS = 2200;

/**
 * "Your crop today" — the season told as a short replay the farmer watches.
 *
 * Everything is read from the phenology engine's stage (lands.stage_uuid) and that crop's own lane in
 * crop_stage_master; nothing is a crop list or a threshold written here:
 *   - day counter      0 → lands.das (the engine's DAS)
 *   - stage track      the lane's stages placed by their own das_min; 💧 / 🔥 on stages the table flags
 *                      is_moisture_critical / is_heat_critical
 *   - plant            stem ← expected_height_cm of the stage reached, leaves ← expected_leaf_count,
 *                      greenness ← the stage's expected NDVI band relative to the lane's greenest stage
 *                      (so it yellows at maturity because the table says so — no position guesses)
 *   - facts            days left in the stage (das_max − DAS), next stage (next_stage_id), the flags
 *   - greenness today  the stage's expected band, the newest pass and its 95% interval
 * The replay always ends on the engine's stage, whatever the day windows say. It is an illustration from the
 * stage table, and the note at the bottom says so.
 */
export function CropStageFigure({ sky }: { sky: FieldSky; compact?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const st = sky.stage;
  const lane = st.ladder;
  const engineIdx = st.index;
  const das = st.das;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.35 });
  const [day, setDay] = useState<number | null>(das == null ? null : reduce ? das : 0);
  const [replay, setReplay] = useState(0);

  // the replay: a day counter runs from sowing to today; everything else is read from the lane at that day
  useEffect(() => {
    if (das == null) { setDay(null); return; }
    if (reduce) { setDay(das); return; }
    if (!inView) return;
    setDay(0);
    const ctl = animate(0, das, { duration: REPLAY_MS / 1000, ease: 'easeInOut', onUpdate: (v) => setDay(Math.round(v)) });
    return () => ctl.stop();
  }, [das, inView, reduce, replay]);

  const geo = useMemo(() => {
    const seasonEnd = Math.max(1, das ?? 0, ...lane.map((s) => s.dasMax ?? s.dasMin ?? 0));
    const maxH = Math.max(1, ...lane.map((s) => s.heightCm ?? 0));
    const mid = (s: StageStep) => (s.ndviMin != null && s.ndviMax != null ? (s.ndviMin + s.ndviMax) / 2 : null);
    const maxG = Math.max(0, ...lane.map((s) => mid(s) ?? 0));
    // carry the last value the table gave forward, so a stage without a height/leaf/band row keeps the plant as it was
    const carried = lane.map((_, i) => {
      let h: number | null = null, l: number | null = null, g: number | null = null;
      for (let k = i; k >= 0 && (h == null || l == null || g == null); k--) {
        h ??= lane[k].heightCm; l ??= lane[k].leaves; g ??= mid(lane[k]);
      }
      return { h, l, g: g != null && maxG > 0 ? g / maxG : null };
    });
    return { seasonEnd, maxH, carried };
  }, [lane, das]);

  // the stage reached on the replay's day — never past the engine's stage, and exactly the engine's stage at the end
  const shownIdx = useMemo(() => {
    if (engineIdx == null) return null;
    if (day == null || das == null || day >= das) return engineIdx;
    let k = 0;
    lane.forEach((s, i) => { if (s.dasMin != null && s.dasMin <= day) k = i; });
    return Math.min(k, engineIdx);
  }, [day, das, lane, engineIdx]);

  if (engineIdx == null || shownIdx == null) return null;
  const current = lane[engineIdx];
  const shown = lane[shownIdx];
  const done = das == null || day == null || day >= das;
  const label = (s: StageStep | null) => (s?.name ? t(stageKey(s.name), s.name) : null);
  const pctOf = (d: number) => Math.max(0, Math.min(100, (d / geo.seasonEnd) * 100));
  const progressPct = pctOf(day ?? current.dasMin ?? 0);

  const plant = geo.carried[shownIdx];
  const daysLeft = das != null && current.dasMax != null && current.dasMax >= das ? current.dasMax - das : null;
  const next = st.next;
  const anyWater = lane.some((s) => s.moistureCritical);
  const anyHeat = lane.some((s) => s.heatCritical);

  const facts: Array<{ key: string; text: string; tone: 'info' | 'warning' | 'plain'; icon?: typeof Droplets }> = [];
  if (daysLeft != null) facts.push({ key: 'left', text: t('sky.season.figure_days_left', '{{days}} more days in this stage', { days: daysLeft }), tone: 'plain' });
  if (next && label(next) && next.dasMin != null) facts.push({ key: 'next', text: t('sky.season.figure_next', 'Next: {{stage}} from day {{das}}', { stage: label(next), das: next.dasMin }), tone: 'plain' });
  if (current.moistureCritical) facts.push({ key: 'water', text: t('sky.season.figure_water_critical', 'Water matters most at this stage'), tone: 'info', icon: Droplets });
  if (current.heatCritical) facts.push({ key: 'heat', text: t('sky.season.figure_heat_critical', 'Heat can harm the crop at this stage'), tone: 'warning', icon: Flame });
  if (current.heightCm != null) facts.push({ key: 'height', text: t('sky.season.figure_height', 'about {{cm}} cm tall', { cm: Math.round(current.heightCm) }), tone: 'plain' });
  if (current.leaves != null) facts.push({ key: 'leaves', text: t('sky.season.figure_leaves', 'about {{n}} leaves', { n: Math.round(current.leaves) }), tone: 'plain' });

  return (
    <div ref={rootRef} className="rounded-3xl border border-border/40 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-muted-foreground">{t('sky.season.figure_title', 'Your crop today')}</p>
        {das != null && !reduce && (
          <button type="button" onClick={() => setReplay((r) => r + 1)} disabled={!done}
            aria-label={t('sky.map.play', 'Play the days')} title={t('sky.map.play', 'Play the days')}
            className="h-11 w-11 -mr-1 rounded-full grid place-items-center border border-primary text-primary bg-card disabled:opacity-40 transition-opacity">
            <Play className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* plant + where the season is */}
      <div className="mt-1 flex items-center gap-3">
        <PlantFigure heightFrac={plant.h != null ? plant.h / geo.maxH : null} leaves={plant.l} green={plant.g} />
        <div className="min-w-0 flex-1">
          <motion.p key={shown.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
            className="text-lg font-bold leading-tight">{label(shown)}</motion.p>
          {day != null && (
            // the day count runs from what this stage's window counts from (crop_stage_master.das_reference)
            <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">{t(`sky.season.figure_day_${current.dasReference ?? 'sowing'}`, t('sky.season.figure_day', 'Day {{das}} since sowing', { das: day }), { das: day })}</p>
          )}
        </div>
      </div>

      {/* the season track: the crop's own stages, placed by their own day windows */}
      <div className="mt-3">
        <div className="relative h-9" aria-hidden>
          <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-muted" />
          <div className="absolute left-0 top-6 h-1.5 rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          {lane.map((s, i) => s.dasMin == null ? null : (
            <span key={s.id} className="absolute top-[27px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${pctOf(s.dasMin)}%` }}>
              {(s.moistureCritical || s.heatCritical) && (
                <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex">
                  {s.moistureCritical && <Droplets className="h-3 w-3 text-info" />}
                  {s.heatCritical && <Flame className="h-3 w-3 text-warning" />}
                </span>
              )}
              <span className={cn('block h-2.5 w-2.5 rounded-full border-2',
                i < shownIdx ? 'bg-success border-success' : i === shownIdx ? 'bg-background border-primary' : 'bg-background border-border')} />
            </span>
          ))}
          <motion.span className="absolute top-[27px] -translate-x-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-primary ring-4 ring-primary/20"
            style={{ left: `${progressPct}%` }}
            animate={done && !reduce ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={done && !reduce ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} />
        </div>
        {/* the track's two ends: what the day count starts from (das_reference of the lane's first stage) and the last stage */}
        <div className="flex items-start justify-between gap-3 text-[12px] text-muted-foreground mt-1">
          {lane[0]?.dasReference && <span className="min-w-0 truncate">{t(stageKey(lane[0].dasReference), lane[0].dasReference)}</span>}
          <span className="min-w-0 truncate text-right ml-auto">{label(lane[lane.length - 1])}</span>
        </div>
        {(anyWater || anyHeat) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {anyWater && <span className="inline-flex items-center gap-1"><Droplets className="h-3 w-3 text-info" />{t('sky.season.figure_water_legend', 'stages where water matters most')}</span>}
            {anyHeat && <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3 text-warning" />{t('sky.season.figure_heat_legend', 'stages where heat can harm the crop')}</span>}
          </div>
        )}
      </div>

      {/* today's facts, from the stage row — they arrive once the replay reaches today */}
      {facts.length > 0 && (
        <motion.ul className="mt-3 flex flex-wrap gap-1.5" initial={false} animate={done ? 'shown' : 'hidden'}
          variants={{ hidden: {}, shown: { transition: { staggerChildren: reduce ? 0 : 0.07 } } }}>
          {facts.map((f) => { const Icon = f.icon; return (
            <motion.li key={f.key} variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium',
                f.tone === 'info' ? 'bg-info/10 border-info/40 text-foreground' : f.tone === 'warning' ? 'bg-warning/10 border-warning/40 text-foreground' : 'bg-muted/40 border-border/40 text-foreground')}>
              {Icon && <Icon className={cn('h-3.5 w-3.5', f.tone === 'info' ? 'text-info' : 'text-warning')} />}{f.text}
            </motion.li>); })}
        </motion.ul>
      )}

      <GreennessToday sky={sky} current={current} show={done} />

      <p className="text-[11px] text-muted-foreground mt-3">{t('sky.season.figure_note', 'Illustration from the crop\'s stage table — not a photo of your field.')}</p>
    </div>
  );
}

/**
 * Today's greenness against what the stage table expects now: the band (crop_stage_master expected NDVI),
 * the newest pass, and the pipeline's 95% interval for that pass. This is the picture behind "within /
 * below / above the expected range". On the 0–1 NDVI scale, which is where crop canopies sit.
 */
function GreennessToday({ sky, current, show }: { sky: FieldSky; current: StageStep; show: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const r = sky.stage.reading;
  if (current.ndviMin == null || current.ndviMax == null || !r) return null;
  const p = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`;
  const lo = r.low ?? r.value, hi = r.high ?? r.value;
  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-[12px] font-semibold text-muted-foreground mb-2">{t('sky.season.figure_greenness', 'Greenness today')}</p>
      <div className="relative h-4" aria-hidden>
        <div className="absolute inset-x-0 top-1.5 h-1 rounded-full bg-muted" />
        <div className="absolute top-0 h-4 rounded-md bg-success/25 border border-success/40" style={{ left: p(current.ndviMin), width: `calc(${p(current.ndviMax)} - ${p(current.ndviMin)})` }} />
        {hi > lo && <div className="absolute top-[7px] h-0.5 bg-primary" style={{ left: p(lo), width: `calc(${p(hi)} - ${p(lo)})` }} />}
        <motion.span className="absolute top-0.5 h-3 w-3 -translate-x-1/2 rounded-full bg-primary ring-2 ring-background"
          initial={reduce ? false : { left: '0%', opacity: 0 }} animate={show ? { left: p(r.value), opacity: 1 } : { left: '0%', opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1.5">
        <span className="inline-flex items-center gap-1"><i className="h-2 w-4 rounded-sm bg-success/30 border border-success/40" />{t('sky.season.legend_band', 'expected now')}</span>
        <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-primary" />{t('sky.season.legend_seen', 'seen')}</span>
      </div>
    </div>
  );
}

/**
 * The plant, drawn only from the stage table's numbers: stem height (fraction of the crop's tallest stage),
 * leaf count, and greenness (the stage's expected NDVI relative to the crop's greenest stage). Colours are
 * theme tokens; greenness is the success token laid over the warning token, so it fades as the table says.
 */
function PlantFigure({ heightFrac, leaves, green }: { heightFrac: number | null; leaves: number | null; green: number | null }) {
  const W = 104, H = 132, groundY = H - 14;
  const hFrac = Math.max(0.06, Math.min(1, heightFrac ?? 0.06));
  const stemTop = groundY - (H - 34) * hFrac;
  const stemH = groundY - stemTop;
  const n = Math.max(0, Math.min(12, Math.round(leaves ?? 0)));
  const g = green == null ? 0.5 : Math.max(0, Math.min(1, green));
  const spring = { type: 'spring' as const, stiffness: 90, damping: 16 };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      <ellipse cx={W / 2} cy={groundY + 5} rx={44} ry={7} fill="hsl(var(--muted))" />
      <ellipse cx={W / 2} cy={groundY + 3} rx={32} ry={4.5} fill="hsl(var(--border))" opacity={0.7} />
      <motion.rect x={W / 2 - 2.5} width={5} rx={2.5} fill="hsl(var(--warning))" initial={false} animate={{ y: stemTop, height: stemH }} transition={spring} />
      <motion.rect x={W / 2 - 2.5} width={5} rx={2.5} fill="hsl(var(--success))" initial={false} animate={{ y: stemTop, height: stemH, opacity: g }} transition={spring} />
      {Array.from({ length: n }).map((_, i) => {
        const frac = (i + 1) / (n + 1);
        const y = groundY - stemH * frac;
        const side = i % 2 === 0 ? -1 : 1;
        const len = 16 + 20 * (1 - Math.abs(frac - 0.45));
        const d = `M ${W / 2} ${y} q ${side * len * 0.55} ${-len * 0.35} ${side * len} ${-len * 0.15} q ${-side * len * 0.35} ${len * 0.35} ${-side * len} ${len * 0.15} z`;
        return (
          <motion.g key={i} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} style={{ originX: `${W / 2}px`, originY: `${y}px` }}>
            <path d={d} fill="hsl(var(--warning))" opacity={0.85} />
            <motion.path d={d} fill="hsl(var(--success))" initial={false} animate={{ opacity: g }} transition={{ duration: 0.3 }} />
          </motion.g>
        );
      })}
    </svg>
  );
}
