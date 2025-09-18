import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Sprout, Cloud, TrendingUp, Bug, HelpCircle, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';

interface GeneralChatWelcomeCardProps {
  onQuickAction?: (action: string) => void;
}

export function GeneralChatWelcomeCard({ onQuickAction }: GeneralChatWelcomeCardProps) {
  const { t } = useTranslation();
  const langStore = useLanguageStore();
  const language = (langStore as any).selectedLanguage || 'en';
  
  const { speak, isSpeaking, stop } = useTextToSpeech({
    language: language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : language === 'mr' ? 'mr-IN' : language === 'ta' ? 'ta-IN' : 'en-IN'
  });

  const handleReadAloud = () => {
    if (isSpeaking) {
      stop();
    } else {
      const welcomeText = `${t('chat.welcomeTitle')}. ${t('chat.askAgricultureQueries')}. ${t('chat.importantNote')}. ${t('chat.agricultureOnlyMessage')}`;
      speak(welcomeText);
    }
  };
  
  const quickTopics = [
    { icon: Cloud, label: t('chat.weatherForecast'), action: 'weather' },
    { icon: Sprout, label: t('chat.cropAdvice'), action: 'crop' },
    { icon: Bug, label: t('chat.pestManagement'), action: 'pest' },
    { icon: TrendingUp, label: t('chat.marketTrends'), action: 'market' },
  ];
  
  return (
    <Card className="p-4 bg-card border-border">
      {/* Welcome Header with Read Aloud */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">{t('chat.welcomeTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('chat.askAgricultureQueries')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleReadAloud}
          className="h-8 w-8"
        >
          <Volume2 className={cn("h-4 w-4", isSpeaking && "text-primary animate-pulse")} />
        </Button>
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