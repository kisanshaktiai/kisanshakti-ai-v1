import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Field, INPUT_CLASS, Panel, PrimaryAction, ProviderPage, Question, SaveError, SwitchRow,
} from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type WorkingDay } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { hapticFeedback } from '@/lib/haptics';
import { clockValue, weekdayName, weekdayShort } from '@/lib/providerText';
import { cn } from '@/lib/utils';

// 0 = Sunday … 6 = Saturday, as the server counts. Shown Monday first.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const SHOWN_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** Offered when a day is first switched on and no time is set yet. */
const DEFAULT_START = '08:00';
const DEFAULT_END = '18:00';

/** Seven rows for the form; a day the provider never saved starts as a day off. */
function toForm(saved: WorkingDay[]): WorkingDay[] {
  return WEEKDAYS.map((weekday) => {
    const day = saved.find((d) => d.weekday === weekday);
    return {
      weekday,
      is_working: day?.is_working ?? false,
      start_time: clockValue(day?.start_time),
      end_time: clockValue(day?.end_time),
    };
  });
}

const dayValid = (day: WorkingDay) =>
  !day.is_working || (!!day.start_time && !!day.end_time && day.end_time > day.start_time);

/** True when every working day has the same times (so one pair of times is enough). */
function sameTimes(days: WorkingDay[]): boolean {
  const working = days.filter((d) => d.is_working);
  return working.every((d) => d.start_time === working[0].start_time && d.end_time === working[0].end_time);
}

/**
 * Working hours: tap the days worked, then set the times once for all of them
 * (or day by day). The server uses them, with the busy days, to tell farmers
 * whether the provider is free.
 */
