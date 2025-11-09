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

interface ResponseSectionCardProps {
  emoji: string;
  title: string;
  content: string;
  sectionType: 'organic' | 'fertilizer' | 'pest' | 'water' | 'income' | 'other';
  isExpanded?: boolean;
}

const sectionColors = {
  organic: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
  },
  fertilizer: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/50 dark:bg-amber-950/20',
    icon: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
  },
  pest: {
    border: 'border-l-rose-500',
    bg: 'bg-rose-50/50 dark:bg-rose-950/20',
    icon: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
  },
  water: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50/50 dark:bg-blue-950/20',
    icon: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
  },
  income: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-50/50 dark:bg-purple-950/20',
    icon: 'text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
  },
  other: {
    border: 'border-l-slate-500',
    bg: 'bg-slate-50/50 dark:bg-slate-950/20',
    icon: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300'
  }
};

export const ResponseSectionCard: React.FC<ResponseSectionCardProps> = ({
  emoji,
  title,
  content,
  sectionType,
  isExpanded = true
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

  return (
    <Card className={cn(
      'border-l-4 overflow-hidden transition-all duration-300',
      colors.border,
      colors.bg
    )}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-1">
            <span className={cn('text-2xl', colors.icon)}>{emoji}</span>
            <h3 className="font-semibold text-base text-foreground flex-1">{title}</h3>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setBookmarked(!bookmarked)}
            >
              <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
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
              className="overflow-hidden"
            >
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
