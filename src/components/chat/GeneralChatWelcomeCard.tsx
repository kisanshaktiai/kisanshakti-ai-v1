import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

interface GeneralChatWelcomeCardProps {
  onQuickAction?: (action: string) => void;
}

export function GeneralChatWelcomeCard({ onQuickAction }: GeneralChatWelcomeCardProps) {
  const { t } = useTranslation();
  const langStore = useLanguageStore();
  const language = (langStore as any).selectedLanguage || 'en';
  const { session } = useAuthStore();
  const [farmerName, setFarmerName] = useState<string>('');
  
  const { speak, isSpeaking, stop } = useTextToSpeech({
    language: language === 'hi' ? 'hi-IN' : language === 'pa' ? 'pa-IN' : language === 'mr' ? 'mr-IN' : language === 'ta' ? 'ta-IN' : 'en-IN'
  });

  useEffect(() => {
    const fetchFarmerName = async () => {
      if (!session?.farmerId) return;
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('full_name')
        .eq('farmer_id', session.farmerId)
        .single();
      
      if (data && data.full_name) {
        setFarmerName(data.full_name);
      }
    };

    fetchFarmerName();
  }, [session?.farmerId]);

  const handleReadAloud = () => {
    if (isSpeaking) {
      stop();
    } else {
      const welcomeText = farmerName 
        ? `Welcome ${farmerName}! ${t('chat.askAgricultureQueries')}`
        : `${t('chat.welcomeTitle')}. ${t('chat.askAgricultureQueries')}`;
      speak(welcomeText);
    }
  };
  
  return (
    <Card className="p-4 bg-card border-border">
      {/* Welcome Header with Read Aloud */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">
              {farmerName 
                ? `Welcome, ${farmerName}!` 
                : t('chat.welcomeTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">{t('chat.askAgricultureQueries')}</p>
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

      {/* Example Questions */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-2">{t('chat.exampleQuestions')}</p>
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">• {t('chat.exampleQuestion1')}</div>
          <div className="text-sm text-muted-foreground">• {t('chat.exampleQuestion2')}</div>
          <div className="text-sm text-muted-foreground">• {t('chat.exampleQuestion3')}</div>
        </div>
      </div>
    </Card>
  );
}