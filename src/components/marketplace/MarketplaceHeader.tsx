import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface MarketplaceHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCartClick: () => void;
  cartItemCount: number;
}

export function MarketplaceHeader({
  searchQuery,
  onSearchChange,
}: MarketplaceHeaderProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder="उत्पादने शोधा • Search products..."
        className="h-11 pl-9 rounded-2xl bg-card border-border/60 text-sm"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
