import { useTranslation } from 'react-i18next';
import { CalendarCheck, Inbox, type LucideIcon } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { EmptyState } from '@/components/layout/EmptyState';
import { ReachCard } from '@/components/identity/ReachCard';
import { ROLE_ICONS } from '@/components/identity/RoleOptionList';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountRole } from '@/lib/accountRoles';

type WorkspaceRole = Exclude<AccountRole, 'FARMER'>;

// What each home will hold once the later tasks add content. Until then every
// section is an empty state; no sample card is ever shown.
const EMPTY_SECTIONS: Record<WorkspaceRole, { key: string; icon: LucideIcon }[]> = {
  SERVICE_PROVIDER: [
    { key: 'requests', icon: Inbox },
    { key: 'jobs', icon: CalendarCheck },
  ],
  CUSTOMER: [{ key: 'produce', icon: ROLE_ICONS.CUSTOMER }],
};

/**
 * Home shell of the Provider (while its workspace flag is off) and Customer
 * workspaces: the role and greeting in large type, a coloured card that says
 * what this workspace is for, the Reach card, and empty states for the
 * content the later tasks bring.
 */
export default function WorkspaceHome({ role }: { role: WorkspaceRole }) {
  const { t } = useTranslation();
  const account = useAccountStore((s) => s.account);
  const RoleIcon = ROLE_ICONS[role];

  return (
    <PageShell variant="gradient-soft">
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{t(`identity.roles.${role}.name`)}</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground break-words">
          {t('identity.home.greeting', { name: account?.displayName ?? '' })}
        </h1>
      </div>

      <div className="flex items-center gap-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-md">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/20">
          <RoleIcon className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{t(`identity.roles.${role}.name`)}</p>
          <p className="text-sm opacity-90 mt-1">{t(`identity.roles.${role}.description`)}</p>
        </div>
      </div>

      <ReachCard role={role} />

      {EMPTY_SECTIONS[role].map(({ key, icon }) => (
        <EmptyState
          key={key}
          icon={icon}
          title={t(`identity.home.${role}.${key}Title`)}
          description={t(`identity.home.${role}.${key}Description`)}
        />
      ))}
    </PageShell>
  );
}
