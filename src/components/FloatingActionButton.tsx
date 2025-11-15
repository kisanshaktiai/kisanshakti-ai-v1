import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Grid3X3, Leaf, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useFeatures } from '@/hooks/useFeatures';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function FloatingActionButton() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMorphing, setIsMorphing] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { enabledFeatures, isLoading } = useFeatures();
  
  // Hide FAB on schedule page
  const shouldHideFAB = location.pathname === '/app/schedule';

  // Debug logging
  console.log('FAB Debug - enabledFeatures:', enabledFeatures);
  console.log('FAB Debug - isLoading:', isLoading);
  console.log('FAB Debug - isExpanded:', isExpanded);

  const handleItemClick = (path: string, enabled: boolean, comingSoon?: boolean) => {
    if (!enabled || comingSoon) return;
    navigate(path);
    setIsExpanded(false);
  };

  const toggleExpanded = () => {
    console.log('FAB Debug - Toggle clicked, current state:', isExpanded);
    setIsMorphing(true);
    setIsExpanded(!isExpanded);
    
    // Reset morphing state after animation
    setTimeout(() => setIsMorphing(false), 300);
  };

  // Voice-read support for accessibility
  useEffect(() => {
    if (isExpanded && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(t('fab.menuOpened'));
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 0.5;
      // Optional: uncomment to enable voice feedback
      // window.speechSynthesis.speak(utterance);
    }
  }, [isExpanded, t]);

  if (isLoading) {
    console.log('🔄 [FAB] Loading features...');
    // Show loading spinner while features are being fetched
    return (
      <div className="fixed right-4 z-50" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0))' }}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/60 via-accent/60 to-primary-glow/60 shadow-2xl shadow-primary/20 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-primary-foreground animate-spin" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-sm">Loading features...</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }
  
  if (!enabledFeatures || enabledFeatures.length === 0) {
    console.log('FAB Debug - No enabled features available');
    return null;
  }
  
  if (shouldHideFAB) {
    console.log('FAB Debug - Hidden on schedule page');
    return null;
  }

  return (
    <TooltipProvider>
      {/* Backdrop with blur effect */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-background/40 backdrop-blur-md z-40 animate-fade-in"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* FAB Container */}
      <div className="fixed right-4 z-50" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0))' }}>
        {/* Expanded Menu Items with Glassmorphism */}
        <div className={cn(
          "absolute bottom-16 right-0 transition-all duration-300",
          isExpanded ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        )}>
          <div className="space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-hide">
            {enabledFeatures.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 justify-end",
                  "transition-all duration-300 transform",
                  isExpanded 
                    ? "translate-x-0 opacity-100 scale-100" 
                    : "translate-x-8 opacity-0 scale-95",
                  item.comingSoon && "opacity-60"
                )}
                style={{
                  transitionDelay: isExpanded ? `${index * 40}ms` : '0ms'
                }}
              >
                {/* Label with Glassmorphism */}
                <div className={cn(
                  "glass-morphism px-4 py-2.5 rounded-xl",
                  "backdrop-blur-xl bg-background/60",
                  "border border-border/50",
                  "shadow-lg shadow-background/5",
                  "flex items-center gap-2"
                )}>
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                    {t(item.labelKey)}
                  </span>
                  {item.comingSoon && (
                    <Badge variant="secondary" className="text-xs bg-muted/50">
                      {t('common.comingSoon')}
                    </Badge>
                  )}
                </div>

                {/* Icon Button with Theme Gradient and Tooltip */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleItemClick(item.path, item.enabled, item.comingSoon)}
                      disabled={!item.enabled || item.comingSoon}
                      aria-label={t(item.labelKey)}
                      className={cn(
                        "w-14 h-14 rounded-2xl",
                        "shadow-xl shadow-primary/20",
                        "flex items-center justify-center",
                        "transition-all duration-300",
                        "transform hover:scale-110 active:scale-95",
                        "relative overflow-hidden",
                        item.comingSoon || !item.enabled
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-gradient-to-br from-primary via-primary to-primary-glow text-primary-foreground hover:shadow-2xl hover:shadow-primary/30"
                      )}
                    >
                      {/* Ripple effect background */}
                      <div className="absolute inset-0 bg-gradient-radial from-primary-foreground/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
                      {/* Safe icon rendering with proper React component check */}
                      {item.icon && (
                        <item.icon className="w-6 h-6 relative z-10" />
                      )}
                    </button>
                  </TooltipTrigger>
                  {item.comingSoon && (
                    <TooltipContent side="left">
                      <p className="text-sm font-medium">Coming Soon</p>
                      <p className="text-xs text-muted-foreground">This feature is under development</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </div>
            ))}
          </div>
        </div>

        {/* Main FAB Button with Morph Animation */}
        <button
          onClick={toggleExpanded}
          aria-label={isExpanded ? t('fab.close') : t('fab.open')}
          className={cn(
            "w-16 h-16 rounded-2xl",
            "bg-gradient-to-br from-primary via-accent to-primary-glow",
            "shadow-2xl shadow-primary/30",
            "flex items-center justify-center",
            "transition-all duration-300",
            "hover:scale-110 hover:shadow-3xl hover:shadow-primary/40",
            "active:scale-95",
            "relative overflow-hidden group"
          )}
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 bg-gradient-radial from-primary-foreground/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Morphing Icon Container */}
          <div className={cn(
            "relative w-7 h-7 transition-all duration-300",
            isMorphing && "scale-110"
          )}>
            {/* Plus Icon */}
            <Plus 
              className={cn(
                "absolute inset-0 w-7 h-7 text-primary-foreground transition-all duration-300",
                isExpanded ? "opacity-0 rotate-180 scale-50" : "opacity-100 rotate-0 scale-100"
              )} 
            />
            
            {/* Grid + Leaf Morph Icon */}
            <div className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-300",
              isExpanded ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-180 scale-50"
            )}>
              <Grid3X3 className="absolute w-5 h-5 text-primary-foreground/80" />
              <Leaf className="absolute w-3 h-3 text-primary-foreground translate-x-2 translate-y-2" />
            </div>
          </div>

          {/* Pulse animation ring */}
          {!isExpanded && (
            <div className="absolute inset-0 rounded-2xl border-2 border-primary-foreground/20 animate-ping" />
          )}
        </button>

        {/* Radial expansion effect */}
        {isExpanded && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-primary/10 rounded-full animate-scale-out" />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}