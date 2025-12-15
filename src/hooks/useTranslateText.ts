import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranslationCache {
  [key: string]: string;
}

// In-memory cache for translations
const translationCache: TranslationCache = {};

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

      if (fnError) throw fnError;

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

    if (error) throw error;
    return data?.translations || texts;
  } catch (err) {
    console.error('Batch translation error:', err);
    return texts;
  }
};
