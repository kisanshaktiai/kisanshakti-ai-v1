import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEntitlements } from '@/hooks/useEntitlements';

/**
 * Renders an inline blocker above the chat composer when the farmer's
 * daily AI-chat quota is exhausted (or the feature is disabled by tenant).
 * Returns null when the user can still chat.
 */
export function ChatQuotaBanner() {
  const { t } = useTranslation('chat');
  const navigate = useNavigate();
  const { aiChat, tenant, isReady } = useEntitlements();

  if (!isReady || aiChat.allowed) return null;

  const isTenantDisabled =
    aiChat.reason === 'feature_disabled' ||
    tenant?.master_features?.ai_chat === false;

  return (
    <div
      role="alert"
      className="mx-3 my-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center"
    >
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <Lock className="h-5 w-5 text-destructive" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {isTenantDisabled
          ? t('quota.tenant_disabled_title', { defaultValue: 'AI Chat unavailable' })
          : t('quota.exceeded_title', { defaultValue: "Today's chats are over" })}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isTenantDisabled
          ? t('quota.tenant_disabled_body', {
              defaultValue: 'AI Chat is not enabled for your organisation. Please contact your administrator.',
            })
          : t('quota.exceeded_body', {
              defaultValue: 'You used {{used}}/{{limit}} chats today. New chats unlock automatically at midnight.',
              used: aiChat.used,
              limit: aiChat.limit ?? 0,
            })}
      </p>
      {!isTenantDisabled && (
        <Button
          size="sm"
          className="mt-3"
          onClick={() => navigate('/app/subscription')}
        >
          {t('quota.upgrade_cta', { defaultValue: 'Upgrade plan' })}
        </Button>
      )}
    </div>
  );
}
