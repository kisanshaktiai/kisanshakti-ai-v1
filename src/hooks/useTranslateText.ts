import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TranslationCache {
  [key: string]: string;
}

// In-memory cache for translations
const translationCache: TranslationCache = {};

// Track if we've shown the credits error this session to avoid spam
let hasShownCreditsError = false;

const getCacheKey = (text: string, sourceLang: string, targetLang: string): string => {
  return `${sourceLang}-${targetLang}-${text.substring(0, 100)}`;
};

export const useTranslateText = (
  originalText: string,
  sourceLanguage: string,
  targetLanguage: string
) => {
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const translate = useCallback(async () => {
    // Skip if same language
    if (sourceLanguage === targetLanguage) {
      setTranslatedText(originalText);
      return;
    }

    // Check cache first
    const cacheKey = getCacheKey(originalText, sourceLanguage, targetLanguage);
    if (translationCache[cacheKey]) {
      setTranslatedText(translationCache[cacheKey]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsTranslating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('translate-text', {
        body: {
          text: originalText,
          sourceLanguage,
          targetLanguage,
        }
      });

      // Handle specific error statuses from the edge function
      if (fnError) {
        const errorMessage = fnError.message || '';
        
        // Check for 402 payment required
        if (errorMessage.includes('402') || errorMessage.includes('credits')) {
          if (!hasShownCreditsError) {
            hasShownCreditsError = true;
            toast.error('Translation unavailable', {
              description: 'AI credits exhausted. Showing original text.',
              duration: 5000,
            });
          }
          setTranslatedText(originalText);
          return;
        }
        
        // Check for 429 rate limit
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          toast.warning('Too many requests', {
            description: 'Please wait a moment before translating more.',
            duration: 3000,
          });
          setTranslatedText(originalText);
          return;
        }
        
        throw fnError;
      }

      if (data?.error) {
        // Handle error in response body
        if (data.error.includes('credits') || data.error.includes('402')) {
          if (!hasShownCreditsError) {
            hasShownCreditsError = true;
            toast.error('Translation unavailable', {
              description: 'AI credits exhausted. Showing original text.',
              duration: 5000,
            });
          }
          setTranslatedText(originalText);
          return;
        }
      }

      if (data?.translatedText) {
        setTranslatedText(data.translatedText);
        // Cache the result
        translationCache[cacheKey] = data.translatedText;
      } else {
        // Fallback to original if translation fails
        setTranslatedText(originalText);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      
      console.error('Translation error:', err);
      setError(err.message || 'Translation failed');
      // Show original text on error
      setTranslatedText(originalText);
    } finally {
      setIsTranslating(false);
    }
  }, [originalText, sourceLanguage, targetLanguage]);

  useEffect(() => {
    translate();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [translate]);

  return {
    translatedText,
    isTranslating,
    error,
    retry: translate
  };
};

// Utility function for batch translation
export const translateBatch = async (
  texts: string[],
  sourceLanguage: string,
  targetLanguage: string
): Promise<string[]> => {
  if (sourceLanguage === targetLanguage) {
    return texts;
  }

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: {
        texts,
        sourceLanguage,
        targetLanguage,
        batch: true
      }
    });

    if (error) {
      console.error('Batch translation error:', error);
      // Handle credits error silently, return original texts
      return texts;
    }
    
    return data?.translations || texts;
  } catch (err) {
    console.error('Batch translation error:', err);
    return texts;
  }
};
