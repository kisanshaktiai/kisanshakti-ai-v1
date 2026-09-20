import { useTranslation } from 'react-i18next';
import { Sun, CloudSun, Cloud, RadioTower, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * "How well could the sky see my field?" This card is what makes the others
 * believable: it says when the last clear view was and how much of the field
 * was visible, and offers radar when optical is blocked.
 */
export function SkyCard({ sky }: { sky: FieldSky }) {
  const { t } = useTranslation();
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
    ? t('sky.sky.radar_line', 'Radar on {{date}}: crop is standing.', { date: sky.radar.date }) : null;

  return (
    <Card className="rounded-3xl border-border/40">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-info/15 grid place-items-center shrink-0"><Icon className="h-5 w-5 text-info" /></div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{headline}</p>
          <p className="text-[11px] text-muted-foreground">{[seen, support].filter(Boolean).join(' · ')}</p>
          {radarLine && <p className="text-[11px] text-muted-foreground mt-0.5">{radarLine}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const EVIDENCE_TEXT: Record<string, string> = {
  high: 'strong measurement', medium: 'fair measurement', low: 'weak measurement — small field', insufficient: 'too small to measure well',
};
