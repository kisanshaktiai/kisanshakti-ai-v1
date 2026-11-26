import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { phSide, type SoilReading } from '@/lib/soilInterpretation';
import type { SoilSourceKey } from '@/services/soil/soilReport';
import { SOIL_SOURCE_ICON } from '@/components/soil/soilSourceMeta';

export interface SoilVerdictInput { ph: SoilReading; oc: SoilReading; n: SoilReading; p: SoilReading; k: SoilReading }

/** The few plain sentences a farmer hears first. Built only from the readings and their governed bands. */
export function soilVerdictLines(r: SoilVerdictInput, t: TFunction, language: string): string[] {
  const fmt = (v: number | null, d = 1) => (v === null ? '' : new Intl.NumberFormat(language, { maximumFractionDigits: d }).format(v));
  const lines: string[] = [];
  const side = phSide(r.ph.value);
  if (side) lines.push(t(`soil.say.ph_${side}`, { value: fmt(r.ph.value) }));
  if (r.oc.band) lines.push(t(`soil.say.oc_${r.oc.band}`, { value: fmt(r.oc.value, 2) }));
  else if (r.oc.noVerdictReason === 'method_differs') lines.push(t('soil.say.oc_estimate', { value: fmt(r.oc.value, 2) }));
  else if (r.oc.value !== null) lines.push(t('soil.say.oc_value', { value: fmt(r.oc.value, 2) }));
  const npk = [['n', r.n], ['p', r.p], ['k', r.k]] as const;
  if (npk.every(([, x]) => x.value === null)) {
    lines.push(t('soil.say.need_lab'));
  } else {
    const low = npk.filter(([, x]) => x.band === 'low').map(([key]) => t(`soil.nutrientName.${key}`));
    // Intl.ListFormat joins names the way the farmer's language does; the app's TS lib predates its typings.
    const ListFormat = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format(items: string[]): string } }).ListFormat;
    const list = ListFormat ? new ListFormat(language, { style: 'long', type: 'conjunction' }).format(low) : low.join(', ');
    if (low.length) lines.push(t('soil.say.npk_low', { list, count: low.length }));
    else if (npk.some(([, x]) => x.band)) lines.push(t('soil.say.npk_ok'));
    if (npk.some(([, x]) => x.value !== null && !x.band)) lines.push(t('soil.say.npk_unrated'));
  }
  return lines;
}

/** Hero card: which report this is, the land, and the spoken summary. Children carry the card's actions. */
export function SoilVerdictCard({ kind, landName, dateLabel, readings, onSpeak, isSpeaking, children }: {
  kind: SoilSourceKey; landName: string; dateLabel?: string | null; readings: SoilVerdictInput | null;
  onSpeak: (text: string) => void; isSpeaking: boolean; children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const Icon = SOIL_SOURCE_ICON[kind];
  const lines = readings ? soilVerdictLines(readings, t, i18n.language) : [];
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm">
          <Icon className="h-3.5 w-3.5 text-primary" />{t(`soil.sourceTypes.${kind}`)}{dateLabel && <span className="font-normal text-muted-foreground">· {dateLabel}</span>}
        </span>
        {lines.length > 0 && (
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-11 w-11 rounded-xl" aria-label={t('soil.readAloud')}
            onClick={() => onSpeak(`${landName}. ${lines.join(' ')}`)}>
            <Volume2 className={cn('h-5 w-5', isSpeaking && 'animate-pulse text-primary')} />
          </Button>
        )}
      </div>
      <h1 className="relative mt-3 text-2xl font-bold tracking-tight text-foreground">{landName}</h1>
      {lines.length > 0 && (
        <ul className="relative mt-3 space-y-1.5">
          {lines.map((line) => <li key={line} className="flex gap-2 text-[15px] leading-snug text-foreground"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{line}</li>)}
        </ul>
      )}
      {children && <div className="relative mt-4">{children}</div>}
    </motion.section>
  );
}
