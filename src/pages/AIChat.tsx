import React from 'react';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { useTranslation } from 'react-i18next';

export default function AIChat() {
  const { t } = useTranslation();

  return (
    <div className="h-full">
      <ChatInterface />
    </div>
  );
}