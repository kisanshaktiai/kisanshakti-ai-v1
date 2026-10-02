import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sun, CloudSun, Cloud, RadioTower, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatSkyDay, type FieldSky } from '@/hooks/useFieldSky';

/**
 * "How well could the sky see my field?" This card is what makes the others
 * believable: it says when the last clear view was and how much of the field
 * was visible, and offers radar when optical is blocked. Below that it lists
 * the satellite's recent visits (clear optical passes and radar passes, from
 * the rows the pipeline stored), so a new visit is visible the day it lands.
 */
export function SkyCard({ sky }: { sky: FieldSky }) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const s = sky.sky;
  const Icon = s.state === 'clear' ? Sun : s.state === 'hazy' ? CloudSun : s.state === 'radar_only' ? RadioTower : s.state === 'cloudy' ? Cloud : EyeOff;

  const headline = (() => {
    switch (s.state) {
      case 'clear': return t('sky.sky.clear', 'Clear view {{days}} days ago', { days: s.ageDays ?? 0 });
      case 'hazy': return t('sky.sky.hazy', 'Partly cloudy view {{days}} days ago', { days: s.ageDays ?? 0 });
      case 'cloudy': return t('sky.sky.cloudy', 'Last clear view was {{days}} days ago', { days: s.ageDays ?? '–' });
      case 'radar_only': return t('sky.sky.radar', 'Clouds — radar view only');
      default: return t('sky.sky.none', 'No clear view yet');
    }
  })();

  const seen = s.fieldSeenPct != null ? t('sky.sky.seen', '{{pct}}% of the field seen clearly', { pct: s.fieldSeenPct }) : null;
  const support = s.evidence ? t(`sky.sky.evidence_${s.evidence}`, EVIDENCE_TEXT[s.evidence] ?? s.evidence) : null;
  const radarLine = sky.radar && (s.state === 'radar_only' || s.state === 'cloudy')
    ? t('sky.sky.radar_line', 'Radar saw the field on {{date}}.', { date: formatSkyDay(sky.radar.date, i18n.language) }) : null;
  // newest first, so the latest visit is on screen without scrolling
  const visits = sky.visits;

  return (
    <Card className="rounded-3xl border-border/40">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-info/15 grid place-items-center shrink-0"><Icon className="h-5 w-5 text-info" /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{headline}</p>
            <p className="text-[11px] text-muted-foreground">{[seen, support].filter(Boolean).join(' · ')}</p>
            {radarLine && <p className="text-[11px] text-muted-foreground mt-0.5">{radarLine}</p>}
          </div>
        </div>

        {visits.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40">
            <p className="text-[12px] font-semibold text-muted-foreground mb-2">{t('sky.sky.visits', 'Satellite visits')}</p>
            <ol className="flex gap-1.5 overflow-x-auto pb-1">
              {visits.map((v, i) => {
                const newest = i === 0;
                const VisitIcon = v.kind === 'clear' ? Sun : RadioTower;
                return (
                  <motion.li key={`${v.date}-${v.kind}`} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
                    aria-label={`${formatSkyDay(v.date, i18n.language)} ${v.kind === 'clear' ? t('sky.sky.visit_clear', 'clear view') : t('sky.sky.visit_radar', 'radar')}`}
                    className={cn('shrink-0 flex flex-col items-center gap-1 rounded-xl border px-2 py-1.5 min-w-[52px]',
                      newest ? 'border-primary bg-primary/10' : 'border-border/40 bg-muted/30')}>
                    <VisitIcon className={cn('h-4 w-4', v.kind === 'clear' ? 'text-warning' : 'text-info')} />
                    <span className={cn('text-[11px] leading-none whitespace-nowrap', newest ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>{formatSkyDay(v.date, i18n.language)}</span>
                  </motion.li>);
              })}
            </ol>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Sun className="h-3.5 w-3.5 text-warning" />{t('sky.sky.visit_clear', 'clear view')}</span>
              <span className="inline-flex items-center gap-1"><RadioTower className="h-3.5 w-3.5 text-info" />{t('sky.sky.visit_radar', 'radar')}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const EVIDENCE_TEXT: Record<string, string> = {
  high: 'strong measurement', medium: 'fair measurement', low: 'weak measurement — small field', insufficient: 'too small to measure well',
};
