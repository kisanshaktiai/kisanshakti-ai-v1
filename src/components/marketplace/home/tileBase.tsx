import { CSSProperties, ReactNode } from 'react';
import { Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TileProps {
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  locked?: boolean;
  ariaLabel?: string;
}

/**
 * Opaque, warm-shadow tile. No backdrop-blur per project mobile FPS rules.
 */
export function Tile({ onClick, className, children, style, locked, ariaLabel }: TileProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'relative w-full text-left rounded-3xl p-4 transition-transform active:scale-[0.98]',
        'min-h-[112px] flex flex-col justify-between',
        className
      )}
      style={{
        backgroundColor: 'hsl(var(--market-surface))',
        border: '1px solid hsl(var(--market-line))',
        boxShadow: '0 8px 22px -14px hsl(var(--market-shadow) / 0.35)',
        ...style,
      }}
    >
      {locked && (
        <span
          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: 'hsl(var(--market-warn) / 0.15)',
            color: 'hsl(var(--market-warn))',
          }}
        >
          <Lock className="w-3 h-3" /> PRO
        </span>
      )}
      {children}
    </button>
  );
}

export function TileChevron() {
  return (
    <ChevronRight
      className="w-4 h-4 absolute bottom-3 right-3"
      style={{ color: 'hsl(var(--market-ink-soft) / 0.7)' }}
    />
  );
}

export function TileIcon({
  children,
  tone = 'primary',
}: {
  children: ReactNode;
  tone?: 'primary' | 'accent' | 'gold' | 'down';
}) {
  const bg =
    tone === 'accent'
      ? 'hsl(var(--market-accent-soft))'
      : tone === 'gold'
        ? 'hsl(var(--market-gold) / 0.18)'
        : tone === 'down'
          ? 'hsl(var(--market-down) / 0.12)'
          : 'hsl(var(--market-primary-soft) / 0.35)';
  const fg =
    tone === 'accent'
      ? 'hsl(var(--market-accent))'
      : tone === 'gold'
        ? 'hsl(var(--market-gold))'
        : tone === 'down'
          ? 'hsl(var(--market-down))'
          : 'hsl(var(--market-primary))';
  return (
    <div
      className="w-11 h-11 rounded-2xl flex items-center justify-center"
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </div>
  );
}
