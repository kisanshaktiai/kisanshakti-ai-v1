import { useCallback, useContext, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTTSFacade } from '@/hooks/useTTSFacade';
import { useLanguageStore } from '@/stores/languageStore';
import { ScrollContext } from '@/components/layout/ScrollContext';
import { cn } from '@/lib/utils';

/**
 * Speak-this-page — permanent header TTS for low-literacy users.
 * Reads visible text from the main scroll container in the active language.
 *
 *  - Tap once  → start speaking (collected from current viewport)
 *  - Tap again → stop
 *
 * Strategy: walk the visible portion of <main>, collect text from
 * h1/h2/h3/p/li/button/[role=heading] nodes, dedupe + cap length to
 * keep the request bounded. We do NOT speak hidden / aria-hidden nodes.
 */
export function SpeakPageButton() {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const mainRef = useContext(ScrollContext);
  const lastSpokeRef = useRef<string>('');

  const { speak, stop, isSpeaking, isLoading } = useTTSFacade({
    language: currentLanguage,
    autoStop: true,
  });

  const collectVisibleText = useCallback((): string => {
    const root = mainRef?.current;
    if (!root) return '';

    const viewportTop = root.scrollTop;
    const viewportBottom = viewportTop + root.clientHeight;
    // Meaningful content only — skip interactive chrome (button/a) which
    // is usually English UI text and would be mispronounced in Marathi mode.
    const SELECTOR = 'h1, h2, h3, h4, p, li, [role="heading"], [data-tts]';
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
    const seen = new Set<string>();
    const parts: string[] = [];

    for (const el of nodes) {
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (el.closest('[data-tts-skip="true"]')) continue;
      if (el.closest('header')) continue; // skip global app header
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (bottom < viewportTop || top > viewportBottom) continue;

      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length < 2) continue;
      // Skip numeric / icon-only blobs
      if (/^[\d\s.,:%°/+\-]+$/.test(txt)) continue;
      if (seen.has(txt)) continue;
      seen.add(txt);
      parts.push(txt);
      if (parts.join(' ').length > 1200) break;
    }
    return parts.join('. ');
  }, [mainRef]);

  const onClick = useCallback(async () => {
    if (isSpeaking || isLoading) {
      stop();
      return;
    }
    const text = collectVisibleText();
    if (!text) {
      console.info('[SpeakPageButton] No readable text in viewport');
      return;
    }
    lastSpokeRef.current = text;
    console.info(
      `[SpeakPageButton] Speaking ${text.length} chars in "${currentLanguage}"`
    );
    const result = await speak(text, currentLanguage);
    if (!result.success) {
      console.warn('[SpeakPageButton] TTS failed:', result.error);
    } else {
      console.info(`[SpeakPageButton] TTS provider: ${result.provider}`);
    }
  }, [collectVisibleText, currentLanguage, isLoading, isSpeaking, speak, stop]);

  return (
    <button
      onClick={onClick}
      aria-label={
        isSpeaking
          ? t('common.stop_speaking', 'Stop speaking')
          : t('common.speak_this_page', 'Speak this page')
      }
      className={cn(
        'shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
        'bg-card/80 border border-border/60 shadow-sm',
        'hover:bg-accent/50 active:scale-95 transition-all',
        isSpeaking && 'bg-primary/10 border-primary/40 text-primary'
      )}
    >
      {isSpeaking ? (
        <VolumeX className="h-4 w-4 motion-safe:animate-pulse" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </button>
  );
}
