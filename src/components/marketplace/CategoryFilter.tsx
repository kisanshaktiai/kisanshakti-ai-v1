import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
}

interface CategoryFilterProps {
  categories: Category[];
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onCategorySelect,
}: CategoryFilterProps) {
  const chip = (id: string | null, label: string, icon?: string) => {
    const active = selectedCategory === id;
    return (
      <button
        key={id ?? 'all'}
        type="button"
        onClick={() => onCategorySelect(id)}
        className={cn(
          'flex items-center gap-1.5 px-4 h-11 rounded-2xl flex-shrink-0 snap-start',
          'border touch-manipulation transition-colors text-sm font-medium',
          active
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-card text-foreground border-border/60 active:bg-muted',
        )}
      >
        {icon && <span className="text-base leading-none">{icon}</span>}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
      <div className="flex gap-2 pb-1 pr-4">
        {chip(null, 'सर्व', '🛒')}
        {categories.map((c) => chip(c.id, c.name, c.icon))}
      </div>
    </div>
  );
}
