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
  
  // Get non-action items only
  const regularNavItems = displayNavItems.filter(item => !item.isAction);
  
  // Split nav items around the action button
  const navItemsBeforeAction = regularNavItems.slice(0, 2);
  const navItemsAfterAction = regularNavItems.slice(2);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
        {/* Neural Grid Background */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/90 backdrop-blur-3xl" />
        <div className="absolute inset-0 border-t border-primary/10" 
             style={{
               background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.05) 50%, transparent 100%)'
             }} />
        
        <div className="relative h-20 flex justify-around items-center px-3">
          {/* Nav items before the action button */}
          {navItemsBeforeAction.map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path!}
              end={path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-500 ease-out',
                  'relative group',
                  hasAction && 'pr-4'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Glow effect for active state */}
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-3xl bg-primary/10 blur-xl animate-pulse-subtle" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "relative w-13 h-13 rounded-3xl flex items-center justify-center",
                    "transition-all duration-500",
                    "before:absolute before:inset-0 before:rounded-3xl before:transition-all before:duration-500",
                    isActive 
                      ? "scale-110 before:bg-gradient-to-br before:from-primary/20 before:via-accent/15 before:to-primary/20 shadow-ai" 
                      : "hover:scale-105 before:bg-muted/40 hover:before:bg-muted/60",
                    "group-active:scale-95",
                    "backdrop-blur-sm"
                  )}>
                    <Icon className={cn(
                      'relative z-10 w-5 h-5 transition-all duration-500',
                      isActive 
                        ? 'text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)] animate-slide-up' 
                        : 'text-muted-foreground',
                      'group-hover:scale-110 group-hover:drop-shadow-[0_0_4px_hsl(var(--primary)/0.3)]'
                    )} />
                  </div>
                  
                  <span className={cn(
                    "text-[10px] mt-1.5 font-semibold tracking-wide transition-all duration-500 leading-tight",
                    isActive 
                      ? 'text-primary drop-shadow-[0_0_4px_hsl(var(--primary)/0.3)]' 
                      : 'text-muted-foreground/70 group-hover:text-muted-foreground'
                  )}>
                    {t(labelKey)}
                  </span>
                  
                  {/* Active indicator with gradient */}
                  {isActive && (
                    <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full overflow-hidden animate-fade-in">
                      <div className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent" />
                    </div>
                  )}
                </>
              )}
            </NavLink>
          ))}

          {/* Central AI Action Button - Futuristic FAB */}
          {hasAction && !hideAction && (
            <button
              onClick={handleActionClick}
              className={cn(
                "absolute left-1/2 -translate-x-1/2 -top-6",
                "w-20 h-20 rounded-full",
                "transition-all duration-500",
                "hover:scale-110 active:scale-95",
                "group"
              )}
            >
              {/* Outer glow ring */}
              <div className={cn(
                "absolute inset-0 rounded-full",
                "bg-gradient-to-br from-primary via-accent to-secondary",
                "opacity-100 blur-md",
                isPulsing ? "animate-pulse" : "animate-pulse-subtle"
              )} />
              
              {/* Middle ring */}
              <div className="absolute inset-1 rounded-full bg-background/20 backdrop-blur-sm" />
              
              {/* Inner gradient button */}
              <div className={cn(
                "absolute inset-2 rounded-full",
                "bg-gradient-to-br from-primary via-accent to-secondary",
                "flex items-center justify-center",
                "shadow-[0_0_40px_hsl(var(--primary)/0.5)]",
                "group-hover:shadow-[0_0_60px_hsl(var(--primary)/0.7)]",
                "transition-all duration-500"
              )}>
                {/* Icon container with animation */}
                <div className="relative">
                  <Scan className={cn(
                    "w-8 h-8 text-primary-foreground",
                    "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]",
                    "transition-transform duration-500",
                    "group-hover:scale-110 group-hover:rotate-12"
                  )} />
                  
                  {/* Scanning lines effect */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 border-2 border-primary-foreground/20 rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
              
              {/* Corner accents */}
              <div className="absolute inset-0 rounded-full">
                {[0, 90, 180, 270].map((rotation) => (
                  <div
                    key={rotation}
                    className="absolute top-0 left-1/2 w-1 h-3 bg-primary-foreground/50 rounded-full"
                    style={{ 
                      transform: `rotate(${rotation}deg) translateX(-50%)`,
                      transformOrigin: '50% 40px'
                    }}
                  />
                ))}
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
              end={path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-500 ease-out',
                  'relative group',
                  hasAction && 'pl-4'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Glow effect for active state */}
                  {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-3xl bg-primary/10 blur-xl animate-pulse-subtle" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "relative w-13 h-13 rounded-3xl flex items-center justify-center",
                    "transition-all duration-500",
                    "before:absolute before:inset-0 before:rounded-3xl before:transition-all before:duration-500",
                    isActive 
                      ? "scale-110 before:bg-gradient-to-br before:from-primary/20 before:via-accent/15 before:to-primary/20 shadow-ai" 
                      : "hover:scale-105 before:bg-muted/40 hover:before:bg-muted/60",
                    "group-active:scale-95",
                    "backdrop-blur-sm"
                  )}>
                    <Icon className={cn(
                      'relative z-10 w-5 h-5 transition-all duration-500',
                      isActive 
                        ? 'text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)] animate-slide-up' 
                        : 'text-muted-foreground',
                      'group-hover:scale-110 group-hover:drop-shadow-[0_0_4px_hsl(var(--primary)/0.3)]'
                    )} />
                  </div>
                  
                  <span className={cn(
                    "text-[10px] mt-1.5 font-semibold tracking-wide transition-all duration-500 leading-tight",
                    isActive 
                      ? 'text-primary drop-shadow-[0_0_4px_hsl(var(--primary)/0.3)]' 
                      : 'text-muted-foreground/70 group-hover:text-muted-foreground'
                  )}>
                    {t(labelKey)}
                  </span>
                  
                  {/* Active indicator with gradient */}
                  {isActive && (
                    <div className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full overflow-hidden animate-fade-in">
                      <div className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent" />
                    </div>
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