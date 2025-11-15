import { useState } from 'react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { useSchedules } from '@/hooks/useSchedules';
import { Badge } from '@/components/ui/badge';

interface ScheduleDebugPanelProps {
  landId?: string;
}

export function ScheduleDebugPanel({ landId }: ScheduleDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { user, session, isAuthenticated } = useAuthStore();
  const { schedules, isLoading, isError, error } = useSchedules(landId);

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  const getStatusBadge = (condition: boolean, label: string) => (
    <Badge variant={condition ? "default" : "destructive"} className="text-xs">
      {condition ? '✓' : '✗'} {label}
    </Badge>
  );

  const getTimestamp = () => new Date().toLocaleTimeString();

  return (
    <div className="fixed bottom-20 right-4 z-50 w-80">
      <Card className="border-2 border-primary/20 shadow-lg">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            <span className="font-semibold text-sm">Debug Panel</span>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>

        {isOpen && (
          <div className="p-4 space-y-3 text-xs border-t">
            <div className="space-y-2">
              <div className="font-semibold text-primary">Authentication State</div>
              <div className="space-y-1 pl-2">
                {getStatusBadge(!!user, 'User Loaded')}
                {getStatusBadge(!!session, 'Session Active')}
                {getStatusBadge(isAuthenticated, 'Authenticated')}
                {user && (
                  <div className="text-muted-foreground mt-1">
                    User: {user.id.substring(0, 8)}...
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-primary">Query State</div>
              <div className="space-y-1 pl-2">
                {getStatusBadge(!isLoading, 'Query Complete')}
                {getStatusBadge(!isError, 'No Errors')}
                {getStatusBadge(schedules.length > 0, 'Data Available')}
                <div className="text-muted-foreground mt-1">
                  {isLoading && '⏳ Loading...'}
                  {isError && `❌ Error: ${error?.message}`}
                  {!isLoading && !isError && `✅ ${schedules.length} schedule(s)`}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-primary">Filters</div>
              <div className="space-y-1 pl-2">
                {landId && (
                  <div className="text-muted-foreground">
                    Land: {landId.substring(0, 8)}...
                  </div>
                )}
                {!landId && (
                  <div className="text-muted-foreground">All lands</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-primary">Timeline</div>
              <div className="space-y-1 pl-2 text-muted-foreground">
                <div>🕐 {getTimestamp()}</div>
                <div className="text-[10px]">
                  Auth: {user ? 'Ready' : 'Waiting'} →
                  Headers: {session ? 'Set' : 'Waiting'} →
                  Query: {isLoading ? 'Running' : 'Done'} →
                  UI: {schedules.length > 0 ? 'Rendered' : 'Empty'}
                </div>
              </div>
            </div>

            {isError && (
              <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive">
                <div className="font-semibold mb-1">Error Details:</div>
                <div className="text-[10px] break-all">
                  {error?.message || 'Unknown error'}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
