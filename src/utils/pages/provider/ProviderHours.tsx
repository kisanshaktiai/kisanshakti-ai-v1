import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProviderPage, SaveError, SwitchRow } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type WorkingDay } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { clockValue, weekdayName } from '@/lib/providerText';

// 0 = Sunday … 6 = Saturday, as the server counts.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

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

/**
 * Working hours: for each day of the week, whether the provider works and from
 * when to when. The server uses them, with the days off, to tell farmers
 * whether the provider is free.
 */
export default function ProviderHours() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();
  const [days, setDays] = useState<WorkingDay[] | null>(null);

  useEffect(() => {
    if (!days && workspace) setDays(toForm(workspace.working_hours));
  }, [days, workspace]);

  const update = (weekday: number, change: Partial<WorkingDay>) =>
    setDays((current) => current?.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)) ?? null);

  const firstWorking = days?.find((d) => d.is_working && dayValid(d));
  const copyToAll = () => {
    if (!firstWorking) return;
    setDays((current) => current?.map((d) => ({
      ...d, is_working: true, start_time: firstWorking.start_time, end_time: firstWorking.end_time,
    })) ?? null);
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

  return (
    <ProviderPage
      title={t('provider.hours.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={(loading && !workspace) || !days}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {days && (
        <>
          <p className="text-sm text-muted-foreground">{t('provider.hours.description')}</p>
          <SaveError message={saveError} />

          {days.map((day) => (
            <Card key={day.weekday} className="p-4 space-y-3">
              <SwitchRow
                id={`hours-working-${day.weekday}`}
                label={weekdayName(day.weekday)}
                hint={t(day.is_working ? 'provider.hours.working' : 'provider.hours.dayOff')}
                checked={day.is_working}
                onCheckedChange={(checked) => update(day.weekday, { is_working: checked })}
                disabled={saving}
              />
              {day.is_working && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor={`hours-start-${day.weekday}`} className="text-sm text-muted-foreground">{t('provider.hours.from')}</label>
                    <Input
                      id={`hours-start-${day.weekday}`}
                      type="time"
                      value={day.start_time ?? ''}
                      onChange={(e) => update(day.weekday, { start_time: e.target.value })}
                      className="h-14 text-lg rounded-2xl"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`hours-end-${day.weekday}`} className="text-sm text-muted-foreground">{t('provider.hours.to')}</label>
                    <Input
                      id={`hours-end-${day.weekday}`}
                      type="time"
                      value={day.end_time ?? ''}
                      onChange={(e) => update(day.weekday, { end_time: e.target.value })}
                      className="h-14 text-lg rounded-2xl"
                      disabled={saving}
                    />
                  </div>
                  {!dayValid(day) && (
                    <p className="col-span-2 text-xs text-destructive">{t('provider.hours.invalid')}</p>
                  )}
                </div>
              )}
            </Card>
          ))}

          <Button variant="outline" className="w-full h-12 text-base" onClick={copyToAll} disabled={!firstWorking || saving}>
            <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('provider.hours.copyToAll')}
          </Button>
          <Button className="w-full h-12 text-base" onClick={handleSave} disabled={!canSave}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
            {t('provider.common.save')}
          </Button>
        </>
      )}
    </ProviderPage>
  );
}
