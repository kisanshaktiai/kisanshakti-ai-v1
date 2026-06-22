import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { 
  Leaf, Beaker, Bug, Droplets, TrendingUp, AlertTriangle,
  CheckCircle, Info, Heart, Shield, Sprout
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeString } from './utils/safe-render';

export interface RecommendationCategory {
  type: 'organic' | 'fertilizer' | 'pesticide' | 'hormone' | 'irrigation' | 'warning' | 'success' | 'info' | 'hybrid';
  title: string;
  products: Array<{
    name: string;
    localName?: string;
    dosage: string;
    applicationMethod?: string;
    timing?: string;
    cost?: string;
  }>;
  instructions?: string[];
  benefits?: string[];
  precautions?: string[];
  estimatedCost?: string;
  effectiveness?: string;
}

export interface VisionAnalysisResult {
  cropDetected: {
    name: string;
    scientificName?: string;
    confidence: number;
    matchesLandCrop?: boolean;
    landCrop?: string;
  };
  healthStatus: {
    condition: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
  };
  diagnosis: {
    summary: string;
    diseases?: Array<{ name: string; confidence: number; symptoms: string[] }>;
    pests?: Array<{ name: string; confidence: number; damageType: string }>;
    deficiencies?: Array<{ nutrient: string; severity: string; symptoms: string[] }>;
  };
  recommendations: {
    organic?: RecommendationCategory;
    fertilizer?: RecommendationCategory;
    pesticide?: RecommendationCategory;
    hormone?: RecommendationCategory;
    hybrid?: RecommendationCategory; // For integrated/complete solutions
  };
  language: string;
}

import type { SuggestionType } from './SuggestionTypeSelector';

interface RecommendationCardsProps {
  analysis: VisionAnalysisResult;
  language?: string;
  suggestionType?: SuggestionType; // Only show this type if specified
}

// Category styles
const categoryStyles: Record<string, {
  gradient: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  badgeColor: string;
}> = {
  organic: {
    gradient: 'from-success/20 to-success/10',
    icon: <Leaf className="h-5 w-5" />,
    bgColor: 'bg-success-soft dark:bg-success/30',
    textColor: 'text-success dark:text-success',
    badgeColor: 'bg-success text-white'
  },
  fertilizer: {
    gradient: 'from-warning/20 to-warning/10',
    icon: <Beaker className="h-5 w-5" />,
    bgColor: 'bg-warning-soft dark:bg-warning/30',
    textColor: 'text-warning dark:text-warning',
    badgeColor: 'bg-warning text-white'
  },
  pesticide: {
    gradient: 'from-destructive/20 to-warning/10',
    icon: <Bug className="h-5 w-5" />,
    bgColor: 'bg-destructive-soft dark:bg-destructive/30',
    textColor: 'text-destructive dark:text-destructive',
    badgeColor: 'bg-destructive text-white'
  },
  hormone: {
    gradient: 'from-primary/20 to-primary/10',
    icon: <TrendingUp className="h-5 w-5" />,
    bgColor: 'bg-primary-soft dark:bg-primary/30',
    textColor: 'text-primary dark:text-primary',
    badgeColor: 'bg-primary text-white'
  },
  hybrid: {
    gradient: 'from-info/20 to-primary/10',
    icon: <Shield className="h-5 w-5" />,
    bgColor: 'bg-info-soft dark:bg-info/30',
    textColor: 'text-info dark:text-info',
    badgeColor: 'bg-info text-white'
  },
  irrigation: {
    gradient: 'from-info/20 to-info/10',
    icon: <Droplets className="h-5 w-5" />,
    bgColor: 'bg-info-soft dark:bg-info/30',
    textColor: 'text-info dark:text-info',
    badgeColor: 'bg-info text-white'
  },
  warning: {
    gradient: 'from-warning/20 to-warning/10',
    icon: <AlertTriangle className="h-5 w-5" />,
    bgColor: 'bg-warning-soft dark:bg-warning/30',
    textColor: 'text-warning dark:text-warning',
    badgeColor: 'bg-warning text-white'
  },
  success: {
    gradient: 'from-success/20 to-success/10',
    icon: <CheckCircle className="h-5 w-5" />,
    bgColor: 'bg-success-soft dark:bg-success/30',
    textColor: 'text-success dark:text-success',
    badgeColor: 'bg-success text-white'
  },
  info: {
    gradient: 'from-info/20 to-info/10',
    icon: <Info className="h-5 w-5" />,
    bgColor: 'bg-info-soft dark:bg-info/30',
    textColor: 'text-info dark:text-info',
    badgeColor: 'bg-info text-white'
  }
};

