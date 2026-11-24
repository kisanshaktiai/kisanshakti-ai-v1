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
 * Home shell of the Provider and Customer workspaces: greeting, the Reach
 * card, and empty states for the content the later tasks bring.
 */
export default function WorkspaceHome({ role }: { role: WorkspaceRole }) {
  const { t } = useTranslation();
  const account = useAccountStore((s) => s.account);

  return (
    <PageShell variant="gradient-soft">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{t(`identity.roles.${role}.name`)}</p>
        <h1 className="text-2xl font-bold text-foreground break-words">
          {t('identity.home.greeting', { name: account?.displayName ?? '' })}
        </h1>
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
