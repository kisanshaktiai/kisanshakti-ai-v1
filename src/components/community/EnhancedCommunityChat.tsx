import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Send, Paperclip, Smile, MoreVertical, Mic, MicOff,
  Phone, Video, Info, Users, Hash, Star, Trophy, Medal,
  MessageSquare, Heart, ThumbsUp, Laugh, Pin, Shield,
  Languages, Camera, FileText, BarChart, Calendar,
  ChevronDown, Reply, Edit, Trash, Flag, Check, X,
  TrendingUp, Clock, MapPin, Globe, Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface Message {
  id: string;
  community_id: string;
  farmer_id: string;
  content: string;
  message_type: 'text' | 'image' | 'video' | 'voice' | 'document' | 'poll';
  attachments: any[];
  parent_message_id?: string;
  reactions: Record<string, string[]>;
  is_pinned: boolean;
  is_verified: boolean;
  is_edited: boolean;
  edited_at?: string;
  translation_data: Record<string, string>;
  metadata: any;
  created_at: string;
  updated_at: string;
  farmer?: {
    id: string;
    farmer_name: string;
    avatar_url?: string;
    is_expert?: boolean;
  };
  replies?: Message[];
  poll?: {
    question: string;
    options: Array<{ id: string; text: string; votes: number }>;
    total_votes: number;
    expires_at?: string;
    user_voted?: boolean;
  };
}

interface OnlineUser {
  id: string;
  name: string;
  avatar_url?: string;
  status: 'online' | 'typing' | 'idle';
  last_seen?: string;
}

interface CommunityMemberActivity {
  farmer_id: string;
  points: number;
  level: number;
  badges: string[];
  total_messages: number;
  helpful_answers: number;
  streak_days: number;
}

const REACTIONS = [
  { emoji: '👍', name: 'like' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '😂', name: 'laugh' },
  { emoji: '🌱', name: 'sprout' },
  { emoji: '✅', name: 'check' },
  { emoji: '🔥', name: 'fire' }
];

const LEVEL_COLORS = [
  'text-gray-500',
  'text-green-500', 
  'text-blue-500',
  'text-purple-500',
  'text-orange-500',
  'text-red-500'
];

const LEVEL_BADGES = [
  { level: 1, icon: Star, name: 'Beginner' },
  { level: 2, icon: Medal, name: 'Active' },
  { level: 3, icon: Trophy, name: 'Expert' },
  { level: 4, icon: Shield, name: 'Master' },
  { level: 5, icon: Sparkles, name: 'Legend' }
];

interface EnhancedCommunityChatProps {
  communityId: string;
  communityName: string;
  communityType: string;
  memberCount: number;
  language: string;
  tags: string[];
  isModerator?: boolean;
}

