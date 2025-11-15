import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationSettings from '@/components/notifications/NotificationSettings';

export default function NotificationSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/5 to-primary/5">
      <div className="fixed top-0 left-0 right-0 z-40 bg-background/60 backdrop-blur-2xl border-b border-border/50">
        <div className="px-3 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/profile')}
              className="h-9 w-9 rounded-xl"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold">Notification Settings</h1>
              <p className="text-xs text-muted-foreground">Manage your alerts and reminders</p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-20 px-4 pb-20">
        <NotificationSettings />
      </div>
    </div>
  );
}
