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
  isLoading = false 
}: MarketLocationButtonsProps) {
  // Show top 4 markets for mobile
  const displayMarkets = markets.slice(0, 4);

  if (displayMarkets.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        बाजार निवडा • Select Market
      </h3>
      
      <div className="flex flex-wrap gap-2">
        {/* All Markets Button */}
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => onSelectMarket('all')}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200",
            "border-2 touch-manipulation active:scale-95",
            "text-sm font-medium",
            selectedMarket === 'all' || !selectedMarket
              ? "bg-primary text-primary-foreground border-primary shadow-md"
              : "bg-card/80 border-border/50 hover:border-primary/50 text-foreground"
          )}
        >
          <span className="text-base">🏪</span>
          <span>सर्व</span>
        </motion.button>

        {displayMarkets.map((market, index) => (
          <motion.button
            key={market.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (index + 1) * 0.05 }}
            onClick={() => onSelectMarket(market.name)}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200",
              "border-2 touch-manipulation active:scale-95",
              "text-sm font-medium",
              selectedMarket === market.name
                ? "bg-primary text-primary-foreground border-primary shadow-md"
                : "bg-card/80 border-border/50 hover:border-primary/50 text-foreground"
            )}
          >
            <MapPin className={cn(
              "w-3.5 h-3.5",
              selectedMarket === market.name ? "text-primary-foreground" : "text-primary"
            )} />
            <span>{market.name}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              selectedMarket === market.name
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              {market.count}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
