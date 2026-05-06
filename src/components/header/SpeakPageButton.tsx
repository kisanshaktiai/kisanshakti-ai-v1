import { useCallback, useContext, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTTSFacade } from '@/hooks/useTTSFacade';
import { useLanguageStore } from '@/stores/languageStore';
import { ScrollContext } from '@/components/layout/ScrollContext';
import { hapticFeedback } from '@/lib/haptics';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Speak-this-page — header TTS for low-literacy users.
 *
 * Reads the text currently visible inside the <main> scroll container in the
 * user's selected language (Hindi / Marathi / English / ...).
 *
 *  - Tap once  → speak visible viewport
 *  - Tap again → stop
 *  - Auto-stops on route change
 *
 * Production hardening:
 *  - getBoundingClientRect-based visibility (offset chain bugs fixed)
 *  - includes interactive cards (button/a) so card titles get read
 *  - haptic + toast feedback
 *  - distinct loading vs speaking icon state
 *  - clean sentence-boundary truncation at ~1500 chars
 *  - aria-pressed for toggle semantics
 */

const MAX_CHARS = 1500;
const MIN_CHARS = 2;

export function SpeakPageButton() {
  const { t } = useTranslation();
  const { currentLanguage } = useLanguageStore();
  const location = useLocation();
  const mainRef = useContext(ScrollContext);

  const { speak, stop, isSpeaking, isLoading } = useTTSFacade({
    language: currentLanguage,
    autoStop: true,
  });

  // Auto-stop on route change so speech doesn't bleed across pages.
  useEffect(() => {
    if (isSpeaking || isLoading) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const collectVisibleText = useCallback((): string => {
    const root = mainRef?.current;
    if (!root) return '';

    const rootRect = root.getBoundingClientRect();
    // Include cards/buttons too — Home wraps titles in <button>.
    const SELECTOR =
      'h1, h2, h3, h4, h5, p, li, [role="heading"], [data-tts], button, a';
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
    const seen = new Set<string>();
    const parts: string[] = [];
    let total = 0;

    for (const el of nodes) {
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (el.closest('[data-tts-skip="true"]')) continue;
      if (el.closest('header')) continue; // skip global app header itself

      const style = window.getComputedStyle(el);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      )
        continue;

      // Visibility check relative to the actual scroll container, not offset parent.
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      if (r.bottom < rootRect.top || r.top > rootRect.bottom) continue;

      // Use innerText so we get rendered text and skip hidden children.
      const raw = (el.innerText || el.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!raw || raw.length < MIN_CHARS) continue;
      // Skip pure numeric / icon-only blobs
      if (/^[\d\s.,:%°/+\-]+$/.test(raw)) continue;
      // Skip if a parent already contributed this exact text
      if (seen.has(raw)) continue;

      // Avoid duplicating: if any already-collected part contains this text
      // (e.g., parent <p> already added, child <span> would repeat).
      let isSubset = false;
      for (const existing of seen) {
        if (existing.includes(raw)) {
          isSubset = true;
          break;
        }
      }
      if (isSubset) continue;

      seen.add(raw);
      parts.push(raw);
      total += raw.length + 2;
      if (total >= MAX_CHARS) break;
    }

    let out = parts.join('. ');
    if (out.length > MAX_CHARS) {
      // Cut at last sentence boundary before the cap.
      const slice = out.slice(0, MAX_CHARS);
      const lastStop = Math.max(
        slice.lastIndexOf('. '),
        slice.lastIndexOf('। '), // Devanagari full stop
        slice.lastIndexOf('? '),
        slice.lastIndexOf('! ')
      );
      out = lastStop > 200 ? slice.slice(0, lastStop + 1) : slice;
    }
    return out;
  }, [mainRef]);

  const onClick = useCallback(async () => {
    hapticFeedback('light');

    if (isSpeaking || isLoading) {
      stop();
      return;
    }

    const text = collectVisibleText();
    if (!text) {
      toast({
        title: t('common.no_readable_text', 'Nothing to read here'),
        description: t(
          'common.no_readable_text_hint',
          'Scroll to a section with text and try again.'
        ),
      });
      return;
    }

    const result = await speak(text, currentLanguage);
    if (!result.success) {
      hapticFeedback('error');
      toast({
        title: t('common.tts_failed', 'Could not read this page'),
        description: result.error,
        variant: 'destructive',
      });
    }
  }, [
    collectVisibleText,
    currentLanguage,
    isLoading,
    isSpeaking,
    speak,
    stop,
    t,
  ]);

  const active = isSpeaking || isLoading;

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={
        active
          ? t('common.stop_speaking', 'Stop speaking')
          : t('common.speak_this_page', 'Speak this page')
      }
      className={cn(
        'shrink-0 h-9 w-9 rounded-full flex items-center justify-center',
        'bg-card/80 border border-border/60 shadow-sm',
        'hover:bg-accent/50 active:scale-95 transition-all',
        active && 'bg-primary/10 border-primary/40 text-primary'
      )}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSpeaking ? (
        <VolumeX className="h-4 w-4 motion-safe:animate-pulse" />
      ) : (
        <Volume2 className="h-4 w-4" />
      )}
    </button>
  );
}
