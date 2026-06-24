import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CropGroup {
  name: string;
  count: number;
  icon: string;
  en: string;
  hi: string;
}

interface CropGroupButtonsProps {
  groups: CropGroup[];
  selectedGroup: string | null;
  onSelectGroup: (group: string) => void;
  isLoading?: boolean;
}

const defaultGroups: CropGroup[] = [
  { name: 'धान्ये', icon: '🌾', en: 'Grains', hi: 'अनाज', count: 0 },
  { name: 'डाळी', icon: '🫘', en: 'Pulses', hi: 'दालें', count: 0 },
  { name: 'भाज्या', icon: '🥬', en: 'Vegetables', hi: 'सब्जियां', count: 0 },
  { name: 'फळे', icon: '🍎', en: 'Fruits', hi: 'फल', count: 0 },
  { name: 'मसाले', icon: '🧄', en: 'Spices', hi: 'मसाले', count: 0 },
  { name: 'तेलबिया', icon: '🌻', en: 'Oilseeds', hi: 'तिलहन', count: 0 },
];

export function CropGroupButtons({
  groups = [],
  selectedGroup,
  onSelectGroup,
  isLoading = false,
}: CropGroupButtonsProps) {
  const displayGroups = groups.length > 0 ? groups : defaultGroups;

  const chip = (
    name: string,
    icon: string,
    en: string,
    count: number,
    active: boolean,
  ) => (
    <motion.button
      key={name}
      type="button"
      onClick={() => onSelectGroup(name)}
      disabled={isLoading}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'flex items-center gap-2 px-4 h-12 rounded-2xl flex-shrink-0 snap-start',
        'border touch-manipulation transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-card text-foreground border-border/60 active:bg-muted',
        isLoading && 'opacity-50',
      )}
    >
      <span className="text-lg leading-none" aria-hidden>{icon}</span>
      <span className="text-sm font-semibold leading-tight">{name}</span>
      <span className="text-[10px] opacity-70 hidden xs:inline">{en}</span>
      {count > 0 && (
        <span
          className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
            active ? 'bg-primary-foreground/20' : 'bg-muted',
          )}
        >
          {count > 999 ? '999+' : count}
        </span>
      )}
    </motion.button>
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          पीक प्रकार
        </h3>
      </div>
      <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        <div className="flex gap-2 pb-1 pr-4">
          {chip('all', '🪴', 'All', 0, !selectedGroup || selectedGroup === 'all')}
          {displayGroups.map((g) =>
            chip(g.name, g.icon, g.en, g.count, selectedGroup === g.name),
          )}
        </div>
      </div>
    </div>
  );
}
