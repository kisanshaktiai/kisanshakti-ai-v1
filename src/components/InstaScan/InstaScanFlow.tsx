import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InstaScanCamera } from './InstaScanCamera';
import { InstaScanResults, InstaScanResult } from './InstaScanResults';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface InstaScanFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstaScanFlow({ isOpen, onClose }: InstaScanFlowProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showCamera, setShowCamera] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<InstaScanResult | null>(null);

  if (!isOpen) return null;

  const handleImageCapture = async (imageData: string) => {
    setShowCamera(false);
    setIsAnalyzing(true);

    try {
      // Call the AI agriculture chat edge function for crop analysis
      const { data, error } = await supabase.functions.invoke('ai-agriculture-chat', {
        body: {
          messages: [
            {
              role: 'user',
              content: `Analyze this crop image and provide:
                1. Crop name identification
                2. Overall crop condition (healthy/warning/critical)
                3. Any visible diseases or pest issues (list them)
                4. 3-5 specific actionable suggestions for the farmer
                
                Please respond in JSON format:
                {
                  "cropName": "string",
                  "condition": "healthy|warning|critical",
                  "diseases": ["string"],
                  "suggestions": ["string"],
                  "confidence": number (0-100)
                }`
            }
          ],
          imageUrl: imageData
        }
      });

      if (error) throw error;

      // Parse the AI response
      let analysis;
      try {
        // The response might be wrapped in the data object
        const responseText = data?.response || data;
        analysis = JSON.parse(responseText);
      } catch (parseError) {
        // Fallback parsing if response is not in expected format
        console.error('Parse error:', parseError);
        analysis = {
          cropName: t('instaScan.unknownCrop'),
          condition: 'warning',
          diseases: [],
          suggestions: [data?.response || t('instaScan.defaultSuggestion')],
          confidence: 75
        };
      }

      const result: InstaScanResult = {
        imageUrl: imageData,
        cropName: analysis.cropName || t('instaScan.unknownCrop'),
        cropCondition: analysis.condition || 'warning',
        diseases: analysis.diseases || [],
        suggestions: analysis.suggestions || [],
        confidence: analysis.confidence || 85
      };

      setScanResult(result);
    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: t('instaScan.analysisError'),
        description: t('instaScan.tryAgain'),
        variant: 'destructive'
      });
      onClose();
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