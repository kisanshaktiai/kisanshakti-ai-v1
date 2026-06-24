import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Volume2, Sparkles, Leaf, CloudSun, Bug, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { motion } from 'framer-motion';

interface GeneralChatWelcomeCardProps {
  onQuickAction?: (action: string) => void;
}

const QUICK_ACTIONS = [
  { icon: Leaf, label: 'Crop Advice', query: 'What crop should I plant?', color: 'success' },
  { icon: CloudSun, label: 'Weather', query: 'What is the weather forecast?', color: 'info' },
  { icon: Bug, label: 'Pest Control', query: 'How to control pests?', color: 'warning' },
  { icon: Droplets, label: 'Irrigation', query: 'When should I irrigate?', color: 'primary' },
];

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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('common.goodMorning', 'Good Morning');
    if (hour < 17) return t('common.goodAfternoon', 'Good Afternoon');
    return t('common.goodEvening', 'Good Evening');
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden border-0 shadow-xl">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-accent/10" />
        
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-radial from-primary/40 to-transparent rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-radial from-success/40 to-transparent rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
        </div>
        
        {/* Content */}
        <div className="relative p-6">
          {/* Header with Avatar and Sound */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              {/* AI Avatar with Glow */}
              <div className="relative">
                <div className="absolute inset-0 bg-primary/40 rounded-2xl blur-lg animate-pulse" />
                <div className="relative p-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                  <Sparkles className="w-7 h-7 text-primary-foreground" />
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-0.5">
                  {getGreeting()}
                </p>
                <h3 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                  {farmerName 
                    ? `${farmerName}!` 
                    : t('chat.welcomeTitle', 'Welcome!')}
                </h3>
              </div>
            </div>
            
            {/* Read Aloud Button */}
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReadAloud}
                className={cn(
                  "h-10 w-10 rounded-xl",
                  isSpeaking 
                    ? "bg-primary/20 text-primary" 
                    : "bg-muted/50 hover:bg-muted"
                )}
              >
                <Volume2 className={cn("h-5 w-5", isSpeaking && "animate-pulse")} />
              </Button>
            </motion.div>
          </div>
          
          {/* Subtitle */}
          <p className="text-muted-foreground mb-6 leading-relaxed">
            {t('chat.askAgricultureQueries', 'Ask me anything about farming, crops, weather, or pest control. I am here to help!')}
          </p>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {QUICK_ACTIONS.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
              >
                <Button
                  variant="outline"
                  onClick={() => onQuickAction?.(action.query)}
                  className={cn(
                    "w-full h-auto py-3 px-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all",
                    "hover:shadow-lg hover:-translate-y-0.5",
                    action.color === 'success' && "hover:border-success/50 hover:bg-success/10",
                    action.color === 'info' && "hover:border-info/50 hover:bg-info/10",
                    action.color === 'warning' && "hover:border-warning/50 hover:bg-warning/10",
                    action.color === 'primary' && "hover:border-primary/50 hover:bg-primary/10"
                  )}
                >
                  <action.icon className={cn(
                    "h-5 w-5",
                    action.color === 'success' && "text-success",
                    action.color === 'info' && "text-info",
                    action.color === 'warning' && "text-warning",
                    action.color === 'primary' && "text-primary"
                  )} />
                  <span className="text-xs font-medium">{action.label}</span>
                </Button>
              </motion.div>
            ))}
          </div>

          {/* Example Questions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              {t('chat.exampleQuestions', 'Try asking')}
            </p>
            <div className="space-y-2">
              {[
                t('chat.exampleQuestion1', 'What fertilizer should I use for wheat?'),
                t('chat.exampleQuestion2', 'How to identify pest damage?'),
                t('chat.exampleQuestion3', 'Best time to harvest rice?')
              ].map((question, idx) => (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  onClick={() => onQuickAction?.(question)}
                  className="w-full text-left text-sm text-muted-foreground hover:text-foreground py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
                >
                  <span className="text-primary">•</span>
                  {question}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
