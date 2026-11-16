import { motion, useReducedMotion } from 'framer-motion';

/** Illustration only: growth fraction = selected stage position in the saved stage order. */
export default function StageGrowthTree({ progress }: { progress: number }) {
  const reduce = useReducedMotion();
  const p = Math.max(0, Math.min(1, progress));
  const W = 64, H = 64, ground = 54;
  const stemH = 6 + 38 * p;
  const top = ground - stemH;
  const leaves = Math.round(1 + p * 7);
  const ripe = p > 0.8;
  const flower = p > 0.5;
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 80, damping: 14 };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      <defs>
        <radialGradient id="sgt-glow" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={32} cy={34} r={30} fill="url(#sgt-glow)" />
      <ellipse cx={32} cy={ground + 3} rx={24} ry={4} fill="hsl(var(--muted-foreground))" opacity={0.25} />
      <motion.ellipse cx={32} cy={ground} rx={4} ry={3} fill="hsl(var(--warning))" initial={false} animate={{ opacity: p < 0.15 ? 1 : 0.3 }} />
      <motion.rect x={30.5} width={3} rx={1.5} fill={ripe ? 'hsl(var(--warning))' : 'hsl(var(--success))'} initial={false} animate={{ y: top, height: stemH }} transition={spring} />
      {Array.from({ length: leaves }).map((_, i) => {
        const f = (i + 1) / (leaves + 1); const y = ground - stemH * f; const s = i % 2 ? 1 : -1; const len = 8 + 8 * (1 - Math.abs(f - 0.4));
        return (
          <motion.path key={i} d={`M32 ${y} q ${s * len * 0.6} ${-len * 0.5} ${s * len} ${-len * 0.2} q ${-s * len * 0.4} ${len * 0.4} ${-s * len} ${len * 0.2}z`}
            fill={ripe ? 'hsl(var(--warning))' : 'hsl(var(--success))'} initial={reduce ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 0.9, rotate: reduce ? 0 : [0, s * 4, 0] }}
            transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.05, rotate: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
            style={{ originX: '32px', originY: `${y}px` }} />
        );
      })}
      {flower && (
        <motion.g initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring} style={{ originX: '32px', originY: `${top}px` }}>
          {[-4, 0, 4].map((dx) => <circle key={dx} cx={32 + dx} cy={top - 2 + Math.abs(dx) / 2} r={2.4} fill={ripe ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />)}
        </motion.g>
      )}
    </svg>
  );
}
