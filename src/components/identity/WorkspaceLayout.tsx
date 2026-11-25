import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, Home, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LanguageSelector } from '@/components/LanguageSelector';
import { SpeakPageButton } from '@/components/header/SpeakPageButton';
import { ScrollContext } from '@/components/layout/ScrollContext';
import { WorkspaceSwitcher } from '@/components/identity/WorkspaceSwitcher';
import { ReachHeaderButton } from '@/components/identity/ReachCard';
import { useAccountReach } from '@/hooks/useAccountReach';
import { useProviderFlag } from '@/hooks/useProviderFlag';
import { ROLE_ICONS } from '@/components/identity/RoleOptionList';
import { useAccountStore } from '@/stores/accountStore';
import { WORKSPACE_HOME, activeRolesOf, type AccountRole } from '@/lib/accountRoles';

interface WorkspaceLayoutProps {
  role: Exclude<AccountRole, 'FARMER'>;
}

/**
 * Shell of the Provider and Customer workspaces: header with the role chip, the
 * base village with radius as a button, the read-aloud button and the language, one scroll container, and a bottom navigation with Home and
 * Profile — plus "My business" in the Provider workspace while the
 * provider_workspace flag is on. Built beside AppLayout with the same layout utilities; it mounts no
 * farmer provider, so no farmer data is requested from these workspaces.
 */
export function WorkspaceLayout({ role }: WorkspaceLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const account = useAccountStore((s) => s.account);
  const hasSeveralRoles = activeRolesOf(account).length > 1;
  const RoleIcon = ROLE_ICONS[role];
  const home = WORKSPACE_HOME[role];

  // One refresh of this workspace's Reach; the header button and the home
  // card both read it from the store.
  useAccountReach(role);
  // Asks the server whether the Provider Workspace is switched on (false for the Customer workspace).
  const providerWorkspaceOn = useProviderFlag(role);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  const navItems = [
    { path: home, icon: Home, labelKey: 'nav.home', end: true },
    ...(providerWorkspaceOn
      ? [{ path: `${home}/business`, icon: Briefcase, labelKey: 'provider.nav.business', end: false }]
      : []),
    { path: `${home}/profile`, icon: User, labelKey: 'nav.profile', end: false },
  ];

  return (
    <ScrollContext.Provider value={mainRef}>
      <div className="flex flex-col h-mobile-screen bg-background">
        <header className="glass-header fixed top-0 left-0 right-0 h-14 z-40 flex items-center gap-1.5 px-3 pt-safe">
          <div className="flex-1 min-w-0">
            {hasSeveralRoles ? (
              <WorkspaceSwitcher variant="header" />
            ) : (
              <span className="inline-flex h-11 items-center gap-1.5 rounded-full border border-primary/30 bg-card pl-2 pr-3 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <RoleIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="max-w-[6.5rem] truncate">{t(`identity.roles.${role}.name`)}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ReachHeaderButton role={role} />
            <SpeakPageButton />
            <LanguageSelector />
          </div>
        </header>

        <main
          ref={mainRef}
          className="pb-nav-safe mobile-scroll-container"
          style={{ paddingTop: '3.5rem' }}
        >
          <Outlet />
        </main>

        <nav className="fixed bottom-0 left-0 right-0 glassmorphism-nav border-t border-border/10 z-50 backdrop-blur-xl pb-safe">
          <div className="h-20 flex justify-around items-center px-3">
            {navItems.map(({ path, icon: Icon, labelKey, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className="flex flex-col items-center justify-center flex-1 h-full py-2 group"
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors group-active:scale-95',
                        isActive ? 'bg-primary/15' : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon className={cn('w-5 h-5', isActive ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                    </div>
                    <span
                      className={cn(
                        'text-[11px] mt-1 font-medium leading-tight',
                        isActive ? 'text-primary font-semibold' : 'text-muted-foreground/80',
                      )}
                    >
                      {t(labelKey)}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </ScrollContext.Provider>
  );
}
