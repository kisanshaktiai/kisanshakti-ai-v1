/**
 * HarvestConfirmDialog — the harvest card (2026-11-19).
 *
 * After a crop's harvest date the farmer is asked, once a day, to give the actual
 * harvest date. The card counts down the days until the land is freed from its crop
 * schedule automatically. Two answers:
 *   - "Harvest done"            -> pick the date (after sowing, up to today)
 *   - "Crop still in the field" -> pick the expected date (after today, up to the
 *                                  end of the crop's harvest window); the countdown
 *                                  starts again from that date
 * Every date comes from the database (trigger_data.question); the answer is written
 * by public.record_crop_harvest through proactive-question-seed (action
 * 'harvest_answer'), which requires the farmer's verified session.
 * Theme tokens only; all text through i18n (alerts.harvest.*).
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Clock, Sprout, Wheat } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { supabase, getSessionToken } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/hooks/useTenant';
import { toast } from '@/hooks/use-toast';
import { formatFarmerDate } from '@/lib/dateFormat';
import {
  canReportStillInField, daysLeft, expectedDateAllowed, harvestDateAllowed,
  localDayIso, parseDay, type HarvestCard,
} from '@/lib/harvestCard';

type Mode = 'choose' | 'harvested' | 'standing';

interface Props {
  card: HarvestCard | null;
  open: boolean;
  onClose: () => void;
  /** The farmer answered; the card is done. */
  onAnswered: (card: HarvestCard) => void;
  /** Shown only on the app-open popup: put this card off until tomorrow. */
  onPutOff?: (card: HarvestCard) => void;
}

const KNOWN_REFUSALS = new Set([
  'HARVEST_DATE_IN_FUTURE', 'HARVEST_DATE_BEFORE_SOWING', 'EXPECTED_DATE_NOT_IN_FUTURE',
  'EXPECTED_DATE_BEYOND_CROP_WINDOW', 'NO_ACTIVE_CROP', 'SESSION_REQUIRED',
]);

/** The edge function's refusal code, read from a non-2xx response. */
async function refusalCode(error: unknown): Promise<string | null> {
  try {
    const ctx = (error as { context?: Response })?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      return typeof body?.code === 'string' ? body.code : null;
    }
  } catch { /* not a JSON body */ }
  return null;
}

