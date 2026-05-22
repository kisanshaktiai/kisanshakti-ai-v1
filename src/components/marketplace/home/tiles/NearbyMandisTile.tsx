import { MapPinned } from 'lucide-react';
import { Tile, TileIcon, TileChevron } from '../tileBase';

interface Props {
  markets: any[];
  hasLocation: boolean;
  onClick: () => void;
}

export function NearbyMandisTile({ markets, hasLocation, onClick }: Props) {
  const count = markets?.length || 0;
  return (
    <Tile onClick={onClick} ariaLabel="Nearby mandis">
      <TileIcon tone="accent">
        <MapPinned className="w-5 h-5" />
      </TileIcon>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          पास की मंडी · Nearby
        </p>
        <p className="text-xl font-extrabold mt-0.5" style={{ color: 'hsl(var(--market-ink))' }}>
          {hasLocation ? `${count} mandis` : '— —'}
        </p>
        <p className="text-[11px]" style={{ color: 'hsl(var(--market-ink-soft))' }}>
          {hasLocation ? '50 km के अंदर' : 'जमीन में स्थान जोड़ें'}
        </p>
      </div>
      <TileChevron />
    </Tile>
  );
}
