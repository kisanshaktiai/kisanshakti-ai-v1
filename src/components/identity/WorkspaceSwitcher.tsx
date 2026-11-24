import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useAccountStore } from '@/stores/accountStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { accountSessionService } from '@/services/accountSessionService';
import { FarmerAuthError } from '@/services/farmerAuthService';
import { accountErrorMessage } from '@/lib/accountErrors';
import { ROLE_ICONS } from '@/components/identity/RoleOptionList';
import { ROUTE_ROLES, activeRolesOf, workspaceRoleOf, type AccountRole } from '@/lib/accountRoles';

interface WorkspaceSwitcherProps {
  /** 'header' sits inside a workspace header; 'floating' is laid over the farmer app. */
  variant: 'header' | 'floating';
}

// Farmer screens that take the whole viewport (same list as AppLayout).
const isFarmerFullScreen = (path: string) =>
  path === '/app/chat' ||
  (path.includes('/app/community/') && path.includes('/chat')) ||
  path === '/app/lands/add' ||
  /^\/app\/lands\/[^/]+\/edit$/.test(path);

/**
 * Workspace Switcher — a chip showing the open workspace and a sheet listing
 * the workspaces the person holds. Rendered only for people with more than one
 * active role; everyone else never sees it.
 */
export function WorkspaceSwitcher({ variant }: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isOnline = useOfflineStatus();
  const account = useAccountStore((s) => s.account);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<AccountRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const held = activeRolesOf(account);
  const current = workspaceRoleOf(account);
  if (!account || !current || held.length < 2) return null;
  if (variant === 'floating' && isFarmerFullScreen(location.pathname)) return null;

  const CurrentIcon = ROLE_ICONS[current];

  const handleSwitch = async (role: AccountRole) => {
    if (role === current || switchingTo) return;
    setError(null);
    if (!isOnline) {
      setError(t('identity.switcher.offline'));
      return;
    }
    setSwitchingTo(role);
    try {
      const destination = await accountSessionService.switchWorkspace(role);
      // Nothing cached for one workspace may be shown in another.
      queryClient.clear();
      setOpen(false);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err instanceof FarmerAuthError && err.code === 'transport_unavailable'
          ? t('identity.switcher.offline')
          : err instanceof FarmerAuthError
            ? accountErrorMessage(err)
            : t('identity.switcher.failed'),
      );
    } finally {
      setSwitchingTo(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        aria-haspopup="dialog"
        aria-label={t('identity.switcher.open', { role: t(`identity.roles.${current}.name`) })}
        className={cn(
          'flex items-center gap-1.5 rounded-full border border-primary/30 bg-card text-foreground shadow-sm',
          'h-11 pl-2 pr-3 text-sm font-semibold active:scale-[0.98] transition-transform',
          variant === 'floating' && 'fixed left-3 bottom-24 z-40 shadow-lg',
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
          <CurrentIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="max-w-[6.5rem] truncate">{t(`identity.roles.${current}.name`)}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader className="text-left">
            <SheetTitle>{t('identity.switcher.title')}</SheetTitle>
            <SheetDescription>{t('identity.switcher.description')}</SheetDescription>
          </SheetHeader>

          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <ul className="mt-4 space-y-2">
            {held.map((role) => {
              const Icon = ROLE_ICONS[role];
              const isCurrent = role === current;
              return (
                <li key={role}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(role)}
                    disabled={!!switchingTo}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cn(
                      'w-full min-h-[64px] flex items-center gap-3 rounded-2xl border-2 p-3 text-left',
                      isCurrent ? 'border-primary bg-primary/10' : 'border-border bg-card',
                    )}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-semibold text-foreground">
                        {t(`identity.roles.${role}.name`)}
                      </span>
                      {isCurrent && (
                        <span className="block text-xs text-primary">{t('identity.switcher.current')}</span>
                      )}
                    </span>
                    {switchingTo === role ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                    ) : (
                      isCurrent && <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => { setOpen(false); navigate(ROUTE_ROLES); }}
                disabled={!!switchingTo}
                className="w-full min-h-[56px] flex items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3 text-left"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-base font-semibold text-foreground">{t('identity.switcher.addRole')}</span>
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