// Localized labels
const getLabels = (lang: string) => ({
  organic: lang === 'hi' ? '🟢 जैविक उपाय' : lang === 'mr' ? '🟢 सेंद्रिय उपाय' : '🟢 Organic Solution',
  fertilizer: lang === 'hi' ? '🟡 रासायनिक खाद' : lang === 'mr' ? '🟡 रासायनिक खत' : '🟡 Chemical Fertilizer',
  pesticide: lang === 'hi' ? '🔴 कीटनाशक' : lang === 'mr' ? '🔴 कीटकनाशक' : '🔴 Pesticide Solution',
  hormone: lang === 'hi' ? '💪 हार्मोन ग्रोअर' : lang === 'mr' ? '💪 हार्मोन ग्रोअर' : '💪 Hormone Grower',
  hybrid: lang === 'hi' ? '🌈 संपूर्ण समाधान' : lang === 'mr' ? '🌈 संपूर्ण समाधान' : '🌈 Complete Solution',
  dosage: lang === 'hi' ? 'मात्रा' : lang === 'mr' ? 'मात्रा' : 'Dosage',
  application: lang === 'hi' ? 'उपयोग विधि' : lang === 'mr' ? 'वापर पद्धत' : 'Application',
  timing: lang === 'hi' ? 'समय' : lang === 'mr' ? 'वेळ' : 'Timing',
  cost: lang === 'hi' ? 'अनुमानित लागत' : lang === 'mr' ? 'अंदाजित खर्च' : 'Estimated Cost',
  benefits: lang === 'hi' ? 'फायदे' : lang === 'mr' ? 'फायदे' : 'Benefits',
  precautions: lang === 'hi' ? 'सावधानियां' : lang === 'mr' ? 'सावधगिरी' : 'Precautions',
  cropDetected: lang === 'hi' ? 'पहचानी गई फसल' : lang === 'mr' ? 'ओळखलेले पीक' : 'Crop Detected',
  healthStatus: lang === 'hi' ? 'स्वास्थ्य स्थिति' : lang === 'mr' ? 'आरोग्य स्थिती' : 'Health Status',
  diagnosis: lang === 'hi' ? 'निदान' : lang === 'mr' ? 'निदान' : 'Diagnosis',
  confidence: lang === 'hi' ? 'विश्वास स्तर' : lang === 'mr' ? 'विश्वास पातळी' : 'Confidence',
  healthy: lang === 'hi' ? 'स्वस्थ' : lang === 'mr' ? 'निरोगी' : 'Healthy',
  warning: lang === 'hi' ? 'सतर्कता' : lang === 'mr' ? 'सावधानता' : 'Warning',
  critical: lang === 'hi' ? 'गंभीर' : lang === 'mr' ? 'गंभीर' : 'Critical',
  mismatchWarning: lang === 'hi' 
    ? 'यह आपके खेत की फसल से मेल नहीं खाता। सामान्य चैट का उपयोग करें।'
    : lang === 'mr'
    ? 'हे तुमच्या शेतातील पिकाशी जुळत नाही. सामान्य चॅट वापरा.'
    : 'This does not match your land\'s crop. Please use General Chat.'
});

