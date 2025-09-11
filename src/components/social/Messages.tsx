import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Send, Users, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export function Messages() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchConversations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages();
      subscribeToMessages();
    }
  }, [selectedConversation]);

  const fetchConversations = async () => {
    try {
      // Fetch direct message conversations
      const { data: directMessages } = await supabase
        .from('direct_messages')
        .select(`
          *,
          sender:farmers!direct_messages_sender_id_fkey(*),
          receiver:farmers!direct_messages_receiver_id_fkey(*)
        `)
        .or(`sender_id.eq.${user?.id},receiver_id.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      // Group by conversation
      const conversationMap = new Map();
      directMessages?.forEach(msg => {
        const otherUser = msg.sender_id === user?.id ? msg.receiver : msg.sender;
        const key = otherUser?.id;
        
        if (key && !conversationMap.has(key)) {
          conversationMap.set(key, {
            id: key,
            type: 'direct',
            name: otherUser?.farmer_name || 'Unknown Farmer',
            lastMessage: msg.content,
            lastMessageTime: msg.created_at,
            unread: !msg.is_read && msg.receiver_id === user?.id,
            otherUser
          });
        }
      });

      // Fetch group chats
      const { data: groupChats } = await supabase
        .from('group_chat_members')
        .select(`
          group_id,
          group_chats!inner(
            id,
            name,
            description,
            member_count
          )
        `)
        .eq('farmer_id', user?.id);

      const groups = groupChats?.map(g => ({
        id: g.group_id,
        type: 'group',
        name: g.group_chats.name,
        description: g.group_chats.description,
        memberCount: g.group_chats.member_count
      })) || [];

      setConversations([...Array.from(conversationMap.values()), ...groups]);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  };

  const fetchMessages = async () => {
    if (!selectedConversation) return;

    try {
      if (selectedConversation.type === 'direct') {
        const { data } = await supabase
          .from('direct_messages')
          .select(`
            *,
            sender:farmers!direct_messages_sender_id_fkey(*)
          `)
          .or(`
            and(sender_id.eq.${user?.id},receiver_id.eq.${selectedConversation.id}),
            and(sender_id.eq.${selectedConversation.id},receiver_id.eq.${user?.id})
          `)
          .order('created_at', { ascending: true });

        setMessages(data || []);

        // Mark messages as read
        await supabase
          .from('direct_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('receiver_id', user?.id)
          .eq('sender_id', selectedConversation.id);
      } else {
        const { data } = await supabase
          .from('group_messages')
          .select(`
            *,
            sender:farmers!group_messages_sender_id_fkey(*)
          `)
          .eq('group_id', selectedConversation.id)
          .order('created_at', { ascending: true });

        setMessages(data || []);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const subscribeToMessages = () => {
    const table = selectedConversation.type === 'direct' ? 'direct_messages' : 'group_messages';
    
    const channel = supabase
      .channel(`messages-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setLoading(true);
    try {
      if (selectedConversation.type === 'direct') {
        await supabase
          .from('direct_messages')
          .insert({
            sender_id: user?.id,
            receiver_id: selectedConversation.id,
            content: newMessage
          });
      } else {
        await supabase
          .from('group_messages')
          .insert({
            group_id: selectedConversation.id,
            sender_id: user?.id,
            content: newMessage
          });
      }

      setNewMessage('');
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)]">
      {/* Conversations List */}
      <div className={`${selectedConversation ? 'w-1/3' : 'w-full'} border-r`}>
        <ScrollArea className="h-full">
          <div className="p-4 space-y-2">
            {conversations.map((conv) => (
              <Card
                key={conv.id}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedConversation?.id === conv.id ? 'bg-accent' : ''
                }`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback>
                      {conv.type === 'group' ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{conv.name}</p>
                      {conv.unread && <Badge className="h-2 w-2 p-0 rounded-full" />}
                    </div>
                    {conv.lastMessage && (
                      <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                    )}
                    {conv.lastMessageTime && (
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conv.lastMessageTime), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Messages Area */}
      {selectedConversation && (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b">
            <h3 className="font-semibold">{selectedConversation.name}</h3>
            {selectedConversation.type === 'group' && (
              <p className="text-sm text-muted-foreground">
                {selectedConversation.memberCount} members
              </p>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg ${
                      msg.sender_id === user?.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.sender_id !== user?.id && (
                      <p className="text-xs font-medium mb-1">{msg.sender?.farmer_name}</p>
                    )}
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                disabled={loading}
              />
              <Button onClick={sendMessage} disabled={loading || !newMessage.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}