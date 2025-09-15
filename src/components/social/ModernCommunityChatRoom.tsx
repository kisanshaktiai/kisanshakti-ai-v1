import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { 
  Send, Paperclip, Mic, MicOff, Smile, Image as ImageIcon,
  Phone, Video, ArrowLeft, MoreVertical, Search, Hash,
  Users, Circle, Heart, ThumbsUp, MessageSquare, Reply,
  CheckCheck, Clock, X, Plus, GripVertical, Sparkles,
  Camera, Settings, Shield, Pin, Bookmark, Share2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

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
    isOnline?: boolean;
  };
}

interface Community {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  member_count?: number;
  community_type?: string;
  tags?: string[];
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🙏', '👏', '🔥'];

export function ModernCommunityChatRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  const [community, setCommunity] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Hide FAB, bottom navigation, and header on mount for full screen experience
  useEffect(() => {
    // Hide navigation elements
    const fab = document.querySelector('.floating-action-button');
    const bottomNav = document.querySelector('nav.fixed.bottom-0');
    const appLayout = document.querySelector('.pb-nav');
    const header = document.querySelector('header');
    const mainContainer = document.querySelector('main');
    
    if (fab) (fab as HTMLElement).style.display = 'none';
    if (bottomNav) (bottomNav as HTMLElement).style.display = 'none';
    if (header) (header as HTMLElement).style.display = 'none';
    if (appLayout) {
      appLayout.classList.remove('pb-nav');
      appLayout.classList.add('pb-0');
    }
    if (mainContainer) {
      mainContainer.classList.add('!p-0');
    }
    
    // Add full screen class to body
    document.body.classList.add('chat-fullscreen');
    
    return () => {
      if (fab) (fab as HTMLElement).style.display = '';
      if (bottomNav) (bottomNav as HTMLElement).style.display = '';
      if (header) (header as HTMLElement).style.display = '';
      if (appLayout) {
        appLayout.classList.add('pb-nav');
        appLayout.classList.remove('pb-0');
      }
      if (mainContainer) {
        mainContainer.classList.remove('!p-0');
      }
      document.body.classList.remove('chat-fullscreen');
    };
  }, []);

