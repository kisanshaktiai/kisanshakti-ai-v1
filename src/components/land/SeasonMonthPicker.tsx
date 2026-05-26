import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface Props {
  /** ISO date string (YYYY-MM-DD) */
  value?: string;
  onChange: (iso: string | undefined) => void;
  /** Limit how many years back/forward are selectable */
  yearsBack?: number;
  yearsForward?: number;
  ariaLabel?: string;
}

/**
 * Farmer-friendly date picker. Two rows: Year × Month tiles.
 * Stores ISO `YYYY-MM-15` (mid-month) so downstream stage math keeps working
 * even when the farmer doesn't know the exact day.
 *
 * Power-users can flip "Exact date" to reveal the native date input.
 */
export function SeasonMonthPicker({
  value, onChange, yearsBack = 2, yearsForward = 1, ariaLabel,
}: Props) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const parsed = useMemo(() => {
    if (!value) return { year: currentYear, month: -1 };
    const d = new Date(value);
    if (isNaN(d.getTime())) return { year: currentYear, month: -1 };
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [value, currentYear]);

  const [exactMode, setExactMode] = useState(false);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - yearsBack; y <= currentYear + yearsForward; y++) arr.push(y);
    return arr;
  }, [currentYear, yearsBack, yearsForward]);

  const monthFmt = useMemo(() =>
    new Intl.DateTimeFormat(i18n.language || 'en', { month: 'short' }),
    [i18n.language],
  );
  const months = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const d = new Date(2024, i, 1);
      // Season tint: Kharif (Jun-Oct) = warm amber, Rabi (Nov-Mar) = cool blue, Zaid (Apr-May) = lime
      let season: 'kharif' | 'rabi' | 'zaid';
      if (i >= 5 && i <= 9) season = 'kharif';
      else if (i === 10 || i === 11 || i <= 2) season = 'rabi';
      else season = 'zaid';
      return { idx: i, label: monthFmt.format(d), season };
    });
  }, [monthFmt]);

  const setMonth = (m: number) => {
    const y = parsed.year;
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-15`;
    onChange(iso);
  };
  const setYear = (y: number) => {
    const m = parsed.month >= 0 ? parsed.month : currentMonth;
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-15`;
    onChange(iso);
  };

  const seasonClass = (s: string, active: boolean) => {
    if (active) return 'bg-primary text-primary-foreground border-primary';
    if (s === 'kharif') return 'bg-warning-soft dark:bg-warning/30 border-warning/30 dark:border-warning text-warning dark:text-warning';
    if (s === 'rabi') return 'bg-info-soft dark:bg-info/30 border-info/30 dark:border-info text-info dark:text-info';
    return 'bg-success-soft dark:bg-success/30 border-success/30 dark:border-success text-success dark:text-success';
  };

  return (
    <div className="space-y-2.5" aria-label={ariaLabel}>
      {/* Year row */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {years.map(y => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={cn(
              'shrink-0 px-3 h-9 rounded-full border text-sm font-medium min-w-[52px]',
              'transition-colors active:scale-[0.96]',
              parsed.year === y
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card border-border text-muted-foreground',
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {months.map(m => {
          const active = parsed.month === m.idx;
          return (
            <button
              key={m.idx}
              type="button"
              onClick={() => setMonth(m.idx)}
              className={cn(
                'h-11 rounded-xl border text-sm font-medium',
                'transition-colors active:scale-[0.96]',
                seasonClass(m.season, active),
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Exact date toggle */}
      <button
        type="button"
        onClick={() => setExactMode(s => !s)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1"
      >
        <Calendar className="h-3.5 w-3.5" />
        {t('lands.smartConfirm.exactDate', { defaultValue: 'Exact date (optional)' })}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', exactMode && 'rotate-180')} />
      </button>
      {exactMode && (
        <Input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="h-11 rounded-xl"
        />
      )}
    </div>
  );
}
