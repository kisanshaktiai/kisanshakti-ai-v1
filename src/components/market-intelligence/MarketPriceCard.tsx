import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MarketPrice } from '@/hooks/useMarketPriceIntelligence';
import { TrendingUp, TrendingDown, MapPin, Wheat, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketPriceCardProps {
  price: MarketPrice;
}

export function MarketPriceCard({ price }: MarketPriceCardProps) {
  const { t } = useTranslation();
  
  const modalPrice = price.modal_price || price.price_per_unit || 0;
  const minPrice = price.min_price || modalPrice;
  const maxPrice = price.max_price || modalPrice;
  const priceSpread = maxPrice - minPrice;
  const spreadPercent = minPrice > 0 ? ((priceSpread / minPrice) * 100).toFixed(1) : '0';

  // Determine if price is high/low based on spread
  const isPriceHigh = priceSpread > 0 && modalPrice >= (minPrice + priceSpread * 0.7);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-4",
        "bg-gradient-to-br from-card via-card to-card/80",
        "border border-border/50 shadow-lg shadow-black/5",
        "backdrop-blur-xl"
      )}
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      
      {/* Distance badge if available */}
      {price.distance !== undefined && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          {price.distance} km
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Wheat className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {price.crop_name}
          </h3>
          {price.variety && (
            <p className="text-xs text-muted-foreground truncate">
              {price.variety}
            </p>
          )}
        </div>
      </div>

      {/* Price Section */}
      <div className="mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">
            ₹{modalPrice.toLocaleString('en-IN')}
          </span>
          <span className="text-sm text-muted-foreground">/{price.unit || 'Qtl'}</span>
        </div>
        
        {/* Price Range */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1 text-xs">
            <TrendingDown className="w-3 h-3 text-red-500" />
            <span className="text-muted-foreground">₹{minPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full"
              style={{ 
                width: `${Math.min(100, ((modalPrice - minPrice) / (priceSpread || 1)) * 100)}%` 
              }}
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <TrendingUp className="w-3 h-3 text-green-500" />
            <span className="text-muted-foreground">₹{maxPrice.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
        <MapPin className="w-3.5 h-3.5" />
        <span className="truncate">
          {price.market_location || price.district}
        </span>
      </div>

      {/* Arrival if available */}
      {price.arrival && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="w-3 h-3" />
          <span>{t('market.intelligence.arrival', 'Arrival')}: {price.arrival} {price.unit || 'Qtl'}</span>
        </div>
      )}

      {/* Price indicator */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-1",
        isPriceHigh ? "bg-gradient-to-r from-green-500 to-green-400" : "bg-gradient-to-r from-yellow-500 to-orange-400"
      )} />
    </motion.div>
  );
}
