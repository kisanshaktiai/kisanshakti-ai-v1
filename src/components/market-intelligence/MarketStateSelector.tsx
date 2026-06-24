import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Star } from 'lucide-react';

interface MarketStateSelectorProps {
  states: string[];
  selectedState: string;
  farmerState?: string;
  onStateChange: (state: string) => void;
}

export function MarketStateSelector({ 
  states, 
  selectedState, 
  farmerState, 
  onStateChange 
}: MarketStateSelectorProps) {
  const { t } = useTranslation();

  // Sort states with farmer's state first
  const sortedStates = [...states].sort((a, b) => {
    if (a === farmerState) return -1;
    if (b === farmerState) return 1;
    return a.localeCompare(b);
  });

  return (
    <Select value={selectedState} onValueChange={onStateChange}>
      <SelectTrigger className="h-12 rounded-2xl bg-card/50 backdrop-blur border-border/50">
        <MapPin className="w-4 h-4 mr-2 text-muted-foreground" />
        <SelectValue placeholder={t('market.intelligence.selectState', 'Select State')} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {sortedStates.map((state) => (
          <SelectItem key={state} value={state}>
            <div className="flex items-center gap-2">
              {state === farmerState && (
                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
              )}
              <span>{state}</span>
              {state === farmerState && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({t('market.intelligence.yourState', 'Your State')})
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
