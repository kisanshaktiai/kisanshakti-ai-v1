import React from 'react';
import { ModernChatInterface } from '@/components/chat/ModernChatInterface';
import { useTranslation } from 'react-i18next';

export default function AIChat() {
  const { t } = useTranslation();

  return (
    <div className="h-[calc(100vh-4rem)]">
      <ModernChatInterface />
    </div>
  );
}