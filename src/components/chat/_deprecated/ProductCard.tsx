// DEPRECATED — not mounted anywhere. Do not edit for chat fixes.
import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Leaf, FlaskConical, Bug, Droplets, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    brand: string;
    productType: 'organic' | 'fertilizer' | 'pesticide' | 'fungicide' | 'herbicide' | 'bio_input' | 'growth_regulator';
    purpose: string;
    dosage: string;
    applicationMethod: string;
    safetyNote: string;
    price?: string;
    organic_certified?: boolean;
    effectiveness_rating?: number;
  };
  index: number;
  onBuyNow?: (productId: string) => void;
  language?: string;
}

const PRODUCT_THEMES = {
  organic: {
    gradient: 'from-success/20 via-success/10 to-success/20',
    border: 'border-success/30',
    icon: Leaf,
    iconColor: 'text-success',
    badge: 'bg-success/20 text-success dark:text-success',
    glow: 'shadow-success/30/20'
  },
  bio_input: {
    gradient: 'from-success/20 via-success/10 to-success/20',
    border: 'border-success/30',
    icon: Leaf,
    iconColor: 'text-success',
    badge: 'bg-success/20 text-success dark:text-success',
    glow: 'shadow-success/30/20'
  },
  fertilizer: {
    gradient: 'from-warning/20 via-warning/10 to-warning/20',
    border: 'border-warning/30',
    icon: FlaskConical,
    iconColor: 'text-warning',
    badge: 'bg-warning/20 text-warning dark:text-warning',
    glow: 'shadow-warning/30/20'
  },
  pesticide: {
    gradient: 'from-destructive/20 via-destructive/10 to-primary/20',
    border: 'border-destructive/30',
    icon: Bug,
    iconColor: 'text-destructive',
    badge: 'bg-destructive/20 text-destructive dark:text-destructive',
    glow: 'shadow-destructive/30/20'
  },
  fungicide: {
    gradient: 'from-primary/20 via-primary/10 to-info/20',
    border: 'border-primary/30',
    icon: FlaskConical,
    iconColor: 'text-primary',
    badge: 'bg-primary/20 text-primary dark:text-primary',
    glow: 'shadow-primary/30/20'
  },
  herbicide: {
    gradient: 'from-warning/20 via-warning/10 to-warning/20',
    border: 'border-warning/30',
    icon: Droplets,
    iconColor: 'text-warning',
    badge: 'bg-warning/20 text-warning dark:text-warning',
    glow: 'shadow-warning/30/20'
  },
  growth_regulator: {
    gradient: 'from-info/20 via-info/10 to-info/20',
    border: 'border-info/30',
    icon: Droplets,
    iconColor: 'text-info',
    badge: 'bg-info/20 text-info dark:text-info',
    glow: 'shadow-info/30/20'
  }
};

const PRODUCT_LABELS: Record<string, Record<string, string>> = {
  organic: { en: 'Organic', hi: 'जैविक', mr: 'सेंद्रिय' },
  bio_input: { en: 'Bio Input', hi: 'जैव आदान', mr: 'जैव निविष्ठा' },
  fertilizer: { en: 'Fertilizer', hi: 'खाद', mr: 'खत' },
  pesticide: { en: 'Pesticide', hi: 'कीटनाशक', mr: 'कीटकनाशक' },
  fungicide: { en: 'Fungicide', hi: 'फफूंदनाशक', mr: 'बुरशीनाशक' },
  herbicide: { en: 'Herbicide', hi: 'खरपतवारनाशक', mr: 'तणनाशक' },
  growth_regulator: { en: 'Growth Regulator', hi: 'वृद्धि नियंत्रक', mr: 'वाढ नियंत्रक' }
};

export function ProductCard({ product, index, onBuyNow, language = 'en' }: ProductCardProps) {
  const theme = PRODUCT_THEMES[product.productType] || PRODUCT_THEMES.organic;
  const IconComponent = theme.icon;
  const typeLabel = PRODUCT_LABELS[product.productType]?.[language] || PRODUCT_LABELS[product.productType]?.en || product.productType;
  
  const buyLabels = { en: 'Buy Now', hi: 'अभी खरीदें', mr: 'आता खरेदी करा' };
  const dosageLabels = { en: 'Dosage', hi: 'मात्रा', mr: 'प्रमाण' };
  const methodLabels = { en: 'Method', hi: 'तरीका', mr: 'पद्धत' };
  const safetyLabels = { en: 'Safety', hi: 'सुरक्षा', mr: 'सुरक्षितता' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, duration: 0.3, ease: 'easeOut' }}
    >
      <Card className={cn(
        'relative overflow-hidden backdrop-blur-xl',
        'bg-gradient-to-br', theme.gradient,
        'border', theme.border,
        'shadow-lg', theme.glow,
        'hover:shadow-xl hover:scale-[1.02] transition-all duration-300',
        'p-4 rounded-2xl'
      )}>
        {/* Glassmorphism overlay */}
        <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
        
        {/* Content */}
        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2.5 rounded-xl bg-background/60 backdrop-blur-sm',
                'ring-1 ring-inset ring-white/20'
              )}>
                <IconComponent className={cn('h-5 w-5', theme.iconColor)} />
              </div>
              <div>
                <h4 className="font-semibold text-foreground text-sm leading-tight">{product.name}</h4>
                <p className="text-xs text-muted-foreground">{product.brand}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={cn('text-xs px-2 py-0.5 rounded-full', theme.badge)}>
                {typeLabel}
              </Badge>
              {product.organic_certified && (
                <Badge className="bg-success/20 text-success dark:text-success text-xs px-2 py-0.5 rounded-full">
                  ✓ Certified
                </Badge>
              )}
            </div>
          </div>
          
          {/* Purpose */}
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{product.purpose}</p>
          
          {/* Details Grid */}
          <div className="grid gap-2 mb-3">
            <div className="flex items-start gap-2 text-xs">
              <span className="font-medium text-foreground/70 min-w-[60px]">{dosageLabels[language as keyof typeof dosageLabels] || dosageLabels.en}:</span>
              <span className="text-foreground/90">{product.dosage}</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="font-medium text-foreground/70 min-w-[60px]">{methodLabels[language as keyof typeof methodLabels] || methodLabels.en}:</span>
              <span className="text-foreground/90">{product.applicationMethod}</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="font-medium text-foreground/70 min-w-[60px]">{safetyLabels[language as keyof typeof safetyLabels] || safetyLabels.en}:</span>
              <span className="text-foreground/90">{product.safetyNote}</span>
            </div>
          </div>
          
          {/* Rating & Price */}
          <div className="flex items-center justify-between mb-3">
            {product.effectiveness_rating && (
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      'h-3.5 w-3.5',
                      i < Math.round(product.effectiveness_rating!)
                        ? 'fill-warning text-warning'
                        : 'text-muted-foreground/30'
                    )}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {product.effectiveness_rating.toFixed(1)}
                </span>
              </div>
            )}
            {product.price && (
              <span className="text-sm font-bold text-foreground">{product.price}</span>
            )}
          </div>
          
          {/* Buy Button - 2030 Glassmorphism Style */}
          <Button
            onClick={() => onBuyNow?.(product.id)}
            className={cn(
              'w-full h-10 rounded-xl font-medium text-sm',
              'bg-gradient-to-r from-primary via-primary/90 to-primary',
              'hover:from-primary/90 hover:via-primary hover:to-primary/90',
              'shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30',
              'backdrop-blur-sm border border-white/20',
              'transition-all duration-300'
            )}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {buyLabels[language as keyof typeof buyLabels] || buyLabels.en}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}