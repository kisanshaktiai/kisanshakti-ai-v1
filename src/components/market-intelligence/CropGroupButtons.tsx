import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CropGroup } from '@/hooks/useMarketPriceIntelligence';

interface CropGroupButtonsProps {
  groups: CropGroup[];
  selectedGroup: string | null;
  onSelectGroup: (group: string) => void;
  isLoading?: boolean;
}

export function CropGroupButtons({ groups, selectedGroup, onSelectGroup, isLoading }: CropGroupButtonsProps) {
  const { t, i18n } = useTranslation();
  const label = (group: CropGroup) => i18n.language.startsWith('mr') ? group.name : i18n.language.startsWith('hi') ? group.hi : group.en;
  return (
    <Select value={selectedGroup || 'all'} onValueChange={onSelectGroup} disabled={isLoading}>
      <SelectTrigger className="h-11 min-w-0 rounded-lg border-border bg-card text-sm" aria-label={t('market.intelligence.cropType')}>
        <SelectValue placeholder={t('market.intelligence.cropType')} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem className="min-h-11 focus:bg-muted focus:text-foreground" value="all">{t('market.intelligence.allCategories')}</SelectItem>
        {groups.map(group => <SelectItem className="min-h-11 focus:bg-muted focus:text-foreground" key={group.name} value={group.name}>
          {group.icon} {label(group)} · {group.count}
        </SelectItem>)}
      </SelectContent>
    </Select>
  );
}
