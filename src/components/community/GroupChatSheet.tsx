import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, Mic, StopCircle, Users, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { useGroupMessages, useSendGroupMessage, useCreateWelcomeMessage, GroupMessage } from '@/hooks/useGroupChat';
import { formatDistanceToNow } from 'date-fns';

interface GroupChatSheetProps {
  isOpen: boolean;
  onClose: () => void;
  group: {
    id: string;
    name: string;
    icon: string;
    memberCount?: number;
  };
  language: string;
}

export const GroupChatSheet: React.FC<GroupChatSheetProps> = ({
  isOpen,
  onClose,
  group,
  language,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Real-time messages
  const { data: messages = [], isLoading } = useGroupMessages(isOpen ? group.id : null);
  const sendMessageMutation = useSendGroupMessage();
  const createWelcomeMutation = useCreateWelcomeMessage();

  // Create welcome message when first opened
  useEffect(() => {
    if (isOpen && group.id && messages.length === 0 && !isLoading) {
      createWelcomeMutation.mutate({ groupId: group.id, groupName: group.name });
    }
  }, [isOpen, group.id, group.name, messages.length, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim() || !group.id) return;

    sendMessageMutation.mutate({
      groupId: group.id,
      content: inputValue.trim(),
      messageType: 'text',
    });
    
    setInputValue('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error(t('social.post.recording_error'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      const { data, error } = await supabase.functions.invoke('transcribe-voice', {
        body: { audio: base64Audio, language }
      });

      if (error) throw error;
      if (data?.text) {
        setInputValue(prev => prev ? `${prev} ${data.text}` : data.text);
        toast.success(t('social.post.transcribed'));
      }
    } catch (err) {
      toast.error(t('social.post.transcription_error'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatMessageTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: false });
    } catch {
      return '';
    }
  };

  const isOwnMessage = (message: GroupMessage) => {
    return message.farmer_id === user?.id;
  };

  const getSenderName = (message: GroupMessage) => {
    if (message.message_type === 'system') return 'System';
    if (isOwnMessage(message)) return t('social.groups.you');
    return message.farmer?.farmer_name || t('social.groups.anonymous');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed inset-0 z-[100] bg-background flex flex-col"
        >
          {/* Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/80 backdrop-blur-xl"
          >
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              className="rounded-full"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            
            <div className="flex items-center gap-3 flex-1">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl">
                {group.icon}
              </div>
              <div>
                <h2 className="font-semibold text-foreground">{group.name}</h2>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {group.memberCount || 0} {t('social.groups.members')}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-6 h-6 text-primary" />
                </motion.div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">💬</div>
                <p className="text-muted-foreground text-sm">
                  {t('social.groups.no_messages')}
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    "flex",
                    isOwnMessage(message) ? "justify-end" : "justify-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[80%] rounded-3xl px-4 py-3",
                    message.message_type === 'system' 
                      ? "bg-muted text-muted-foreground text-center mx-auto"
                      : isOwnMessage(message) 
                        ? "bg-primary text-primary-foreground rounded-br-lg" 
                        : "bg-secondary text-secondary-foreground rounded-bl-lg"
                  )}>
                    {!isOwnMessage(message) && message.message_type !== 'system' && (
                      <p className="text-xs font-medium opacity-70 mb-1">
                        {getSenderName(message)}
                      </p>
                    )}
                    <p className="text-sm">{message.content}</p>
                    <p className={cn(
                      "text-[10px] mt-1",
                      message.message_type === 'system'
                        ? "text-muted-foreground"
                        : isOwnMessage(message) 
                          ? "text-primary-foreground/70" 
                          : "text-muted-foreground"
                    )}>
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </motion.div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border-t border-border/50 bg-background/80 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t('social.groups.type_message')}
                className="flex-1 h-12 rounded-2xl bg-secondary/50 border-0"
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              
              <motion.button
                whileTap={{ scale: 0.9 }}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={() => isRecording && stopRecording()}
                disabled={isTranscribing}
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  isRecording 
                    ? "bg-destructive text-destructive-foreground" 
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {isTranscribing ? (
                  <Sparkles className="w-5 h-5 animate-spin" />
                ) : isRecording ? (
                  <StopCircle className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleSend}
                disabled={!inputValue.trim() || sendMessageMutation.isPending}
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  inputValue.trim() 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-secondary text-muted-foreground"
                )}
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
