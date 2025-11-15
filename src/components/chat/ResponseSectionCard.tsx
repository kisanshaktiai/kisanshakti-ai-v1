import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Copy, Share2, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { InteractiveScheduleTable, ScheduleRow } from './InteractiveScheduleTable';
import { ProgressTimeline, TimelineStage } from './ProgressTimeline';

interface ResponseSectionCardProps {
  emoji: string;
  title: string;
  content: string;
  sectionType: 'organic' | 'fertilizer' | 'pest' | 'water' | 'income' | 'other';
  isExpanded?: boolean;
  scheduleData?: ScheduleRow[];
  timelineData?: TimelineStage[];
}

const sectionColors = {
  organic: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-green-border))]',
    bg: 'bg-[hsl(var(--chat-section-green-bg))]',
    icon: 'text-[hsl(var(--chat-section-green-icon))]',
    badge: 'bg-[hsl(var(--chat-section-green-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-green-badge))]'
  },
  fertilizer: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-yellow-border))]',
    bg: 'bg-[hsl(var(--chat-section-yellow-bg))]',
    icon: 'text-[hsl(var(--chat-section-yellow-icon))]',
    badge: 'bg-[hsl(var(--chat-section-yellow-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-yellow-badge))]'
  },
  pest: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-red-border))]',
    bg: 'bg-[hsl(var(--chat-section-red-bg))]',
    icon: 'text-[hsl(var(--chat-section-red-icon))]',
    badge: 'bg-[hsl(var(--chat-section-red-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-red-badge))]'
  },
  water: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-blue-border))]',
    bg: 'bg-[hsl(var(--chat-section-blue-bg))]',
    icon: 'text-[hsl(var(--chat-section-blue-icon))]',
    badge: 'bg-[hsl(var(--chat-section-blue-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-blue-badge))]'
  },
  income: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-purple-border))]',
    bg: 'bg-[hsl(var(--chat-section-purple-bg))]',
    icon: 'text-[hsl(var(--chat-section-purple-icon))]',
    badge: 'bg-[hsl(var(--chat-section-purple-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-purple-badge))]'
  },
  other: {
    border: 'border-l-[3px] border-l-[hsl(var(--chat-section-default-border))]',
    bg: 'bg-[hsl(var(--chat-section-default-bg))]',
    icon: 'text-[hsl(var(--chat-section-default-icon))]',
    badge: 'bg-[hsl(var(--chat-section-default-badge))] text-white',
    iconBg: 'bg-[hsl(var(--chat-section-default-badge))]'
  }
};

export const ResponseSectionCard: React.FC<ResponseSectionCardProps> = ({
  emoji,
  title,
  content,
  sectionType,
  isExpanded = true,
  scheduleData,
  timelineData
}) => {
  const [expanded, setExpanded] = useState(isExpanded);
  const [bookmarked, setBookmarked] = useState(false);
  const { toast } = useToast();
  const colors = sectionColors[sectionType];

  const handleCopy = () => {
    navigator.clipboard.writeText(`${emoji} ${title}\n\n${content}`);
    toast({ title: 'Copied to clipboard' });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${emoji} ${title}`,
          text: content
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      handleCopy();
    }
  };

  const handleSaveSchedule = (updatedRows: ScheduleRow[]) => {
    // Save to local storage or backend
    console.log('Saving schedule:', updatedRows);
    toast({ title: 'Schedule saved successfully' });
  };

  return (
    <Card className={cn(
      'overflow-hidden transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.08)]',
      colors.border,
      colors.bg
    )}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            {/* Icon Badge */}
            <div className={cn(
              'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
              colors.iconBg
            )}>
              <span className="text-2xl text-white">{emoji}</span>
            </div>
            <h3 className="font-semibold text-base text-foreground flex-1">{title}</h3>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/60 transition-colors"
              onClick={() => setBookmarked(!bookmarked)}
            >
              <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/60 transition-colors"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/60 transition-colors"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-background/60 transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden space-y-4"
            >
              {/* Timeline if provided */}
              {timelineData && timelineData.length > 0 && (
                <div className="mb-4">
                  <ProgressTimeline stages={timelineData} />
                </div>
              )}

              {/* Interactive Schedule Table if provided */}
              {scheduleData && scheduleData.length > 0 && (
                <div className="mb-4">
                  <InteractiveScheduleTable
                    title="Application Schedule"
                    rows={scheduleData}
                    onSave={handleSaveSchedule}
                  />
                </div>
              )}

              {/* Markdown Content */}
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-lg font-bold mt-3 mb-2 first:mt-0" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-base font-bold mt-3 mb-2 first:mt-0" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc list-inside my-2 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal list-inside my-2 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="ml-2 text-sm" {...props} />,
                    table: ({node, ...props}) => (
                      <div className="overflow-x-auto my-3">
                        <table className="min-w-full border border-border rounded-lg overflow-hidden text-sm" {...props} />
                      </div>
                    ),
                    thead: ({node, ...props}) => <thead className={colors.badge} {...props} />,
                    th: ({node, ...props}) => <th className="px-3 py-2 border border-border font-semibold text-left" {...props} />,
                    td: ({node, ...props}) => <td className="px-3 py-2 border border-border" {...props} />,
                    p: ({node, ...props}) => <p className="my-2 leading-relaxed text-sm" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold" {...props} />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
};
