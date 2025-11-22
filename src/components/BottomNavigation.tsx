import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, TrendingUp, User, Scan, Mic, Grid3x3, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { InstaScanFlow } from '@/components/InstaScan/InstaScanFlow';
import { useModernVoice } from '@/contexts/ModernVoiceContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useFeatures } from '@/hooks/useFeatures';

interface BottomNavigationProps {
  onMenuOpen: () => void;
  hideNav?: boolean;
  hideAction?: boolean;
}

const navItems = [
  { path: '/app', icon: Home, labelKey: 'nav.home' },
  { path: '/app/social', icon: Users, labelKey: 'nav.community' },
  { path: '/app/analytics', icon: TrendingUp, labelKey: 'nav.analytics' },
  { path: '/app/profile', icon: User, labelKey: 'nav.profile' },
];

export function BottomNavigation({ 
  onMenuOpen, 
  hideNav = false, 
  hideAction = false
}: BottomNavigationProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [showInstaScan, setShowInstaScan] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  const { startListening, stopListening, isListening } = useModernVoice();
  const { enabledFeatures } = useFeatures();

  // Close menus when route changes
  useEffect(() => {
    setIsActionMenuOpen(false);
    setShowQuickActions(false);
  }, [location.pathname]);

  // If navigation is hidden, return null
  if (hideNav) return null;

  const handleScanClick = () => {
    const now = Date.now();
    const timeDiff = now - lastTapTime;
    
    // Close Quick Actions if open
    if (showQuickActions) {
      setShowQuickActions(false);
    }
    
    // Double tap detection (< 300ms)
    if (timeDiff < 300 && isActionMenuOpen) {
      // Double tap - minimize menu
      setIsActionMenuOpen(false);
    } else {
      // Single tap - toggle menu
      setIsActionMenuOpen(!isActionMenuOpen);
    }
    
    setLastTapTime(now);
  };

  const handleInstaScanOpen = () => {
    setShowInstaScan(true);
    setIsActionMenuOpen(false);
  };

  const handleVoiceToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
    setIsActionMenuOpen(false);
  };

  const handleQuickActionsOpen = () => {
    setShowQuickActions(!showQuickActions);
    setIsActionMenuOpen(false);
  };

  const handleFeatureClick = (path: string, enabled: boolean, comingSoon?: boolean) => {
    if (!enabled || comingSoon) return;
    navigate(path);
    setShowQuickActions(false);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 glassmorphism-nav border-t border-border/10 z-50 backdrop-blur-xl pb-safe">
        <div className="h-20 flex justify-around items-center px-3 relative">
          {/* First two navigation items */}
          {navItems.slice(0, 2).map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/app'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-300 ease-out',
                  'relative group'
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
                    "text-[11px] mt-1 font-medium transition-all duration-300 leading-tight",
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

          {/* Scan Button - After Community */}
          {!hideAction && (
            <button
              onClick={handleScanClick}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2",
                "transition-all duration-300 ease-out",
                "relative group"
              )}
              aria-label={t('nav.scan')}
            >
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center",
                "transition-all duration-300",
                isActionMenuOpen 
                  ? "bg-primary/15 scale-110 shadow-lg shadow-primary/20" 
                  : "hover:bg-muted/60 hover:scale-105",
                "group-active:scale-95"
              )}>
                <Scan className={cn(
                  'w-5 h-5 transition-all duration-300',
                  isActionMenuOpen 
                    ? 'text-primary drop-shadow-glow' 
                    : 'text-muted-foreground',
                  'group-hover:scale-110'
                )} />
              </div>
              <span className={cn(
                "text-[11px] mt-1 font-medium transition-all duration-300 leading-tight",
                isActionMenuOpen 
                  ? 'text-primary font-semibold' 
                  : 'text-muted-foreground/80'
              )}>
                {t('nav.scan')}
              </span>
            </button>
          )}

          {/* Remaining navigation items */}
          {navItems.slice(2).map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/app'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2',
                  'transition-all duration-300 ease-out',
                  'relative group'
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
                    "text-[11px] mt-1 font-medium transition-all duration-300 leading-tight",
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

        {/* 3-Button Action Menu Popup */}
        <AnimatePresence>
          {isActionMenuOpen && !hideAction && (
            <motion.div
              initial={{ y: 100, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.95 }}
              transition={{ 
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="absolute bottom-full left-0 right-0 pb-4"
            >
              <div className="glassmorphism-nav-menu rounded-t-3xl mx-4 p-4 border border-border/20">
                <div className="flex justify-around items-center gap-3">
                  {/* Voice Assistant Button */}
                  <button
                    onClick={handleVoiceToggle}
                    className={cn(
                      "flex flex-col items-center justify-center flex-1 gap-2",
                      "transition-all duration-300",
                      "group"
                    )}
                    aria-label={isListening ? "Stop Voice" : "Start Voice"}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.6)]",
                      isListening && "animate-pulse shadow-glow"
                    )}>
                      {isListening ? (
                        <MicOff className="w-6 h-6 text-primary-foreground" strokeWidth={2} />
                      ) : (
                        <Mic className="w-6 h-6 text-primary-foreground" strokeWidth={2} />
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {isListening ? t('voice.stop', 'Stop') : t('voice.start', 'Voice')}
                    </span>
                  </button>

                  {/* InstaScan Button */}
                  <button
                    onClick={handleInstaScanOpen}
                    className={cn(
                      "flex flex-col items-center justify-center flex-1 gap-2",
                      "transition-all duration-300",
                      "group"
                    )}
                    aria-label="InstaScan"
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-gradient-to-br from-[hsl(var(--secondary))] to-[hsl(var(--secondary)/0.6)]">
                      <Scan className="w-6 h-6 text-secondary-foreground" strokeWidth={2} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {t('nav.scan', 'Scan')}
                    </span>
                  </button>

                  {/* Feature Button */}
                  <button
                    onClick={handleQuickActionsOpen}
                    className={cn(
                      "flex flex-col items-center justify-center flex-1 gap-2",
                      "transition-all duration-300",
                      "group"
                    )}
                    aria-label="Features"
                  >
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent)/0.6)]">
                      <Grid3x3 className="w-6 h-6 text-accent-foreground" strokeWidth={2} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {t('feature.title', 'Feature')}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Actions Menu Popup */}
        <AnimatePresence>
          {showQuickActions && !hideAction && enabledFeatures && enabledFeatures.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 100, opacity: 0, scale: 0.95 }}
              transition={{ 
                type: "spring",
                stiffness: 300,
                damping: 30
              }}
              className="absolute bottom-full left-0 right-0 pb-4"
            >
              <div className="glassmorphism-nav-menu rounded-t-3xl mx-4 p-4 border border-border/20 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  {enabledFeatures.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleFeatureClick(item.path, item.enabled, item.comingSoon)}
                      disabled={!item.enabled || item.comingSoon}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-xl transition-all",
                        item.enabled && !item.comingSoon
                          ? "hover:bg-muted/50 active:scale-95"
                          : "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.6)]"
                      )}>
                        {item.icon && <item.icon className="w-6 h-6 text-primary-foreground" />}
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground text-center line-clamp-2">
                        {t(item.labelKey)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
