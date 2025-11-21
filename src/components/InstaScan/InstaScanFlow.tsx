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

  const handleImageCapture = async (imageData: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      // Enhanced logging for debugging
      const imageSizeKB = Math.round(imageData.length / 1024);
      const imageFormat = imageData.substring(0, 30);
      console.log('📷 Sending image to AI for analysis:', {
        imageSize: `${imageSizeKB}KB`,
        format: imageFormat,
        timestamp: new Date().toISOString(),
        language: i18n.language
      });
      
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
      
      // Call the edge function with proper authentication and context
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [],
          imageUrl: imageData,
          sessionId: `instascan-${Date.now()}`,
          language: i18n.language,
          metadata: {
            tenantId: currentTenantId,
            farmerId
          }
        }
      });

      if (error) {
        console.error('Error analyzing image:', error);
        
        // Handle specific error types
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          sonnerToast.error(t('common.rateLimitError') || 'Too many requests. Please try again later.');
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

      console.log('AI Analysis result:', data);

      // Handle the structured response
      if (!data?.success || !data?.result) {
        console.error('Invalid response format:', data);
        sonnerToast.error(t('instaScan.analysisError'));
        setErrorMessage(t('instaScan.tryAgain'));
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }

      // Validate result quality
      const resultData = data.result;
      
      // Check if AI couldn't identify the crop reliably
      if (resultData.confidence < 50 || 
          resultData.cropName?.toLowerCase().includes('unknown') ||
          resultData.cropName?.toLowerCase().includes('not a crop')) {
        console.warn('Low confidence or unidentified crop:', resultData);
        sonnerToast.warning(t('instaScan.lowConfidence') || 'Could not identify crop clearly. Please take a clearer photo.');
        setErrorMessage(t('instaScan.tryAgain'));
        setShowCamera(true);
        setIsAnalyzing(false);
        return;
      }

      const result: InstaScanResult = {
        imageUrl: imageData,
        cropName: resultData.cropName || t('instaScan.unknownCrop'),
        cropCondition: resultData.condition || 'warning',
        diseases: resultData.diseases || [],
        suggestions: resultData.suggestions || [t('instaScan.defaultSuggestion')],
        confidence: resultData.confidence || 0
      };

      console.log('✅ InstaScan completed successfully:', result);
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

    // Store scan result in session storage for AI Chat to pick up
    const scanContext = {
      fromInstaScan: true,
      imageUrl: scanResult.imageUrl,
      cropName: scanResult.cropName,
      cropCondition: scanResult.cropCondition,
      diseases: scanResult.diseases,
      suggestions: scanResult.suggestions,
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