export function HarvestConfirmDialog({ card, open, onClose, onAnswered, onPutOff }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [mode, setMode] = useState<Mode>('choose');
  const [picked, setPicked] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const todayIso = localDayIso();
  const q = card?.question ?? null;
  const left = q ? Math.max(daysLeft(q.release_on, todayIso), 0) : 0;
  const land = card?.landName || t('alerts.unknown_land', 'this land');
  const showStanding = q ? canReportStillInField(q, todayIso) : false;

  const reset = () => { setMode('choose'); setPicked(undefined); setSaving(false); };
  const close = () => { reset(); onClose(); };

  const defaultMonth = useMemo(() => {
    if (!q) return new Date();
    return mode === 'harvested' ? parseDay(q.harvest_date) : new Date();
  }, [q, mode]);

  if (!card || !q) return null;

  const save = async () => {
    if (!picked || saving) return;
    setSaving(true);
    const harvested = mode === 'harvested';
    try {
      const { error } = await supabase.functions.invoke('proactive-question-seed', {
        body: {
          action: 'harvest_answer',
          alertId: card.alertId,
          landId: card.landId,
          harvested,
          date: localDayIso(picked),
        },
        headers: {
          'x-farmer-id': user?.id || '',
          'x-tenant-id': tenant?.id || '',
          'x-session-token': getSessionToken() || '',
        },
      });
      if (error) {
        const code = await refusalCode(error);
        toast({
          variant: 'destructive',
          description: code && KNOWN_REFUSALS.has(code)
            ? t(`alerts.harvest.errors.${code}`)
            : t('alerts.harvest.errors.generic', 'Could not save. Please try again.'),
        });
        setSaving(false);
        return;
      }
      toast({
        description: harvested
          ? t('alerts.harvest.saved_done', 'Harvest saved. This land is now free for your next crop.')
          : t('alerts.harvest.saved_standing', 'Noted. We will ask again after {{date}}.', {
              date: formatFarmerDate(picked, lang),
            }),
      });
      reset();
      onAnswered(card);
    } catch (e) {
      console.error('[harvest-card] answer failed', e);
      toast({ variant: 'destructive', description: t('alerts.harvest.errors.generic', 'Could not save. Please try again.') });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-3xl p-5">
        <DialogHeader className="text-left space-y-2">
          <DialogTitle className="flex items-center gap-2 text-lg leading-snug">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Wheat className="h-5 w-5" />
            </span>
            {t('alerts.harvest.title', 'Is the harvest of {{land}} done?', { land })}
          </DialogTitle>
          {/* 2026-11-20: the colour is set on DialogDescription itself so it merges with the
              component's default text-muted-foreground (on the child it lost and the text read grey). */}
          <DialogDescription asChild className="space-y-3 text-sm text-foreground">
            <div>
              {/* the countdown and the auto-release warning, the most important lines on the card */}
              <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-3">
                <div className="flex items-center gap-3">
                  {/* solid warning badge: bg-warning + text-warning-foreground is the pair the
                      tenant theme defines together, so the number stays readable in every theme */}
                  <span className="flex h-16 min-w-16 shrink-0 items-center justify-center rounded-2xl bg-warning px-3 text-4xl font-bold tabular-nums text-warning-foreground">
                    {left}
                  </span>
                  <span className="text-base font-semibold leading-snug text-foreground">
                    {t('alerts.harvest.days_left', { count: left, defaultValue: '{{count}} days left before this land is freed automatically' })}
                  </span>
                </div>
                <p className="text-base font-bold leading-snug text-foreground">
                  {t('alerts.harvest.warning',
                    'If you do not enter the date, this land will be freed from its crop schedule automatically on {{release}}.',
                    { release: formatFarmerDate(parseDay(q.release_on), lang) })}
                </p>
              </div>
              <p className="leading-relaxed">
                {t('alerts.harvest.body',
                  'The harvest was due around {{date}}. Please enter the actual harvest date, or tell us if the crop is still in the field.',
                  { date: formatFarmerDate(parseDay(q.harvest_date), lang) })}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {mode === 'choose' && (
          <div className="mt-1 flex flex-col gap-2">
            <Button className="min-h-[48px] w-full gap-2 rounded-full text-base whitespace-normal" onClick={() => setMode('harvested')}>
              <CalendarCheck className="h-5 w-5" />
              {t('alerts.harvest.done', 'Harvest done — enter the date')}
            </Button>
            {showStanding && (
              <Button variant="outline" className="min-h-[48px] w-full gap-2 rounded-full text-base whitespace-normal" onClick={() => setMode('standing')}>
                <Sprout className="h-5 w-5" />
                {t('alerts.harvest.standing', 'Crop is still in the field')}
              </Button>
            )}
            {onPutOff && (
              <Button variant="ghost" className="min-h-[44px] w-full gap-2 rounded-full whitespace-normal text-muted-foreground"
                onClick={() => { reset(); onPutOff(card); }}>
                <Clock className="h-4 w-4" />
                {t('alerts.harvest.later', 'Remind me tomorrow')}
              </Button>
            )}
          </div>
        )}

        {mode !== 'choose' && (
          <div className="mt-1 space-y-2">
            <p className="text-sm font-semibold">
              {mode === 'harvested'
                ? t('alerts.harvest.when_harvested', 'When did you harvest?')
                : t('alerts.harvest.when_expected', 'When do you expect to harvest?')}
            </p>
            {mode === 'standing' && q.max_expected_date && (
              <p className="text-xs text-muted-foreground">
                {t('alerts.harvest.expected_upto', 'You can choose a date up to {{date}}.', {
                  date: formatFarmerDate(parseDay(q.max_expected_date), lang),
                })}
              </p>
            )}
            <div className="flex justify-center rounded-2xl border border-border">
              <Calendar
                mode="single"
                selected={picked}
                onSelect={setPicked}
                defaultMonth={defaultMonth}
                disabled={(day) => mode === 'harvested'
                  ? !harvestDateAllowed(day, q, todayIso)
                  : !expectedDateAllowed(day, q, todayIso)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-[48px] flex-1 rounded-full" disabled={saving}
                onClick={() => { setMode('choose'); setPicked(undefined); }}>
                {t('alerts.harvest.back', 'Back')}
              </Button>
              <Button className="min-h-[48px] flex-1 rounded-full" disabled={!picked || saving} onClick={save}>
                {saving ? t('alerts.harvest.saving', 'Saving…') : t('alerts.harvest.save', 'Save')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
