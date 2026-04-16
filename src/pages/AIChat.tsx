import React from 'react';
import { EnhancedAIChatInterface } from '@/components/chat/EnhancedAIChatInterface';
import { SubscriptionGate } from '@/contexts/SubscriptionContext';
import { UpgradePrompt } from '@/components/subscription/UpgradePrompt';

export default function AIChat() {
  return (
    <SubscriptionGate
      feature="ai_chat"
      fallback={
        <UpgradePrompt
          feature="ai_chat"
          title="AI Crop Advisor"
          description="Get instant, personalized agricultural advice in your language. Upgrade to unlock unlimited AI chat with our farming intelligence."
        />
      }
    >
      <EnhancedAIChatInterface />
    </SubscriptionGate>
  );
}
