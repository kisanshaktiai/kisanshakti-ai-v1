import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarOff, Check, Inbox, MapPin, Store, Wrench, TreePine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/EmptyState';
import { ReachCard, ReachSheet } from '@/components/identity/ReachCard';
import { Switch } from '@/components/ui/switch';
import { Panel, PrimaryAction, ProviderPage, SaveError } from '@/components/provider/ProviderUi';
import { useAccountStore } from '@/stores/accountStore';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type AvailabilityState, type ProviderWorkspace } from '@/services/providerWorkspaceService';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';
import { formatDay } from '@/lib/providerText';
import { cn } from '@/lib/utils';

type StepKey = 'profile' | 'service' | 'hours' | 'reach';

/** What is still needed before the listing can be sent for review, in order. */
function setupSteps(workspace: ProviderWorkspace, reachSet: boolean): { key: StepKey; done: boolean }[] {
  return [
    { key: 'profile', done: !!workspace.profile },
    { key: 'service', done: workspace.services.some((s) => s.status === 'ACTIVE') },
    { key: 'hours', done: workspace.working_hours.some((d) => d.is_working) },
    { key: 'reach', done: reachSet },
  ];
}

const STEP_ICONS = { profile: Store, service: Wrench, hours: CalendarOff, reach: MapPin } as const;

// The big status card: colour and icon say the state before the words do.
const STATE_CARD: Record<AvailabilityState, string> = {
  AVAILABLE: 'bg-primary text-primary-foreground',
  BUSY: 'bg-warning-soft text-warning-foreground',
  NOT_ACCEPTING: 'bg-muted text-foreground',
  OFFLINE: 'bg-muted text-foreground',
};

/**
 * Home of the Provider Workspace: how farmers see the provider right now
 * (worked out by the server from working hours, busy days and the accepting
 * switch), the four steps to get listed, and shortcuts into the business.
 */