export default function ProviderHours() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();
  const [days, setDays] = useState<WorkingDay[] | null>(null);
  const [perDay, setPerDay] = useState(false);

  useEffect(() => {
    if (!days && workspace) {
      const form = toForm(workspace.working_hours);
      setDays(form);
      setPerDay(!sameTimes(form));
    }
  }, [days, workspace]);

  const update = (weekday: number, change: Partial<WorkingDay>) =>
    setDays((current) => current?.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)) ?? null);

  const working = days?.filter((d) => d.is_working) ?? [];
  const shared = working[0] ?? null;

  const toggleDay = (weekday: number) => {
    hapticFeedback('light');
    setDays((current) => {
      if (!current) return current;
      const day = current.find((d) => d.weekday === weekday)!;
      if (day.is_working) return current.map((d) => (d.weekday === weekday ? { ...d, is_working: false } : d));
      // A day switched on takes the shared times, or the usual day when none is set yet.
      const first = current.find((d) => d.is_working);
      const start = perDay ? '' : first?.start_time || '';
      const end = perDay ? '' : first?.end_time || '';
      return current.map((d) => (d.weekday === weekday ? { ...d, is_working: true, start_time: start, end_time: end } : d));
    });
  };

  const setShared = (change: Partial<WorkingDay>) =>
    setDays((current) => current?.map((d) => (d.is_working ? { ...d, ...change } : d)) ?? null);

  const switchPerDay = (on: boolean) => {
    setPerDay(on);
    if (!on && shared) setShared({ start_time: shared.start_time, end_time: shared.end_time });
  };

  const allValid = !!days && days.every(dayValid);
  const canSave = allValid && !saving && isOnline;

  const handleSave = async () => {
    if (!days || !canSave) return;
    const ok = await run(() => providerWorkspaceService.setWorkingHours(
      days.map((d) => ({
        weekday: d.weekday,
        is_working: d.is_working,
        start_time: d.start_time || null,
        end_time: d.end_time || null,
      })),
    ));
    if (ok) navigate(PROVIDER_ROUTES.business);
  };

  const timePair = (idSuffix: string, day: Pick<WorkingDay, 'start_time' | 'end_time'>, onChange: (change: Partial<WorkingDay>) => void, labelFrom: string, labelTo: string) => (
    <div className="grid grid-cols-2 gap-3">
      <Field label={labelFrom} htmlFor={`hours-start-${idSuffix}`}>
        <Input
          id={`hours-start-${idSuffix}`}
          type="time"
          value={day.start_time ?? ''}
          onChange={(e) => onChange({ start_time: e.target.value })}
          className={INPUT_CLASS}
          disabled={saving}
        />
      </Field>
      <Field label={labelTo} htmlFor={`hours-end-${idSuffix}`}>
        <Input
          id={`hours-end-${idSuffix}`}
          type="time"
          value={day.end_time ?? ''}
          onChange={(e) => onChange({ end_time: e.target.value })}
          className={INPUT_CLASS}
          disabled={saving}
        />
      </Field>
    </div>
  );

  return (
    <ProviderPage
      title={t('provider.hours.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !days}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
      footer={days ? <PrimaryAction onClick={handleSave} disabled={!canSave} busy={saving}>{t('provider.common.save')}</PrimaryAction> : undefined}
    >
      {days && (
        <div className="space-y-5">
          <SaveError message={saveError} />

          <Question hint={t('provider.hours.description')}>{t('provider.hours.daysQuestion')}</Question>
          <div role="group" aria-label={t('provider.hours.daysQuestion')} className="grid grid-cols-7 gap-1.5">
            {SHOWN_ORDER.map((weekday) => {
              const day = days.find((d) => d.weekday === weekday)!;
              return (
                <button
                  key={weekday}
                  type="button"
                  aria-pressed={day.is_working}
                  aria-label={weekdayName(weekday)}
                  disabled={saving}
                  onClick={() => toggleDay(weekday)}
                  className={cn(
                    'flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-[3px] text-sm font-bold transition-colors active:scale-95',
                    day.is_working ? 'border-primary bg-primary text-primary-foreground' : 'border-transparent bg-card text-muted-foreground shadow-sm',
                  )}
                >
                  {day.is_working ? <Check className="h-5 w-5" aria-hidden="true" /> : <span className="h-5" aria-hidden="true" />}
                  <span className="truncate max-w-full px-0.5">{weekdayShort(weekday)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-base font-medium text-foreground">
            {working.length === 0 ? t('provider.hours.noDays') : t('provider.hours.daysCount', { count: working.length })}
          </p>

          {working.length > 0 && (
            <>
              <Question>{t('provider.hours.timesQuestion')}</Question>
              {!perDay && shared && (
                <Panel className="space-y-3">
                  {timePair('all', shared, setShared, t('provider.hours.from'), t('provider.hours.to'))}
                  {!dayValid(shared) && <p className="text-sm text-destructive">{t('provider.hours.invalid')}</p>}
                  {!shared.start_time && !shared.end_time && (
                    <button
                      type="button"
                      onClick={() => setShared({ start_time: DEFAULT_START, end_time: DEFAULT_END })}
                      className="min-h-[44px] text-base font-semibold text-primary"
                    >
                      {t('provider.hours.useUsual', { from: DEFAULT_START, to: DEFAULT_END })}
                    </button>
                  )}
                </Panel>
              )}
              <Panel>
                <SwitchRow
                  id="hours-per-day"
                  label={t('provider.hours.perDayLabel')}
                  hint={t('provider.hours.perDayHint')}
                  checked={perDay}
                  onCheckedChange={switchPerDay}
                  disabled={saving}
                />
              </Panel>
              {perDay && SHOWN_ORDER.map((weekday) => {
                const day = days.find((d) => d.weekday === weekday)!;
                if (!day.is_working) return null;
                return (
                  <Panel key={weekday} className="space-y-3">
                    <p className="text-base font-bold text-foreground">{weekdayName(weekday)}</p>
                    {timePair(String(weekday), day, (change) => update(weekday, change), t('provider.hours.from'), t('provider.hours.to'))}
                    {!dayValid(day) && <p className="text-sm text-destructive">{t('provider.hours.invalid')}</p>}
                  </Panel>
                );
              })}
            </>
          )}
        </div>
      )}
    </ProviderPage>
  );
}
