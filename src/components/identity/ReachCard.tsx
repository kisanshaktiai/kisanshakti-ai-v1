import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReachEditor } from '@/components/identity/ReachEditor';
import { useAccountStore } from '@/stores/accountStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import type { AccountRole } from '@/lib/accountRoles';

type ReachRole = Exclude<AccountRole, 'FARMER'>;

interface ReachSheetProps {
  role: ReachRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bottom sheet holding the Reach editor (village + radius slider). */
export function ReachSheet({ role, open, onOpenChange }: ReachSheetProps) {
  const { t } = useTranslation();
  const reach = useAccountStore((s) => s.reach[role]) ?? null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl pb-safe max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle>{t('identity.reach.title')}</SheetTitle>
          <SheetDescription>{t('identity.onboarding.reachDescription')}</SheetDescription>
        </SheetHeader>
        {open && (
          <ReachEditor
            roles={[role]}
            initial={reach}
            submitLabel={t('identity.reach.save')}
            onSaved={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** One line for the saved Reach: "<village> · <km> km", or the not-set text. */
function useReachSummary(role: ReachRole) {
  const { t } = useTranslation();
  const reach = useAccountStore((s) => s.reach[role]) ?? null;
  const isSet = !!reach?.is_set && reach.radius_km != null;
  const summary = isSet
    ? t('identity.reach.summary', {
        village: reach!.village_name || t('identity.reach.villageSaved'),
        km: reach!.radius_km,
      })
    : t('identity.reach.notSet');
  return { reach, isSet, summary };
}

/** Header control: the base village with the radius, as a button. */
export function ReachHeaderButton({ role }: { role: ReachRole }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isOnline = useOfflineStatus();
  const { isSet, summary } = useReachSummary(role);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!isOnline}
        aria-label={t('identity.reach.headerLabel', { summary })}
        className="flex h-11 max-w-[9.5rem] items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground disabled:opacity-60"
      >
        <MapPin className={isSet ? 'h-4 w-4 shrink-0 text-primary' : 'h-4 w-4 shrink-0 text-muted-foreground'} aria-hidden="true" />
        <span className="truncate">{isSet ? summary : t('identity.reach.set')}</span>
      </button>
      <ReachSheet role={role} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Reach card on the workspace home: the saved area, how many changes are left
 * in the window, and the way to set or change it.
 */
export function ReachCard({ role }: { role: ReachRole }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isOnline = useOfflineStatus();
  const { reach, isSet, summary } = useReachSummary(role);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{t('identity.reach.title')}</p>
          <p className="text-base font-semibold text-foreground break-words">{summary}</p>
          {isSet && reach && (
            <p className="text-xs text-muted-foreground mt-1">
              {t('identity.reach.changesRemaining', {
                count: reach.changes_remaining,
                days: reach.policy.change_limit_window_days,
              })}
            </p>
          )}
          {!isSet && <p className="text-xs text-muted-foreground mt-1">{t('identity.reach.whyNeeded')}</p>}
        </div>
      </div>
      <Button
        variant={isSet ? 'outline' : 'default'}
        className="w-full h-12 text-base"
        onClick={() => setOpen(true)}
        disabled={!isOnline}
      >
        {isSet ? t('identity.reach.change') : t('identity.reach.set')}
      </Button>
      {!isOnline && <p className="text-xs text-muted-foreground">{t('identity.reach.offline')}</p>}
      <ReachSheet role={role} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
