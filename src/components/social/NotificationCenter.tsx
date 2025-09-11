import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bell, 
  Heart, 
  MessageSquare, 
  UserPlus, 
  Award,
  TrendingUp,
  CheckCircle,
  X,
  Trash2
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface NotificationCenterProps {
  onClose: () => void;
}

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'badge' | 'mention' | 'trending';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: any;
  icon?: React.ReactNode;
}

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  // Mock notifications - in production, fetch from database
  const mockNotifications: Notification[] = [
    {
      id: '1',
      type: 'like',
      title: 'Post Liked',
      message: 'Rajesh Kumar liked your post about organic farming',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      icon: <Heart className="h-4 w-4 text-destructive" />
    },
    {
      id: '2',
      type: 'comment',
      title: 'New Comment',
      message: 'Priya Patel commented on your wheat cultivation post',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      icon: <MessageSquare className="h-4 w-4 text-primary" />
    },
    {
      id: '3',
      type: 'follow',
      title: 'New Follower',
      message: 'Amit Singh started following you',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      icon: <UserPlus className="h-4 w-4 text-success" />
    },
    {
      id: '4',
      type: 'badge',
      title: 'Achievement Unlocked!',
      message: 'You earned the "Expert Contributor" badge',
      isRead: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      icon: <Award className="h-4 w-4 text-accent" />
    },
    {
      id: '5',
      type: 'trending',
      title: 'Your Post is Trending!',
      message: 'Your post about drip irrigation is trending in Maharashtra',
      isRead: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      icon: <TrendingUp className="h-4 w-4 text-primary" />
    }
  ];

  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, isRead: true }))
    );
  };

  const deleteNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const filteredNotifications = activeTab === 'all' 
    ? notifications 
    : activeTab === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications.filter(n => n.type === activeTab);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="h-4 w-4 text-destructive" />;
      case 'comment': return <MessageSquare className="h-4 w-4 text-primary" />;
      case 'follow': return <UserPlus className="h-4 w-4 text-success" />;
      case 'badge': return <Award className="h-4 w-4 text-accent" />;
      case 'mention': return <Bell className="h-4 w-4 text-primary" />;
      case 'trending': return <TrendingUp className="h-4 w-4 text-primary" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="space-y-0 pb-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 px-1">
                  {unreadCount}
                </Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="like">Likes</TabsTrigger>
            <TabsTrigger value="comment">Comments</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4 space-y-0">
            <ScrollArea className="h-[calc(100vh-200px)]">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    {activeTab === 'unread' 
                      ? "You're all caught up!"
                      : "No notifications yet"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 rounded-lg transition-colors ${
                        notification.isRead 
                          ? 'bg-background hover:bg-muted/50' 
                          : 'bg-primary/5 hover:bg-primary/10'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {notification.icon || getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">
                            {notification.title}
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}