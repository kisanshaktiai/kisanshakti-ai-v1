import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TrendingUp, MessageCircle, Users, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendingTopic {
  id: string;
  tag: string;
  translatedTag?: string;
  postCount: number;
  participantCount: number;
  isHot: boolean;
  category: 'pest' | 'crop' | 'weather' | 'market' | 'scheme' | 'technique';
}

const MOCK_TRENDING: TrendingTopic[] = [
  { id: '1', tag: 'गेहूं_बुवाई', translatedTag: 'Wheat Sowing', postCount: 1234, participantCount: 456, isHot: true, category: 'crop' },
  { id: '2', tag: 'पिंक_बॉलवर्म', translatedTag: 'Pink Bollworm', postCount: 892, participantCount: 234, isHot: true, category: 'pest' },
  { id: '3', tag: 'रबी_सीजन', translatedTag: 'Rabi Season', postCount: 756, participantCount: 189, isHot: false, category: 'crop' },
  { id: '4', tag: 'MSP_गेहूं', translatedTag: 'MSP Wheat', postCount: 654, participantCount: 167, isHot: false, category: 'market' },
  { id: '5', tag: 'ड्रिप_सिंचाई', translatedTag: 'Drip Irrigation', postCount: 543, participantCount: 145, isHot: false, category: 'technique' },
  { id: '6', tag: 'PM_किसान_योजना', translatedTag: 'PM Kisan Scheme', postCount: 432, participantCount: 123, isHot: false, category: 'scheme' },
];

// Semantic color tokens from design system
const CATEGORY_COLORS: Record<string, string> = {
  pest: 'bg-destructive/10 text-destructive border-destructive/20',
  crop: 'bg-success/10 text-success border-success/20',
  weather: 'bg-info/10 text-info border-info/20',
  market: 'bg-warning/10 text-warning border-warning/20',
  scheme: 'bg-secondary/10 text-secondary border-secondary/20',
  technique: 'bg-accent/10 text-accent border-accent/20',
};

interface TrendingTopicsProps {
  viewLanguage: string;
}

export const TrendingTopics: React.FC<TrendingTopicsProps> = ({ viewLanguage }) => {
  const { t } = useTranslation();

  return (
    <div className="px-4 py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-primary/10 rounded-xl">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">
            {t('social.trending.title')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('social.trending.subtitle')}
          </p>
        </div>
      </div>

      {/* Topics List */}
      <div className="space-y-3">
        {MOCK_TRENDING.map((topic, index) => (
          <motion.div
            key={topic.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              "p-4 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50",
              "cursor-pointer transition-all duration-200 hover:bg-card"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Rank & Topic */}
              <div className="flex items-start gap-3">
                {/* Rank */}
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                  index < 3 
                    ? "bg-gradient-to-br from-warning to-warning/80 text-warning-foreground"
                    : "bg-secondary text-muted-foreground"
                )}>
                  {index + 1}
                </div>

                {/* Topic Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      #{topic.tag}
                    </span>
                    {topic.isHot && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-warning/10 rounded-full">
                        <Flame className="w-3 h-3 text-warning" />
                        <span className="text-[10px] text-warning font-medium">Hot</span>
                      </span>
                    )}
                  </div>
                  
                  {/* Show translated tag if different language */}
                  {viewLanguage !== 'hi' && topic.translatedTag && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {topic.translatedTag}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {topic.postCount.toLocaleString()} posts
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {topic.participantCount.toLocaleString()} farmers
                    </span>
                  </div>
                </div>
              </div>

              {/* Category Badge */}
              <span className={cn(
                "px-2 py-1 text-xs font-medium rounded-full border",
                CATEGORY_COLORS[topic.category]
              )}>
                {topic.category}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* View All */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        className="w-full mt-4 py-3 text-center text-sm text-primary font-medium hover:bg-primary/5 rounded-xl transition-colors"
      >
        {t('social.trending.view_all')} →
      </motion.button>
    </div>
  );
};
