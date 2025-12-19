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
  isLoading = false 
}: CropGroupButtonsProps) {
  const displayGroups = groups.length > 0 ? groups.slice(0, 6) : defaultGroups;

  return (
    <div className="w-full">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <span className="text-lg">🌱</span>
        पीक प्रकार निवडा • Select Crop Type
      </h3>
      
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
        {displayGroups.map((group, index) => (
          <motion.button
            key={group.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => onSelectGroup(group.name)}
            disabled={isLoading}
            className={cn(
              "relative flex flex-col items-center justify-center p-3 md:p-4 rounded-2xl transition-all duration-200",
              "min-h-[80px] md:min-h-[100px]",
              "border-2 touch-manipulation",
              "active:scale-95",
              selectedGroup === group.name
                ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                : "bg-card/80 backdrop-blur border-border/50 hover:border-primary/50 hover:bg-primary/5",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            {/* Icon */}
            <span className="text-2xl md:text-3xl mb-1">{group.icon}</span>
            
            {/* Marathi Name */}
            <span className={cn(
              "text-xs md:text-sm font-semibold text-center leading-tight",
              selectedGroup === group.name ? "text-primary-foreground" : "text-foreground"
            )}>
              {group.name}
            </span>
            
            {/* English Name */}
            <span className={cn(
              "text-[10px] md:text-xs text-center",
              selectedGroup === group.name ? "text-primary-foreground/80" : "text-muted-foreground"
            )}>
              {group.en}
            </span>

            {/* Count Badge */}
            {group.count > 0 && (
              <span className={cn(
                "absolute -top-1 -right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px]",
                selectedGroup === group.name
                  ? "bg-primary-foreground text-primary"
                  : "bg-primary/10 text-primary"
              )}>
                {group.count > 999 ? '999+' : group.count}
              </span>
            )}

            {/* Selection Indicator */}
            {selectedGroup === group.name && (
              <motion.div
                layoutId="groupSelection"
                className="absolute inset-0 rounded-2xl border-2 border-primary"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* All Groups Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        onClick={() => onSelectGroup('all')}
        className={cn(
          "w-full mt-3 py-3 rounded-xl text-sm font-medium transition-all",
          "border-2 touch-manipulation active:scale-[0.98]",
          selectedGroup === 'all' || !selectedGroup
            ? "bg-accent text-accent-foreground border-accent"
            : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted"
        )}
      >
        सर्व पिके पहा • View All Crops
      </motion.button>
    </div>
  );
}
