import { useState, useEffect } from 'react';
import { WifiOff, X } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';

export function OfflineIndicator() {
  const isOnline = useOfflineStatus();
  const { user } = useAuthStore();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  // Only show for authenticated users
  useEffect(() => {
    if (isOnline || !user) {
      setShowIndicator(false);
      setIsDismissed(false);
      return;
    }

    // Delay showing the indicator by 500ms to avoid flashing for brief disconnections
    const timer = setTimeout(() => {
      if (!isOnline && user && !isDismissed) {
        setShowIndicator(true);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isOnline, user, isDismissed]);

  if (!showIndicator || isDismissed) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50",
      "bg-warning/90 backdrop-blur-sm text-warning-foreground px-4 py-2",
      "flex items-center justify-between gap-2",
      "animate-in slide-in-from-top duration-300 shadow-lg"
    )}>
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 animate-pulse" />
        <span className="text-sm font-medium">
          You are offline. Changes will sync when connection is restored.
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsDismissed(true)}
        className="h-6 w-6 p-0 hover:bg-warning-foreground/10"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
