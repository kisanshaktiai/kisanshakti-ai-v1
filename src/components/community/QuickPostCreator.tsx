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
import { useCaptionSuggest } from '@/hooks/useCaptionSuggest';
import { FarmerAvatar } from './FarmerAvatar';
import { useAuthStore } from '@/stores/authStore';

interface QuickPostCreatorProps {
  language: string;
  onExpandToFull?: () => void;
}

export const QuickPostCreator: React.FC<QuickPostCreatorProps> = ({
  language,
  onExpandToFull
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  const createPostMutation = useCreatePost();
  const { suggest, isLoading: isSuggesting } = useCaptionSuggest();

  const handleAISuggest = async () => {
    let imageBase64: string | undefined;
    if (selectedImage?.startsWith('data:')) {
      imageBase64 = selectedImage.split(',')[1];
    }
    if (!content.trim() && !imageBase64) {
      toast.info(t('social.post.add_text_or_image') || 'Add text or an image first');
      return;
    }
    const result = await suggest({ text: content, imageBase64, language });
    if (result) {
      setContent(result.caption + (result.hashtags?.length ? '\n\n' + result.hashtags.map(h => `#${h}`).join(' ') : ''));
    }
  };

  const MAX_RECORD_SEC = 60;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
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
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsExpanded(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SEC) {
            stopRecording();
            return MAX_RECORD_SEC;
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(t('social.post.recording_error'));
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
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
        toast.success(t('social.post.transcribed'));
      }
    } catch (err) {
      toast.error(t('social.post.transcription_error'));
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
      toast.error(t('social.post.empty_error'));
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
          toast.success(t('social.post.success'));
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
        'mx-3 mb-4 bg-card rounded-3xl border border-border overflow-hidden shadow-sm'
      )}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          <FarmerAvatar
            name={user?.farmerName || user?.fullName || user?.name}
            seed={user?.id}
            imageUrl={user?.avatarUrl}
            size="md"
          />

          <div
            className={cn(
              'flex-1 min-h-[44px] px-4 py-2.5 bg-muted rounded-2xl cursor-text transition-colors'
            )}
            onClick={() => setIsExpanded(true)}
          >
            {isExpanded ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('social.post.whats_on_mind') || "What's on your mind?"}
                className="w-full bg-transparent border-none outline-none resize-none text-foreground placeholder:text-muted-foreground min-h-[44px]"
                autoFocus
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('social.post.tap_or_speak') || 'Tap to write or speak'}
              </p>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={toggleRecording}
            disabled={isTranscribing}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={cn(
              'relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
              'transition-colors shadow-md',
              isRecording
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            )}
          >
            {isTranscribing ? (
              <Sparkles className="w-5 h-5 animate-spin" />
            ) : isRecording ? (
              <StopCircle className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}

            {isRecording && (
              <motion.div
                className="absolute inset-0 rounded-full bg-destructive/30 -z-10"
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </motion.button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-2">
          {isRecording
            ? `${t('social.post.recording') || 'Recording'} ${recordSeconds}s · ${t('social.post.tap_to_stop') || 'Tap to stop'}`
            : isTranscribing
            ? t('social.post.converting') || 'Converting voice…'
            : t('social.post.tap_mic') || 'Tap mic to record'}
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
                    className="absolute top-2 right-2 p-1.5 bg-overlay-dark/50 rounded-full text-overlay-light"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Action Bar - mobile-first 2-row layout to keep Post always visible */}
            <div className="flex flex-col gap-2 px-3 py-3 border-t border-border mt-2">
              <Button
                onClick={handleSubmit}
                disabled={(!content.trim() && !selectedImage) || createPostMutation.isPending}
                className="w-full rounded-full gap-2 h-11 text-base font-semibold shadow-md"
              >
                {createPostMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {t('social.post.publish') || 'Post'}
              </Button>

              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full h-9 w-9 text-muted-foreground"
                    aria-label={t('social.post.add_photo') || 'Add photo'}
                  >
                    <Image className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-9 w-9 text-muted-foreground"
                    aria-label="Camera"
                  >
                    <Camera className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAISuggest}
                    disabled={isSuggesting}
                    className="rounded-full gap-1.5 text-primary h-9 px-2"
                  >
                    {isSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    <span className="text-xs">{t('social.post.improve_ai') || 'AI'}</span>
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="text-muted-foreground h-9 px-3"
                >
                  {t('social.post.clear') || 'Clear'}
                </Button>
              </div>
            </div>


          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
