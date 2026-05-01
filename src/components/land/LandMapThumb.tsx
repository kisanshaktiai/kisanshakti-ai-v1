import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface LatLng { lat: number; lng: number; }

interface Props {
  boundary: LatLng[];
  size?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * Self-contained SVG thumbnail of a drawn land boundary.
 * No external tile dependency — renders the polygon shape over a satellite-green
 * gradient so the farmer instantly recognizes "the field I just drew".
 */
export function LandMapThumb({ boundary, size = 72, onClick, className }: Props) {
  const path = useMemo(() => {
    if (!boundary || boundary.length < 3) return '';
    const lats = boundary.map(p => p.lat);
    const lngs = boundary.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const dLat = Math.max(maxLat - minLat, 1e-9);
    const dLng = Math.max(maxLng - minLng, 1e-9);
    const pad = 6;
    const inner = size - pad * 2;
    const pts = boundary.map(p => {
      const x = pad + ((p.lng - minLng) / dLng) * inner;
      // Flip Y so north is up
      const y = pad + (1 - (p.lat - minLat) / dLat) * inner;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${pts.join(' L ')} Z`;
  }, [boundary, size]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative shrink-0 rounded-2xl overflow-hidden border border-border',
        'bg-gradient-to-br from-emerald-700 via-emerald-600 to-lime-600',
        'active:scale-95 transition-transform',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label="Re-draw land boundary"
    >
      {/* faint grid for satellite feel */}
      <svg width={size} height={size} className="absolute inset-0 opacity-30">
        <defs>
          <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="white" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width={size} height={size} fill="url(#grid)" />
      </svg>
      {path && (
        <svg width={size} height={size} className="absolute inset-0">
          <path
            d={path}
            fill="hsl(var(--primary) / 0.55)"
            stroke="white"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
