import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { 
  Leaf, Beaker, Bug, Droplets, TrendingUp, AlertTriangle,
  CheckCircle, Info, Heart, Shield, Sprout
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
    gradient: 'from-green-500/20 to-emerald-500/10',
    icon: <Leaf className="h-5 w-5" />,
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    textColor: 'text-green-700 dark:text-green-300',
    badgeColor: 'bg-green-500 text-white'
  },
  fertilizer: {
    gradient: 'from-amber-500/20 to-yellow-500/10',
    icon: <Beaker className="h-5 w-5" />,
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    textColor: 'text-amber-700 dark:text-amber-300',
    badgeColor: 'bg-amber-500 text-white'
  },
  pesticide: {
    gradient: 'from-red-500/20 to-orange-500/10',
    icon: <Bug className="h-5 w-5" />,
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    textColor: 'text-red-700 dark:text-red-300',
    badgeColor: 'bg-red-500 text-white'
  },
  hormone: {
    gradient: 'from-purple-500/20 to-violet-500/10',
    icon: <TrendingUp className="h-5 w-5" />,
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    textColor: 'text-purple-700 dark:text-purple-300',
    badgeColor: 'bg-purple-500 text-white'
  },
  hybrid: {
    gradient: 'from-indigo-500/20 to-purple-500/10',
    icon: <Shield className="h-5 w-5" />,
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
    textColor: 'text-indigo-700 dark:text-indigo-300',
    badgeColor: 'bg-indigo-500 text-white'
  },
  irrigation: {
    gradient: 'from-blue-500/20 to-cyan-500/10',
    icon: <Droplets className="h-5 w-5" />,
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    textColor: 'text-blue-700 dark:text-blue-300',
    badgeColor: 'bg-blue-500 text-white'
  },
  warning: {
    gradient: 'from-orange-500/20 to-yellow-500/10',
    icon: <AlertTriangle className="h-5 w-5" />,
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    textColor: 'text-orange-700 dark:text-orange-300',
    badgeColor: 'bg-orange-500 text-white'
  },
  success: {
    gradient: 'from-emerald-500/20 to-green-500/10',
    icon: <CheckCircle className="h-5 w-5" />,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    badgeColor: 'bg-emerald-500 text-white'
  },
  info: {
    gradient: 'from-sky-500/20 to-blue-500/10',
    icon: <Info className="h-5 w-5" />,
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    textColor: 'text-sky-700 dark:text-sky-300',
    badgeColor: 'bg-sky-500 text-white'
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
                    <span className="ml-1">{typeof product.timing === 'object' ? ((product.timing as any)?.reason || (product.timing as any)?.recommended_start || '') : product.timing}</span>
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
                  <Sprout className="h-4 w-4 mt-0.5 text-green-500 shrink-0" />
                  <span>{instruction}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Benefits */}
          {category.benefits && category.benefits.length > 0 && (
            <div className="p-2 bg-green-500/10 rounded-lg">
              <div className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                <Heart className="h-4 w-4" />
                {labels.benefits}
              </div>
              <ul className="text-sm space-y-1">
                {category.benefits.map((benefit, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <CheckCircle className="h-3 w-3 mt-1 text-green-500" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Precautions */}
          {category.precautions && category.precautions.length > 0 && (
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <div className="flex items-center gap-1 text-sm font-medium text-orange-700 dark:text-orange-300 mb-1">
                <Shield className="h-4 w-4" />
                {labels.precautions}
              </div>
              <ul className="text-sm space-y-1">
                {category.precautions.map((precaution, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-1 text-orange-500" />
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
    healthy: 'bg-green-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500'
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
