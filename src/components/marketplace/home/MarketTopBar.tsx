import { MapPin, ShoppingCart, Mic } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  cartItemCount: number;
  onCartClick: () => void;
  district?: string;
  farmerName?: string;
}

export function MarketTopBar({ cartItemCount, onCartClick, district, farmerName }: Props) {
  const greeting = getGreeting();
  return (
    <header
      className="sticky top-0 z-30 px-3 pt-3 pb-3"
      style={{
        backgroundColor: 'hsl(var(--market-bg))',
        borderBottom: '1px solid hsl(var(--market-line) / 0.6)',
      }}
    >
      <div className="max-w-screen-sm mx-auto flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium" style={{ color: 'hsl(var(--market-ink-soft))' }}>
            {greeting.hi} {farmerName ? `· ${farmerName.split(' ')[0]}` : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3.5 h-3.5" style={{ color: 'hsl(var(--market-primary))' }} />
            <h1
              className="text-base font-bold truncate"
              style={{ color: 'hsl(var(--market-ink))' }}
            >
              {district || 'बाजार · Market'}
            </h1>
          </div>
        </div>

        <button
          aria-label="Voice search"
          className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center transition-transform active:scale-95"
          style={{
            backgroundColor: 'hsl(var(--market-primary))',
            color: 'hsl(var(--market-primary-foreground))',
            boxShadow: '0 6px 16px -8px hsl(var(--market-primary) / 0.6)',
          }}
        >
          <Mic className="w-5 h-5" />
        </button>

        <button
          aria-label={`Cart (${cartItemCount})`}
          onClick={onCartClick}
          className="relative min-h-11 min-w-11 rounded-2xl flex items-center justify-center transition-transform active:scale-95"
          style={{
            backgroundColor: 'hsl(var(--market-surface))',
            border: '1px solid hsl(var(--market-line))',
            color: 'hsl(var(--market-ink))',
          }}
        >
          <ShoppingCart className="w-5 h-5" />
          {cartItemCount > 0 && (
            <Badge
              className="absolute -top-1.5 -right-1.5 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold border-0"
              style={{
                backgroundColor: 'hsl(var(--market-down))',
                color: 'hsl(var(--market-primary-foreground))',
              }}
            >
              {cartItemCount}
            </Badge>
          )}
        </button>
      </div>
    </header>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { hi: 'सुप्रभात', en: 'Good morning' };
  if (h < 17) return { hi: 'नमस्कार', en: 'Good afternoon' };
  return { hi: 'शुभ संध्या', en: 'Good evening' };
}
