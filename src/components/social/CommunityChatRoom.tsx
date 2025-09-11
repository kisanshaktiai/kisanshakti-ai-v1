import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Send, Paperclip, Smile, MoreVertical, 
  Phone, Video, Info, Users, Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';

interface Message {
  id: string;
  community_id: string;
  farmer_id: string;
  message: string;
  created_at: string;
  farmer: {
    name: string;
    avatar_url?: string;
  };
}

interface CommunityChatRoomProps {
  communityId: string;
  communityName: string;
  memberCount: number;
  onlineCount: number;
}

export function CommunityChatRoom({ 
  communityId, 
  communityName, 
  memberCount,
  onlineCount 
}: CommunityChatRoomProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
    subscribeToMessages();
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
        .from('messages')
        .select(`
          *,
          sender:farmers!messages_sender_id_fkey (
            farmer_name
          )
        `)
        .eq('conversation_id', communityId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;

      const formattedMessages = data?.map(msg => ({
        id: msg.id,
        community_id: msg.conversation_id,
        farmer_id: msg.sender_id,
        message: msg.content,
        created_at: msg.created_at,
        farmer: {
          name: msg.sender?.farmer_name || 'Unknown',
          avatar_url: null
        }
      })) || [];

      setMessages(formattedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel(`community-chat-${communityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${communityId}`
        },
        async (payload) => {
          const newMsg = payload.new as any;
          
          // Fetch farmer details for the new message
          const { data: farmerData } = await supabase
            .from('farmers')
            .select('farmer_name')
            .eq('id', newMsg.sender_id)
            .single();

          const formattedMessage = {
            id: newMsg.id,
            community_id: newMsg.conversation_id,
            farmer_id: newMsg.sender_id,
            message: newMsg.content,
            created_at: newMsg.created_at,
            farmer: {
              name: farmerData?.farmer_name || 'Unknown',
              avatar_url: null
            }
          };

          setMessages(prev => [...prev, formattedMessage]);
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.values(state).flat();
        setTypingUsers(users.filter((u: any) => u.typing).map((u: any) => u.name));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user?.id) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: communityId,
          sender_id: user.id,
          receiver_id: user.id, // Using sender as receiver for community messages
          content: newMessage.trim()
        });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    
    if (date.toDateString() === today.toDateString()) {
      return format(date, 'HH:mm');
    }
    return format(date, 'dd MMM HH:mm');
  };

  const groupMessagesByDate = (messages: Message[]) => {
    const grouped: { [key: string]: Message[] } = {};
    
    messages.forEach(msg => {
      const date = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(msg);
    });
    
    return grouped;
  };

  const groupedMessages = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">{communityName}</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{memberCount} members</span>
            <span className="text-success">• {onlineCount} online</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
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
          <div className="space-y-4">
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                {/* Date Separator */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(date), 'EEEE, MMMM d')}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                
                {/* Messages for this date */}
                {msgs.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.farmer_id === user?.id ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={message.farmer.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {message.farmer.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className={`flex flex-col gap-1 max-w-[70%] ${
                      message.farmer_id === user?.id ? 'items-end' : ''
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {message.farmer.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatMessageTime(message.created_at)}
                        </span>
                      </div>
                      
                      <Card className={`p-3 ${
                        message.farmer_id === user?.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="animate-pulse">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="w-5 h-5" />
          </Button>
          
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1"
          />
          
          <Button variant="ghost" size="icon">
            <Smile className="w-5 h-5" />
          </Button>
          
          <Button 
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            size="icon"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}