export function EnhancedCommunityChat({ 
  communityId, 
  communityName,
  communityType,
  memberCount,
  language,
  tags,
  isModerator = false
}: EnhancedCommunityChatProps) {
  const { toast } = useToast();
  
  // Get farmer ID from custom auth session
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    // Get farmer data from localStorage session
    const session = localStorage.getItem('farmSession');
    if (session) {
      const sessionData = JSON.parse(session);
      // Fetch farmer details
      supabase
        .from('farmers')
        .select('*')
        .eq('id', sessionData.farmerId)
        .single()
        .then(({ data }) => {
          if (data) {
            setUser({
              id: data.id,
              farmer_name: data.farmer_name,
              name: data.farmer_name
            });
          }
        });
    }
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [showTranslation, setShowTranslation] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<any>(null);
  const [memberActivity, setMemberActivity] = useState<CommunityMemberActivity | null>(null);
  const [leaderboard, setLeaderboard] = useState<CommunityMemberActivity[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Voice features
  const { isListening, startListening, stopListening } = useSpeechRecognition({
    onTranscript: (transcript) => {
      setNewMessage(prev => prev + ' ' + transcript);
    },
    language: selectedLanguage === 'hi' ? 'hi-IN' : 
             selectedLanguage === 'mr' ? 'mr-IN' :
             selectedLanguage === 'ta' ? 'ta-IN' :
             selectedLanguage === 'pa' ? 'pa-IN' : 'en-US'
  });

  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech({
    language: selectedLanguage === 'hi' ? 'hi-IN' : 
             selectedLanguage === 'mr' ? 'mr-IN' :
             selectedLanguage === 'ta' ? 'ta-IN' :
             selectedLanguage === 'pa' ? 'pa-IN' : 'en-US'
  });

  useEffect(() => {
    fetchMessages();
    fetchPinnedMessages();
    fetchMemberActivity();
    fetchLeaderboard();
    subscribeToMessages();
    subscribeToPresence();
  }, [communityId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmers!community_messages_farmer_id_fkey (
            id,
            farmer_name,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .is('parent_message_id', null)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      // Fetch replies for each message
      const messagesWithReplies = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: replies } = await supabase
            .from('community_messages')
            .select(`
              *,
              farmer:farmers!community_messages_farmer_id_fkey (
                id,
                farmer_name,
                avatar_url
              )
            `)
            .eq('parent_message_id', msg.id)
            .order('created_at', { ascending: true });

          return {
            ...msg,
            message_type: msg.message_type || 'text',
            attachments: msg.attachments || [],
            reactions: msg.reactions || {},
            translation_data: msg.translation_data || {},
            metadata: msg.metadata || {},
            replies: (replies || []).map(r => ({
              ...r,
              message_type: r.message_type || 'text',
              attachments: r.attachments || [],
              reactions: r.reactions || {},
              translation_data: r.translation_data || {},
              metadata: r.metadata || {}
            }))
          };
        })
      );

      setMessages(messagesWithReplies as any);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPinnedMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmers!community_messages_farmer_id_fkey (
            id,
            farmer_name,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .eq('is_pinned', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPinnedMessages((data || []) as any);
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
    }
  };

  const fetchMemberActivity = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('community_member_activity')
        .select('*')
        .eq('community_id', communityId)
        .eq('farmer_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setMemberActivity(data ? { ...data, badges: (data.badges as any) || [] } : null);
    } catch (error) {
      console.error('Error fetching member activity:', error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from('community_member_activity')
        .select(`
          *,
          farmer:farmers!community_member_activity_farmer_id_fkey (
            id,
            farmer_name,
            avatar_url
          )
        `)
        .eq('community_id', communityId)
        .order('points', { ascending: false })
        .limit(10);

      if (error) throw error;
      setLeaderboard((data || []).map(d => ({ ...d, badges: (d.badges as any) || [] })));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`community-${communityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_messages',
          filter: `community_id=eq.${communityId}`
        },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // Fetch farmer details
          const { data: farmerData } = await supabase
            .from('farmers')
            .select('id, farmer_name, avatar_url')
            .eq('id', newMsg.farmer_id)
            .single();

          const formattedMessage = {
            ...newMsg,
            farmer: farmerData,
            replies: []
          };

          if (newMsg.parent_message_id) {
            // Add as reply
            setMessages(prev => prev.map(msg => 
              msg.id === newMsg.parent_message_id
                ? { ...msg, replies: [...(msg.replies || []), formattedMessage] }
                : msg
            ));
          } else {
            // Add as new message
            setMessages(prev => [...prev, formattedMessage]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_messages'
        },
        (payload) => {
          const updated = payload.new as any;
          setMessages(prev => prev.map(msg => 
            msg.id === updated.id ? { ...msg, ...updated } : msg
          ));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const subscribeToPresence = () => {
    const channel = supabase.channel(`presence-${communityId}`);
    
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat().map((u: any) => ({
          id: u.id,
          name: u.name,
          avatar_url: u.avatar_url,
          status: u.status || 'online',
          last_seen: u.last_seen
        }));
        setOnlineUsers(users);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user) {
          await channel.track({
            id: user.id,
            name: (user as any).farmer_name || user.name || 'Anonymous',
            status: 'online',
            last_seen: new Date().toISOString()
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !attachmentPreview) return;
    if (!user?.id) return;

    try {
      const messageData = {
        community_id: communityId,
        farmer_id: user.id,
        content: newMessage.trim(),
        message_type: attachmentPreview ? attachmentPreview.type : 'text',
        attachments: attachmentPreview ? [attachmentPreview] : [],
        parent_message_id: replyingTo?.id || null,
        reactions: {},
        is_pinned: false,
        is_verified: false,
        is_edited: false,
        translation_data: {},
        metadata: {}
      };

      const { error } = await supabase
        .from('community_messages')
        .insert(messageData);

      if (error) throw error;

      setNewMessage('');
      setReplyingTo(null);
      setAttachmentPreview(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive"
      });
    }
  };

  const handleReaction = async (messageId: string, reaction: string) => {
    if (!user?.id) return;

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const reactions = { ...message.reactions };
      if (!reactions[reaction]) reactions[reaction] = [];

      const userIndex = reactions[reaction].indexOf(user.id);
      if (userIndex > -1) {
        reactions[reaction].splice(userIndex, 1);
      } else {
        reactions[reaction].push(user.id);
      }

      const { error } = await supabase
        .from('community_messages')
        .update({ reactions })
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const handlePinMessage = async (messageId: string) => {
    if (!isModerator) return;

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      const { error } = await supabase
        .from('community_messages')
        .update({ is_pinned: !message.is_pinned })
        .eq('id', messageId);

      if (error) throw error;

      toast({
        title: message.is_pinned ? "Message unpinned" : "Message pinned",
        description: message.is_pinned ? "Message removed from pins" : "Message added to pins"
      });
    } catch (error) {
      console.error('Error pinning message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('community_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;

      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast({
        title: "Message deleted",
        description: "Your message has been deleted"
      });
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const type = file.type.startsWith('image/') ? 'image' :
                   file.type.startsWith('video/') ? 'video' :
                   file.type.startsWith('audio/') ? 'voice' : 'document';
      
      setAttachmentPreview({
        type,
        url: reader.result,
        name: file.name,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleVoiceRecord = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return format(date, 'HH:mm');
    }
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const getTagColor = (type: string) => {
    switch (type) {
      case 'state': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'crop': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'language': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'practice': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const MessageBubble = ({ message, isReply = false }: { message: Message; isReply?: boolean }) => {
    const isOwnMessage = message.farmer_id === user?.id;
    const userActivity = leaderboard.find(l => l.farmer_id === message.farmer_id);
    const level = userActivity?.level || 1;
    const LevelIcon = LEVEL_BADGES[level - 1]?.icon || Star;

    return (
      <div
        className={cn(
          "flex gap-3 group",
          isOwnMessage ? "flex-row-reverse" : "",
          isReply ? "ml-12 mt-2" : "mt-4"
        )}
      >
        <Avatar className={cn("w-10 h-10", isReply && "w-8 h-8")}>
          <AvatarImage src={message.farmer?.avatar_url} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {message.farmer?.farmer_name?.charAt(0)}
          </AvatarFallback>
        </Avatar>
        
        <div className={cn(
          "flex flex-col gap-1 max-w-[70%]",
          isOwnMessage ? "items-end" : ""
        )}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground flex items-center gap-1">
              {message.farmer?.farmer_name}
              <LevelIcon className={cn("w-3 h-3", LEVEL_COLORS[level])} />
            </span>
            {message.is_verified && (
              <Badge variant="secondary" className="text-xs">
                <Check className="w-3 h-3 mr-1" /> Verified
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatMessageTime(message.created_at)}
            </span>
            {message.is_edited && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>
          
          {replyingTo && message.parent_message_id === replyingTo.id && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mb-1">
              Replying to {replyingTo.farmer?.farmer_name}
            </div>
          )}

          <Card className={cn(
            "p-3",
            isOwnMessage 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted",
            message.is_pinned && "border-2 border-yellow-500"
          )}>
            {message.message_type === 'poll' && message.poll && (
              <div className="space-y-2">
                <p className="font-medium">{message.poll.question}</p>
                {message.poll.options.map((option) => (
                  <div key={option.id} className="flex items-center justify-between">
                    <span>{option.text}</span>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(option.votes / Math.max(message.poll!.total_votes, 1)) * 100} 
                        className="w-20 h-2"
                      />
                      <span className="text-xs">{option.votes}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {message.message_type === 'image' && message.attachments[0] && (
              <img 
                src={message.attachments[0].url} 
                alt="Attachment" 
                className="rounded-lg max-w-full"
              />
            )}
            
            {message.message_type === 'video' && message.attachments[0] && (
              <video 
                src={message.attachments[0].url} 
                controls 
                className="rounded-lg max-w-full"
              />
            )}
            
            {message.message_type === 'text' && (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
            
            {showTranslation && message.translation_data[selectedLanguage] && (
              <p className="text-sm mt-2 pt-2 border-t opacity-80">
                {message.translation_data[selectedLanguage]}
              </p>
            )}
          </Card>

          <div className="flex items-center gap-1 mt-1">
            {REACTIONS.map((reaction) => (
              <button
                key={reaction.name}
                onClick={() => handleReaction(message.id, reaction.name)}
                className={cn(
                  "p-1 rounded transition-all",
                  message.reactions[reaction.name]?.includes(user?.id || '') 
                    ? "bg-primary/20" 
                    : "hover:bg-muted opacity-0 group-hover:opacity-100"
                )}
              >
                <span className="text-sm">
                  {reaction.emoji}
                  {message.reactions[reaction.name]?.length > 0 && (
                    <span className="text-xs ml-1">
                      {message.reactions[reaction.name].length}
                    </span>
                  )}
                </span>
              </button>
            ))}
            
            <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="w-6 h-6"
                onClick={() => setReplyingTo(message)}
              >
                <Reply className="w-3 h-3" />
              </Button>
              
              {message.farmer_id === user?.id && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => setEditingMessage(message)}
                  >
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6"
                    onClick={() => handleDeleteMessage(message.id)}
                  >
                    <Trash className="w-3 h-3" />
                  </Button>
                </>
              )}
              
              {isModerator && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-6 h-6"
                  onClick={() => handlePinMessage(message.id)}
                >
                  <Pin className={cn("w-3 h-3", message.is_pinned && "fill-current")} />
                </Button>
              )}
              
              <Button
                size="icon"
                variant="ghost"
                className="w-6 h-6"
                onClick={() => speak(message.content)}
              >
                {isSpeaking ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {message.replies && message.replies.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.replies.map((reply) => (
                <MessageBubble key={reply.id} message={reply} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <Card className="rounded-none border-x-0 border-t-0 shadow-sm">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Hash className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-lg">{communityName}</h3>
              </div>
              <Badge variant="secondary" className={getTagColor(communityType)}>
                {communityType}
              </Badge>
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{memberCount} members</span>
                <span className="text-success">• {onlineUsers.length} online</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTranslation(!showTranslation)}
                >
                  <Languages className="w-4 h-4 mr-1" />
                  Translate
                </Button>
                <Button variant="ghost" size="icon">
                  <Phone className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Video className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon">
                  <Info className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
          
          {/* User Stats */}
          {memberActivity && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" />
                <span className="text-sm">
                  Level {memberActivity.level} • {memberActivity.points} points
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{memberActivity.total_messages} messages</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span className="text-sm">{memberActivity.streak_days} day streak</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none px-4">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="pinned">Pinned ({pinnedMessages.length})</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col m-0">
          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <Hash className="w-12 h-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Reply Preview */}
          {replyingTo && (
            <div className="px-4 py-2 bg-muted/50 border-t flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Reply className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Replying to <strong>{replyingTo.farmer?.farmer_name}</strong>
                </span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {replyingTo.content}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-6 h-6"
                onClick={() => setReplyingTo(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Attachment Preview */}
          {attachmentPreview && (
            <div className="px-4 py-2 bg-muted/50 border-t flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{attachmentPreview.name}</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="w-6 h-6"
                onClick={() => setAttachmentPreview(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Message Input */}
          <Card className="rounded-none border-x-0 border-b-0 shadow-sm">
            <div className="p-4">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                />
                
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-5 h-5" />
                </Button>
                
                <Button variant="ghost" size="icon">
                  <Camera className="w-5 h-5" />
                </Button>
                
                <Input
                  value={editingMessage ? editingMessage.content : newMessage}
                  onChange={(e) => {
                    if (editingMessage) {
                      setEditingMessage({ ...editingMessage, content: e.target.value });
                    } else {
                      setNewMessage(e.target.value);
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={
                    isListening ? "Listening..." : 
                    editingMessage ? "Edit your message..." : 
                    "Type a message..."
                  }
                  className="flex-1"
                />
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile className="w-5 h-5" />
                </Button>
                
                <Button
                  variant={isListening ? "destructive" : "ghost"}
                  size="icon"
                  onClick={handleVoiceRecord}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                
                <Button 
                  onClick={sendMessage}
                  disabled={!newMessage.trim() && !attachmentPreview}
                  size="icon"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pinned" className="flex-1 p-4">
          <ScrollArea className="h-full">
            {pinnedMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No pinned messages
              </div>
            ) : (
              <div className="space-y-4">
                {pinnedMessages.map((message) => (
                  <Card key={message.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium">{message.farmer?.farmer_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(message.created_at)}
                          </span>
                        </div>
                        <p className="text-sm">{message.content}</p>
                      </div>
                      <Pin className="w-4 h-4 text-yellow-500" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="leaderboard" className="flex-1 p-4">
          <ScrollArea className="h-full">
            <div className="space-y-4">
              {leaderboard.map((member, index) => {
                const LevelIcon = LEVEL_BADGES[member.level - 1]?.icon || Star;
                return (
                  <Card key={member.farmer_id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {index < 3 && (
                            <div className="absolute -top-1 -right-1 z-10">
                              {index === 0 && <Trophy className="w-4 h-4 text-yellow-500" />}
                              {index === 1 && <Medal className="w-4 h-4 text-gray-400" />}
                              {index === 2 && <Medal className="w-4 h-4 text-orange-600" />}
                            </div>
                          )}
                          <Avatar>
                            <AvatarFallback>
                              {(member as any).farmer?.farmer_name?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {(member as any).farmer?.farmer_name}
                            <LevelIcon className={cn("w-4 h-4", LEVEL_COLORS[member.level])} />
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Level {member.level} • {member.total_messages} messages
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">{member.points}</p>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="events" className="flex-1 p-4">
          <ScrollArea className="h-full">
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-primary mt-1" />
                  <div className="flex-1">
                    <h4 className="font-medium">Weekly Farmer Meet</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Discussion on crop management techniques
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tomorrow, 4:00 PM
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Online
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        23 attending
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}