import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Sparkles, Clock } from 'lucide-react';

function formatCountdown(target: string | null): string | null {
  if (!target) return null;
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Compact chip shown above the chat input that displays
 * "{used}/{limit} chats today · resets in 4h 12m".
 * Hidden when the plan has unlimited chats (limit === null).
 */
export function ChatQuotaHeader() {
  const { t } = useTranslation('chat');
  const { aiChat, isReady } = useEntitlements();
  const [, force] = useState(0);

  // Re-render every minute so the countdown ticks
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!isReady || aiChat.limit === null) return null;
  const countdown = formatCountdown(aiChat.resetsAt);
  const exceeded = !aiChat.allowed && aiChat.reason === 'quota_exceeded';

  return (
    <div
      className={`mx-3 mt-2 flex items-center justify-between rounded-full px-3 py-1.5 text-xs font-medium
        ${exceeded ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" />
        {t('quota.used', {
          defaultValue: '{{used}}/{{limit}} chats today',
          used: aiChat.used,
          limit: aiChat.limit,
        })}
      </span>
      {countdown && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t('quota.resets_in', { defaultValue: 'resets in {{time}}', time: countdown })}
        </span>
      )}
    </div>
  );
}
