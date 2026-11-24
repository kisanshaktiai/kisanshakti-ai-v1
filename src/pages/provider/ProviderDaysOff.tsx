import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/EmptyState';
import { Field, INPUT_CLASS, NativeSelect, ProviderPage, SaveError } from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type Blackout } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { formatDay } from '@/lib/providerText';

// Reason codes the provider may give. The reason stays with the provider:
// farmers only ever see "busy until <date>".
const REASON_CODES = ['OTHER_WORK', 'MAINTENANCE', 'PERSONAL', 'WEATHER', 'FESTIVAL'];

const pad = (n: number) => String(n).padStart(2, '0');
/** The device's own calendar day as "YYYY-MM-DD". */
const dayValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const startOfDay = (value: string) => new Date(`${value}T00:00:00`);
/** The first instant after the chosen last day. */
const endOfDay = (value: string) => {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
};

/** "3 Dec 2026" for one day, "3 Dec 2026 – 6 Dec 2026" for several. */
function periodText(blackout: Blackout): string {
  const from = new Date(blackout.from);
  // The stored end is exclusive; show the last day that is actually blocked.
  const last = new Date(new Date(blackout.to).getTime() - 1);
  const a = formatDay(from);
  const b = formatDay(last);
  return a === b ? a : `${a} – ${b}`;
}

/**
 * Days off ("I am busy"): periods in which the provider cannot take work.
 * While a period runs, farmers see the provider as busy until the next free
 * working day — never where the provider is or for whom they work.
 */
export default function ProviderDaysOff() {
  const { t } = useTranslation();
  const { workspace, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();
  const today = dayValue(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');

  const maxDays = workspace?.policy.max_blackout_days ?? 0;
  const span = from && to ? Math.round((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) : 0;
  const valid = !!from && !!to && to >= from && to >= today && span <= maxDays;
  const canAdd = valid && !saving && isOnline;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const ok = await run(() => providerWorkspaceService.addBlackout(startOfDay(from), endOfDay(to), reason || null));
    if (ok) { setFrom(today); setTo(today); setReason(''); }
  };

  const blackouts = workspace?.blackouts ?? [];

  return (
    <ProviderPage
      title={t('provider.daysOff.title')}
      backTo={PROVIDER_ROUTES.business}
      pending={loading && !workspace}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {workspace && (
        <>
          <p className="text-sm text-muted-foreground">{t('provider.daysOff.description')}</p>
          <SaveError message={saveError} />

          <Card className="p-4">
            <form onSubmit={handleAdd} className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">{t('provider.daysOff.addTitle')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('provider.daysOff.from')} htmlFor="daysoff-from">
                  <Input
                    id="daysoff-from"
                    type="date"
                    min={today}
                    value={from}
                    onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }}
                    className={INPUT_CLASS}
                    disabled={saving}
                    required
                  />
                </Field>
                <Field label={t('provider.daysOff.to')} htmlFor="daysoff-to">
                  <Input
                    id="daysoff-to"
                    type="date"
                    min={from || today}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className={INPUT_CLASS}
                    disabled={saving}
                    required
                  />
                </Field>
              </div>
              {!valid && from && to && (
                <p className="text-xs text-destructive">{t('provider.daysOff.invalid', { count: maxDays })}</p>
              )}
              <Field label={t('provider.daysOff.reasonLabel')} htmlFor="daysoff-reason" hint={t('provider.daysOff.reasonHint')}>
                <NativeSelect
                  id="daysoff-reason"
                  value={reason}
                  onChange={setReason}
                  options={REASON_CODES.map((code) => ({ value: code, label: t(`provider.daysOff.reasons.${code}`) }))}
                  placeholder={t('provider.common.notSet')}
                  disabled={saving}
                />
              </Field>
              <Button type="submit" className="w-full h-12 text-base" disabled={!canAdd}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                {t('provider.daysOff.add')}
              </Button>
            </form>
          </Card>

          {blackouts.length === 0 && (
            <EmptyState
              icon={CalendarOff}
              title={t('provider.daysOff.emptyTitle')}
              description={t('provider.daysOff.emptyDescription')}
            />
          )}

          {blackouts.map((blackout) => (
            <Card key={blackout.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground break-words">{periodText(blackout)}</p>
                <p className="text-sm text-muted-foreground">
                  {blackout.source === 'JOB'
                    ? t('provider.daysOff.fromJob')
                    : blackout.reason_code
                      ? t(`provider.daysOff.reasons.${blackout.reason_code}`, { defaultValue: t('provider.daysOff.ownEntry') })
                      : t('provider.daysOff.ownEntry')}
                </p>
              </div>
              {blackout.source === 'MANUAL' && (
                <Button
                  variant="outline"
                  className="h-12 shrink-0"
                  disabled={saving || !isOnline}
                  onClick={() => run(() => providerWorkspaceService.cancelBlackout(blackout.id))}
                >
                  <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {t('provider.daysOff.cancel')}
                </Button>
              )}
            </Card>
          ))}
        </>
      )}
    </ProviderPage>
  );
}
