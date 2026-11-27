import { memo, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { buildSlab, DEFAULT_RING, SCENE_H, SCENE_W, sunPoint, type Pt } from './fieldGeometry';

export interface FieldPin { key: string; icon: LucideIcon; tone: 'do' | 'warn' | 'stop'; label: string; onSelect: () => void }

interface FieldSceneProps {
  /** boundary in the unit square (normaliseRing), or null to draw a plain plot */
  ring: Pt[] | null;
  /** 0..1 along the crop's own stage lane; null draws a bare field */
  stageProgress: number | null;
  /** governed irrigation flag: true = dry band, false = full band, null = no band */
  irrigationNeeded: boolean | null;
  /** 0..1 from sunrise to sunset; null when the sun is down or the times are unknown */
  sun: number | null;
  /** true only when the sun times are known and it is night */
  night?: boolean;
  cloudy: boolean;
  raining: boolean;
  pins: FieldPin[];
  stageLabel: string | null;
  waterLabel: string | null;
  ariaLabel: string;
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(1)}%`;
const TONE_FILL: Record<FieldPin['tone'], string> = { do: 'hsl(var(--primary))', warn: 'hsl(var(--warning))', stop: 'hsl(var(--destructive))' };
const TONE_PILL: Record<FieldPin['tone'], string> = {
  do: 'bg-primary text-primary-foreground',
  warn: 'bg-card text-warning border-[1.5px] border-warning',
  stop: 'bg-card text-destructive border-[1.5px] border-destructive',
};

/** The farmer's field as a tilted block: crop on top, soil and water on the edge, sky above. Static SVG, no animation. */
export const FieldScene = memo(function FieldScene({ ring, stageProgress, irrigationNeeded, sun, night = false, cloudy, raining, pins, stageLabel, waterLabel, ariaLabel }: FieldSceneProps) {
  const slab = useMemo(
    () => buildSlab(ring ?? DEFAULT_RING, irrigationNeeded == null ? null : irrigationNeeded ? 0.22 : 0.7),
    [ring, irrigationNeeded],
  );
  const plantHeight = stageProgress == null ? 0 : 6 + Math.max(0, Math.min(1, stageProgress)) * 16;
  const sunAt = sun == null ? null : sunPoint(sun);
  const shown = pins.slice(0, slab.anchors.length);

  return (
    <div className="lf-stage">
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} role="img" aria-label={ariaLabel}>
        <path d="M24 120 Q195 -60 366 120" fill="none" stroke="hsl(var(--foreground) / 0.22)" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
        {sunAt && (
          <g>
            <circle cx={sunAt.x} cy={sunAt.y} r="40" fill="hsl(var(--accent) / 0.22)" />
            <circle cx={sunAt.x} cy={sunAt.y} r="28" fill="hsl(var(--accent) / 0.45)" />
            <circle cx={sunAt.x} cy={sunAt.y} r="18" fill="hsl(var(--accent))" stroke="hsl(var(--tertiary, var(--accent)))" strokeWidth="2" />
          </g>
        )}
        {night && (
          <g>
            <path d="M318 34 a24 24 0 1 0 22 36 a19 19 0 0 1 -22 -36z" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
            {[[60, 44], [112, 22], [150, 70], [232, 30], [268, 84], [40, 96]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="hsl(var(--foreground) / 0.4)" />)}
          </g>
        )}
        {cloudy && (
          <g fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5">
            <path d="M312 84 a16 16 0 0 1 30 -8 a13 13 0 0 1 24 8 a10 10 0 0 1 -4 19 h-46 a11 11 0 0 1 -4 -19z" />
            <path d="M176 40 a11 11 0 0 1 21 -5 a9 9 0 0 1 16 5 a7 7 0 0 1 -3 13 h-31 a8 8 0 0 1 -3 -13z" />
          </g>
        )}
        {raining && (
          <g stroke="hsl(var(--info))" strokeWidth="2.5" strokeLinecap="round">
            {[318, 332, 346, 184, 196].map((x, i) => <path key={x} d={`M${x} ${i < 3 ? 112 : 62} l-4 10`} />)}
          </g>
        )}

        <ellipse cx={SCENE_W / 2} cy="322" rx="176" ry="13" fill="hsl(var(--foreground) / 0.10)" />
        {slab.sides.map((s, i) => (
          <g key={i}>
            <polygon points={s.soil} fill={`hsl(var(--tertiary, var(--secondary)) / ${s.facingLeft ? 0.55 : 0.8})`} />
            {s.water && <polygon points={s.water} fill="hsl(var(--info) / 0.8)" />}
            {s.waterLine && <path d={`M${s.waterLine[0].x.toFixed(1)} ${s.waterLine[0].y.toFixed(1)} L${s.waterLine[1].x.toFixed(1)} ${s.waterLine[1].y.toFixed(1)}`} stroke="hsl(var(--card) / 0.7)" strokeWidth="1.5" strokeDasharray="3 4" />}
          </g>
        ))}
        <polygon points={slab.top} fill="hsl(var(--primary))" stroke="hsl(var(--primary-variant, var(--primary)))" strokeWidth="2" strokeLinejoin="round" />
        <clipPath id="lf-field-top"><polygon points={slab.top} /></clipPath>
        <g clipPath="url(#lf-field-top)">
          {slab.rows.map(([a, b], i) => <path key={i} d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`} stroke="hsl(var(--primary-variant, var(--primary)) / 0.9)" strokeWidth="5" />)}
        </g>
        {plantHeight > 0 && slab.plants.map((p, i) => (
          <path key={i} fill="none" stroke="hsl(var(--accent))" strokeWidth="2.4" strokeLinecap="round"
            d={`M${p.x.toFixed(1)} ${p.y.toFixed(1)} v${(-plantHeight).toFixed(1)} M${p.x.toFixed(1)} ${(p.y - plantHeight * 0.55).toFixed(1)} q-6 -3 -7 -9 M${p.x.toFixed(1)} ${(p.y - plantHeight * 0.7).toFixed(1)} q6 -3 7 -9`} />
        ))}

        {shown.map((pin, i) => {
          const a = slab.anchors[i];
          const stem = i === 0 ? 34 : 26;
          const Icon = pin.icon;
          return (
            <g key={pin.key}>
              <path d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)} v${-stem}`} stroke="hsl(var(--foreground) / 0.55)" strokeWidth="2" />
              <circle cx={a.x} cy={a.y} r="4" fill="hsl(var(--card))" stroke="hsl(var(--foreground) / 0.6)" strokeWidth="2" />
              <circle cx={a.x} cy={a.y - stem - 19} r="21" fill={TONE_FILL[pin.tone]} stroke="hsl(var(--card))" strokeWidth="3" />
              <Icon x={a.x - 11} y={a.y - stem - 30} width={22} height={22} color="hsl(var(--card))" strokeWidth={2.2} />
            </g>
          );
        })}
      </svg>

      {shown.map((pin, i) => {
        const a = slab.anchors[i];
        const stem = i === 0 ? 34 : 26;
        return (
          <button key={pin.key} type="button" onClick={pin.onSelect} className="lf-at" style={{ left: pct(a.x, SCENE_W), top: pct(a.y - stem - 30, SCENE_H), minWidth: 'var(--lf-tap)', minHeight: 'var(--lf-tap)', display: 'grid', placeItems: 'start center' }}>
            <span className={`lf-pill lf-pill-sm ${TONE_PILL[pin.tone]}`} style={{ transform: 'translateY(-70%)', maxWidth: '40vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pin.label}</span>
          </button>
        );
      })}
      {waterLabel && (
        <div className="lf-at" style={{ left: 'auto', insetInlineEnd: 0, top: pct(slab.lowest.y - 6, SCENE_H), transform: 'translateY(-50%)' }}>
          <span className="lf-pill lf-pill-sm bg-card text-info border-[1.5px] border-info">{waterLabel}</span>
        </div>
      )}
      {stageLabel && (
        <div className="lf-at" style={{ left: 0, top: pct(Math.min(SCENE_H - 14, slab.lowest.y + 8), SCENE_H), transform: 'translateY(-50%)' }}>
          <span className="lf-pill lf-pill-sm bg-card text-primary border-[1.5px] border-primary">{stageLabel}</span>
        </div>
      )}
    </div>
  );
});
