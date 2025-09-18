import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Sprout, Cloud, TrendingUp, Bug, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GeneralChatWelcomeCardProps {
  onQuickAction?: (action: string) => void;
}

export function GeneralChatWelcomeCard({ onQuickAction }: GeneralChatWelcomeCardProps) {
  const { t } = useTranslation();
  
  const quickTopics = [
    { icon: Cloud, label: t('chat.weatherForecast'), action: 'weather' },
    { icon: Sprout, label: t('chat.cropAdvice'), action: 'crop' },
    { icon: Bug, label: t('chat.pestManagement'), action: 'pest' },
    { icon: TrendingUp, label: t('chat.marketTrends'), action: 'market' },
  ];
  
  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/20 backdrop-blur-sm">
      {/* Welcome Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-full bg-gradient-to-r from-primary to-secondary">
          <MessageSquare className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{t('chat.welcomeTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('chat.askAgricultureQueries')}</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
              {t('chat.importantNote')}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t('chat.agricultureOnlyMessage')}
            </p>
          </div>
        </div>
      </div>

      {/* Example Questions */}
      <div className="mb-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">{t('chat.exampleQuestions')}</p>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">• {t('chat.exampleQuestion1')}</div>
          <div className="text-xs text-muted-foreground">• {t('chat.exampleQuestion2')}</div>
          <div className="text-xs text-muted-foreground">• {t('chat.exampleQuestion3')}</div>
        </div>
      </div>

      {/* Quick Topic Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {quickTopics.map((topic) => (
          <button
            key={topic.action}
            onClick={() => onQuickAction?.(topic.action)}
            className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-colors text-left"
          >
            <topic.icon className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">{topic.label}</span>
          </button>
        ))}
      </div>

      {/* Available Features Badge */}
      <div className="flex flex-wrap gap-1 mt-3">
        <Badge variant="secondary" className="text-xs">
          {t('chat.weatherUpdates')}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {t('chat.cropScheduling')}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {t('chat.soilHealth')}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {t('chat.marketPrices')}
        </Badge>
      </div>
    </Card>
  );
}