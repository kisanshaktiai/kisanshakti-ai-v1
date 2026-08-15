import React, { useState } from 'react';
import { Leaf, Sprout, FlaskConical, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useUiTranslations } from '@/hooks/useUiTranslations';

export type FarmingMode = 'unset' | 'fertilizer_pesticide' | 'organic_fertilizer' | 'organic_only';

const MODE_META: Record<Exclude<FarmingMode, 'unset'>, {
  i18nKey: string;
  descKey: string;
  icon: React.ReactNode;
  pill: string;
  dot: string;
}> = {
  organic_only: {
    i18nKey: 'mode.organic',
    descKey: 'mode.organic.desc',
    icon: <Leaf className="h-3.5 w-3.5" />,
    pill: 'bg-mode-organic-soft text-mode-organic border-mode-organic/30',
    dot: 'bg-mode-organic',
  },
  organic_fertilizer: {
    i18nKey: 'mode.mixed',
    descKey: 'mode.mixed.desc',
    icon: <Sprout className="h-3.5 w-3.5" />,
    pill: 'bg-mode-mixed-soft text-mode-mixed border-mode-mixed/30',
    dot: 'bg-mode-mixed',
  },
  fertilizer_pesticide: {
    i18nKey: 'mode.chemical',
    descKey: 'mode.chemical.desc',
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    pill: 'bg-mode-chemical-soft text-mode-chemical border-mode-chemical/30',
    dot: 'bg-mode-chemical',
  },
};

const ORDER: Array<Exclude<FarmingMode, 'unset'>> = [
  'organic_only',
  'organic_fertilizer',
  'fertilizer_pesticide',
];

interface FarmingModeBadgeProps {
  mode: FarmingMode;
  /** Emits the i18n key of the picked mode (backend maps key → farming_type). */
  onSelectModeKey: (modeKey: string) => void;
  className?: string;
}

export default function FarmingModeBadge({ mode, onSelectModeKey, className }: FarmingModeBadgeProps) {
  const { t } = useUiTranslations();
  const [open, setOpen] = useState(false);

  const active = mode !== 'unset' ? MODE_META[mode] : null;
  const label = active ? t(active.i18nKey) : t('mode.unset');
  if (!label) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
          'text-[11px] font-semibold leading-none transition-colors active:scale-[0.97]',
          active ? active.pill : 'bg-muted text-muted-foreground border-border',
          className,
        )}
        aria-label={label}
      >
        {active ? active.icon : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />}
        <span className="max-w-[9rem] truncate">{label}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0">
          <SheetHeader className="px-5 pt-5 pb-2 text-left">
            <SheetTitle className="text-base font-semibold">{t('mode.sheet_title')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-6">
            {ORDER.map((m) => {
              const meta = MODE_META[m];
              const selected = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onSelectModeKey(meta.i18nKey);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all',
                    'active:scale-[0.98]',
                    selected ? meta.pill : 'border-border bg-card',
                  )}
                >
                  <span className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background',
                    selected ? 'border-current' : 'border-border text-muted-foreground',
                  )}>
                    {meta.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{t(meta.i18nKey)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(meta.descKey)}</span>
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
