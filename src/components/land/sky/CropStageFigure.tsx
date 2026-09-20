import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * A crop figure that grows with the stage — driven ONLY by crop_stage_master
 * (phenology order, expected height, expected leaf count). Crop-agnostic:
 * the same figure serves rice, sugarcane, wheat or groundnut because the
 * table, not the code, says how tall and how leafy the crop should be at
 * this stage. It is an illustration and the caption says so; it is never a
 * photo of the field.
 *
 * Visual grammar (stylised, depth via layered shading — no 3-D assets needed):
 *   - stem height   ← expected height at the current stage, scaled to the crop's max
 *   - leaf count    ← expected leaves at the current stage (capped for legibility)
 *   - head/flower   ← appears from the flowering/heading stage onward (by ladder position)
 *   - colour        ← green through growth, gold at maturity/harvest (by ladder position)
 * Every number here is a drawing parameter, not an agronomic judgement.
 */
export function CropStageFigure({ sky, compact = false }: { sky: FieldSky; compact?: boolean }) {
  const { t } = useTranslation();
  const st = sky.stage;

  const model = useMemo(() => {
    const ladder = st.ladder;
    const idx = st.index ?? null;
    const n = ladder.length || 1;
    const pos = idx == null ? 0 : (idx + 1) / n;                       // 0..1 along the season
    const maxH = Math.max(...ladder.map(l => l.heightCm ?? 0), 1);
    const hFrac = st.heightCm != null ? Math.max(0.08, Math.min(1, st.heightCm / maxH)) : Math.max(0.08, pos);
    const leaves = st.leaves != null ? Math.round(Math.max(1, Math.min(12, st.leaves))) : Math.round(2 + pos * 8);
    const late = pos >= 0.75;                                            // ripening / harvest end of the ladder
    const flowering = pos >= 0.55;
    return { pos, hFrac, leaves, late, flowering };
  }, [st.ladder, st.index, st.heightCm, st.leaves]);

  const stageLabel = (() => {
    if (!st.stageName) return null;
    const slug = st.stageName.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    return t(`sky.stage.${slug}`, st.stageName);
  })();
  const next = st.index != null && st.ladder[st.index + 1] ? st.ladder[st.index + 1] : null;
  const nextLabel = next?.name ? t(`sky.stage.${next.name.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`, next.name) : null;

  const W = 160, H = compact ? 150 : 210;
  const groundY = H - 18;
  const stemTop = groundY - (H - 46) * model.hFrac;
  const stemH = groundY - stemTop;
  const leafColor = model.late ? 'hsl(var(--warning))' : 'hsl(var(--success))';
  const stemColor = model.late ? 'hsl(var(--warning))' : 'hsl(var(--primary))';

  return (
    <div className={cn('rounded-3xl border border-border/40 bg-card p-4', compact && 'p-3')}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{t('sky.season.figure_title', 'Your crop today')}</p>
      <div className="flex items-center gap-4">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={stageLabel ?? ''} className="shrink-0">
          <defs>
            <linearGradient id="skyfig-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="hsl(var(--muted))" /><stop offset="1" stopColor="hsl(var(--border))" /></linearGradient>
            <linearGradient id="skyfig-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={leafColor} stopOpacity="0.95" /><stop offset="1" stopColor={leafColor} stopOpacity="0.55" /></linearGradient>
          </defs>
          {/* ground with a little depth */}
          <ellipse cx={W / 2} cy={groundY + 6} rx={62} ry={9} fill="url(#skyfig-soil)" />
          <ellipse cx={W / 2} cy={groundY + 3} rx={48} ry={6} fill="hsl(var(--border))" opacity={0.6} />
          {/* stem grows */}
          <motion.rect x={W / 2 - 3} width={6} rx={3} fill={stemColor}
            initial={{ y: groundY, height: 0 }} animate={{ y: stemTop, height: stemH }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} />
          {/* leaves: alternate sides, spaced up the stem, count from the stage table */}
          {Array.from({ length: model.leaves }).map((_, i) => {
            const frac = (i + 1) / (model.leaves + 1);
            const y = groundY - stemH * frac;
            const side = i % 2 === 0 ? -1 : 1;
            const len = 22 + 26 * (1 - Math.abs(frac - 0.45));
            const path = `M ${W / 2} ${y} q ${side * len * 0.55} ${-len * 0.35} ${side * len} ${-len * 0.15} q ${-side * len * 0.35} ${len * 0.35} ${-side * len} ${len * 0.15} z`;
            return <motion.path key={i} d={path} fill="url(#skyfig-leaf)" stroke={leafColor} strokeWidth={0.6}
              initial={{ opacity: 0, scale: 0.6, originX: `${W / 2}px`, originY: `${y}px` }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.05 }} />;
          })}
          {/* head / flower from the flowering part of the ladder onward */}
          {model.flowering && (
            <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <ellipse cx={W / 2} cy={stemTop - 10} rx={9} ry={16} fill={model.late ? 'hsl(var(--warning))' : 'hsl(var(--primary-glow))'} opacity={0.9} />
              <ellipse cx={W / 2 - 6} cy={stemTop - 4} rx={5} ry={10} fill={model.late ? 'hsl(var(--warning))' : 'hsl(var(--primary-glow))'} opacity={0.7} />
              <ellipse cx={W / 2 + 6} cy={stemTop - 4} rx={5} ry={10} fill={model.late ? 'hsl(var(--warning))' : 'hsl(var(--primary-glow))'} opacity={0.7} />
            </motion.g>
          )}
        </svg>
        <div className="min-w-0 flex-1">
          {stageLabel && <p className="text-base font-semibold leading-tight">{stageLabel}</p>}
          {st.das != null && stageLabel && <p className="text-sm text-muted-foreground mt-0.5">{t('sky.season.figure_caption', 'Day {{das}} since sowing · {{stage}}', { das: st.das, stage: stageLabel })}</p>}
          {st.heightCm != null && <p className="text-sm text-muted-foreground mt-0.5">{t('sky.season.figure_height', 'about {{cm}} cm tall', { cm: Math.round(st.heightCm) })}</p>}
          {next && nextLabel && next.dasMin != null && <p className="text-xs text-muted-foreground mt-2">{t('sky.season.figure_next', 'Next: {{stage}} from day {{das}}', { stage: nextLabel, das: next.dasMin })}</p>}
          {/* stage ladder dots */}
          {st.ladder.length > 1 && (
            <div className="flex items-center gap-1 mt-3" aria-hidden>
              {st.ladder.map((l, i) => <span key={l.code} className={cn('h-2 rounded-full transition-all', i === st.index ? 'w-5 bg-primary' : i < (st.index ?? -1) ? 'w-2 bg-success/60' : 'w-2 bg-muted')} />)}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">{t('sky.season.figure_note', 'Illustration from the crop\'s stage table — not a photo of your field.')}</p>
        </div>
      </div>
    </div>
  );
}
