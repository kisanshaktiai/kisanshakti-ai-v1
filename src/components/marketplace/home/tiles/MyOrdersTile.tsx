import { Package } from 'lucide-react';
import { Tile, TileIcon, TileChevron } from '../tileBase';

export function MyOrdersTile({ onClick }: { onClick: () => void }) {
  return (
    <Tile onClick={onClick} ariaLabel="My orders">
      <TileIcon tone="gold">
        <Package className="w-5 h-5" />
      </TileIcon>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          ऑर्डर · Orders
        </p>
        <p className="text-xl font-extrabold" style={{ color: 'hsl(var(--market-ink))' }}>
          देखें
        </p>
        <p className="text-[11px]" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          Track your purchases
        </p>
      </div>
      <TileChevron />
    </Tile>
  );
}
