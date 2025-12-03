import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { MessageCircle, ArrowRight, Shield, Lightbulb, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FollowUpQuestion {
  id: string;
  text: string;
  category: 'clarification' | 'next_step' | 'alternative' | 'prevention';
  emoji: string;
}

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[];
  onQuestionClick: (question: string) => void;
  language?: string;
}

const CATEGORY_STYLES = {
  clarification: {
    icon: HelpCircle,
    gradient: 'from-blue-500/20 to-cyan-500/20',
    border: 'border-blue-500/30',
    iconColor: 'text-blue-500'
  },
  next_step: {
    icon: ArrowRight,
    gradient: 'from-green-500/20 to-emerald-500/20',
    border: 'border-green-500/30',
    iconColor: 'text-green-500'
  },
  alternative: {
    icon: Lightbulb,
    gradient: 'from-amber-500/20 to-yellow-500/20',
    border: 'border-amber-500/30',
    iconColor: 'text-amber-500'
  },
  prevention: {
    icon: Shield,
    gradient: 'from-purple-500/20 to-violet-500/20',
    border: 'border-purple-500/30',
    iconColor: 'text-purple-500'
  }
};

export function FollowUpQuestions({ questions, onQuestionClick, language = 'en' }: FollowUpQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  const headerLabels = {
    en: 'Continue the conversation',
    hi: 'बातचीत जारी रखें',
    mr: 'संवाद सुरू ठेवा'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="mt-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {headerLabels[language as keyof typeof headerLabels] || headerLabels.en}
        </span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const style = CATEGORY_STYLES[question.category];
          const IconComponent = style.icon;
          
          return (
            <motion.div
              key={question.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.1 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onQuestionClick(question.text)}
                className={cn(
                  'h-auto py-2 px-3 rounded-xl',
                  'bg-gradient-to-r', style.gradient,
                  'border', style.border,
                  'hover:scale-105 hover:shadow-md',
                  'transition-all duration-200',
                  'text-left whitespace-normal'
                )}
              >
                <span className="mr-2">{question.emoji}</span>
                <span className="text-xs">{question.text}</span>
              </Button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
