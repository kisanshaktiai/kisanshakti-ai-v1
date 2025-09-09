import { NavLink } from 'react-router-dom';
import { Home, Cloud, TrendingUp, MessageSquare, FileText, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/app', icon: Home, labelKey: 'nav.home' },
  { path: '/app/weather', icon: Cloud, labelKey: 'nav.weather' },
  { path: '/app/market', icon: TrendingUp, labelKey: 'nav.market' },
  { path: '/app/advisory', icon: MessageSquare, labelKey: 'nav.advisory' },
  { path: '/app/schemes', icon: FileText, labelKey: 'nav.schemes' },
  { path: '/app/profile', icon: User, labelKey: 'nav.profile' },
];

export function BottomNavigation() {
  const { t } = useTranslation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-nav bg-nav border-t border-nav-border z-50">
      <div className="h-full flex justify-around items-center px-2">
        {navItems.map(({ path, icon: Icon, labelKey }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors',
                isActive
                  ? 'text-nav-active'
                  : 'text-nav-inactive hover:text-nav-active/70'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-5 h-5', isActive && 'animate-slide-up')} />
                <span className="text-xs mt-1 font-medium">
                  {t(labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}