import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MarketPrice, FarmerLocation } from '@/hooks/useMarketPriceIntelligence';
import { MarketPriceCard } from './MarketPriceCard';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, RefreshCw, Loader2 } from 'lucide-react';

interface NearbyMarketsSectionProps {
  markets: MarketPrice[];
  isLoading: boolean;
  farmerLocation: FarmerLocation | null;
  onRefresh: () => void;
}

export function NearbyMarketsSection({ 
  markets, 
  isLoading, 
  farmerLocation,
  onRefresh 
}: NearbyMarketsSectionProps) {
  const { t } = useTranslation();

  if (!farmerLocation?.lat || !farmerLocation?.lon) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
      >
        <Navigation className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {t('market.intelligence.locationRequired', 'Location Required')}
        </h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {t('market.intelligence.locationRequiredDesc', 'Add land coordinates in your land settings to see nearby markets within 50km radius')}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl border border-primary/10"
      >
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">
              {t('market.intelligence.nearbyTitle', 'Markets within 50km')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {farmerLocation.district}, {farmerLocation.state}
            </p>
          </div>
        </div>
        
        <Button 
          onClick={onRefresh} 
          variant="outline" 
          className="rounded-xl"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {t('market.intelligence.refresh', 'Refresh')}
        </Button>
      </motion.div>

      {/* Markets Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : markets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
        >
          <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            {t('market.intelligence.noNearbyMarkets', 'No market data found within 50km radius')}
          </p>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {markets.map((market, index) => (
            <motion.div
              key={market.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <MarketPriceCard price={market} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Distance legend */}
      {markets.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground"
        >
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>0-15 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>15-30 km</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span>30-50 km</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