  useEffect(() => {
    if (id) {
      fetchCommunity();
      fetchMessages();
      subscribeToMessages();
    }
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchCommunity = async () => {
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
    }
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmers!community_messages_farmer_id_fkey (
            id,
            farmer_name
          )
        `)
        .eq('community_id', id)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      setMessages(data?.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        farmer_id: msg.farmer_id || '',
        created_at: msg.created_at || '',
        updated_at: msg.updated_at || undefined,
        is_edited: msg.is_edited || false,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        reactions: msg.reactions as { [key: string]: string[] } || {},
        reply_to: msg.parent_message_id || undefined,
        status: 'read' as const,
        farmer: {
          id: msg.farmer?.id || '',
          name: msg.farmer?.farmer_name || 'Unknown User',
          avatar_url: undefined,
          isOnline: Math.random() > 0.5
        }
      })) || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`community-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'community_messages',
        filter: `community_id=eq.${id}`,
      }, async (payload) => {
        const newMsg = payload.new as any;
        
        const { data: farmerData } = await supabase
          .from('farmers')
          .select('id, farmer_name')
          .eq('id', newMsg.farmer_id)
          .single();

        const formattedMessage = {
          ...newMsg,
          farmer: {
            id: farmerData?.id,
            name: farmerData?.farmer_name || 'Unknown User',
            isOnline: true
          }
        };

        setMessages(prev => [...prev, formattedMessage]);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineUsers(Object.keys(state).length);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user?.id) return;

    try {
      const messageData = {
        community_id: id,
        farmer_id: user.id,
        content: newMessage.trim(),
        message_type: 'text',
        parent_message_id: replyingTo?.id || null,
      };

      const { error } = await supabase
        .from('community_messages')
        .insert(messageData);

      if (error) throw error;

      setNewMessage('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user?.id) return;

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const reactions = { ...(message.reactions || {}) };
      if (!reactions[emoji]) reactions[emoji] = [];

      const userIndex = reactions[emoji].indexOf(user.id);
      if (userIndex > -1) {
        reactions[emoji].splice(userIndex, 1);
      } else {
        reactions[emoji].push(user.id);
      }

      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }

      const { error } = await supabase
        .from('community_messages')
        .update({ reactions })
        .eq('id', messageId);

      if (!error) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, reactions } : msg
        ));
      }
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    return format(date, 'HH:mm');
  };

  const MessageBubble = ({ message }: { message: Message }) => {
    const isOwn = message.farmer_id === user?.id;
    const [showActions, setShowActions] = useState(false);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "flex gap-2 mb-4 group",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {!isOwn && (
          <div className="relative">
            <Avatar className="w-10 h-10 border-2 border-background shadow-sm">
              <AvatarImage src={message.farmer?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary font-semibold">
                {message.farmer?.name?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {message.farmer?.isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background animate-pulse" />
            )}
          </div>
        )}

        <div className={cn(
          "max-w-[70%] relative",
          isOwn ? "items-end" : "items-start"
        )}>
          {!isOwn && (
            <span className="text-xs font-semibold text-primary/80 ml-3 mb-1 block">
              {message.farmer?.name}
            </span>
          )}

          <div className={cn(
            "relative group/bubble",
            isOwn ? "ml-auto" : ""
          )}>
            <div className={cn(
              "px-4 py-2.5 rounded-2xl shadow-sm transition-all",
              isOwn 
                ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-tr-sm" 
                : "bg-card border border-border/50 rounded-tl-sm hover:border-border"
            )}>
              {replyingTo?.id === message.id && (
                <div className="text-xs opacity-75 border-l-2 border-current pl-2 mb-2">
                  Replying to message
                </div>
              )}
              
              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                {message.content}
              </p>
              
              <div className={cn(
                "flex items-center gap-1.5 mt-1",
                isOwn ? "justify-end" : "justify-start"
              )}>
                <span className="text-[10px] opacity-60">
                  {formatMessageTime(message.created_at)}
                </span>
                {isOwn && (
                  <CheckCheck className="w-3 h-3 text-blue-400" />
                )}
              </div>
            </div>

            {/* Reactions */}
            {message.reactions && Object.keys(message.reactions).length > 0 && (
              <div className="absolute -bottom-3 left-2 flex gap-1 z-10">
                {Object.entries(message.reactions).map(([emoji, users]) => (
                  users.length > 0 && (
                    <motion.button
                      key={emoji}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleReaction(message.id, emoji)}
                      className="bg-background/95 backdrop-blur-sm border border-border/50 text-xs px-2 py-1 rounded-full flex items-center gap-1 hover:bg-muted transition-colors"
                    >
                      <span>{emoji}</span>
                      <span className="font-medium">{users.length}</span>
                    </motion.button>
                  )
                ))}
              </div>
            )}

            {/* Quick Actions */}
            <AnimatePresence>
              {showActions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={cn(
                    "absolute -top-10 flex gap-1 z-20",
                    isOwn ? "right-0" : "left-0"
                  )}
                >
                  <div className="bg-background/95 backdrop-blur-md border border-border/50 rounded-xl shadow-xl flex gap-0.5 p-1">
                    {QUICK_REACTIONS.map(emoji => (
                      <Button
                        key={emoji}
                        size="sm"
                        variant="ghost"
                        className="w-8 h-8 p-0 hover:bg-primary/10"
                        onClick={() => handleReaction(message.id, emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                    <div className="w-px bg-border/50 mx-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-8 h-8 p-0 hover:bg-primary/10"
                      onClick={() => setReplyingTo(message)}
                    >
                      <Reply className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="fixed inset-0 bg-gradient-to-br from-background via-background/98 to-background/95 flex flex-col z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Ultra Modern Header with Glassmorphism */}
      <motion.div 
        className="bg-gradient-to-b from-card/90 via-card/80 to-card/70 backdrop-blur-2xl border-b border-border/30"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 100 }}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="hover:bg-primary/10 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </motion.div>
            
            <div className="flex items-center gap-3">
              <motion.div 
                className="relative"
                whileHover={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5 }}
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/20 to-accent/20 flex items-center justify-center shadow-lg">
                  <Hash className="w-6 h-6 text-primary" />
                </div>
                <motion.div 
                  className="absolute -bottom-1 -right-1"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <div className="w-3.5 h-3.5 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background shadow-lg shadow-green-500/50" />
                </motion.div>
              </motion.div>
              
              <div>
                <h3 className="font-bold text-lg bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                  {community?.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/30">
                    <Users className="w-3 h-3" />
                    <span className="font-medium">{community?.member_count || 0}</span>
                  </div>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                    <Circle className="w-2 h-2 fill-current animate-pulse" />
                    <span className="font-medium">{onlineUsers} active</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {[Search, Phone, Video, MoreVertical].map((Icon, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-primary/10 rounded-xl"
                >
                  <Icon className="w-5 h-5" />
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Typing Indicator */}
      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-2 overflow-hidden"
          >
            <p className="text-xs text-muted-foreground animate-pulse">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <MessageSquare className="w-10 h-10 text-primary/50" />
            </div>
            <p className="text-muted-foreground text-center">
              No messages yet.<br />Start the conversation!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply Preview */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-border/50 bg-muted/50 px-4 py-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Reply className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium">Replying to {replyingTo.farmer?.name}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {replyingTo.content}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setReplyingTo(null)}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modern Input Area */}
      <div className="border-t border-border/50 bg-card/80 backdrop-blur-xl p-4">
        <div className="flex items-end gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </Button>
          
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="pr-24 bg-muted/50 border-border/50 focus:border-primary/50 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-primary/10"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8 hover:bg-primary/10"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                <Smile className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon"
            className={cn(
              "hover:bg-primary/10 transition-all",
              isRecording && "text-red-500 animate-pulse"
            )}
            onClick={() => setIsRecording(!isRecording)}
          >
            {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </Button>
          
          <Button 
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            size="icon"
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 active:scale-95"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}