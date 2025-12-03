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
  // Format content with proper line breaks and numbered list detection
  const formatContent = (text: string) => {
    // First, ensure numbered points are on separate lines
    const formattedText = text
      // Add newline before numbered points if missing
      .replace(/(?<!\n)(\d+\.)\s+/g, '\n$1 ')
      // Add newline before Hindi numbers
      .replace(/(?<!\n)([१२३४५६७८९०]+\.)\s+/g, '\n$1 ')
      // Add newline before bullets
      .replace(/(?<!\n)([•·\-])\s+/g, '\n$1 ')
      // Clean leading newlines
      .replace(/^\n+/, '');
    
    return formattedText
      .split('\n')
      .map((line, idx) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;
        
        // Check if it's a numbered point
        const isNumberedPoint = /^(\d+\.|[१२३४५६७८९०]+\.)/.test(trimmedLine);
        const isBulletPoint = /^[•·\-]/.test(trimmedLine);
        
        return (
          <div 
            key={idx} 
            className={cn(
              "mb-2 last:mb-0",
              isNumberedPoint && "pl-2 border-l-2 border-primary/20",
              isBulletPoint && "pl-2"
            )}
          >
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