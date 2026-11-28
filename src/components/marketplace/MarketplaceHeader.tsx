import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder={t('market.ui.search_products')}
        aria-label={t('market.ui.search_products')}
        className="h-11 pl-9 rounded-2xl bg-card border-border/60 text-base"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
