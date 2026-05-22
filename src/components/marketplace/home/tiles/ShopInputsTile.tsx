import { Sprout } from 'lucide-react';
import { Tile, TileIcon, TileChevron } from '../tileBase';

export function ShopInputsTile({ onClick, locked }: { onClick: () => void; locked?: boolean }) {
  return (
    <Tile onClick={onClick} ariaLabel="Shop inputs" locked={locked}>
      <TileIcon tone="primary">
        <Sprout className="w-5 h-5" />
      </TileIcon>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          खरीदें · Shop
        </p>
        <p className="text-xl font-extrabold" style={{ color: 'hsl(var(--market-ink))' }}>
          बीज · खाद · दवा
        </p>
        <p className="text-[11px]" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          Seeds · Fertilizer · Pesticide
        </p>
      </div>
      <TileChevron />
    </Tile>
  );
}
