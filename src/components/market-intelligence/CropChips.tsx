import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CropChipsProps {
  crops: string[];
  selectedCrop: string | null;
  onSelectCrop: (crop: string) => void;
  isLoading?: boolean;
  maxDisplay?: number;
}

export function CropChips({ crops, selectedCrop, onSelectCrop, isLoading }: CropChipsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const select = (crop: string) => { onSelectCrop(crop); setOpen(false); setQuery(''); };
  const choices = crops.filter(crop => crop.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={isLoading} className="h-11 w-full min-w-0 justify-between gap-1 rounded-lg bg-card px-3 text-xs">
          <span className="truncate">{selectedCrop || t('market.intelligence.allItems', { count: crops.length })}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-2" onOpenAutoFocus={event => event.preventDefault()}>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label={t('market.intelligence.search')} placeholder={t('market.intelligence.search')} value={query} onChange={event => setQuery(event.target.value)} className="h-10 pl-8" />
        </div>
        <div className="max-h-64 overflow-y-auto" role="listbox" aria-label={t('market.intelligence.items')}>
          <Button variant="ghost" className="h-10 w-full justify-between" onClick={() => select('')}>
            {t('market.intelligence.allItems', { count: crops.length })}{!selectedCrop && <Check className="h-4 w-4" />}
          </Button>
          {choices.map(crop => <Button key={crop} variant="ghost" role="option" aria-selected={selectedCrop === crop} className="h-auto min-h-10 w-full justify-between whitespace-normal text-left" onClick={() => select(crop)}>
            {crop}{selectedCrop === crop && <Check className="h-4 w-4 shrink-0" />}
          </Button>)}
          {!choices.length && <p className="p-3 text-sm text-muted-foreground">{t('market.intelligence.noPrices')}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
