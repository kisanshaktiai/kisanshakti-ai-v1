import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { ROLE_ICONS } from '@/components/identity/RoleOptionList';
import { useAccountStore } from '@/stores/accountStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { accountSessionService } from '@/services/accountSessionService';
import { accountErrorMessage } from '@/lib/accountErrors';
import {
  ACCOUNT_ROLES,
  WORKSPACE_HOME,
  roleStatusOf,
  workspaceRoleOf,
  type AccountRole,
} from '@/lib/accountRoles';

/**
 * Roles — the standalone page where a signed-in person sees the roles they
 * hold and adds another one. Adding never asks for a new mobile number or PIN:
 * the server attaches the role to the same person (and, when a person without
 * the Farmer role adds it, moves the one credential copy to the farmer record).
 */
export default function RolesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useOfflineStatus();
  const account = useAccountStore((s) => s.account);
  const [busy, setBusy] = useState<AccountRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!account) return null; // WorkspaceRoute redirects
  const current = workspaceRoleOf(account);

  const run = async (role: AccountRole, action: 'add' | 'open') => {
    setError(null);
    setNotice(null);
    if (!isOnline) {
      setError(t('identity.switcher.offline'));
      return;
    }
    setBusy(role);
    try {
      if (action === 'add') {
        const status = await accountSessionService.addRole(role);
        setNotice(t(`identity.rolesPage.added.${status}`, { role: t(`identity.roles.${role}.name`) }));
      } else {
        const destination = await accountSessionService.switchWorkspace(role);
        queryClient.clear();
        navigate(destination, { replace: true });
      }
    } catch (err) {
      setError(accountErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-mobile-screen bg-background">
      <header className="glass-header sticky top-0 z-40 h-14 flex items-center gap-2 px-3 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('auth.back')}
          onClick={() => navigate(current ? WORKSPACE_HOME[current] : '/', { replace: true })}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">{t('identity.rolesPage.title')}</h1>
      </header>

      <div className="px-4 py-4 space-y-4 max-w-md mx-auto">
        <p className="text-sm text-muted-foreground">{t('identity.rolesPage.description')}</p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <ul className="space-y-3">
          {ACCOUNT_ROLES.map((role) => {
            const Icon = ROLE_ICONS[role];
            const status = roleStatusOf(account, role);
            const isCurrent = role === current;
            return (
              <li
                key={role}
                className={cn(
                  'rounded-2xl border-2 p-4 space-y-3',
                  status === 'ACTIVE' ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground">{t(`identity.roles.${role}.name`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`identity.roles.${role}.description`)}</p>
                  </div>
                </div>

                {status === null && (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-base"
                    disabled={!!busy}
                    onClick={() => run(role, 'add')}
                  >
                    {busy === role && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                    {t('identity.rolesPage.add')}
                  </Button>
                )}
                {status === 'ACTIVE' && isCurrent && (
                  <p className="text-sm font-semibold text-primary">{t('identity.switcher.current')}</p>
                )}
                {status === 'ACTIVE' && !isCurrent && (
                  <Button className="w-full h-12 text-base" disabled={!!busy} onClick={() => run(role, 'open')}>
                    {busy === role && <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />}
                    {t('identity.rolesPage.open')}
                  </Button>
                )}
                {status !== null && status !== 'ACTIVE' && (
                  <p className="text-sm text-muted-foreground">{t(`identity.rolesPage.status.${status}`)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
