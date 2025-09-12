import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  MoreVertical,
  Search,
  Phone,
  Video,
  ArrowLeft,
  Check,
  CheckCheck,
  Image,
  X,
  Volume2,
  StopCircle,
  Camera,
  FileText,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Message {
  id: string;
  content: string;
  farmer_id: string | null;
  community_id: string;
  created_at: string;
  updated_at: string | null;
  edited_at: string | null;
  is_edited: boolean | null;
  is_pinned: boolean | null;
  is_verified: boolean | null;
  translation_data: any;
  reactions: any;
  metadata: any;
  parent_message_id: string | null;
  attachments: any;
  message_type: string | null;
  read_by: string[] | null;
  is_ai_filtered: boolean | null;
  farmer?: {
    id: string;
    full_name: string;
    phone_primary: string;
    profile_image?: string;
  };
  reply_to?: Message;
}

interface EnhancedWhatsAppChatProps {
  communityId: string;
  onBack?: () => void;
}

export function EnhancedWhatsAppChat({ communityId, onBack }: EnhancedWhatsAppChatProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { speak, stop, isSpeaking } = useTextToSpeech({ language: i18n.language });

  // Get current user
  const { data: currentUser } = useQuery({
    queryKey: ['current-farmer'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: farmer } = await supabase
        .from('farmers')
        .select('*')
        .eq('auth_id', user.id)
        .maybeSingle();

      return farmer;
    }
  });

  // Fetch community details
  const { data: community } = useQuery({
    queryKey: ['community', communityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .eq('id', communityId)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  // Fetch messages with farmer details
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['community-messages', communityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_messages')
        .select(`
          *,
          farmer:farmers(id, full_name, phone_primary, profile_image)
        `)
        .eq('community_id', communityId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []).map(msg => ({
        ...msg,
        read_by: Array.isArray(msg.read_by) ? msg.read_by : []
      })) as Message[];
    },
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Set up real-time subscription
  useEffect(() => {
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
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['community-messages', communityId] });
          // Mark message as read if from another user
          if (payload.new.farmer_id !== currentUser?.id) {
            markMessageAsRead(payload.new.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_messages',
          filter: `community_id=eq.${communityId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['community-messages', communityId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId, currentUser, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mark message as read
  const markMessageAsRead = async (messageId: string) => {
    if (!currentUser) return;

    const { data: message } = await supabase
      .from('community_messages')
      .select('read_by')
      .eq('id', messageId)
      .single();

    if (message) {
      const readBy = message.read_by || [];
      if (!readBy.includes(currentUser.id)) {
        await supabase
          .from('community_messages')
          .update({
            read_by: [...readBy, currentUser.id]
          })
          .eq('id', messageId);
      }
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, type = 'text', attachments = null }: { 
      content: string; 
      type?: string; 
      attachments?: any 
    }) => {
      if (!currentUser) throw new Error('User not authenticated');

      const messageData = {
        content,
        farmer_id: currentUser.id,
        community_id: communityId,
        message_type: type,
        attachments,
        metadata: {
          sender_language: i18n.language,
          sender_name: currentUser.name,
          tenant_id: currentUser.tenant_id,
          timestamp: new Date().toISOString()
        },
        read_by: [currentUser.id] // Mark as read by sender
      };

      const { data, error } = await supabase
        .from('community_messages')
        .insert(messageData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setMessage('');
      setSelectedImage(null);
      setImagePreview(null);
      queryClient.invalidateQueries({ queryKey: ['community-messages', communityId] });
    },
    onError: (error) => {
      toast.error(t('social.messages.sendError'));
      console.error('Send message error:', error);
    }
  });

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('social.messages.imageTooLarge'));
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload and filter image
  const uploadAndFilterImage = async () => {
    if (!selectedImage || !currentUser) return null;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Upload image to storage
      const fileExt = selectedImage.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('community-images')
        .upload(fileName, selectedImage, {
          onUploadProgress: (progress) => {
            setUploadProgress((progress.loaded / progress.total) * 100);
          }
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('community-images')
        .getPublicUrl(fileName);

      // Check with AI filter
      setUploadProgress(75);
      const filterResponse = await supabase.functions.invoke('filter-community-image', {
        body: { imageUrl: publicUrl }
      });

      if (filterResponse.error) {
        throw new Error('Failed to analyze image');
      }

      const { allowed, analysis } = filterResponse.data;

      if (!allowed) {
        // Delete the uploaded image if not agricultural
        await supabase.storage
          .from('community-images')
          .remove([fileName]);
        
        toast.error(
          t('social.messages.imageNotAgricultural') || 
          `Image rejected: ${analysis.reason}. Please upload agriculture-related images only.`
        );
        return null;
      }

      setUploadProgress(100);
      toast.success(t('social.messages.imageApproved') || 'Image approved for agricultural content!');
      
      return {
        url: publicUrl,
        type: 'image',
        analysis
      };
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error(t('social.messages.imageUploadError'));
      return null;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle send message
  const handleSendMessage = async () => {
    if ((!message.trim() && !selectedImage) || isUploading) return;

    let attachments = null;
    let messageType = 'text';
    let messageContent = message.trim();

    if (selectedImage) {
      const uploadResult = await uploadAndFilterImage();
      if (!uploadResult) {
        setSelectedImage(null);
        setImagePreview(null);
        return;
      }
      attachments = uploadResult;
      messageType = 'image';
      if (!messageContent) {
        messageContent = '📷 Image';
      }
    }

    if (messageContent || attachments) {
      sendMessageMutation.mutate({ 
        content: messageContent, 
        type: messageType, 
        attachments 
      });
    }
  };

  // Handle text-to-speech
  const handleTextToSpeech = (text: string) => {
    if (isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  // Format message time
  const formatMessageTime = (date: string) => {
    const messageDate = new Date(date);
    const today = new Date();
    
    if (messageDate.toDateString() === today.toDateString()) {
      return format(messageDate, 'HH:mm');
    }
    return format(messageDate, 'dd/MM HH:mm');
  };

  // Message status indicator
  const MessageStatus = ({ message }: { message: Message }) => {
    const isOwn = message.farmer_id === currentUser?.id;
    if (!isOwn) return null;

    const readByOthers = (message.read_by || []).filter(id => id !== currentUser?.id);
    const isRead = readByOthers.length > 0;

    return (
      <span className="ml-1">
        {isRead ? (
          <CheckCheck className="h-4 w-4 text-primary" />
        ) : (
          <Check className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
    );
  };

  // Filtered messages based on search
  const filteredMessages = messages.filter(msg => 
    msg.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Avatar className="h-10 w-10">
              <AvatarImage src={community?.image_url} />
              <AvatarFallback>{community?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold">{community?.name}</h3>
              <p className="text-xs text-muted-foreground">
                {community?.member_count || 0} members
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Phone className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Video className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-4">
          {filteredMessages.map((msg) => {
            const isOwn = msg.farmer_id === currentUser?.id;
            
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  isOwn ? "justify-end" : "justify-start"
                )}
              >
                {!isOwn && (
                  <Avatar className="h-8 w-8 mt-auto">
                    <AvatarImage src={msg.farmer?.avatar_url} />
                    <AvatarFallback>
                      {msg.farmer?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div className={cn(
                  "max-w-[70%] space-y-1",
                  isOwn ? "items-end" : "items-start"
                )}>
                  {!isOwn && (
                    <p className="text-xs text-muted-foreground px-3">
                      {msg.farmer?.name}
                    </p>
                  )}
                  
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2 relative group",
                      isOwn 
                        ? "bg-primary text-primary-foreground rounded-br-sm" 
                        : "bg-muted rounded-bl-sm"
                    )}
                  >
                    {/* Image attachment */}
                    {msg.attachments?.url && msg.message_type === 'image' && (
                      <div 
                        className="mb-2 cursor-pointer"
                        onClick={() => setViewingImage(msg.attachments.url)}
                      >
                        <img 
                          src={msg.attachments.url} 
                          alt="Shared image"
                          className="rounded-lg max-w-full h-auto max-h-64 object-cover"
                        />
                        {msg.is_ai_filtered && (
                          <Badge className="mt-1" variant="secondary">
                            <Check className="h-3 w-3 mr-1" />
                            AI Verified Agricultural Content
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                    
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs opacity-70">
                        {formatMessageTime(msg.created_at)}
                      </span>
                      <MessageStatus message={msg} />
                    </div>

                    {/* Message actions */}
                    <div className="absolute -top-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1 bg-card border rounded-lg p-1 shadow-lg">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleTextToSpeech(msg.content)}
                        >
                          {isSpeaking ? (
                            <StopCircle className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {msg.is_edited && (
                    <p className="text-xs text-muted-foreground px-3">
                      {t('social.messages.edited')}
                    </p>
                  )}
                </div>
                
                {isOwn && (
                  <Avatar className="h-8 w-8 mt-auto">
                    <AvatarImage src={currentUser?.avatar_url} />
                    <AvatarFallback>
                      {currentUser?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Image Preview */}
      {imagePreview && (
        <div className="px-4 py-2 border-t bg-muted/50">
          <div className="relative inline-block">
            <img 
              src={imagePreview} 
              alt="Preview"
              className="h-20 w-20 object-cover rounded-lg"
            />
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6"
              onClick={() => {
                setSelectedImage(null);
                setImagePreview(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {isUploading && (
            <div className="mt-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Analyzing image for agricultural content...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="sticky bottom-0 bg-card border-t p-4">
        <div className="flex items-end gap-2">
          <div className="flex gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Paperclip className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="flex-1">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={t('social.messages.placeholder')}
              className="min-h-[40px] max-h-[120px] resize-none"
              rows={1}
              disabled={isUploading}
            />
          </div>
          
          <div className="flex gap-1">
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="grid grid-cols-8 gap-2">
                  {['😀', '😂', '😍', '🤔', '👍', '👏', '🙏', '❤️'].map(emoji => (
                    <Button
                      key={emoji}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMessage(prev => prev + emoji);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            
            {message.trim() || selectedImage ? (
              <Button 
                size="icon"
                onClick={handleSendMessage}
                disabled={sendMessageMutation.isPending || isUploading}
              >
                <Send className="h-5 w-5" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon">
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Image Viewer Dialog */}
      <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Image Preview</DialogTitle>
          </DialogHeader>
          {viewingImage && (
            <img 
              src={viewingImage} 
              alt="Full size"
              className="w-full h-auto rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}