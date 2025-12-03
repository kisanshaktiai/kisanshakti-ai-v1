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
    gradient: 'from-emerald-500/20 to-green-500/20',
    border: 'border-emerald-500/40',
    iconColor: 'text-emerald-500',
    hoverBg: 'hover:bg-emerald-500/10'
  },
  yield: {
    icon: TrendingUp,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/40',
    iconColor: 'text-blue-500',
    hoverBg: 'hover:bg-blue-500/10'
  },
  savings: {
    icon: Wallet,
    gradient: 'from-amber-500/20 to-yellow-500/20',
    border: 'border-amber-500/40',
    iconColor: 'text-amber-500',
    hoverBg: 'hover:bg-amber-500/10'
  },
  next_action: {
    icon: Target,
    gradient: 'from-purple-500/20 to-violet-500/20',
    border: 'border-purple-500/40',
    iconColor: 'text-purple-500',
    hoverBg: 'hover:bg-purple-500/10'
  },
  expert_tip: {
    icon: Award,
    gradient: 'from-rose-500/20 to-pink-500/20',
    border: 'border-rose-500/40',
    iconColor: 'text-rose-500',
    hoverBg: 'hover:bg-rose-500/10'
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
        <Lightbulb className="h-4 w-4 text-amber-500" />
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
