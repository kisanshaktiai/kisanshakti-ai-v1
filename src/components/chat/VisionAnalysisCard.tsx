import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { 
  Camera, Video, Loader2, AlertCircle, 
  CheckCircle, Leaf, Bug, Droplets,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Re-export type for convenience
export type { VisionAnalysisResult } from './RecommendationCards';
import { RecommendationCards, VisionAnalysisResult } from './RecommendationCards';

interface VisionAnalysisCardProps {
  imageUrl?: string;
  videoUrl?: string;
  isAnalyzing?: boolean;
  analysisResult?: VisionAnalysisResult;
  error?: string;
  language?: string;
  onRetry?: () => void;
}

export function VisionAnalysisCard({
  imageUrl,
  videoUrl,
  isAnalyzing = false,
  analysisResult,
  error,
  language = 'en',
  onRetry
}: VisionAnalysisCardProps) {
  // Localized text
  const getText = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      analyzing: { 
        en: 'Analyzing your image...', 
        hi: 'आपकी छवि का विश्लेषण हो रहा है...', 
        mr: 'तुमच्या प्रतिमेचे विश्लेषण होत आहे...' 
      },
      analyzingVideo: { 
        en: 'Analyzing video frames...', 
        hi: 'वीडियो फ्रेम का विश्लेषण हो रहा है...', 
        mr: 'व्हिडिओ फ्रेमचे विश्लेषण होत आहे...' 
      },
      error: { 
        en: 'Analysis failed', 
        hi: 'विश्लेषण विफल', 
        mr: 'विश्लेषण अयशस्वी' 
      },
      retry: { 
        en: 'Try Again', 
        hi: 'पुनः प्रयास करें', 
        mr: 'पुन्हा प्रयत्न करा' 
      },
      detecting: {
        en: 'Detecting crop, diseases, pests...',
        hi: 'फसल, रोग, कीट पहचान रहा है...',
        mr: 'पीक, रोग, कीटक ओळखत आहे...'
      },
      generating: {
        en: 'Generating recommendations...',
        hi: 'सिफारिशें बना रहा है...',
        mr: 'शिफारसी तयार करत आहे...'
      },
      aiPowered: {
        en: 'AI-Powered Analysis',
        hi: 'AI-संचालित विश्लेषण',
        mr: 'AI-चालित विश्लेषण'
      }
    };
    return texts[key]?.[language] || texts[key]?.en || key;
  };
  
  // Loading state
  if (isAnalyzing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="overflow-hidden border-primary/20">
          <CardContent className="p-4">
            {/* Media Preview */}
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted mb-4">
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  alt="Captured" 
                  className="w-full h-full object-cover opacity-50"
                />
              )}
              {videoUrl && (
                <video 
                  src={videoUrl} 
                  className="w-full h-full object-cover opacity-50"
                  muted
                  loop
                  autoPlay
                />
              )}
              
              {/* Scanning Animation Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <motion.div
                  className="absolute inset-0 border-2 border-primary/50"
                  animate={{
                    scale: [1, 1.05, 1],
                    opacity: [0.5, 1, 0.5]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                
                {/* Scanning Line */}
                <motion.div
                  className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                />
                
                <div className="relative z-10 text-center">
                  <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-3" />
                  <Badge className="bg-primary/90 text-primary-foreground mb-2">
                    {getText('aiPowered')}
                  </Badge>
                </div>
              </div>
            </div>
            
            {/* Analysis Steps */}
            <div className="space-y-2">
              <AnalysisStep 
                icon={<Camera className="h-4 w-4" />}
                text={videoUrl ? getText('analyzingVideo') : getText('analyzing')}
                isActive={true}
              />
              <AnalysisStep 
                icon={<Leaf className="h-4 w-4" />}
                text={getText('detecting')}
                isActive={false}
              />
              <AnalysisStep 
                icon={<Bug className="h-4 w-4" />}
                text={getText('generating')}
                isActive={false}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-destructive/20">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <div className="font-medium text-destructive">{getText('error')}</div>
                <div className="text-sm text-muted-foreground">{error}</div>
              </div>
            </div>
            
            {/* Image Preview */}
            {imageUrl && (
              <div className="aspect-video rounded-lg overflow-hidden bg-muted mb-4">
                <img 
                  src={imageUrl} 
                  alt="Captured" 
                  className="w-full h-full object-cover opacity-50"
                />
              </div>
            )}
            
            {onRetry && (
              <Button onClick={onRetry} variant="outline" className="w-full">
                {getText('retry')}
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }
  
  // Result state
  if (analysisResult) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Image Preview */}
        {(imageUrl || videoUrl) && (
          <Card className="overflow-hidden">
            <div className="relative aspect-video">
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  alt="Analyzed" 
                  className="w-full h-full object-cover"
                />
              )}
              {videoUrl && (
                <video 
                  src={videoUrl} 
                  className="w-full h-full object-cover"
                  controls
                />
              )}
              
              {/* Success Overlay */}
              <div className="absolute top-2 right-2">
                <Badge className="bg-success text-success-foreground">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {language === 'hi' ? 'विश्लेषित' : language === 'mr' ? 'विश्लेषित' : 'Analyzed'}
                </Badge>
              </div>
            </div>
          </Card>
        )}
        
        {/* Recommendation Cards */}
        <RecommendationCards analysis={analysisResult} language={language} />
      </motion.div>
    );
  }
  
  return null;
}

// Analysis step component
function AnalysisStep({ 
  icon, 
  text, 
  isActive 
}: { 
  icon: React.ReactNode; 
  text: string; 
  isActive: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-2 rounded-lg transition-all",
      isActive ? "bg-primary/10" : "opacity-50"
    )}>
      <div className={cn(
        "p-1.5 rounded-full",
        isActive ? "bg-primary text-primary-foreground" : "bg-muted"
      )}>
        {isActive ? (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            {icon}
          </motion.div>
        ) : (
          icon
        )}
      </div>
      <span className={cn(
        "text-sm",
        isActive ? "font-medium" : "text-muted-foreground"
      )}>
        {text}
      </span>
    </div>
  );
}
