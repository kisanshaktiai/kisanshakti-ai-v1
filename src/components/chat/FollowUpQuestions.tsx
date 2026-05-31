import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { TrendingUp, Wallet, Target, Lightbulb, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'income' | 'yield' | 'savings' | 'next_action' | 'expert_tip';
  emoji: string;
}

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[];
  onQuestionClick: (question: string) => void;
  language?: string;
}

const CATEGORY_STYLES = {
  income: {
    icon: Wallet,
    gradient: 'from-success/20 to-success/20',
    border: 'border-success/40',
    iconColor: 'text-success',
    hoverBg: 'hover:bg-success/10'
  },
  yield: {
    icon: TrendingUp,
    gradient: 'from-info/20 to-info/20',
    border: 'border-info/40',
    iconColor: 'text-info',
    hoverBg: 'hover:bg-info/10'
  },
  savings: {
    icon: Wallet,
    gradient: 'from-warning/20 to-warning/20',
    border: 'border-warning/40',
    iconColor: 'text-warning',
    hoverBg: 'hover:bg-warning/10'
  },
  next_action: {
    icon: Target,
    gradient: 'from-primary/20 to-primary/20',
    border: 'border-primary/40',
    iconColor: 'text-primary',
    hoverBg: 'hover:bg-primary/10'
  },
  expert_tip: {
    icon: Award,
    gradient: 'from-destructive/20 to-primary/20',
    border: 'border-destructive/40',
    iconColor: 'text-destructive',
    hoverBg: 'hover:bg-destructive/10'
  }
};

const headerLabels = {
  en: '💡 You might also want to know...',
  hi: '💡 आप यह भी जानना चाहेंगे...',
  mr: '💡 तुम्हाला हे ही जाणून घ्यायला आवडेल...'
};

export function FollowUpQuestions({ questions, onQuestionClick, language = 'en' }: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5, type: 'spring', stiffness: 300 }}
      className="mt-4 space-y-3"
    >
      {/* Header */}
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-sm font-medium text-muted-foreground flex items-center gap-2"
      >
        <Lightbulb className="h-4 w-4 text-warning" />
        {headerLabels[language as keyof typeof headerLabels] || headerLabels.en}
      </motion.p>
      
      {/* Questions Grid */}
      <div className="flex flex-col gap-2">
        {questions.map((question, index) => {
          const style = CATEGORY_STYLES[question.category] || CATEGORY_STYLES.expert_tip;
          const IconComponent = style.icon;
          
          return (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ 
                delay: 0.5 + index * 0.1,
                type: 'spring',
                stiffness: 400,
                damping: 25
              }}
            >
              <Button
                variant="outline"
                onClick={() => onQuestionClick(question.text)}
                className={cn(
                  'w-full justify-start h-auto py-3 px-4 rounded-xl',
                  'bg-gradient-to-r', style.gradient,
                  'border-2', style.border,
                  style.hoverBg,
                  'hover:scale-[1.02] hover:shadow-lg',
                  'active:scale-[0.98]',
                  'transition-all duration-200',
                  'text-left group'
                )}
              >
                <span className="text-lg mr-3">{question.emoji}</span>
                <span className="flex-1 text-sm font-medium leading-tight">
                  {question.text}
                </span>
                <IconComponent className={cn(
                  'h-4 w-4 ml-2 opacity-50 group-hover:opacity-100 transition-opacity',
                  style.iconColor
                )} />
              </Button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
