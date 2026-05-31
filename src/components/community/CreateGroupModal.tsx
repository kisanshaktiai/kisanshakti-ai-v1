import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  X, Mic, Loader2, StopCircle, Sparkles, Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCreateGroup } from '@/hooks/useCommunityGroups';
import { useLanguageStore } from '@/stores/languageStore';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Group emoji options for simple selection
const GROUP_EMOJIS = ['👥', '🌾', '🚜', '🌱', '💧', '🌻', '🐄', '🐔', '🍅', '🥕', '🌽', '🍇'];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👥');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingField, setRecordingField] = useState<'name' | 'description' | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const createGroupMutation = useCreateGroup();

  const startRecording = async (field: 'name' | 'description') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingField(field);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob, field);
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

  const transcribeAudio = async (audioBlob: Blob, field: 'name' | 'description') => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      const { data, error } = await supabase.functions.invoke('transcribe-voice', {
        body: { audio: base64Audio, language: currentLanguage }
      });

      if (error) throw error;
      if (data?.text) {
        if (field === 'name') {
          setName(prev => prev ? `${prev} ${data.text}` : data.text);
        } else {
          setDescription(prev => prev ? `${prev}\n${data.text}` : data.text);
        }
        toast.success(t('social.post.transcribed'));
      }
    } catch (err) {
      toast.error(t('social.post.transcription_error'));
    } finally {
      setIsTranscribing(false);
      setRecordingField(null);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t('social.groups.name_required'));
      return;
    }

    createGroupMutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        avatar_url: selectedEmoji
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setSelectedEmoji('👥');
          onClose();
        },
      }
    );
  };

  const handleClose = () => {
    if (isRecording) stopRecording();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-overlay-dark/60 backdrop-blur-sm z-[60]"
          />

          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 max-h-[75vh] bg-card rounded-t-3xl overflow-hidden z-[60] mb-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {t('social.groups.create_title')}
              </h2>
              <Button
                onClick={handleSubmit}
                disabled={!name.trim() || createGroupMutation.isPending}
                className="rounded-full"
              >
                {createGroupMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  t('social.groups.create_btn')
                )}
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[55vh] pb-24">
              {/* Emoji Selector */}
              <div className="mb-6">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {t('social.groups.select_icon')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {GROUP_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setSelectedEmoji(emoji)}
                      className={cn(
                        "w-12 h-12 rounded-xl text-2xl flex items-center justify-center",
                        "transition-all duration-200",
                        selectedEmoji === emoji
                          ? "bg-primary/20 ring-2 ring-primary scale-110"
                          : "bg-muted/50 hover:bg-muted"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Group Name */}
              <div className="mb-4">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {t('social.groups.name_label')} *
                </label>
                <div className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('social.groups.name_placeholder')}
                    className="flex-1 h-12 rounded-xl"
                  />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onTouchStart={() => startRecording('name')}
                    onTouchEnd={stopRecording}
                    onMouseDown={() => startRecording('name')}
                    onMouseUp={stopRecording}
                    onMouseLeave={() => isRecording && recordingField === 'name' && stopRecording()}
                    disabled={isTranscribing}
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      "transition-all duration-200",
                      isRecording && recordingField === 'name'
                        ? "bg-destructive text-destructive-foreground" 
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {isTranscribing && recordingField === 'name' ? (
                      <Sparkles className="w-5 h-5 animate-spin" />
                    ) : isRecording && recordingField === 'name' ? (
                      <StopCircle className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <label className="text-sm font-medium text-foreground mb-2 block">
                  {t('social.groups.description_label')}
                </label>
                <div className="flex gap-2">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={t('social.groups.description_placeholder')}
                    className="flex-1 min-h-[80px] rounded-xl resize-none"
                  />
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onTouchStart={() => startRecording('description')}
                    onTouchEnd={stopRecording}
                    onMouseDown={() => startRecording('description')}
                    onMouseUp={stopRecording}
                    onMouseLeave={() => isRecording && recordingField === 'description' && stopRecording()}
                    disabled={isTranscribing}
                    className={cn(
                      "w-12 h-20 rounded-xl flex items-center justify-center",
                      "transition-all duration-200",
                      isRecording && recordingField === 'description'
                        ? "bg-destructive text-destructive-foreground" 
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    {isTranscribing && recordingField === 'description' ? (
                      <Sparkles className="w-5 h-5 animate-spin" />
                    ) : isRecording && recordingField === 'description' ? (
                      <StopCircle className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Voice Hint */}
              <p className="text-center text-xs text-muted-foreground">
                {isRecording 
                  ? t('social.post.release_to_stop')
                  : t('social.groups.voice_hint')}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
