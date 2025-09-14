import { NavLink } from 'react-router-dom';
import { Home, Users, TrendingUp, User, Scan } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { InstaScanFlow } from '@/components/InstaScan/InstaScanFlow';

interface BottomNavigationProps {
  onMenuOpen: () => void;
}

const navItems = [
  { path: '/app', icon: Home, labelKey: 'nav.home' },
  { path: '/app/social', icon: Users, labelKey: 'nav.community' },
  { path: null, icon: Scan, labelKey: 'nav.scan', isAction: true },
  { path: '/app/analytics', icon: TrendingUp, labelKey: 'nav.analytics' },
  { path: '/app/profile', icon: User, labelKey: 'nav.profile' },
];

export function BottomNavigation({ onMenuOpen }: BottomNavigationProps) {
  const { t } = useTranslation();
  const [isPulsing, setIsPulsing] = useState(false);
  const [showInstaScan, setShowInstaScan] = useState(false);

  const handleActionClick = () => {
    setIsPulsing(true);
    setShowInstaScan(true);
    setTimeout(() => setIsPulsing(false), 600);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 h-20 glassmorphism-nav border-t border-nav-border/20 z-50 backdrop-blur-xl">
        <div className="h-full flex justify-around items-center px-3 relative">
        {navItems.map(({ path, icon: Icon, labelKey, isAction }, index) => {
          // Central action button
          if (isAction) {
            return (
              <button
                key={labelKey}
                onClick={handleActionClick}
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 -top-4",
                  "w-16 h-16 rounded-full",
                  "bg-gradient-to-br from-primary via-accent to-primary-glow",
                  "shadow-2xl shadow-primary/30",
                  "flex items-center justify-center",
                  "transition-all duration-300 ease-out",
                  "hover:scale-110 hover:shadow-3xl hover:shadow-primary/40",
                  "active:scale-95",
                  isPulsing && "animate-pulse-ring"
                )}
              >
                <div className="w-14 h-14 rounded-full bg-background/10 backdrop-blur-sm flex items-center justify-center">
                  <Icon className="w-7 h-7 text-white animate-float" />
                </div>
              </button>
            );
          }

          // Regular nav items
          return path ? (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-300 ease-out',
                  'relative group',
                  index < 2 && 'mr-8', // Space for center button
                  index > 2 && 'ml-8'  // Space for center button
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    "transition-all duration-300",
                    isActive ? "bg-primary/10 scale-110" : "hover:bg-muted/50",
                    "group-active:scale-95"
                  )}>
                    <Icon className={cn(
                      'w-5 h-5 transition-all duration-300',
                      isActive ? 'text-primary animate-slide-up' : 'text-muted-foreground',
                      'group-hover:scale-110'
                    )} />
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium transition-all duration-300",
                    isActive ? 'text-primary' : 'text-muted-foreground/70'
                  )}>
                    {t(labelKey)}
                  </span>
                  {isActive && (
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary animate-fade-in" />
                  )}
                </>
              )}
            </NavLink>
          ) : null;
        })}
        </div>
      </nav>
      
      {/* InstaScan Flow */}
      <InstaScanFlow 
        isOpen={showInstaScan} 
        onClose={() => setShowInstaScan(false)} 
      />
    </>
  );
}