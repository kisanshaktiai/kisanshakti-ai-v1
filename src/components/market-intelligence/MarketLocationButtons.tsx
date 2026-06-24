import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopMarket {
  name: string;
  count: number;
}

interface MarketLocationButtonsProps {
  markets: TopMarket[];
  selectedMarket: string | null;
  onSelectMarket: (market: string) => void;
  isLoading?: boolean;
}

export function MarketLocationButtons({
  markets = [],
  selectedMarket,
  onSelectMarket,
  isLoading = false,
}: MarketLocationButtonsProps) {
  if (markets.length === 0) return null;

  const chip = (name: string, label: string, count: number, active: boolean) => (
    <motion.button
      key={name}
      type="button"
      onClick={() => onSelectMarket(name)}
      disabled={isLoading}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'flex items-center gap-1.5 px-3.5 h-11 rounded-2xl flex-shrink-0 snap-start',
        'border touch-manipulation transition-colors text-sm font-medium',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border/60 active:bg-muted',
        isLoading && 'opacity-50',
      )}
    >
      <MapPin
        className={cn(
          'w-3.5 h-3.5',
          active ? 'text-primary-foreground' : 'text-primary',
        )}
      />
      <span className="truncate max-w-[120px]">{label}</span>
      {count > 0 && (
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
            active ? 'bg-primary-foreground/20' : 'bg-muted',
          )}
        >
          {count}
        </span>
      )}
    </motion.button>
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          बाजार
        </h3>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <div className="flex gap-2 pb-1 pr-4">
          {chip('all', 'सर्व बाजार', 0, selectedMarket === 'all' || !selectedMarket)}
          {markets.map((m) => chip(m.name, m.name, m.count, selectedMarket === m.name))}
        </div>
      </div>
    </div>
  );
}
