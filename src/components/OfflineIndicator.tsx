import { WifiOff } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

export function OfflineIndicator() {
  const isOnline = useOfflineStatus();
  const { user } = useAuthStore();

  // Only show for authenticated users
  if (isOnline || !user) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-50",
      "bg-warning text-warning-foreground px-4 py-2",
      "flex items-center justify-center gap-2",
      "animate-in slide-in-from-top duration-300"
    )}>
      <WifiOff className="h-4 w-4" />
      <span className="text-sm font-medium">
        You are offline. Some features may be limited.
      </span>
    </div>
  );
}