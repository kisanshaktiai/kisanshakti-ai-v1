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
  return <motion.div initial={{
    opacity: 0,
    y: 20
  }} animate={{
    opacity: 1,
    y: 0
  }} transition={{
    delay: index * 0.1
  }} className="mb-2">
      <Card className={cn("w-full px-3 py-2.5 relative overflow-hidden", "border-l-4 shadow-sm", "transition-all duration-200 hover:shadow-md")} style={{
      borderLeftColor: card.color,
      background: `linear-gradient(135deg, ${card.gradient[0]}06 0%, ${card.gradient[2]}06 100%)`
    }}>
        <div className="flex items-start gap-0">
          <div className="text-xl flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{
          background: `linear-gradient(135deg, ${card.gradient[0]} 0%, ${card.gradient[1]} 100%)`
        }}>
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1.5 leading-tight" style={{
            color: card.color
          }}>
              {card.title}
            </h3>
            <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {card.content}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>;
}