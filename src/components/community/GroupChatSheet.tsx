import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Send, Mic, StopCircle, ArrowLeft, Users, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

interface GroupMessage {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  isOwn: boolean;
}

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

// Mock messages for demonstration
const generateMockMessages = (groupName: string): GroupMessage[] => [
  {
    id: '1',
    content: `Welcome to ${groupName} discussion! Share your experiences and tips.`,
    senderId: 'system',
    senderName: 'Community Bot',
    timestamp: '10:00 AM',
    isOwn: false,
  },
  {
    id: '2',
    content: 'What variety are you all growing this season?',
    senderId: 'user1',
    senderName: 'Ramesh Kumar',
    timestamp: '10:05 AM',
    isOwn: false,
  },
  {
    id: '3',
    content: 'I am trying the new HD-3086 variety. Very good results so far!',
    senderId: 'user2',
    senderName: 'Suresh Singh',
    timestamp: '10:08 AM',
    isOwn: false,
  },
];

export const GroupChatSheet: React.FC<GroupChatSheetProps> = ({
  isOpen,
  onClose,
  group,
  language,
}) => {
  const { t } = useTranslation('social');
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (isOpen) {
      setMessages(generateMockMessages(group.name));
    }
  }, [isOpen, group.name]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMessage: GroupMessage = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      senderId: user?.id || 'me',
      senderName: 'You',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isOwn: true,
    };

    setMessages(prev => [...prev, newMessage]);
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
      toast.error('Unable to access microphone');
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
      }
    } catch (err) {
      toast.error('Failed to convert voice');
    } finally {
      setIsTranscribing(false);
    }
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
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "flex",
                  message.isOwn ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[80%] rounded-3xl px-4 py-3",
                  message.isOwn 
                    ? "bg-primary text-primary-foreground rounded-br-lg" 
                    : "bg-secondary text-secondary-foreground rounded-bl-lg"
                )}>
                  {!message.isOwn && (
                    <p className="text-xs font-medium opacity-70 mb-1">{message.senderName}</p>
                  )}
                  <p className="text-sm">{message.content}</p>
                  <p className={cn(
                    "text-[10px] mt-1",
                    message.isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    {message.timestamp}
                  </p>
                </div>
              </motion.div>
            ))}
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
                disabled={!inputValue.trim()}
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
