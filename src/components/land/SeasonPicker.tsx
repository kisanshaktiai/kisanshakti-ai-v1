import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { seasonToSowingDate } from '@/lib/cropStage';

type Season = 'kharif' | 'rabi' | 'summer';

interface SeasonPickerProps {
  value?: string | null;        // ISO date currently selected (we infer season from it)
  onChange: (sowingIso: string, season: Season) => void;
}

const SEASONS: { key: Season; emoji: string; labelKey: string; monthsKey: string }[] = [
  { key: 'kharif', emoji: '🌧️', labelKey: 'lands.smartConfirm.season.kharif', monthsKey: 'lands.smartConfirm.season.kharifMonths' },
  { key: 'rabi',   emoji: '❄️',  labelKey: 'lands.smartConfirm.season.rabi',   monthsKey: 'lands.smartConfirm.season.rabiMonths' },
  { key: 'summer', emoji: '☀️',  labelKey: 'lands.smartConfirm.season.summer', monthsKey: 'lands.smartConfirm.season.summerMonths' },
];

function seasonOf(iso?: string | null): Season | null {
  if (!iso) return null;
  const m = new Date(iso + 'T00:00:00Z').getUTCMonth() + 1;
  if (m >= 6 && m <= 9) return 'kharif';
  if (m >= 10 || m <= 1) return 'rabi';
  return 'summer';
}

export function SeasonPicker({ value, onChange }: SeasonPickerProps) {
  const { t } = useTranslation();
  const current = seasonOf(value);
  return (
    <div className="grid grid-cols-3 gap-2">
      {SEASONS.map((s) => {
        const active = current === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(seasonToSowingDate(s.key), s.key);
            }}
            className={cn(
              'flex flex-col items-center justify-center rounded-2xl px-2 py-3 border min-h-[72px]',
              'transition-colors active:scale-[0.97]',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border hover:border-primary/40',
            )}
          >
            <span className="text-2xl leading-none">{s.emoji}</span>
            <span className="text-xs font-medium mt-1">
              {t(s.labelKey, { defaultValue: s.key })}
            </span>
            <span className={cn(
              'text-[10px] mt-0.5',
              active ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}>
              {t(s.monthsKey, { defaultValue: '' })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
