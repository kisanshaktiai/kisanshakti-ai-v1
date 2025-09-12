import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Search,
  MoreVertical,
  Phone,
  Video,
  Image,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Reply,
  Users,
  Circle,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Message {
  id: string;
  content: string;
  farmer_id: string;
  created_at: string;
  updated_at?: string;
  is_edited?: boolean;
  attachments?: any[];
  reactions?: { [key: string]: string[] };
  reply_to?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read';
  farmer?: {
    id: string;
    name: string;
    avatar_url?: string;
  };
}

interface Community {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  member_count?: number;
  created_by?: string;
}

interface OnlineUser {
  id: string;
  name: string;
  last_seen?: string;
}

export function WhatsAppChatRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const userId = session?.farmerId;
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch community details
  useEffect(() => {
    if (!id) return;

    const fetchCommunity = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('communities')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setCommunity(data);
      } catch (error) {
        console.error('Error fetching community:', error);
        toast.error('Failed to load community');
        navigate('/app/social');
      } finally {
        setLoading(false);
      }
    };

    fetchCommunity();
  }, [id, navigate]);

  // Fetch messages
  useEffect(() => {
    if (!id) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmer_id (
            id,
            name,
            avatar_url
          )
        `)
        .eq('community_id', id)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.map(msg => ({
          ...msg,
          farmer_id: msg.farmer_id || '',
          attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
          reactions: typeof msg.reactions === 'object' && msg.reactions !== null ? msg.reactions as { [key: string]: string[] } : {},
          status: 'read' as const,
        })));
      }
    };

    fetchMessages();
  }, [id]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!id || !userId) return;

    const channel = supabase
      .channel(`community-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_messages',
        filter: `community_id=eq.${id}`,
      }, async (payload) => {
        const newMsg = payload.new as any;
        
        // Fetch sender details
        const { data: senderData } = await supabase
          .from('farmers')
          .select('id, name, avatar_url')
          .eq('id', newMsg.farmer_id)
          .single();

        setMessages(prev => [...prev, {
          ...newMsg,
          farmer_id: newMsg.farmer_id,
          farmer: senderData,
          status: newMsg.farmer_id === userId ? 'sent' : 'delivered',
        }]);
        
        // Scroll to bottom for new messages
        setTimeout(() => scrollToBottom(), 100);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().map((presence: any) => ({
          id: presence.user_id || presence.id,
          name: presence.name || 'User',
          last_seen: presence.last_seen,
        })) as OnlineUser[];
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            name: session?.user?.user_metadata?.name || 'User',
            last_seen: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId, session]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = differenceInMinutes(now, date);

    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'dd/MM/yy HH:mm');
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !id || !userId || sending) return;

    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: newMessage,
      farmer_id: userId,
      created_at: new Date().toISOString(),
      status: 'sending',
      farmer: {
        id: userId,
        name: session?.user?.user_metadata?.name || 'You',
        avatar_url: session?.user?.user_metadata?.avatar_url,
      },
    };

    // Add temporary message
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    scrollToBottom();

    try {
      const messageData: any = {
        community_id: id,
        farmer_id: userId,
        content: newMessage,
        message_type: 'text',
      };

      if (replyingTo) {
        messageData.reply_to = replyingTo.id;
      }

      const { error } = await supabase
        .from('community_messages')
        .insert(messageData);

      if (error) throw error;

      // Update temp message status
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, status: 'sent' } : msg
      ));

      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
      
      // Remove temp message on error
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setNewMessage(tempMessage.content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTyping = () => {
    // Emit typing event (implement with presence channel)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      // Stop typing indicator
    }, 1000);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!userId) return;
    
    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const reactions = message.reactions || {};
      const emojiReactions = reactions[emoji] || [];
      const hasReacted = emojiReactions.includes(userId);

      let updatedReactions;
      if (hasReacted) {
        updatedReactions = {
          ...reactions,
          [emoji]: emojiReactions.filter(id => id !== userId),
        };
      } else {
        updatedReactions = {
          ...reactions,
          [emoji]: [...emojiReactions, userId],
        };
      }

      const { error } = await supabase
        .from('community_messages')
        .update({ reactions: updatedReactions })
        .eq('id', messageId);

      if (!error) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, reactions: updatedReactions } : msg
        ));
      }
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
  };

  const MessageBubble = ({ message }: { message: Message }) => {
    const isOwn = message.farmer_id === userId;
    const isOnline = onlineUsers.some(u => u.id === message.farmer_id);

    return (
      <div className={cn(
        "flex gap-2 mb-2 group",
        isOwn ? "justify-end" : "justify-start"
      )}>
        {!isOwn && (
          <Avatar className="w-8 h-8 relative">
            <AvatarImage src={message.farmer?.avatar_url} />
            <AvatarFallback>{message.farmer?.name?.[0]}</AvatarFallback>
            {isOnline && (
              <Circle className="absolute bottom-0 right-0 w-3 h-3 fill-green-500 text-green-500" />
            )}
          </Avatar>
        )}
        
        <div className={cn(
          "max-w-[70%] relative",
          isOwn ? "items-end" : "items-start"
        )}>
          {!isOwn && (
            <span className="text-xs text-muted-foreground ml-2">
              {message.farmer?.name}
            </span>
          )}
          
          <div className={cn(
            "rounded-2xl px-4 py-2 relative",
            isOwn 
              ? "bg-primary text-primary-foreground rounded-br-sm" 
              : "bg-muted rounded-bl-sm"
          )}>
            {replyingTo?.id === message.id && (
              <div className="text-xs opacity-70 border-l-2 pl-2 mb-1">
                Replying to {replyingTo.farmer?.name}
              </div>
            )}
            
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            
            <div className={cn(
              "flex items-center gap-1 mt-1",
              isOwn ? "justify-end" : "justify-start"
            )}>
              <span className="text-[10px] opacity-60">
                {formatMessageTime(message.created_at)}
              </span>
              {isOwn && (
                <span className="text-[10px]">
                  {message.status === 'sending' && <Clock className="w-3 h-3" />}
                  {message.status === 'sent' && <Check className="w-3 h-3" />}
                  {message.status === 'delivered' && <CheckCheck className="w-3 h-3" />}
                  {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                </span>
              )}
            </div>

            {/* Reactions */}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
              <div className="absolute -bottom-2 left-2 flex gap-1">
                {Object.entries(message.reactions).map(([emoji, users]) => (
                  users.length > 0 && (
                    <Badge 
                      key={emoji}
                      variant="secondary"
                      className="text-xs px-1 py-0 h-5 cursor-pointer"
                      onClick={() => handleReaction(message.id, emoji)}
                    >
                      {emoji} {users.length}
                    </Badge>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Quick reactions on hover */}
          <div className={cn(
            "absolute -top-8 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
            isOwn ? "right-0" : "left-0"
          )}>
            {['👍', '❤️', '😂'].map(emoji => (
              <Button
                key={emoji}
                size="sm"
                variant="secondary"
                className="w-8 h-8 p-0"
                onClick={() => handleReaction(message.id, emoji)}
              >
                {emoji}
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              className="w-8 h-8 p-0"
              onClick={() => setReplyingTo(message)}
            >
              <Reply className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Community not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/app/social')}
            className="md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <Avatar className="w-10 h-10">
            <AvatarImage src={community.avatar_url} />
            <AvatarFallback>{community.name[0]}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h2 className="font-semibold text-base">{community.name}</h2>
            <p className="text-xs text-muted-foreground">
              {onlineUsers.length > 0 ? (
                <span className="text-green-600">
                  {onlineUsers.length} online
                </span>
              ) : (
                `${community.member_count || 0} members`
              )}
              {typingUsers.length > 0 && (
                <span className="ml-2 italic">
                  {typingUsers.join(', ')} typing...
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Search className="h-5 w-5" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/app/community/${id}`)}>
                <Users className="mr-2 h-4 w-4" />
                Community Info
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Search className="mr-2 h-4 w-4" />
                Search Messages
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Image className="mr-2 h-4 w-4" />
                Media & Files
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea 
        className="flex-1 p-4 overflow-y-auto bg-muted/10"
      >
        <div className="space-y-2">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Reply Preview */}
      {replyingTo && (
        <div className="bg-muted px-4 py-2 flex items-center justify-between border-t">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Replying to {replyingTo.farmer?.name}
            </p>
            <p className="text-sm truncate">{replyingTo.content}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyingTo(null)}
          >
            ✕
          </Button>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-card border-t p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Smile className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="icon">
            <Paperclip className="h-5 w-5" />
          </Button>

          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1"
            disabled={sending}
          />

          {newMessage.trim() ? (
            <Button 
              size="icon"
              onClick={sendMessage}
              disabled={sending}
            >
              <Send className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant={isRecording ? "destructive" : "default"}
              onClick={() => setIsRecording(!isRecording)}
            >
              <Mic className={cn("h-5 w-5", isRecording && "animate-pulse")} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}