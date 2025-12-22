import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Droplet, Leaf, Bug, AlertTriangle, CheckCircle, Info, 
  FlaskConical, Sprout, Timer, BookOpen 
} from 'lucide-react';

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

// ✅ Map icon string names to actual Lucide components
const ICON_MAP: Record<string, React.ReactNode> = {
  'droplet': <Droplet className="h-4 w-4" />,
  'leaf': <Leaf className="h-4 w-4" />,
  'bug': <Bug className="h-4 w-4" />,
  'alert-triangle': <AlertTriangle className="h-4 w-4" />,
  'check-circle': <CheckCircle className="h-4 w-4" />,
  'info': <Info className="h-4 w-4" />,
  'flask': <FlaskConical className="h-4 w-4" />,
  'sprout': <Sprout className="h-4 w-4" />,
  'timer': <Timer className="h-4 w-4" />,
  'book': <BookOpen className="h-4 w-4" />,
};

// ✅ Get icon component or fallback
const getIcon = (iconName: string, cardType: string): React.ReactNode => {
  if (ICON_MAP[iconName]) return ICON_MAP[iconName];
  
  // Fallback based on card type
  switch (cardType) {
    case 'irrigation': return <Droplet className="h-4 w-4" />;
    case 'fertilizer': return <Leaf className="h-4 w-4" />;
    case 'pesticide': return <Bug className="h-4 w-4" />;
    case 'warning': return <AlertTriangle className="h-4 w-4" />;
    case 'success': return <CheckCircle className="h-4 w-4" />;
    case 'organic': return <Sprout className="h-4 w-4" />;
    case 'hormone': return <FlaskConical className="h-4 w-4" />;
    default: return <Info className="h-4 w-4" />;
  }
};

// ✅ Parse content into urgency and source
const parseContent = (content: string): { urgency: string; source: string } => {
  const parts = content.split('|').map(p => p.trim());
  return {
    urgency: parts[0] || '',
    source: parts[1] || ''
  };
};

export function ColorCodedCard({
  card,
  index
}: ColorCodedCardProps) {
  const { urgency, source } = parseContent(card.content);
  const icon = getIcon(card.icon, card.type);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ delay: index * 0.05 }}
    >
      <div 
        className={cn(
          "w-full px-3 py-2.5 relative",
          "border-l-4 rounded-lg",
          "bg-gradient-to-r from-card/80 to-card/50",
          "hover:shadow-sm transition-shadow duration-200"
        )} 
        style={{
          borderLeftColor: card.color
        }}
      >
        {/* Title with Icon */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-primary" style={{ color: card.color }}>
            {icon}
          </span>
          <span className="font-semibold text-sm text-foreground">{card.title}</span>
        </div>
        
        {/* Urgency and Source in better format */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {urgency && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Timer className="h-3 w-3" />
              {urgency}
            </span>
          )}
          {source && (
            <span className="flex items-center gap-1 text-primary/70">
              <BookOpen className="h-3 w-3" />
              {source}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
