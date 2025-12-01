import React from 'react';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
interface ColorCodedCardProps {
  card: {
    id: string;
    type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
    title: string;
    content: string;
    color: string;
    gradient: string[];
    icon: string;
    priority: number;
  };
  index: number;
}
export function ColorCodedCard({
  card,
  index
}: ColorCodedCardProps) {
  // Format content with proper line breaks
  const formatContent = (text: string) => {
    return text
      .split('\n')
      .map((line, idx) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;
        
        return (
          <div key={idx} className="mb-2 last:mb-0">
            {trimmedLine}
          </div>
        );
      })
      .filter(Boolean);
  };

  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    delay: index * 0.1
  }}>
      <Card className={cn("w-full px-3 py-2.5 relative overflow-hidden", "border-l-4 shadow-sm", "transition-all duration-200 hover:shadow-md")} style={{
      borderLeftColor: card.color,
      background: `linear-gradient(135deg, ${card.gradient[0]}06 0%, ${card.gradient[2]}06 100%)`
    }}>
        {card.title && (
          <div className="font-medium text-sm mb-2 text-foreground">
            {card.title}
          </div>
        )}
        <div className="w-full text-sm text-foreground/90 leading-relaxed">
          {formatContent(card.content)}
        </div>
      </Card>
    </motion.div>;
}