import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { MarketPrice } from '@/hooks/useMarketPriceIntelligence';
import { MapPin, CalendarDays, Package, ChevronRight } from 'lucide-react';
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
  const { t } = useTranslation();
  const modalPrice = price.modal_price || price.price_per_unit || 0;
  const minPrice = price.min_price || modalPrice;
  const maxPrice = price.max_price || modalPrice;
  const spread = maxPrice - minPrice;
  const groupIcon = getGroupIcon(price.commodity_category);

  return (
    <Button
      variant="surface"
      onClick={onClick}
      className={cn(
        'block h-full w-full min-w-0 whitespace-normal text-left p-3.5',
        'transition-colors duration-150 touch-manipulation'
      )}
    >
      {/* Row 1: crop + trend */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xl leading-none" aria-hidden>{groupIcon}</span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-foreground break-words leading-snug">
              {price.crop_name}
            </h3>
            {price.variety && (
              <p className="text-[11px] font-normal text-muted-foreground break-words leading-snug">
                {price.variety}
              </p>
            )}
          </div>
        </div>
        {price.arrival != null && Number(price.arrival) > 0 ? (
          <div className="flex max-w-[45%] flex-wrap items-center justify-end gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground tabular-nums">
            <Package className="w-3.5 h-3.5" />
            {t('market.intelligence.arrival')} {Number(price.arrival).toLocaleString('en-IN')}
          </div>
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Row 2: price */}
      <div className="flex flex-wrap items-baseline gap-1.5 mb-3">
        <span className="text-2xl font-extrabold text-foreground tabular-nums leading-none">
          ₹{modalPrice.toLocaleString('en-IN')}
        </span>
        <span className="text-xs text-muted-foreground">/ {price.unit || 'Qtl'}</span>
      </div>

      {/* Row 3: min/max range */}
      {spread > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 tabular-nums">
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

      {/* Row 4: market name, road distance + date */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-border/60 pt-2.5">
        <div className="min-w-0">
          <span className="flex items-start gap-1.5 min-w-0 text-base font-semibold text-foreground">
            <MapPin className="w-3.5 h-3.5 mt-0.5 text-primary flex-shrink-0" />
            <span className="min-w-0 break-words leading-snug">{price.market_location || price.district}</span>
          </span>
          {(price.distance !== undefined || price.is_major_market) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-xs">
              {price.distance !== undefined && (
                <span className="py-0.5 text-muted-foreground font-medium tabular-nums">
                  {price.distanceKind === 'road' ? '' : '~'}{price.distance} किमी
                  {price.distanceKind === 'road' ? ' रस्ता' : ''}
                  {price.travelMinutes !== undefined && ` · ${price.travelMinutes >= 60 ? `${Math.floor(price.travelMinutes / 60)} तास ${price.travelMinutes % 60} मि` : `${price.travelMinutes} मि`}`}
                </span>
              )}
              {price.is_major_market && (
                <span className="px-1.5 py-0.5 rounded-md bg-muted text-foreground font-medium">मोठा बाजार</span>
              )}
            </div>
          )}
        </div>
        {price.price_date && (
          <span className="flex items-center gap-1 flex-shrink-0 pt-1 text-xs text-muted-foreground">
            <CalendarDays className="w-3 h-3" />
            {formatDate(price.price_date)}
          </span>
        )}
      </div>
    </Button>
  );
}
