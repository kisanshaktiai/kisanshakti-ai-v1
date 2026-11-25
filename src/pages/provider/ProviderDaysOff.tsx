import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/layout/EmptyState';
import {
  ChoiceChips, Field, INPUT_CLASS, Panel, PrimaryAction, ProviderPage, Question, SaveError, StatusBadge,
} from '@/components/provider/ProviderUi';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type Blackout } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { hapticFeedback } from '@/lib/haptics';
import { formatDay } from '@/lib/providerText';
import { cn } from '@/lib/utils';

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
const daysFromToday = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return dayValue(date);
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
 * Busy days ("I am busy"): periods in which the provider cannot take work.
 * Quick choices cover the common cases (today, tomorrow, a few days); the
 * dates can also be picked. While a period runs, farmers see the provider as
 * busy until the next free working day — never where the provider is or for
 * whom they work.
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

  const quick = [
    { key: 'today', from: today, to: today },
    { key: 'tomorrow', from: daysFromToday(1), to: daysFromToday(1) },
    { key: 'threeDays', from: today, to: daysFromToday(2) },
    { key: 'week', from: today, to: daysFromToday(6) },
  ];
  const pickQuick = (q: { from: string; to: string }) => { hapticFeedback('light'); setFrom(q.from); setTo(q.to); };

  const handleAdd = async () => {
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
      footer={workspace ? <PrimaryAction onClick={handleAdd} disabled={!canAdd} busy={saving} icon={CalendarOff}>{t('provider.daysOff.add')}</PrimaryAction> : undefined}
    >
      {workspace && (
        <div className="space-y-5">
          <SaveError message={saveError} />

          <Question hint={t('provider.daysOff.description')}>{t('provider.daysOff.whenQuestion')}</Question>
          <div role="group" aria-label={t('provider.daysOff.whenQuestion')} className="grid grid-cols-2 gap-3">
            {quick.map((q) => {
              const isOn = from === q.from && to === q.to;
              return (
                <button
                  key={q.key}
                  type="button"
                  aria-pressed={isOn}
                  disabled={saving}
                  onClick={() => pickQuick(q)}
                  className={cn(
                    'min-h-[64px] rounded-3xl border-[3px] px-3 text-lg font-bold transition-colors active:scale-[0.98]',
                    isOn ? 'border-primary bg-primary/10 text-foreground' : 'border-transparent bg-card text-foreground shadow-sm',
                  )}
                >
                  {t(`provider.daysOff.quick.${q.key}`)}
                </button>
              );
            })}
          </div>

          <Panel className="space-y-4">
            <p className="text-base font-bold text-foreground">{t('provider.daysOff.pickDates')}</p>
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
              <p className="text-sm text-destructive">{t('provider.daysOff.invalid', { count: maxDays })}</p>
            )}
            {valid && <p className="text-base font-medium text-foreground">{t('provider.daysOff.spanText', { count: span })}</p>}
          </Panel>

          <Field label={t('provider.daysOff.reasonLabel')} hint={t('provider.daysOff.reasonHint')}>
            <ChoiceChips
              label={t('provider.daysOff.reasonLabel')}
              options={REASON_CODES.map((code) => ({ value: code, label: t(`provider.daysOff.reasons.${code}`) }))}
              selected={reason ? [reason] : []}
              onToggle={(code) => setReason((r) => (r === code ? '' : code))}
              disabled={saving}
            />
          </Field>

          <h2 className="text-lg font-bold text-foreground pt-2">{t('provider.daysOff.listTitle')}</h2>
          {blackouts.length === 0 && (
            <EmptyState
              icon={CalendarOff}
              title={t('provider.daysOff.emptyTitle')}
              description={t('provider.daysOff.emptyDescription')}
            />
          )}

          {blackouts.map((blackout) => (
            <Panel key={blackout.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-lg font-bold leading-tight text-foreground break-words">{periodText(blackout)}</p>
                <StatusBadge tone={blackout.source === 'JOB' ? 'neutral' : 'busy'}>
                  {blackout.source === 'JOB'
                    ? t('provider.daysOff.fromJob')
                    : blackout.reason_code
                      ? t(`provider.daysOff.reasons.${blackout.reason_code}`, { defaultValue: t('provider.daysOff.ownEntry') })
                      : t('provider.daysOff.ownEntry')}
                </StatusBadge>
              </div>
              {blackout.source === 'MANUAL' && (
                <Button
                  variant="outline"
                  className="h-12 shrink-0 rounded-2xl"
                  disabled={saving || !isOnline}
                  onClick={() => run(() => providerWorkspaceService.cancelBlackout(blackout.id))}
                >
                  <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  {t('provider.daysOff.cancel')}
                </Button>
              )}
            </Panel>
          ))}
        </div>
      )}
    </ProviderPage>
  );
}
