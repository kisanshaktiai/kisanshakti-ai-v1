import { motion } from 'framer-motion';
import { MarketPrice } from '@/hooks/useMarketPriceIntelligence';
import { TrendingUp, TrendingDown, MapPin, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MarketPriceCardProps {
  price: MarketPrice;
  onClick?: () => void;
}

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

function formatDate(d?: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function MarketPriceCard({ price, onClick }: MarketPriceCardProps) {
  const modalPrice = price.modal_price || price.price_per_unit || 0;
  const minPrice = price.min_price || modalPrice;
  const maxPrice = price.max_price || modalPrice;
  const spread = maxPrice - minPrice;
  const trendPct = minPrice > 0 ? ((modalPrice - minPrice) / minPrice) * 100 : 0;
  const isUp = trendPct >= 0;
  const groupIcon = getGroupIcon(price.commodity_category);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'w-full text-left rounded-2xl p-4 bg-card border border-border/60',
        'active:bg-muted/40 transition-colors touch-manipulation'
      )}
    >
      {/* Row 1: crop + trend */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-2xl leading-none" aria-hidden>{groupIcon}</span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground truncate leading-tight">
              {price.crop_name}
            </h3>
            {price.variety && (
              <p className="text-[11px] text-muted-foreground truncate leading-tight">
                {price.variety}
              </p>
            )}
          </div>
        </div>
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0',
            isUp
              ? 'bg-success/15 text-success'
              : 'bg-destructive/15 text-destructive'
          )}
        >
          {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {isUp ? '+' : ''}{trendPct.toFixed(1)}%
        </div>
      </div>

      {/* Row 2: price */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-2xl font-extrabold text-foreground tabular-nums leading-none">
          ₹{modalPrice.toLocaleString('en-IN')}
        </span>
        <span className="text-xs text-muted-foreground">/ {price.unit || 'Qtl'}</span>
      </div>

      {/* Row 3: min/max range */}
      {spread > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 tabular-nums">
          <span>कमी ₹{minPrice.toLocaleString('en-IN')}</span>
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, ((modalPrice - minPrice) / spread) * 100)}%`,
              }}
            />
          </div>
          <span>जास्त ₹{maxPrice.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* Row 4: location + date */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 min-w-0">
          <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="truncate">
            {price.market_location || price.district}
            {price.distance !== undefined && (
              <span className="ml-1 text-primary font-medium">• {price.distance} km</span>
            )}
          </span>
        </span>
        {price.price_date && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <CalendarDays className="w-3 h-3" />
            {formatDate(price.price_date)}
          </span>
        )}
      </div>
    </motion.button>
  );
}
