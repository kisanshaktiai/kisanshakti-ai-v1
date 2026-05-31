import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CaptionSuggestion {
  caption: string;
  hashtags: string[];
  crop?: string;
  detected_issue?: string;
}

export function useCaptionSuggest() {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<CaptionSuggestion | null>(null);

  const suggest = useCallback(
    async (params: { text?: string; imageBase64?: string; language: string }) => {
      setIsLoading(true);
      setSuggestion(null);
      try {
        const { data, error } = await supabase.functions.invoke('community-caption-suggest', {
          body: {
            text: params.text,
            image_base64: params.imageBase64,
            language: params.language,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setSuggestion(data as CaptionSuggestion);
        return data as CaptionSuggestion;
      } catch (e: any) {
        console.error('caption suggest error', e);
        toast.error('AI suggestion unavailable');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { suggest, suggestion, isLoading, reset: () => setSuggestion(null) };
}
