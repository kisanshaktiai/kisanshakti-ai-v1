import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { hapticFeedback } from '@/lib/haptics';
import { useAccountStore } from '@/stores/accountStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { accountSessionService } from '@/services/accountSessionService';
import { FarmerAuthError, farmerAuthService } from '@/services/farmerAuthService';
import { accountErrorMessage } from '@/lib/accountErrors';
import { preloadWorkspaces } from '@/lib/workspacePreload';
import { ROLE_ICONS, RolePicture } from '@/components/identity/RoleOptionList';
import { ACCOUNT_ROLES, ROUTE_ROLES, activeRolesOf, workspaceRoleOf, type AccountRole } from '@/lib/accountRoles';

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

/** Side of the round button, in px, per variant: the card opens exactly over it. */
const BUTTON_PX = { header: 44, floating: 48 } as const;

/**
 * Workspace Switcher — one round picture of the open workspace. A tap opens,
 * in the same place, the pictures of the workspaces the person holds; a tap on
 * one of them opens that workspace. No second screen and no bottom sheet.
 * Rendered only for people with more than one active role.
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

  const handleOpenChange = (next: boolean) => {
    if (switchingTo) return; // the card stays until the workspace has opened or the server has refused
    setError(null);
    setOpen(next);
    if (next && isOnline) {
      // While the person looks at the choices: load the screens they may open,
      // and wake the server so the switch itself does not wait for it to start.
      preloadWorkspaces(held.filter((role) => role !== current));
      farmerAuthService.sessionInfo().catch(() => { /* only a wake-up call; the switch reports real failures */ });
    }
  };

  const handleSwitch = async (role: AccountRole) => {
    if (switchingTo) return;
    if (role === current) { setOpen(false); return; }
    hapticFeedback('light');
    setError(null);
    if (!isOnline) {
      setError(t('identity.switcher.offline'));
      return;
    }
    setSwitchingTo(role);
    try {
      // Requests still on their way belong to the workspace being left.
      await queryClient.cancelQueries();
      const destination = await accountSessionService.switchWorkspace(role);
      // Every workspace on this device belongs to the same person, and only
      // farmer screens read this cache: what is already read is kept and marked
      // as old, so a farmer screen shows at once when the person comes back and
      // refreshes itself then (nothing is asked for from the workspace being left).
      void queryClient.invalidateQueries({ refetchType: 'none' });
      setOpen(false);
      navigate(destination, { replace: true });
    } catch (err) {
      // Still in the same workspace: read again what was stopped.
      void queryClient.invalidateQueries();
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

  const tile = 'flex w-[5.25rem] min-h-[92px] flex-col items-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors active:scale-[0.97] disabled:opacity-60';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('identity.switcher.open', { role: t(`identity.roles.${current}.name`) })}
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-card shadow-sm transition-transform active:scale-95',
            variant === 'header' ? 'h-11 w-11' : 'fixed left-3 bottom-40 z-40 h-12 w-12 shadow-lg',
          )}
        >
          <RolePicture role={current} className={variant === 'floating' ? 'h-9 w-9' : undefined} />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side={variant === 'header' ? 'bottom' : 'top'}
        align="start"
        sideOffset={-BUTTON_PX[variant]}
        collisionPadding={8}
        className="w-auto max-w-[calc(100vw-1rem)] rounded-3xl border-border p-2 shadow-xl"
      >
        <div role="radiogroup" aria-label={t('identity.switcher.title')} aria-busy={!!switchingTo} className="flex items-stretch gap-1">
          {held.map((role) => {
            const Icon = ROLE_ICONS[role];
            const isCurrent = role === current;
            const isOpening = switchingTo === role;
            return (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={isCurrent}
                disabled={!!switchingTo && !isOpening}
                onClick={() => handleSwitch(role)}
                className={cn(tile, isCurrent ? 'bg-primary/10' : 'hover:bg-muted/60')}
              >
                <span
                  className={cn(
                    'relative flex h-14 w-14 items-center justify-center rounded-full',
                    isCurrent || isOpening ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
                  )}
                >
                  {isOpening
                    ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
                    : <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />}
                  {isCurrent && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-popover bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </span>
                <span className={cn('text-xs leading-tight text-foreground break-words', isCurrent ? 'font-bold' : 'font-semibold')}>
                  {t(`identity.roles.${role}.name`)}
                </span>
                {isCurrent && <span className="sr-only">{t('identity.switcher.current')}</span>}
              </button>
            );
          })}
          {held.length < ACCOUNT_ROLES.length && (
            <button
              type="button"
              disabled={!!switchingTo}
              onClick={() => { setOpen(false); navigate(ROUTE_ROLES); }}
              className={cn(tile, 'hover:bg-muted/60')}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground">
                <Plus className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="text-xs font-semibold leading-tight text-muted-foreground break-words">{t('identity.switcher.addRole')}</span>
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 max-w-[17rem] px-2 pb-1 text-sm font-medium leading-snug text-destructive">{error}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
