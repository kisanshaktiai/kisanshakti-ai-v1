import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MarketPrice, FarmerLocation } from '@/hooks/useMarketPriceIntelligence';
import { MarketPriceCard } from './MarketPriceCard';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NearbyMarketsSectionProps {
  markets: MarketPrice[];
  isLoading: boolean;
  farmerLocation: FarmerLocation | null;
  onRefresh: () => void;
  embedded?: boolean;
}

export function NearbyMarketsSection({
  markets,
  isLoading,
  farmerLocation,
  onRefresh,
  embedded = false,
}: NearbyMarketsSectionProps) {
  const { t } = useTranslation();

  if (!farmerLocation?.lat || !farmerLocation?.lon) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'text-center py-8 px-4 rounded-2xl',
          !embedded && 'bg-card border border-border/60',
        )}
      >
        <Navigation className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <h3 className="text-sm font-semibold mb-1">
          {t('market.intelligence.locationRequired', 'Location Required')}
        </h3>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          {t(
            'market.intelligence.locationRequiredDesc',
            'Add land coordinates in your land settings to see nearby markets within 50km radius',
          )}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {!embedded && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-primary/10">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {t('market.intelligence.nearbyTitle', 'Markets within 50km')}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {farmerLocation.district}, {farmerLocation.state}
              </p>
            </div>
          </div>
          <Button
            onClick={onRefresh}
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-xl flex-shrink-0"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      )}

      {embedded && (
        <p className="text-[11px] text-muted-foreground px-1">
          📍 {farmerLocation.district}, {farmerLocation.state}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-8">
          <MapPin className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {t('market.intelligence.noNearbyMarkets', 'No market data found within 50km radius')}
          </p>
        </div>
      ) : embedded ? (
        // Horizontal scroll carousel
        <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          <div className="flex gap-2.5 pb-1 pr-4">
            {markets.slice(0, 12).map((m, i) => (
              <div
                key={m.id || i}
                className="w-[78%] sm:w-[60%] flex-shrink-0 snap-start"
              >
                <MarketPriceCard price={m} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {markets.map((m, i) => (
            <MarketPriceCard key={m.id || i} price={m} />
          ))}
        </div>
      )}
    </div>
  );
}