export default function ProviderHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.account);
  const reachIsSet = useAccountStore((s) => !!s.reach.SERVICE_PROVIDER?.is_set);
  const { workspace, loading, loadError, isOnline, saving, saveError, run, reload } = useProviderWorkspace();
  const [reachOpen, setReachOpen] = useState(false);

  const profile = workspace?.profile ?? null;
  // The Reach can be saved on this screen after the workspace was read.
  const steps = workspace ? setupSteps(workspace, workspace.reach_set || reachIsSet) : [];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = steps.length > 0 && doneCount === steps.length;
  const nextStep = steps.find((s) => !s.done);
  const listing = profile?.listing_status ?? 'DRAFT';

  const openStep = (key: StepKey) => {
    if (key === 'reach') { setReachOpen(true); return; }
    if (key === 'profile') navigate(PROVIDER_ROUTES.profile);
    else if (key === 'service') navigate(workspace?.services.length ? PROVIDER_ROUTES.services : PROVIDER_ROUTES.serviceNew);
    else navigate(PROVIDER_ROUTES.hours);
  };

  const availability = workspace?.availability;
  const state: AvailabilityState = availability?.state ?? 'OFFLINE';
  const availabilityText = availability
    ? state === 'BUSY' && availability.next_free_date
      ? t('provider.availability.busyUntil', { date: formatDay(availability.next_free_date) })
      : t(`provider.availability.${state}`)
    : '';
  const activeServices = workspace?.services.filter((s) => s.status === 'ACTIVE').length ?? 0;
  const readyPlants = workspace?.nursery_products.reduce(
    (sum, p) => sum + p.batches.reduce((n, b) => n + Math.max(0, b.total_qty - b.reserved_qty), 0), 0,
  ) ?? 0;

  return (
    <ProviderPage
      eyebrow={t('identity.roles.SERVICE_PROVIDER.name')}
      title={t('identity.home.greeting', { name: account?.displayName ?? '' })}
      pending={loading && !workspace}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {workspace && (
        <>
          <SaveError message={saveError} />

          <div className={cn('rounded-3xl p-5 space-y-4 shadow-md', STATE_CARD[state])}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium opacity-80">{t('provider.availability.title')}</p>
                <p className="text-2xl font-bold leading-tight break-words">{availabilityText}</p>
              </div>
              {profile && (
                <label htmlFor="provider-accepting" className="flex shrink-0 flex-col items-center gap-1">
                  <Switch
                    id="provider-accepting"
                    checked={profile.accepts_requests}
                    disabled={saving || !isOnline}
                    onCheckedChange={(checked) => run(() => providerWorkspaceService.setAccepting(checked))}
                    aria-label={t('provider.availability.acceptingLabel')}
                    className="h-9 w-16 [&>span]:h-8 [&>span]:w-8 [&>span]:data-[state=checked]:translate-x-7"
                  />
                  <span className="text-xs font-semibold opacity-90">{t('provider.availability.acceptingShort')}</span>
                </label>
              )}
            </div>
            <p className="text-sm opacity-80">{t(`provider.availability.hint.${state}`)}</p>
            {profile && (
              <Button
                variant="secondary"
                className="w-full h-14 rounded-2xl text-base font-semibold bg-background text-foreground hover:bg-background/90"
                onClick={() => navigate(PROVIDER_ROUTES.daysOff)}
              >
                <CalendarOff className="w-5 h-5 mr-2" aria-hidden="true" />
                {t('provider.availability.markBusy')}
              </Button>
            )}
          </div>

          {listing === 'DRAFT' && (
            <Panel className="space-y-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">{t('provider.setup.title')}</h2>
                <span className="text-sm font-semibold text-primary">
                  {t('provider.setup.progress', { done: doneCount, total: steps.length })}
                </span>
              </div>
              {profile?.review_note_code && (
                <p className="rounded-2xl bg-warning-soft p-3 text-base text-warning-foreground">
                  {t('provider.listing.returned')}{' '}
                  {t(`provider.listing.notes.${profile.review_note_code}`, { defaultValue: t('provider.listing.notes.generic') })}
                </p>
              )}
              <ol className="grid grid-cols-4 gap-2">
                {steps.map((step) => {
                  const Icon = STEP_ICONS[step.key];
                  // A step opens once the business profile exists (the server needs it first).
                  const locked = step.key !== 'profile' && step.key !== 'reach' && !profile;
                  const isNext = nextStep?.key === step.key;
                  return (
                    <li key={step.key}>
                      <button
                        type="button"
                        onClick={() => openStep(step.key)}
                        disabled={locked || (step.key === 'reach' && !isOnline)}
                        aria-label={`${t(`provider.setup.steps.${step.key}.title`)}: ${t(`provider.setup.steps.${step.key}.${step.done ? 'done' : 'todo'}`)}`}
                        className="flex w-full min-h-[96px] flex-col items-center gap-2 rounded-2xl p-1 text-center disabled:opacity-50"
                      >
                        <span
                          className={cn(
                            'flex h-14 w-14 items-center justify-center rounded-full',
                            step.done
                              ? 'bg-primary text-primary-foreground'
                              : isNext
                                ? 'bg-warning-soft text-warning-foreground ring-2 ring-warning'
                                : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {step.done ? <Check className="h-7 w-7" aria-hidden="true" /> : <Icon className="h-7 w-7" aria-hidden="true" />}
                        </span>
                        <span className={cn('text-xs leading-tight', step.done || isNext ? 'font-bold text-foreground' : 'font-medium text-muted-foreground')}>
                          {t(`provider.setup.steps.${step.key}.title`)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {nextStep ? (
                <PrimaryAction
                  onClick={() => openStep(nextStep.key)}
                  disabled={(nextStep.key !== 'profile' && nextStep.key !== 'reach' && !profile) || (nextStep.key === 'reach' && !isOnline)}
                  icon={ArrowRight}
                >
                  {t('provider.setup.next', { step: t(`provider.setup.steps.${nextStep.key}.title`) })}
                </PrimaryAction>
              ) : (
                <PrimaryAction
                  busy={saving}
                  disabled={!allDone || !isOnline}
                  onClick={() => run(() => providerWorkspaceService.submitForReview())}
                >
                  {t('provider.setup.submit')}
                </PrimaryAction>
              )}
              {!allDone && <p className="text-sm text-muted-foreground">{t('provider.setup.submitHint')}</p>}
            </Panel>
          )}

          {listing !== 'DRAFT' && (
            <Panel className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">{t('provider.listing.title')}</p>
              <p className="text-xl font-bold text-foreground">{t(`provider.listing.${listing}.name`)}</p>
              <p className="text-base text-muted-foreground">{t(`provider.listing.${listing}.description`)}</p>
              {profile?.review_note_code && (
                <p className="text-base text-foreground pt-1">
                  {t(`provider.listing.notes.${profile.review_note_code}`, { defaultValue: t('provider.listing.notes.generic') })}
                </p>
              )}
            </Panel>
          )}

          {profile && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate(PROVIDER_ROUTES.services)}
                className="flex min-h-[132px] flex-col gap-3 rounded-3xl bg-card p-4 text-left shadow-sm active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Wrench className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="text-lg font-bold leading-tight text-foreground">{t('provider.business.sections.services')}</span>
                <span className="text-sm text-muted-foreground">{t('provider.home.activeCount', { count: activeServices })}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate(PROVIDER_ROUTES.nursery)}
                className="flex min-h-[132px] flex-col gap-3 rounded-3xl bg-card p-4 text-left shadow-sm active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <TreePine className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="text-lg font-bold leading-tight text-foreground">{t('provider.business.sections.nursery')}</span>
                <span className="text-sm text-muted-foreground">{t('provider.home.readyPlants', { count: readyPlants })}</span>
              </button>
            </div>
          )}

          <ReachCard role="SERVICE_PROVIDER" />

          <EmptyState
            icon={Inbox}
            title={t('identity.home.SERVICE_PROVIDER.requestsTitle')}
            description={t('identity.home.SERVICE_PROVIDER.requestsDescription')}
          />
        </>
      )}
      <ReachSheet role="SERVICE_PROVIDER" open={reachOpen} onOpenChange={setReachOpen} />
    </ProviderPage>
  );
}
