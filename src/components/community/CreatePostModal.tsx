import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  X, Camera, Image, Mic, Send, Globe, 
  Sparkles, Loader2, StopCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCreatePost } from '@/hooks/useCommunityPosts';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultLanguage: string;
}

const LANGUAGE_OPTIONS = [
  { code: 'hi', name: 'हिन्दी' },
  { code: 'en', name: 'English' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  defaultLanguage
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(defaultLanguage);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Use the create post mutation
  const createPostMutation = useCreatePost();

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
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
        setVoiceNoteUrl(URL.createObjectURL(audioBlob));
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
        body: { audio: base64Audio, language: selectedLanguage }
      });

      if (error) throw error;
      if (data?.text) {
        setContent(prev => prev ? `${prev}\n\n${data.text}` : data.text);
        toast.success(t('social.post.transcribed'));
      }
    } catch (err) {
      toast.error(t('social.post.transcription_error'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error(t('social.post.empty_error'));
      return;
    }

    createPostMutation.mutate(
      {
        content: content.trim(),
        language_code: selectedLanguage,
        media_urls: selectedImage ? [selectedImage] : undefined,
        post_type: selectedImage ? 'image' : 'text',
      },
      {
        onSuccess: () => {
          setContent('');
          setSelectedImage(null);
          setVoiceNoteUrl(null);
          onClose();
        },
      }
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-overlay-dark/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] bg-card rounded-t-3xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
              <h2 className="font-semibold text-foreground">{t('social.post.create')}</h2>
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || createPostMutation.isPending}
                className="rounded-full gap-2"
              >
                {createPostMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t('social.post.publish')}
              </Button>
            </div>

            <div className="px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {LANGUAGE_OPTIONS.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLanguage(lang.code)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-all",
                      selectedLanguage === lang.code
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[50vh]">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('social.post.whats_on_mind')}
                className="min-h-[120px] text-lg border-none bg-transparent resize-none focus-visible:ring-0 p-0"
              />

              {isTranscribing && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 mt-3 p-3 bg-primary/10 rounded-xl">
                  <Sparkles className="w-4 h-4 text-primary animate-spin" />
                  <span className="text-sm text-primary">{t('social.post.converting')}</span>
                </motion.div>
              )}

              {selectedImage && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative mt-4 rounded-2xl overflow-hidden">
                  <img src={selectedImage} alt="Selected" className="w-full h-48 object-cover" />
                  <button onClick={() => setSelectedImage(null)} className="absolute top-2 right-2 p-1.5 bg-overlay-dark/50 rounded-full text-overlay-light">
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {voiceNoteUrl && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-3 bg-muted/50 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center"><Mic className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('social.post.voice')}</p>
                  </div>
                  <button onClick={() => setVoiceNoteUrl(null)} className="p-1.5 hover:bg-muted rounded-full"><X className="w-4 h-4 text-muted-foreground" /></button>
                </motion.div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                  <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} className="rounded-full"><Image className="w-5 h-5" /></Button>
                  <Button variant="outline" size="icon" className="rounded-full"><Camera className="w-5 h-5" /></Button>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  className={cn("relative w-16 h-16 rounded-full flex items-center justify-center transition-all", isRecording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}
                >
                  {isRecording ? <StopCircle className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                </motion.button>
                <div className="text-sm text-muted-foreground">{content.length}/2000</div>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-3">
                {isRecording ? t('social.post.release_to_stop') : t('social.post.hold_mic')}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
