import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Volume2, Sprout, AlertTriangle, CloudOff, HelpCircle, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatSkyDay, type FieldSky } from '@/hooks/useFieldSky';
import { useSignedSatelliteImage } from '@/hooks/useSignedSatelliteImage';

/**
 * The one sentence a farmer needs first, next to the newest picture the
 * satellite took of this field. Tone comes from the state, the state comes
 * from governed sources (stage band in crop_stage_master, robust z from the
 * pipeline, freshness from the decision view) — see useFieldSky. The picture
 * is the newest crop-growth frame of the map (sky.layerFrames.vigour[0]) and
 * carries its own date, so an old picture is never mistaken for today's.
 */
export function FieldStateCard({ sky, landName, landId, farmerId, tenantId, onSpeak, isSpeaking, onOpenMap }: {
  sky: FieldSky; landName: string; landId?: string | null; farmerId?: string; tenantId?: string;
  onSpeak: (text: string) => void; isSpeaking: boolean; onOpenMap?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const ui = STATE_UI[sky.state];
  const Icon = ui.icon;
  const picture = sky.layerFrames.vigour[0] ?? null;
  const image = useSignedSatelliteImage(picture?.path ?? null, farmerId, tenantId, landId ?? undefined);

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
    if (sky.state === 'unclear' && sky.radar) return t('sky.state.radar_note', 'Radar can see through cloud. It last saw this field on {{date}}.', { date: formatSkyDay(sky.radar.date, i18n.language) });
    if (sky.stage.state === 'no_sowing_date') return t('sky.state.need_sowing', 'Tell us when you sowed and we can compare with what the crop should look like now.');
    // stage names are translated by the same keys the crop figure uses (sky.stage.<name>), falling back to the table's own text
    if (sky.stage.stageName) return t('sky.state.stage_line', 'Day {{das}} · {{stage}}', { das: sky.stage.das ?? '–', stage: t(`sky.stage.${sky.stage.stageName.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`, sky.stage.stageName) });
    return null;
  })();

  const pictureLabel = picture ? t('sky.map.picture_from', 'Picture from {{date}}', { date: formatSkyDay(picture.date, i18n.language) }) : null;

  const speakButton = (
    <Button variant="ghost" size="icon" aria-label={t('sky.read_aloud', 'Read aloud')} onClick={() => onSpeak(`${line} ${detail ?? ''}`)} className="h-11 w-11 rounded-xl shrink-0 -mr-2 -mt-2">
      <Volume2 className={cn('h-5 w-5', isSpeaking && 'text-primary animate-pulse')} />
    </Button>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('rounded-3xl p-4 border', ui.bg, ui.border)}>
      <div className="flex items-start gap-3">
        {image.url ? (
          <button type="button" onClick={onOpenMap} aria-label={t('sky.state.open_map', 'Open this picture on the map')}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border/40 bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <motion.img key={image.url} src={image.url} alt={pictureLabel ?? ''} className="absolute inset-0 h-full w-full object-contain p-1"
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45, ease: 'easeOut' }} />
            {/* one pass of the satellite over the picture when it arrives */}
            {!reduceMotion && (
              <motion.span key={`sweep-${image.url}`} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-primary/35 to-transparent"
                initial={{ y: -32, opacity: 0 }} animate={{ y: 96, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.3, ease: 'easeInOut', delay: 0.25 }} />
            )}
          </button>
        ) : (
          <div className={cn('h-12 w-12 rounded-2xl grid place-items-center shrink-0', ui.iconBg)}>
            <Icon className={cn('h-6 w-6', ui.iconFg)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {image.url && (
            <div className="flex items-start justify-between gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold', ui.iconBg, ui.iconFg)}>
                <Icon className="h-3.5 w-3.5" />{pictureLabel}
              </span>
              {speakButton}
            </div>
          )}
          <p className={cn('text-[15px] leading-snug font-semibold', image.url && 'mt-0.5', ui.fg)}>{line}</p>
          {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
        </div>
        {!image.url && speakButton}
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
