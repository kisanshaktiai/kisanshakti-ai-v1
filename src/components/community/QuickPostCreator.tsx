import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { 
  Mic, Image, Send, Loader2, StopCircle, 
  Sparkles, X, Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCreatePost } from '@/hooks/useCommunityPosts';

interface QuickPostCreatorProps {
  language: string;
  onExpandToFull?: () => void;
}

export const QuickPostCreator: React.FC<QuickPostCreatorProps> = ({
  language,
  onExpandToFull
}) => {
  const { t } = useTranslation('social');
  const [content, setContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  const createPostMutation = useCreatePost();

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
      setIsExpanded(true);
    } catch (err) {
      toast.error(t('post.recording_error'));
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
        setContent(prev => prev ? `${prev}\n\n${data.text}` : data.text);
        toast.success(t('post.transcribed'));
      }
    } catch (err) {
      toast.error(t('post.transcription_error'));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setIsExpanded(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !selectedImage) {
      toast.error(t('post.empty_error'));
      return;
    }

    createPostMutation.mutate(
      {
        content: content.trim(),
        language_code: language,
        media_urls: selectedImage ? [selectedImage] : undefined,
        post_type: selectedImage ? 'image' : 'text',
      },
      {
        onSuccess: () => {
          setContent('');
          setSelectedImage(null);
          setIsExpanded(false);
          toast.success(t('post.success'));
        },
      }
    );
  };

  const handleClear = () => {
    setContent('');
    setSelectedImage(null);
    setIsExpanded(false);
  };

  return (
    <motion.div
      layout
      className={cn(
        "mx-4 mb-4 bg-card/80 backdrop-blur-xl rounded-3xl border border-border/50",
        "shadow-lg shadow-black/5 overflow-hidden"
      )}
    >
      {/* Compact Mode - Voice First */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* User Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl flex-shrink-0">
            👨‍🌾
          </div>

          {/* Input Area */}
          <div 
            className={cn(
              "flex-1 min-h-[48px] px-4 py-3 bg-secondary/30 rounded-2xl",
              "cursor-text transition-all",
              isExpanded && "bg-secondary/50"
            )}
            onClick={() => setIsExpanded(true)}
          >
            {isExpanded ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('post.whats_on_mind')}
                className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground min-h-[60px]"
                autoFocus
              />
            ) : (
              <p className="text-muted-foreground">
                {t('post.tap_or_speak')}
              </p>
            )}
          </div>

          {/* Big Voice Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => isRecording && stopRecording()}
            disabled={isTranscribing}
            className={cn(
              "relative w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0",
              "transition-all duration-200 shadow-lg",
              isRecording 
                ? "bg-destructive text-destructive-foreground scale-110" 
                : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
            )}
          >
            {isTranscribing ? (
              <Sparkles className="w-6 h-6 animate-spin" />
            ) : isRecording ? (
              <StopCircle className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}

            {/* Recording Pulse */}
            {isRecording && (
              <motion.div
                className="absolute inset-0 rounded-full bg-destructive/30"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>

        {/* Voice Hint */}
        <p className="text-center text-xs text-muted-foreground mt-2">
          {isRecording 
            ? t('post.release_to_stop')
            : isTranscribing
            ? t('post.converting')
            : t('post.hold_mic')}
        </p>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Selected Image */}
            {selectedImage && (
              <div className="px-4 pb-3">
                <div className="relative rounded-2xl overflow-hidden">
                  <img src={selectedImage} alt="Selected" className="w-full h-32 object-cover" />
                  <button 
                    onClick={() => setSelectedImage(null)} 
                    className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-between p-4 pt-0 border-t border-border/30 mt-2 pt-3">
              <div className="flex items-center gap-2">
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageSelect} 
                  className="hidden" 
                />
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()} 
                  className="rounded-full h-10 w-10"
                >
                  <Image className="w-5 h-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full h-10 w-10"
                >
                  <Camera className="w-5 h-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleClear}
                  className="text-muted-foreground"
                >
                  {t('post.clear')}
                </Button>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={(!content.trim() && !selectedImage) || createPostMutation.isPending}
                className="rounded-full gap-2 px-6"
              >
                {createPostMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {t('post.publish')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
