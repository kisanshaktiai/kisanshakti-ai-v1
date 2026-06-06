import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, Loader2, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { schedulesApi } from '@/services/schedulesApi';
import { useInvalidatePendingHarvests, type PendingHarvest } from '@/hooks/usePendingHarvests';
import { PostHarvestSuggestionDialog } from '@/components/schedule/PostHarvestSuggestionDialog';

type Outcome = 'FULLY_HARVESTED' | 'PARTIALLY_HARVESTED' | 'ABANDONED';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PendingHarvest | null;
}

export function HarvestConfirmDialog({ open, onOpenChange, request }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const invalidate = useInvalidatePendingHarvests();

  const [outcome, setOutcome] = useState<Outcome>('FULLY_HARVESTED');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [yieldQtl, setYieldQtl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [busy, setBusy] = useState<'confirm' | 'snooze' | null>(null);
  const [showNext, setShowNext] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcome('FULLY_HARVESTED');
      setDate(new Date());
      setYieldQtl('');
      setNotes('');
      setBusy(null);
    }
  }, [open, request?.id]);

  const sowing = request?.crop_schedules?.sowing_date
    ? new Date(request.crop_schedules.sowing_date)
    : undefined;
  const today = useMemo(() => new Date(), []);
  const cropName = request?.crop_schedules?.crop_name || t('schedule.harvest.crop_fallback', 'your crop');
  const landName = request?.lands?.name || '';

  const submit = async () => {
    if (!request) return;
    if (outcome !== 'ABANDONED' && !date) {
      toast({
        title: t('schedule.harvest.errors.date_required', 'Please pick the harvest date'),
        variant: 'destructive',
      });
      return;
    }
    setBusy('confirm');
    try {
      await schedulesApi.confirmHarvest({
        schedule_id: request.schedule_id,
        outcome,
        actual_harvest_date: outcome === 'ABANDONED' ? undefined : format(date!, 'yyyy-MM-dd'),
        yield_qtl: yieldQtl ? Number(yieldQtl) : null,
        notes: notes.trim() || null,
      });
      toast({
        title:
          outcome === 'ABANDONED'
            ? t('schedule.harvest.toast.abandoned', 'Season closed')
            : t('schedule.harvest.toast.confirmed', 'Harvest confirmed'),
      });
      invalidate();
      onOpenChange(false);
      // Step 7: surface residue + rotation suggestions after a real harvest.
      // Skip the dialog for ABANDONED — nothing to harvest, nothing to rotate from.
      if (outcome !== 'ABANDONED') setShowNext(true);
    } catch (e: any) {
      toast({
        title: t('schedule.harvest.errors.submit', 'Could not save harvest'),
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const snooze = async () => {
    if (!request) return;
    setBusy('snooze');
    try {
      await schedulesApi.snoozeHarvest(request.id, 7);
      toast({ title: t('schedule.harvest.toast.snoozed', 'Reminder snoozed for 7 days') });
      invalidate();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: t('schedule.harvest.errors.snooze', 'Could not snooze'),
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>{t('schedule.harvest.dialog.title', 'Confirm harvest')}</DialogTitle>
          <DialogDescription>
            {cropName}
            {landName ? ` • ${landName}` : ''}
            {request?.crop_schedules?.expected_harvest_date
              ? ` • ${t('schedule.harvest.dialog.expected', 'Expected')}: ${request.crop_schedules.expected_harvest_date}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t('schedule.harvest.dialog.outcome_label', 'Outcome')}</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as Outcome)}
              className="grid gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <RadioGroupItem value="FULLY_HARVESTED" id="hc-full" />
                <span>{t('schedule.harvest.outcomes.full', 'Fully harvested')}</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <RadioGroupItem value="PARTIALLY_HARVESTED" id="hc-partial" />
                <span>{t('schedule.harvest.outcomes.partial', 'Partially harvested')}</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border p-2 cursor-pointer">
                <RadioGroupItem value="ABANDONED" id="hc-abandoned" />
                <span>{t('schedule.harvest.outcomes.abandoned', 'Abandoned / failed')}</span>
              </label>
            </RadioGroup>
          </div>

          {outcome !== 'ABANDONED' && (
            <div>
              <Label className="mb-2 block">
                {t('schedule.harvest.dialog.date_label', 'Actual harvest date')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !date && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : t('schedule.harvest.dialog.pick_date', 'Pick a date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d > today || (sowing ? d < sowing : false)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {outcome !== 'ABANDONED' && (
            <div>
              <Label htmlFor="yield-qtl" className="mb-2 block">
                {t('schedule.harvest.dialog.yield_label', 'Yield (quintals, optional)')}
              </Label>
              <Input
                id="yield-qtl"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                placeholder="0.0"
                value={yieldQtl}
                onChange={(e) => setYieldQtl(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label htmlFor="harvest-notes" className="mb-2 block">
              {t('schedule.harvest.dialog.notes_label', 'Notes (optional)')}
            </Label>
            <Textarea
              id="harvest-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t(
                'schedule.harvest.dialog.notes_placeholder',
                'Anything you want to remember about this harvest',
              )}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            size="icon"
            asChild
            aria-label={t('schedule.harvest.dialog.share', 'Share on WhatsApp')}
            title={t('schedule.harvest.dialog.share', 'Share on WhatsApp')}
          >
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `🌾 ${cropName}${landName ? ` • ${landName}` : ''}${
                  yieldQtl ? `\n${yieldQtl} q` : ''
                }${date ? `\n${format(date, 'yyyy-MM-dd')}` : ''}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Share2 className="h-4 w-4" />
            </a>
          </Button>
          <Button variant="ghost" onClick={snooze} disabled={!!busy}>
            {busy === 'snooze' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('schedule.harvest.dialog.snooze', 'Snooze 7 days')}
          </Button>
          <Button onClick={submit} disabled={!!busy}>
            {busy === 'confirm' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('schedule.harvest.dialog.confirm', 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <PostHarvestSuggestionDialog
      open={showNext}
      onOpenChange={setShowNext}
      prevCrop={request?.crop_schedules?.crop_name || null}
      landId={request?.land_id || null}
      landName={request?.lands?.name || null}
    />
    </>
  );
}
