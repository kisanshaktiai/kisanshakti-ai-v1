import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Check, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/layout/EmptyState';
import { ReachCard, ReachSheet } from '@/components/identity/ReachCard';
import { ProviderPage, SaveError, SwitchRow } from '@/components/provider/ProviderUi';
import { useAccountStore } from '@/stores/accountStore';
import { useProviderWorkspace } from '@/hooks/useProviderWorkspace';
import { providerWorkspaceService, type ProviderWorkspace } from '@/services/providerWorkspaceService';
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

/**
 * Home of the Provider Workspace: whether farmers can book the provider right
 * now (worked out by the server from working hours, days off and the accepting
 * switch), the steps to get listed, and the area served.
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
  const allDone = steps.length > 0 && steps.every((s) => s.done);
  const listing = profile?.listing_status ?? 'DRAFT';

  const openStep = (key: StepKey) => {
    if (key === 'reach') { setReachOpen(true); return; }
    if (key === 'profile') navigate(PROVIDER_ROUTES.profile);
    else if (key === 'service') navigate(workspace?.services.length ? PROVIDER_ROUTES.services : PROVIDER_ROUTES.serviceNew);
    else navigate(PROVIDER_ROUTES.hours);
  };

  const availability = workspace?.availability;
  const availabilityText = availability
    ? availability.state === 'BUSY' && availability.next_free_date
      ? t('provider.availability.busyUntil', { date: formatDay(availability.next_free_date) })
      : t(`provider.availability.${availability.state}`)
    : '';

  return (
    <ProviderPage
      title={t('identity.home.greeting', { name: account?.displayName ?? '' })}
      pending={loading && !workspace}
      loadError={loadError}
      onRetry={reload}
      isOnline={isOnline}
    >
      {workspace && (
        <>
          <SaveError message={saveError} />

          <Card className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-1.5 h-3 w-3 shrink-0 rounded-full',
                  availability?.state === 'AVAILABLE' ? 'bg-primary' : 'bg-muted-foreground',
                )}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">{t('provider.availability.title')}</p>
                <p className="text-lg font-semibold text-foreground break-words">{availabilityText}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(`provider.availability.hint.${availability?.state ?? 'OFFLINE'}`)}
                </p>
              </div>
            </div>
            {profile && (
              <>
                <SwitchRow
                  id="provider-accepting"
                  label={t('provider.availability.acceptingLabel')}
                  hint={t('provider.availability.acceptingHint')}
                  checked={profile.accepts_requests}
                  disabled={saving || !isOnline}
                  onCheckedChange={(checked) => run(() => providerWorkspaceService.setAccepting(checked))}
                />
                <Button
                  variant="outline"
                  className="w-full h-12 text-base"
                  onClick={() => navigate(PROVIDER_ROUTES.daysOff)}
                >
                  <CalendarOff className="w-4 h-4 mr-2" aria-hidden="true" />
                  {t('provider.availability.markBusy')}
                </Button>
              </>
            )}
          </Card>

          {listing === 'DRAFT' && (
            <Card className="p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{t('provider.setup.title')}</h2>
                <p className="text-sm text-muted-foreground">{t('provider.setup.description')}</p>
              </div>
              {profile?.review_note_code && (
                <p className="rounded-2xl bg-muted p-3 text-sm text-foreground">
                  {t('provider.listing.returned')}{' '}
                  {t(`provider.listing.notes.${profile.review_note_code}`, { defaultValue: t('provider.listing.notes.generic') })}
                </p>
              )}
              <ol className="space-y-2">
                {steps.map((step, index) => {
                  // A step opens once the business profile exists (the server needs it first).
                  const locked = step.key !== 'profile' && step.key !== 'reach' && !profile;
                  return (
                    <li key={step.key}>
                      <button
                        type="button"
                        onClick={() => openStep(step.key)}
                        disabled={locked || (step.key === 'reach' && !isOnline)}
                        className="w-full min-h-[60px] flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left disabled:opacity-60"
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                            step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {step.done ? <Check className="h-5 w-5" aria-hidden="true" /> : index + 1}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold text-foreground">
                            {t(`provider.setup.steps.${step.key}.title`)}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {t(`provider.setup.steps.${step.key}.${step.done ? 'done' : 'todo'}`)}
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ol>
              <Button
                className="w-full h-12 text-base"
                disabled={!allDone || saving || !isOnline}
                onClick={() => run(() => providerWorkspaceService.submitForReview())}
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                {t('provider.setup.submit')}
              </Button>
              {!allDone && <p className="text-xs text-muted-foreground">{t('provider.setup.submitHint')}</p>}
            </Card>
          )}

          {listing !== 'DRAFT' && (
            <Card className="p-4 space-y-1">
              <p className="text-sm text-muted-foreground">{t('provider.listing.title')}</p>
              <p className="text-lg font-semibold text-foreground">{t(`provider.listing.${listing}.name`)}</p>
              <p className="text-sm text-muted-foreground">{t(`provider.listing.${listing}.description`)}</p>
              {profile?.review_note_code && (
                <p className="text-sm text-foreground pt-1">
                  {t(`provider.listing.notes.${profile.review_note_code}`, { defaultValue: t('provider.listing.notes.generic') })}
                </p>
              )}
            </Card>
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
