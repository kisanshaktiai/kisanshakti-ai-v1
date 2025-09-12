import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Search,
  MoreVertical,
  Phone,
  Video,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Reply,
  Users,
  Circle,
  Hash,
  Pin,
  Star,
  Info,
  Camera,
  File,
  MapPin,
  AtSign,
  Heart,
  ThumbsUp,
  MessageSquare,
  X,
  Plus,
} from 'lucide-react';
import { format, isToday, isYesterday, differenceInMinutes, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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
  const queryClient = useQueryClient();
  
  // Get farmer ID from custom auth session
  const [userId, setUserId] = useState<string | null>(null);
  
  useEffect(() => {
    // Get farmer ID from auth storage
    const authStorage = localStorage.getItem('auth-storage');
    if (authStorage) {
      const authData = JSON.parse(authStorage);
      const sessionData = authData?.state?.session;
      if (sessionData?.farmerId) {
        setUserId(sessionData.farmerId);
      }
    }
  }, []);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch community details with React Query
  const { data: community, isLoading: loadingCommunity } = useQuery({
    queryKey: ['community', id],
    queryFn: async () => {
      if (!id) throw new Error('No community ID');
      
      const { data, error } = await supabase
        .from('communities')
        .select(`
          *,
          community_members!inner(
            farmer_id
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Check if user is a member
  const { data: isMember } = useQuery({
    queryKey: ['community-member', id, userId],
    queryFn: async () => {
      if (!id || !userId) return false;
      
      const { data, error } = await supabase
        .from('community_members')
        .select('id')
        .eq('community_id', id)
        .eq('farmer_id', userId)
        .maybeSingle();

      return !!data;
    },
    enabled: !!id && !!userId,
  });

  // Fetch messages with React Query
  const { data: messagesData, refetch: refetchMessages } = useQuery({
    queryKey: ['community-messages', id],
    queryFn: async () => {
      if (!id) return [];
      
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmers!community_messages_farmer_id_fkey(
            id,
            farmer_name,
            mobile_number
          )
        `)
        .eq('community_id', id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!isMember,
  });

  // Update messages when data changes
  useEffect(() => {
    if (messagesData) {
      setMessages(messagesData.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        farmer_id: msg.farmer_id || '',
        created_at: msg.created_at || new Date().toISOString(),
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        reactions: typeof msg.reactions === 'object' && msg.reactions !== null ? msg.reactions as { [key: string]: string[] } : {},
        status: 'read' as const,
        farmer: msg.farmer ? {
          id: msg.farmer.id,
          name: msg.farmer.farmer_name || 'Unknown User',
          avatar_url: undefined
        } : undefined
      })));
      
      // Scroll to bottom on new messages
      setTimeout(scrollToBottom, 100);
    }
  }, [messagesData]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!id || !userId || !isMember) return;

    const channel = supabase
      .channel(`community-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_messages',
        filter: `community_id=eq.${id}`,
      }, () => {
        // Refetch messages when new ones arrive
        refetchMessages();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'community_messages',
        filter: `community_id=eq.${id}`,
      }, () => {
        // Refetch messages when updated
        refetchMessages();
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
            name: 'Farmer',
            last_seen: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId, isMember, refetchMessages]);

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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageContent: string) => {
      if (!id || !userId) throw new Error('Missing required data');
      
      const messageData: any = {
        community_id: id,
        farmer_id: userId,
        content: messageContent,
        message_type: 'text',
      };

      if (replyingTo) {
        messageData.parent_message_id = replyingTo.id;
      }

      const { data, error } = await supabase
        .from('community_messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setNewMessage('');
      setReplyingTo(null);
      refetchMessages();
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    },
  });

  const sendMessage = () => {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !isMember) return;
    
    sendMessageMutation.mutate(trimmedMessage);
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
    const isSelected = selectedMessage === message.id;

    return (
      <div 
        className={cn(
          "flex gap-2 mb-3 group px-2 py-1 rounded-lg transition-all",
          isOwn ? "justify-end" : "justify-start",
          isSelected && "bg-primary/5"
        )}
        onClick={() => setSelectedMessage(isSelected ? null : message.id)}
      >
        {!isOwn && (
          <Avatar className="w-9 h-9 relative flex-shrink-0">
            <AvatarImage src={message.farmer?.avatar_url} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {message.farmer?.name?.[0]?.toUpperCase()}
            </AvatarFallback>
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
            )}
          </Avatar>
        )}
        
        <div className={cn(
          "max-w-[75%] sm:max-w-[65%] relative",
          isOwn ? "items-end" : "items-start"
        )}>
          {!isOwn && (
            <span className="text-xs font-medium text-primary/70 ml-3 mb-1 block">
              {message.farmer?.name}
            </span>
          )}
          
          <div className={cn(
            "rounded-2xl px-4 py-2.5 relative shadow-sm",
            isOwn 
              ? "bg-primary text-primary-foreground rounded-tr-sm" 
              : "bg-card border border-border rounded-tl-sm"
          )}>
            {message.reply_to && (
              <div className="text-xs opacity-75 border-l-2 border-current pl-2 mb-2">
                <span className="font-medium">Replying to message</span>
              </div>
            )}
            
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </p>
            
            <div className={cn(
              "flex items-center gap-1.5 mt-1.5",
              isOwn ? "justify-end" : "justify-start"
            )}>
              <span className="text-[10px] opacity-60">
                {formatMessageTime(message.created_at)}
              </span>
              {isOwn && (
                <span className="text-[10px]">
                  {message.status === 'sending' && <Clock className="w-3 h-3 opacity-60" />}
                  {message.status === 'sent' && <Check className="w-3 h-3 opacity-60" />}
                  {message.status === 'delivered' && <CheckCheck className="w-3 h-3 opacity-60" />}
                  {message.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-400" />}
                </span>
              )}
            </div>

            {/* Reactions */}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
              <div className="absolute -bottom-3 left-2 flex gap-1 z-10">
                {Object.entries(message.reactions).map(([emoji, users]) => (
                  users.length > 0 && (
                    <Badge 
                      key={emoji}
                      variant="secondary"
                      className="text-xs px-1.5 py-0.5 h-5 cursor-pointer hover:scale-110 transition-transform bg-background border"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReaction(message.id, emoji);
                      }}
                    >
                      {emoji} {users.length}
                    </Badge>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Quick actions on hover */}
          <div className={cn(
            "absolute -top-9 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20",
            isOwn ? "right-0" : "left-0"
          )}>
            <div className="bg-background border rounded-lg shadow-lg flex gap-0.5 p-1">
              {['👍', '❤️', '😂', '🙏', '👏'].map(emoji => (
                <Button
                  key={emoji}
                  size="sm"
                  variant="ghost"
                  className="w-8 h-8 p-0 hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction(message.id, emoji);
                  }}
                >
                  {emoji}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="w-8 h-8 p-0 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setReplyingTo(message);
                }}
              >
                <Reply className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥', '🎉', '💯'];

  if (loadingCommunity) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <Users className="w-16 h-16 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">Community not found</p>
        <Button onClick={() => navigate('/app/social')}>
          Back to Communities
        </Button>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-6 p-4">
        <div className="text-center max-w-md">
          <Users className="w-20 h-20 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">{community.name}</h2>
          <p className="text-muted-foreground mb-6">{community.description}</p>
          <Button 
            size="lg"
            onClick={async () => {
              if (!userId) {
                toast.error('Please login to join this community');
                return;
              }
              
              try {
                await supabase
                  .from('community_members')
                  .insert({
                    community_id: id,
                    farmer_id: userId,
                    role: 'member'
                  });
                
                queryClient.invalidateQueries({ queryKey: ['community-member', id, userId] });
                toast.success('Successfully joined the community!');
              } catch (error) {
                console.error('Error joining community:', error);
                toast.error('Failed to join community');
              }
            }}
          >
            Join Community to Chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Enhanced Header */}
      <div className="bg-card/95 backdrop-blur-lg border-b shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/app/social')}
              className="hover:bg-primary/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            
            <Avatar className="w-11 h-11 ring-2 ring-primary/20">
              <AvatarImage src={community.icon_url || community.cover_image_url} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {community.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1">
              <h2 className="font-semibold text-base flex items-center gap-2">
                {community.name}
                {community.is_verified && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    <Check className="w-3 h-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {onlineUsers.length > 0 ? (
                  <span className="flex items-center gap-1">
                    <Circle className="w-2 h-2 fill-green-500 text-green-500 animate-pulse" />
                    <span className="text-green-600 font-medium">
                      {onlineUsers.length} online
                    </span>
                  </span>
                ) : (
                  <span>{community.member_count || 0} members</span>
                )}
                {typingUsers.length > 0 && (
                  <span className="italic animate-pulse">
                    typing...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowSearch(!showSearch)}
              className="hover:bg-primary/10"
            >
              <Search className="h-5 w-5" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => navigate(`/app/community/${id}`)}>
                  <Info className="mr-2 h-4 w-4" />
                  Community Info
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Users className="mr-2 h-4 w-4" />
                  View Members
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Pin className="mr-2 h-4 w-4" />
                  Pinned Messages
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Shared Media
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  Leave Community
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 pb-3 animate-fade-in">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Messages Area with Background Pattern */}
      <ScrollArea className="flex-1 relative">
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative p-4 space-y-1 min-h-full">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="bg-primary/10 rounded-full p-6 mb-4">
                <MessageSquare className="w-12 h-12 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Start the Conversation</h3>
              <p className="text-muted-foreground max-w-sm">
                Be the first to send a message in this community chat!
              </p>
            </div>
          ) : (
            <>
              {messages
                .filter(msg => !searchQuery || msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Reply Preview */}
      {replyingTo && (
        <div className="bg-card/95 backdrop-blur px-4 py-3 flex items-center gap-3 border-t animate-slide-up">
          <Reply className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary">
              Replying to {replyingTo.farmer?.name}
            </p>
            <p className="text-sm text-muted-foreground truncate">
              {replyingTo.content}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReplyingTo(null)}
            className="hover:bg-destructive/10"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Enhanced Input Area */}
      <div className="bg-card/95 backdrop-blur border-t shadow-lg">
        <div className="p-3">
          {/* Emoji Quick Access */}
          {showEmojiPicker && (
            <div className="mb-2 p-2 bg-muted rounded-lg flex flex-wrap gap-2 animate-fade-in">
              {emojis.map(emoji => (
                <Button
                  key={emoji}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:scale-125 transition-transform"
                  onClick={() => {
                    setNewMessage(prev => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          )}
          
          <div className="flex items-end gap-2">
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="hover:bg-primary/10"
              >
                <Smile className="h-5 w-5" />
              </Button>
              
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={(e) => {
                  // Handle file upload
                  const file = e.target.files?.[0];
                  if (file) {
                    toast.info('File upload coming soon!');
                  }
                }}
              />
              
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="hover:bg-primary/10"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="hover:bg-primary/10 hidden sm:inline-flex"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="ghost" size="sm" className="flex flex-col gap-1 h-auto py-3">
                      <Camera className="h-5 w-5" />
                      <span className="text-xs">Camera</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="flex flex-col gap-1 h-auto py-3">
                      <File className="h-5 w-5" />
                      <span className="text-xs">Document</span>
                    </Button>
                    <Button variant="ghost" size="sm" className="flex flex-col gap-1 h-auto py-3">
                      <MapPin className="h-5 w-5" />
                      <span className="text-xs">Location</span>
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <Textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value);
                handleTyping();
              }}
              onKeyDown={handleKeyPress}
              placeholder={isMember ? "Type a message..." : "Join community to send messages"}
              className="flex-1 min-h-[44px] max-h-32 resize-none bg-muted/50"
              disabled={sending || !isMember}
              rows={1}
            />

            {newMessage.trim() ? (
              <Button 
                size="icon"
                onClick={sendMessage}
                disabled={sending || !isMember}
                className="hover:scale-105 transition-transform"
              >
                <Send className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant={isRecording ? "destructive" : "default"}
                onClick={() => {
                  setIsRecording(!isRecording);
                  if (!isRecording) {
                    toast.info('Voice notes coming soon!');
                  }
                }}
                disabled={!isMember}
                className="hover:scale-105 transition-transform"
              >
                <Mic className={cn("h-5 w-5", isRecording && "animate-pulse")} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
