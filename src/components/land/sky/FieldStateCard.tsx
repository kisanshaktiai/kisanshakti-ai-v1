import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Volume2, Sprout, AlertTriangle, CloudOff, HelpCircle, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldSky } from '@/hooks/useFieldSky';

/**
 * The one sentence a farmer needs first. Tone comes from the state, the state
 * comes from governed sources (stage band in crop_stage_master, robust z from
 * the pipeline, freshness from the decision view) — see useFieldSky.
 */
export function FieldStateCard({ sky, landName, onSpeak, isSpeaking }: { sky: FieldSky; landName: string; onSpeak: (text: string) => void; isSpeaking: boolean }) {
  const { t } = useTranslation();
  const ui = STATE_UI[sky.state];
  const Icon = ui.icon;

  const line = (() => {
    switch (sky.state) {
      case 'as_expected': return t('sky.state.as_expected', '{{land}} is growing as expected for this stage.', { land: landName });
      case 'slower': return t('sky.state.slower', '{{land}} is growing a little slower than nearby fields.', { land: landName });
      case 'something_wrong': return t('sky.state.something_wrong', 'Something looks off in {{land}}. Worth a walk through the field.', { land: landName });
      case 'unclear': return t('sky.state.unclear', 'Clouds have hidden {{land}} for a while. We will look again on the next clear day.', { land: landName });
      default: return t('sky.state.no_data', 'The satellite has not had a clear look at {{land}} yet.', { land: landName });
    }
  })();

  const detail = (() => {
    if (sky.state === 'unclear' && sky.radar) return t('sky.state.radar_note', 'Radar can see through cloud: the crop is still standing.');
    if (sky.stage.state === 'no_sowing_date') return t('sky.state.need_sowing', 'Tell us when you sowed and we can compare with what the crop should look like now.');
    if (sky.stage.stageName) return t('sky.state.stage_line', 'Day {{das}} · {{stage}}', { das: sky.stage.das ?? '–', stage: sky.stage.stageName });
    return null;
  })();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-3xl p-4 border', ui.bg, ui.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('h-12 w-12 rounded-2xl grid place-items-center shrink-0', ui.iconBg)}>
          <Icon className={cn('h-6 w-6', ui.iconFg)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-[15px] leading-snug font-semibold', ui.fg)}>{line}</p>
          {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
        </div>
        <Button variant="ghost" size="icon" aria-label={t('sky.read_aloud', 'Read aloud')} onClick={() => onSpeak(`${line} ${detail ?? ''}`)} className="h-9 w-9 rounded-xl shrink-0">
          <Volume2 className={cn('h-4 w-4', isSpeaking && 'text-primary animate-pulse')} />
        </Button>
      </div>
    </motion.div>
  );
}

const STATE_UI = {
  as_expected:     { icon: Sprout,        bg: 'bg-success/10',     border: 'border-success/30',     iconBg: 'bg-success/15',     iconFg: 'text-success',     fg: 'text-foreground' },
  slower:          { icon: TrendingDown,  bg: 'bg-warning/10',     border: 'border-warning/30',     iconBg: 'bg-warning/15',     iconFg: 'text-warning',     fg: 'text-foreground' },
  something_wrong: { icon: AlertTriangle, bg: 'bg-destructive/10', border: 'border-destructive/30', iconBg: 'bg-destructive/15', iconFg: 'text-destructive', fg: 'text-foreground' },
  unclear:         { icon: CloudOff,      bg: 'bg-muted/50',       border: 'border-border/40',      iconBg: 'bg-muted',          iconFg: 'text-muted-foreground', fg: 'text-foreground' },
  no_data:         { icon: HelpCircle,    bg: 'bg-muted/50',       border: 'border-border/40',      iconBg: 'bg-muted',          iconFg: 'text-muted-foreground', fg: 'text-foreground' },
} as const;
