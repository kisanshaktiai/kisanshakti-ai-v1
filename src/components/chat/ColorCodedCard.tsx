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
    if (!text) return null;
    
    // ✅ Step 1: Normalize text - ensure numbered points start on new lines
    let formattedText = text
      // Add newline before numbered points (1. 2. 3. etc.)
      .replace(/([^\n])(\d+\.)\s+/g, '$1\n$2 ')
      // Add newline before Hindi numbers (१. २. ३. etc.)
      .replace(/([^\n])([१२३४५६७८९०]+\.)\s+/g, '$1\n$2 ')
      // Add newline before bullet points
      .replace(/([^\n])([•·\-])\s+/g, '$1\n$2 ')
      // Add newline before emoji markers (🌱, 💧, ⚠️, etc.)
      .replace(/([^\n])([\u{1F300}-\u{1F9FF}])/gu, '$1\n$2')
      // Clean up multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Clean leading newlines
      .replace(/^\n+/, '');
    
    // ✅ Step 2: Split into lines and render each properly
    const lines = formattedText.split('\n');
    
    return lines.map((line, idx) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        // Empty line = spacing
        return <div key={idx} className="h-2" />;
      }
      
      // Check if it's a numbered point (1., 2., or Hindi १., २.)
      const isNumberedPoint = /^(\d+\.|[१२३४५६७८९०]+\.)/.test(trimmedLine);
      // Check if it's a bullet point
      const isBulletPoint = /^[•·\-\*]/.test(trimmedLine);
      // Check if it starts with an emoji (section header)
      const isEmojiSection = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(trimmedLine);
      
      return (
        <div 
          key={idx} 
          className={cn(
            "mb-1.5 last:mb-0 leading-relaxed",
            isNumberedPoint && "pl-3 border-l-2 border-primary/30 ml-1",
            isBulletPoint && "pl-3 ml-1",
            isEmojiSection && "font-medium mt-2 first:mt-0"
          )}
        >
          {trimmedLine}
        </div>
      );
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ delay: index * 0.05 }}
    >
      <div 
        className={cn(
          "w-full px-3 py-2 relative",
          "border-l-3 rounded-md",
          "bg-card/50"
        )} 
        style={{
          borderLeftColor: card.color,
          borderLeftWidth: '3px'
        }}
      >
        {card.title && (
          <div className="font-medium text-sm mb-1 text-foreground flex items-center gap-1.5">
            <span className="text-xs">{card.icon}</span>
            <span>{card.title}</span>
          </div>
        )}
        <div className="w-full text-sm text-foreground/90 leading-snug">
          {formatContent(card.content)}
        </div>
      </div>
    </motion.div>
  );
}
