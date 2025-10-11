import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Download, 
  Share2, 
  Loader2,
  Droplets,
  Leaf,
  Zap,
  Mountain,
  Activity,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  FileText,
  Image as ImageIcon,
  Volume2,
  VolumeX
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import html2pdf from 'html2pdf.js';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  village?: string;
  district?: string;
  state?: string;
  soil_type?: string;
  boundary_polygon_old?: any;
  center_point_old?: any;
}

interface SoilData {
  latitude: number;
  longitude: number;
  depth: string;
  properties: {
    bdod: { mean: number; unit: string; description: string };
    cec: { mean: number; unit: string; description: string };
    cfvo: { mean: number; unit: string; description: string };
    clay: { mean: number; unit: string; description: string };
    nitrogen: { mean: number; unit: string; description: string };
    ocd: { mean: number; unit: string; description: string };
    ocs: { mean: number; unit: string; description: string };
    phh2o: { mean: number; unit: string; description: string };
    sand: { mean: number; unit: string; description: string };
    silt: { mean: number; unit: string; description: string };
    soc: { mean: number; unit: string; description: string };
  };
}

export default function SoilReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const reportRef = useRef<HTMLDivElement>(null);
  const [land, setLand] = useState<Land | null>(null);
  const [soilData, setSoilData] = useState<SoilData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { speak, stop, isSpeaking } = useTextToSpeech();

  useEffect(() => {
    fetchLandAndSoilData();
  }, [id]);

  const fetchLandAndSoilData = async () => {
    try {
      setLoading(true);
      
      // Fetch land data
      const { landsApi } = await import('@/services/landsApi');
      const landData = await landsApi.fetchLandById(id!);
      
      if (!landData) {
        toast({
          title: 'Error',
          description: 'Land not found',
          variant: 'destructive',
        });
        navigate('/app/lands');
        return;
      }
      
      setLand(landData);
      
      // Extract coordinates from center_point_old
      let lat, lng;
      if (landData.center_point_old?.coordinates) {
        lng = landData.center_point_old.coordinates[0];
        lat = landData.center_point_old.coordinates[1];
      } else if (landData.boundary_polygon_old?.coordinates?.[0]?.[0]) {
        lng = landData.boundary_polygon_old.coordinates[0][0][0];
        lat = landData.boundary_polygon_old.coordinates[0][0][1];
      }
      
      if (!lat || !lng) {
        toast({
          title: 'Error',
          description: 'Land coordinates not found',
          variant: 'destructive',
        });
        return;
      }
      
      // Fetch soil data from KisanShakti API
      const response = await fetch(
        `https://kisanshakti-api.onrender.com/soil?latitude=${lat}&longitude=${lng}&depth=0-5cm`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch soil data');
      }
      
      const data = await response.json();
      setSoilData(data);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load soil data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getSoilHealthScore = (): number => {
    if (!soilData) return 0;
    
    let score = 0;
    const { phh2o, soc, nitrogen, clay, sand } = soilData.properties;
    
    // pH score (0-40 points)
    const pH = phh2o.mean / 10;
    if (pH >= 6.0 && pH <= 7.5) score += 40;
    else if (pH >= 5.5 && pH <= 8.0) score += 30;
    else if (pH >= 5.0 && pH <= 8.5) score += 20;
    else score += 10;
    
    // Organic carbon score (0-30 points)
    const orgCarbon = soc.mean / 10;
    if (orgCarbon >= 1.5) score += 30;
    else if (orgCarbon >= 1.0) score += 20;
    else if (orgCarbon >= 0.5) score += 10;
    
    // Nitrogen score (0-30 points)
    const nitrogenVal = nitrogen.mean / 10;
    if (nitrogenVal >= 3.0) score += 30;
    else if (nitrogenVal >= 2.0) score += 20;
    else if (nitrogenVal >= 1.0) score += 10;
    
    return Math.round(score);
  };

  const getHealthStatus = (score: number): { label: string; color: string; bgColor: string } => {
    if (score >= 80) return { label: 'Excellent', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950' };
    if (score >= 60) return { label: 'Good', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950' };
    if (score >= 40) return { label: 'Fair', color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-950' };
    return { label: 'Poor', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950' };
  };

  const getFarmerAdvice = (): string[] => {
    if (!soilData) return [];
    
    const advice: string[] = [];
    const { phh2o, soc, nitrogen, clay, sand, silt } = soilData.properties;
    const pH = phh2o.mean / 10;
    const orgCarbon = soc.mean / 10;
    const nitrogenVal = nitrogen.mean / 10;
    
    // pH advice
    if (pH < 6.0) {
      advice.push(i18n.language === 'hi' 
        ? 'मिट्टी अम्लीय है। चूना (lime) डालकर pH बढ़ाएं। प्रति एकड़ 200-300 kg चूना डालें।'
        : 'Soil is acidic. Add lime to increase pH. Apply 200-300 kg lime per acre.');
    } else if (pH > 8.0) {
      advice.push(i18n.language === 'hi'
        ? 'मिट्टी क्षारीय है। जिप्सम (gypsum) डालें या खाद मिलाएं। प्रति एकड़ 500 kg जिप्सम डालें।'
        : 'Soil is alkaline. Add gypsum or compost. Apply 500 kg gypsum per acre.');
    } else {
      advice.push(i18n.language === 'hi'
        ? 'मिट्टी का pH अच्छा है। इसे बनाए रखें। नियमित रूप से जैविक खाद डालें।'
        : 'Soil pH is good. Maintain it by adding organic matter regularly.');
    }
    
    // Organic carbon advice
    if (orgCarbon < 0.75) {
      advice.push(i18n.language === 'hi'
        ? 'जैविक कार्बन कम है। गोबर की खाद या कम्पोस्ट डालें। प्रति एकड़ 5-8 टन खाद डालें।'
        : 'Organic carbon is low. Add farmyard manure or compost. Apply 5-8 tons per acre.');
    } else {
      advice.push(i18n.language === 'hi'
        ? 'जैविक कार्बन अच्छा है। फसल अवशेषों को खेत में मिलाते रहें।'
        : 'Organic carbon is good. Continue adding crop residues to soil.');
    }
    
    // Nitrogen advice
    if (nitrogenVal < 2.0) {
      advice.push(i18n.language === 'hi'
        ? 'नाइट्रोजन की कमी है। यूरिया या DAP उर्वरक डालें। दलहनी फसलें (मूंग, उड़द) लगाएं।'
        : 'Nitrogen is low. Apply urea or DAP fertilizer. Grow legume crops (pulses).');
    } else {
      advice.push(i18n.language === 'hi'
        ? 'नाइट्रोजन स्तर अच्छा है। संतुलित उर्वरक उपयोग जारी रखें।'
        : 'Nitrogen level is good. Continue balanced fertilizer use.');
    }
    
    // Texture advice
    const clayPercent = clay.mean / 10;
    const sandPercent = sand.mean / 10;
    
    if (sandPercent > 70) {
      advice.push(i18n.language === 'hi'
        ? 'मिट्टी रेतीली है। पानी जल्दी सूखता है। जैविक खाद मिलाएं और बार-बार सिंचाई करें।'
        : 'Soil is sandy. Water drains fast. Add organic matter and irrigate frequently.');
    } else if (clayPercent > 60) {
      advice.push(i18n.language === 'hi'
        ? 'मिट्टी चिकनी (clay) है। जल निकासी की व्यवस्था करें। जैविक खाद मिलाकर मिट्टी ढीली बनाएं।'
        : 'Soil is clayey. Ensure good drainage. Add organic matter to improve structure.');
    } else {
      advice.push(i18n.language === 'hi'
        ? 'मिट्टी की बनावट संतुलित है। यह खेती के लिए अच्छी है।'
        : 'Soil texture is balanced. Good for cultivation.');
    }
    
    return advice;
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    
    try {
      setDownloading(true);
      const element = reportRef.current;
      
      const opt = {
        margin: 10,
        filename: `soil-report-${land?.name || 'land'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      await html2pdf().set(opt).from(element).save();
      
      toast({
        title: 'Success',
        description: 'PDF downloaded successfully',
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to download PDF',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const downloadJPG = async () => {
    if (!reportRef.current) return;
    
    try {
      setDownloading(true);
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `soil-report-${land?.name || 'land'}.jpg`;
          a.click();
          URL.revokeObjectURL(url);
          
          toast({
            title: 'Success',
            description: 'Image downloaded successfully',
          });
        }
      }, 'image/jpeg', 0.98);
    } catch (error) {
      console.error('Error generating image:', error);
      toast({
        title: 'Error',
        description: 'Failed to download image',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Soil Report - ${land?.name}`,
      text: `Soil Health Score: ${getSoilHealthScore()}%`,
      url: window.location.href,
    };
    
    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link Copied',
        description: 'Report link copied to clipboard',
      });
    }
  };

  const speakAdvice = () => {
    const advice = getFarmerAdvice().join('. ');
    const healthScore = getSoilHealthScore();
    const status = getHealthStatus(healthScore);
    const text = i18n.language === 'hi'
      ? `आपकी मिट्टी का स्वास्थ्य स्कोर ${healthScore} प्रतिशत है। स्थिति ${status.label} है। सलाह: ${advice}`
      : `Your soil health score is ${healthScore} percent. Status is ${status.label}. Advice: ${advice}`;
    
    if (isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4 pb-24">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!soilData || !land) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Unable to load soil data for this land
            </p>
            <Button onClick={() => navigate(`/app/lands/${id}`)}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const healthScore = getSoilHealthScore();
  const healthStatus = getHealthStatus(healthScore);
  const advice = getFarmerAdvice();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/app/lands/${id}`)}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">Soil Report</h1>
              <p className="text-xs text-muted-foreground truncate">{land.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={speakAdvice}
              className="shrink-0"
              title={isSpeaking ? "Stop" : "Listen"}
            >
              {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleShare}
              className="shrink-0"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={downloadJPG}
              disabled={downloading}
              className="shrink-0"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={downloadPDF}
              disabled={downloading}
              className="shrink-0"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="max-w-4xl mx-auto p-4 space-y-4" ref={reportRef}>
        {/* Hero Card - Health Score */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className={`overflow-hidden border-2 ${healthStatus.bgColor}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Soil Health Score</p>
                  <h2 className={`text-5xl font-bold ${healthStatus.color}`}>{healthScore}%</h2>
                </div>
                <div className={`h-20 w-20 rounded-full ${healthStatus.color} bg-opacity-10 flex items-center justify-center`}>
                  <Activity className={`h-10 w-10 ${healthStatus.color}`} />
                </div>
              </div>
              
              <Progress value={healthScore} className="h-3 mb-3" />
              
              <div className="flex items-center justify-between">
                <Badge className={`${healthStatus.color} bg-opacity-20 border-0 text-sm px-3 py-1`}>
                  {healthStatus.label}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {land.village}, {land.district}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Key Properties Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <Card className="overflow-hidden">
            <CardContent className="p-4 text-center">
              <Droplets className="h-8 w-8 mx-auto mb-2 text-blue-500" />
              <p className="text-xs text-muted-foreground mb-1">pH Level</p>
              <p className="text-2xl font-bold">{(soilData.properties.phh2o.mean / 10).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {soilData.properties.phh2o.mean / 10 >= 6.0 && soilData.properties.phh2o.mean / 10 <= 7.5 ? '✓ Good' : '⚠ Adjust'}
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4 text-center">
              <Leaf className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-xs text-muted-foreground mb-1">Organic C</p>
              <p className="text-2xl font-bold">{(soilData.properties.soc.mean / 10).toFixed(2)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {soilData.properties.soc.mean / 10 >= 1.0 ? '✓ Good' : '⚠ Low'}
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4 text-center">
              <Zap className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
              <p className="text-xs text-muted-foreground mb-1">Nitrogen</p>
              <p className="text-2xl font-bold">{(soilData.properties.nitrogen.mean / 10).toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {soilData.properties.nitrogen.mean / 10 >= 2.0 ? '✓ Good' : '⚠ Low'}
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-4 text-center">
              <Mountain className="h-8 w-8 mx-auto mb-2 text-orange-500" />
              <p className="text-xs text-muted-foreground mb-1">Clay</p>
              <p className="text-2xl font-bold">{(soilData.properties.clay.mean / 10).toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {land.soil_type || 'Type'}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Soil Composition */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Soil Composition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Sand</span>
                  <span className="text-sm text-muted-foreground">{(soilData.properties.sand.mean / 10).toFixed(1)}%</span>
                </div>
                <Progress value={soilData.properties.sand.mean / 10} className="h-2 bg-yellow-100" />
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Silt</span>
                  <span className="text-sm text-muted-foreground">{(soilData.properties.silt.mean / 10).toFixed(1)}%</span>
                </div>
                <Progress value={soilData.properties.silt.mean / 10} className="h-2 bg-blue-100" />
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Clay</span>
                  <span className="text-sm text-muted-foreground">{(soilData.properties.clay.mean / 10).toFixed(1)}%</span>
                </div>
                <Progress value={soilData.properties.clay.mean / 10} className="h-2 bg-orange-100" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Farmer-Friendly Advice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                {i18n.language === 'hi' ? 'किसान सलाह' : 'Recommendations for Farmers'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {advice.map((item, index) => (
                <div key={index} className="flex gap-3 p-3 bg-background rounded-lg">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Detailed Properties */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Detailed Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <p className="font-medium">Bulk Density</p>
                  <p className="text-muted-foreground">{(soilData.properties.bdod.mean / 100).toFixed(2)} {soilData.properties.bdod.unit}</p>
                </div>
                
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <p className="font-medium">CEC</p>
                  <p className="text-muted-foreground">{(soilData.properties.cec.mean / 10).toFixed(1)} {soilData.properties.cec.unit}</p>
                </div>
                
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <p className="font-medium">Coarse Fragments</p>
                  <p className="text-muted-foreground">{(soilData.properties.cfvo.mean / 10).toFixed(1)} {soilData.properties.cfvo.unit}</p>
                </div>
                
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <p className="font-medium">Organic Carbon Density</p>
                  <p className="text-muted-foreground">{(soilData.properties.ocd.mean / 10).toFixed(1)} {soilData.properties.ocd.unit}</p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium mb-1">Data Source:</p>
                <p>KisanShakti API • SoilGrids • Depth: {soilData.depth}</p>
                <p className="mt-1">Location: {soilData.latitude.toFixed(6)}, {soilData.longitude.toFixed(6)}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
