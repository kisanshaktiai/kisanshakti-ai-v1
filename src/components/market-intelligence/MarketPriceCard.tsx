import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MarketPrice } from '@/hooks/useMarketPriceIntelligence';
import { TrendingUp, TrendingDown, MapPin, Wheat, Package, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketPriceCardProps {
  price: MarketPrice;
}

// Get group icon based on commodity_category
function getGroupIcon(category: string | undefined): string {
  const icons: Record<string, string> = {
    'धान्ये': '🌾',
    'डाळी': '🫘',
    'भाज्या': '🥬',
    'फळे': '🍎',
    'मसाले': '🧄',
    'तेलबिया': '🌻',
    'गूळ व साखर': '🍯',
    'कापूस': '🧶',
    'इतर': '📦',
  };
  return icons[category || ''] || '🌱';
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
  const groupIcon = getGroupIcon(price.commodity_category);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-4",
        "bg-gradient-to-br from-card via-card to-card/80",
        "border border-border/50",
        "shadow-sm hover:shadow-md transition-shadow"
      )}
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      
      {/* Group Badge - Always show */}
      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/80 text-xs">
        <span>{groupIcon}</span>
        <span className="text-muted-foreground font-medium truncate max-w-[60px]">
          {price.commodity_category || 'इतर'}
        </span>
      </div>

      {/* Distance badge if available */}
      {price.distance !== undefined && (
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-full bg-info/10 text-info text-xs font-medium">
          {price.distance} km
        </div>
      )}

      {/* Header with crop name */}
      <div className="flex items-start gap-3 mb-3 pr-20">
        <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
          <Wheat className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate text-sm">
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
          <span className="text-xl font-bold text-foreground">
            ₹{modalPrice.toLocaleString('en-IN')}
          </span>
          <span className="text-xs text-muted-foreground">/{price.unit || 'Qtl'}</span>
        </div>
        
        {/* Price Range */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-1 text-xs">
            <TrendingDown className="w-3 h-3 text-destructive" />
            <span className="text-muted-foreground">₹{minPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                isPriceHigh 
                  ? "bg-gradient-to-r from-warning via-success to-success" 
                  : "bg-gradient-to-r from-destructive via-warning to-warning"
              )}
              style={{ 
                width: `${Math.min(100, ((modalPrice - minPrice) / (priceSpread || 1)) * 100)}%` 
              }}
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <TrendingUp className="w-3 h-3 text-success" />
            <span className="text-muted-foreground">₹{maxPrice.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <MapPin className="w-3 h-3 text-primary" />
        <span className="truncate">
          {price.market_location || price.district}
        </span>
      </div>

      {/* Arrival if available */}
      {price.arrival && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="w-3 h-3" />
          <span>आवक: {price.arrival} {price.unit || 'Qtl'}</span>
        </div>
      )}

      {/* Price indicator bar */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-1",
        isPriceHigh 
          ? "bg-gradient-to-r from-success to-success/70" 
          : "bg-gradient-to-r from-warning to-warning/70"
      )} />
    </motion.div>
  );
}
