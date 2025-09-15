import { NavLink } from 'react-router-dom';
import { Home, Users, TrendingUp, User, Scan } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { InstaScanFlow } from '@/components/InstaScan/InstaScanFlow';

interface BottomNavigationProps {
  onMenuOpen: () => void;
  hideNav?: boolean;
  hideAction?: boolean;
}

const navItems = [
  { path: '/app', icon: Home, labelKey: 'nav.home' },
  { path: '/app/social', icon: Users, labelKey: 'nav.community' },
  { path: null, icon: Scan, labelKey: 'nav.scan', isAction: true },
  { path: '/app/analytics', icon: TrendingUp, labelKey: 'nav.analytics' },
  { path: '/app/profile', icon: User, labelKey: 'nav.profile' },
];

export function BottomNavigation({ onMenuOpen, hideNav = false, hideAction = false }: BottomNavigationProps) {
  const { t } = useTranslation();
  const [isPulsing, setIsPulsing] = useState(false);
  const [showInstaScan, setShowInstaScan] = useState(false);

  const handleActionClick = () => {
    setIsPulsing(true);
    setShowInstaScan(true);
    setTimeout(() => setIsPulsing(false), 600);
  };

  // If navigation is hidden, return null
  if (hideNav) return null;

  // Filter nav items to exclude action if needed
  const displayNavItems = hideAction 
    ? navItems.filter(item => !item.isAction)
    : navItems;

  // Calculate dynamic spacing based on FAB presence
  const hasAction = !hideAction && displayNavItems.some(item => item.isAction);
  const navItemsBeforeAction = displayNavItems.filter(item => !item.isAction).slice(0, 2);
  const navItemsAfterAction = displayNavItems.filter(item => !item.isAction).slice(2);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 glassmorphism-nav border-t border-border/10 z-50 backdrop-blur-xl pb-safe">
        <div className="h-20 flex justify-around items-center px-3 relative">
          {/* Nav items before the action button */}
          {navItemsBeforeAction.map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path!}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-300 ease-out',
                  'relative group',
                  hasAction && 'pr-4' // Dynamic spacing when FAB exists
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    "transition-all duration-300",
                    isActive 
                      ? "bg-primary/15 scale-110 shadow-lg shadow-primary/20" 
                      : "hover:bg-muted/60 hover:scale-105",
                    "group-active:scale-95"
                  )}>
                    <Icon className={cn(
                      'w-5 h-5 transition-all duration-300',
                      isActive 
                        ? 'text-primary drop-shadow-glow animate-slide-up' 
                        : 'text-muted-foreground',
                      'group-hover:scale-110'
                    )} />
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium transition-all duration-300",
                    isActive 
                      ? 'text-primary font-semibold' 
                      : 'text-muted-foreground/80'
                  )}>
                    {t(labelKey)}
                  </span>
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary animate-fade-in" />
                  )}
                </>
              )}
            </NavLink>
          ))}

          {/* Central action button */}
          {hasAction && !hideAction && (
            <button
              onClick={handleActionClick}
              className={cn(
                "absolute left-1/2 -translate-x-1/2 -top-4",
                "w-16 h-16 rounded-full",
                "bg-gradient-primary",
                "shadow-elegant shadow-primary/30",
                "flex items-center justify-center",
                "transition-smooth",
                "hover:scale-110 hover:shadow-glow",
                "active:scale-95",
                isPulsing && "animate-pulse"
              )}
            >
              <div className="w-14 h-14 rounded-full bg-background/10 backdrop-blur-sm flex items-center justify-center">
                <Scan className="w-7 h-7 text-primary-foreground drop-shadow-lg" />
              </div>
            </button>
          )}

          {/* Empty space for FAB */}
          {hasAction && <div className="flex-1" />}

          {/* Nav items after the action button */}
          {navItemsAfterAction.map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path!}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-300 ease-out',
                  'relative group',
                  hasAction && 'pl-4' // Dynamic spacing when FAB exists
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    "transition-all duration-300",
                    isActive 
                      ? "bg-primary/15 scale-110 shadow-lg shadow-primary/20" 
                      : "hover:bg-muted/60 hover:scale-105",
                    "group-active:scale-95"
                  )}>
                    <Icon className={cn(
                      'w-5 h-5 transition-all duration-300',
                      isActive 
                        ? 'text-primary drop-shadow-glow animate-slide-up' 
                        : 'text-muted-foreground',
                      'group-hover:scale-110'
                    )} />
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium transition-all duration-300",
                    isActive 
                      ? 'text-primary font-semibold' 
                      : 'text-muted-foreground/80'
                  )}>
                    {t(labelKey)}
                  </span>
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gradient-primary animate-fade-in" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      
      {/* InstaScan Flow */}
      {!hideAction && (
        <InstaScanFlow 
          isOpen={showInstaScan} 
          onClose={() => setShowInstaScan(false)} 
        />
      )}
    </>
  );
}