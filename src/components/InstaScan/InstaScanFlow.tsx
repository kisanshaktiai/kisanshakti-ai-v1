import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InstaScanCamera } from './InstaScanCamera';
import { InstaScanResults, InstaScanResult } from './InstaScanResults';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { toast as sonnerToast } from 'sonner';
import { preprocessImage } from '@/utils/imagePreprocessing';

interface InstaScanFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstaScanFlow({ isOpen, onClose }: InstaScanFlowProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const [showCamera, setShowCamera] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<InstaScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setShowCamera(true);
      setIsAnalyzing(false);
      setScanResult(null);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleImageCapture = async (imageFrames: string[]) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      console.log('📷 Starting image preprocessing...', imageFrames.length, 'frames');
      
      // Import selectBestFrame function
      const { selectBestFrame } = await import('@/utils/imagePreprocessing');
      
      // Select best frame from burst
      const bestFrame = await selectBestFrame(imageFrames);
      
      // Preprocess image: resize, compress, validate quality
      const preprocessed = await preprocessImage(bestFrame, {
        maxDimension: 1536,
        targetQuality: 0.85,
        targetSizeKB: 500
      });
      
      console.log('✨ Image preprocessed:', {
        originalSize: `${Math.round(preprocessed.originalSize / 1024)}KB`,
        processedSize: `${Math.round(preprocessed.processedSize / 1024)}KB`,
        compression: `${preprocessed.compressionRatio.toFixed(2)}x`,
        warnings: preprocessed.warnings
      });
      
      // Show warnings to user if any
      if (preprocessed.warnings.length > 0) {
        preprocessed.warnings.forEach(warning => {
          sonnerToast.warning(warning);
        });
      }
      
      // Get authentication context
      const farmerId = user?.id;
      const currentTenantId = tenant?.id;

      if (!farmerId || !currentTenantId) {
        console.error('Missing authentication context:', { farmerId, tenantId: currentTenantId });
        sonnerToast.error(t('instaScan.analysisError'));
        setErrorMessage(t('auth.loginRequired') || 'Please log in to use InstaScan');
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }

      // Use authenticated Supabase client
      const supabase = supabaseWithAuth(farmerId, currentTenantId);
      
      console.log('🔬 Calling AI crop scan edge function...');
      
      // Call the new production-quality edge function
      const { data, error } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: [preprocessed.processedImage],
          language: i18n.language,
          farmerId,
          tenantId: currentTenantId
        }
      });

      if (error) {
        console.error('Error analyzing image:', error);
        
        // Handle specific error types
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          sonnerToast.error(t('common.rateLimitError') || 'Too many requests. Please try again later.');
        } else if (error.message?.includes('402') || error.message?.includes('quota')) {
          sonnerToast.error(t('instaScan.quotaExceeded') || 'AI quota exceeded. Please contact support.');
        } else if (error.message?.includes('401') || error.message?.includes('authentication')) {
          sonnerToast.error(t('auth.loginRequired') || 'Authentication required');
        } else {
          sonnerToast.error(t('instaScan.analysisError'));
        }
        
        setErrorMessage(t('instaScan.tryAgain'));
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }

      console.log('🤖 AI Analysis result:', data);

      // Handle the structured response
      if (!data?.success || !data?.result) {
        console.error('Invalid response format:', data);
        sonnerToast.error(t('instaScan.analysisError'));
        setErrorMessage(t('instaScan.tryAgain'));
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }

      const aiResult = data.result;
      
      // RELAXED confidence threshold - accept more results
      // Only reject if confidence is very low (<40%) AND category is unknown
      if (aiResult.detectedItem?.confidence < 40 && 
          aiResult.detectedItem?.category === 'unknown') {
        console.warn('Very low confidence detection:', aiResult.detectedItem);
        sonnerToast.warning(t('instaScan.lowConfidence') || 'Could not identify clearly. Please take a clearer photo.');
        
        if (aiResult.metadata?.needsMoreImages) {
          sonnerToast.info(t('instaScan.needsMoreImages') || 'Try capturing from different angles');
        }
        
        setErrorMessage(t('instaScan.tryAgain'));
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }
      
      // Show warning for moderate confidence but still proceed
      if (aiResult.detectedItem?.confidence < 70) {
        sonnerToast.info(t('instaScan.moderateConfidence') || 'Analysis complete. Consider taking additional photos for better accuracy.');
      }

      // Transform AI result to InstaScanResult format
      const result: InstaScanResult = {
        imageUrl: bestFrame,
        detectedItem: aiResult.detectedItem,
        healthStatus: aiResult.healthStatus,
        diagnosis: aiResult.diagnosis,
        recommendations: aiResult.recommendations,
        metadata: aiResult.metadata,
        visualAnalysis: aiResult.visualAnalysis,
        processingTimeMs: data.processingTimeMs
      };

      console.log('✅ InstaScan completed successfully:', {
        item: result.detectedItem.commonName,
        confidence: result.detectedItem.confidence,
        condition: result.healthStatus.condition,
        processingTime: result.processingTimeMs + 'ms'
      });
      
      setScanResult(result);
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: t('instaScan.analysisError'),
        description: t('instaScan.tryAgain'),
        variant: 'destructive'
      });
      setErrorMessage(t('instaScan.tryAgain'));
      setShowCamera(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleContinueToChat = () => {
    if (!scanResult) return;

    // Store comprehensive scan result in session storage for AI Chat
    const scanContext = {
      fromInstaScan: true,
      imageUrl: scanResult.imageUrl,
      detectedItem: scanResult.detectedItem.commonName,
      scientificName: scanResult.detectedItem.scientificName,
      category: scanResult.detectedItem.category,
      healthStatus: scanResult.healthStatus.condition,
      riskLevel: scanResult.healthStatus.riskLevel,
      primaryIssues: scanResult.healthStatus.primaryIssues,
      diagnosisSummary: scanResult.diagnosis.summary,
      diseases: scanResult.diagnosis.likelyDiseases.map(d => d.name),
      pests: scanResult.diagnosis.likelyPests.map(p => p.name),
      recommendations: [
        ...scanResult.recommendations.immediate.map(r => r.action),
        ...scanResult.recommendations.shortTerm.map(r => r.action)
      ],
      timestamp: new Date().toISOString()
    };

    sessionStorage.setItem('instaScanContext', JSON.stringify(scanContext));
    
    // Navigate to AI Chat
    navigate('/app/chat');
    onClose();
  };

  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center">
        <div className="glassmorphism rounded-3xl p-8 max-w-sm mx-4">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-glow animate-pulse" />
              <Loader2 className="w-10 h-10 text-white absolute inset-0 m-auto animate-spin" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">{t('instaScan.analyzing')}</h3>
              <p className="text-muted-foreground text-sm">{t('instaScan.aiWorking')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (scanResult) {
    return (
      <InstaScanResults
        result={scanResult}
        onClose={onClose}
        onContinueToChat={handleContinueToChat}
      />
    );
  }

  if (showCamera) {
    return (
      <InstaScanCamera
        onCapture={handleImageCapture}
        onClose={onClose}
      />
    );
  }

  return null;
}