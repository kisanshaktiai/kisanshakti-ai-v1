import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EnhancedAIChatInterface } from '@/components/chat/EnhancedAIChatInterface';
import { useEntitlements } from '@/hooks/useEntitlements';

/**
 * AI Chat page.
 *
 * Plan-gating contract (SSOT = /app/subscription):
 *   The home grid + bottom-nav already render this feature as a LOCKED tile
 *   when the active plan disables `ai_chat`, and tapping a locked tile routes
 *   straight to /app/subscription. This page only adds defense-in-depth: if a
 *   user reaches `/app/chat` via deep link / nav state without entitlement,
 *   silently redirect to /app/subscription — never show a second upsell card.
 */
export default function AIChat() {
  const navigate = useNavigate();
  const { isReady, canUse } = useEntitlements();

  useEffect(() => {
    if (!isReady) return;
    if (!canUse('ai_chat').allowed) {
      navigate('/app/subscription', { replace: true });
    }
  }, [isReady, canUse, navigate]);

  return <EnhancedAIChatInterface />;
}