function RecommendationCard({ category, language }: { category: RecommendationCategory; language: string }) {
  const style = categoryStyles[category.type] || categoryStyles.info;
  const labels = getLabels(language);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn(
        "overflow-hidden border-0 shadow-lg",
        `bg-gradient-to-br ${style.gradient}`
      )}>
        <CardHeader className={cn("pb-2", style.bgColor)}>
          <div className="flex items-center justify-between">
            <CardTitle className={cn("flex items-center gap-2 text-lg", style.textColor)}>
              {style.icon}
              {category.title}
            </CardTitle>
            {category.estimatedCost && (
              <Badge className={style.badgeColor}>
                {labels.cost}: {category.estimatedCost}
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4 pt-4">
          {/* Products */}
          {category.products.map((product, idx) => (
            <div key={idx} className="p-3 bg-background/80 rounded-lg border">
              <div className="font-medium text-foreground mb-2">
                {product.name}
                {product.localName && (
                  <span className="text-muted-foreground ml-2">({product.localName})</span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{labels.dosage}:</span>
                  <span className="ml-1 font-medium">{product.dosage}</span>
                </div>
                
                {product.timing && (
                  <div>
                    <span className="text-muted-foreground">{labels.timing}:</span>
                    <span className="ml-1">{safeString(product.timing)}</span>
                  </div>
                )}
                
                {product.cost && (
                  <div>
                    <span className="text-muted-foreground">{labels.cost}:</span>
                    <span className="ml-1">{product.cost}</span>
                  </div>
                )}
              </div>
              
              {product.applicationMethod && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium">{labels.application}:</span> {product.applicationMethod}
                </div>
              )}
            </div>
          ))}
          
          {/* Instructions */}
          {category.instructions && category.instructions.length > 0 && (
            <div className="space-y-1">
              {category.instructions.map((instruction, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <Sprout className="h-4 w-4 mt-0.5 text-success shrink-0" />
                  <span>{instruction}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Benefits */}
          {category.benefits && category.benefits.length > 0 && (
            <div className="p-2 bg-success/10 rounded-lg">
              <div className="flex items-center gap-1 text-sm font-medium text-success dark:text-success mb-1">
                <Heart className="h-4 w-4" />
                {labels.benefits}
              </div>
              <ul className="text-sm space-y-1">
                {category.benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <CheckCircle className="h-3 w-3 mt-1 text-success" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Precautions */}
          {category.precautions && category.precautions.length > 0 && (
            <div className="p-2 bg-warning/10 rounded-lg">
              <div className="flex items-center gap-1 text-sm font-medium text-warning dark:text-warning mb-1">
                <Shield className="h-4 w-4" />
                {labels.precautions}
              </div>
              <ul className="text-sm space-y-1">
                {category.precautions.map((precaution, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-1 text-warning" />
                    {precaution}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function RecommendationCards({ analysis, language = 'en', suggestionType }: RecommendationCardsProps) {
  const labels = getLabels(language);
  
  // ✅ Safety check: Ensure analysis has required fields
  if (!analysis?.cropDetected || !analysis?.healthStatus || !analysis?.diagnosis) {
    console.warn('[RecommendationCards] Incomplete analysis data:', {
      hasCropDetected: !!analysis?.cropDetected,
      hasHealthStatus: !!analysis?.healthStatus,
      hasDiagnosis: !!analysis?.diagnosis
    });
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Analysis data is incomplete. Please try again.</p>
      </div>
    );
  }
  
  // Health status colors
  const healthColors = {
    healthy: 'bg-success',
    warning: 'bg-warning',
    critical: 'bg-destructive'
  };

  // ✅ Filter recommendations based on suggestionType
  const shouldShowCategory = (category: 'organic' | 'fertilizer' | 'pesticide' | 'hormone') => {
    if (!suggestionType) return true; // Show all if no filter
    if (suggestionType === 'hybrid') return true; // Hybrid shows all
    return category === suggestionType;
  };

  // Get localized title based on suggestion type
  const getSolutionTitle = () => {
    if (!suggestionType) return null;
    const titles = {
      organic: language === 'hi' ? '🟢 जैविक समाधान' : language === 'mr' ? '🟢 सेंद्रिय समाधान' : '🟢 Organic Solution',
      fertilizer: language === 'hi' ? '🟡 खाद समाधान' : language === 'mr' ? '🟡 खत समाधान' : '🟡 Fertilizer Solution',
      pesticide: language === 'hi' ? '🔴 कीटनाशक समाधान' : language === 'mr' ? '🔴 कीटकनाशक समाधान' : '🔴 Pesticide Solution',
      hybrid: language === 'hi' ? '🌈 संपूर्ण समाधान' : language === 'mr' ? '🌈 संपूर्ण समाधान' : '🌈 Complete Solution'
    };
    return titles[suggestionType];
  };
  
  return (
    <div className="space-y-4">
      {/* Solution Type Header (only for targeted solutions) */}
      {suggestionType && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-center py-2 px-4 bg-primary/10 rounded-lg border border-primary/20">
            <span className="font-semibold text-primary text-lg">
              {getSolutionTitle()}
            </span>
          </div>
        </motion.div>
      )}
      
      {/* Recommendation Cards - Filtered by suggestionType */}
      <div className="space-y-4">
        {/* ✅ Hybrid/Complete Solution - render directly if present */}
        {suggestionType === 'hybrid' && analysis.recommendations?.hybrid && (
          <RecommendationCard 
            category={{
              ...analysis.recommendations.hybrid,
              type: 'hybrid' as const
            }} 
            language={language} 
          />
        )}
        
        {/* Organic - only if not hybrid or if hybrid has separate organic */}
        {suggestionType !== 'hybrid' && shouldShowCategory('organic') && analysis.recommendations?.organic && (
          <RecommendationCard 
            category={analysis.recommendations.organic} 
            language={language} 
          />
        )}
        
        {/* Fertilizer */}
        {suggestionType !== 'hybrid' && shouldShowCategory('fertilizer') && analysis.recommendations?.fertilizer && (
          <RecommendationCard 
            category={analysis.recommendations.fertilizer} 
            language={language} 
          />
        )}
        
        {/* Pesticide */}
        {suggestionType !== 'hybrid' && shouldShowCategory('pesticide') && analysis.recommendations?.pesticide && (
          <RecommendationCard 
            category={analysis.recommendations.pesticide} 
            language={language} 
          />
        )}
        
        {/* Hormone Grower (for hybrid/complete solution - fallback if separate) */}
        {suggestionType === 'hybrid' && analysis.recommendations?.hormone && (
          <RecommendationCard 
            category={analysis.recommendations.hormone} 
            language={language} 
          />
        )}
      </div>
    </div>
  );
}
