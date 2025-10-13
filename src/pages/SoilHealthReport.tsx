import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Download, Share2, Loader2, Activity, AlertCircle, 
  FileText, Image as ImageIcon, Droplet, Leaf, Gauge, TestTube
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';

export default function SoilHealthReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [soilData, setSoilData] = useState<any>(null);
  const [farmerData, setFarmerData] = useState<any>(null);
  const [landData, setLandData] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('soil_health')
        .select(`
          *,
          user_profiles!inner(
            full_name,
            farmer_code,
            mobile_number,
            avatar_url,
            address_line1,
            village,
            district,
            state,
            pincode
          ),
          lands!inner(
            name,
            survey_number,
            area_acres
          )
        `)
        .eq('land_id', id)
        .order('test_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({ 
          title: 'No Data', 
          description: 'No soil health data available',
          variant: 'destructive' 
        });
        navigate(-1);
        return;
      }

      setSoilData(data);
      setFarmerData(data.user_profiles);
      setLandData(data.lands);
    } catch (error) {
      console.error('Error:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to load data',
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateScore = () => {
    if (!soilData) return 0;
    let score = 0;

    if (soilData.ph_level >= 6.0 && soilData.ph_level <= 7.5) score += 40;
    else if (soilData.ph_level >= 5.5 && soilData.ph_level <= 8.0) score += 30;
    else score += 15;

    if (soilData.organic_carbon >= 1.5) score += 30;
    else if (soilData.organic_carbon >= 1.0) score += 20;
    else score += 10;

    const npk = 
      (soilData.nitrogen_level === 'High' ? 10 : soilData.nitrogen_level === 'Medium' ? 7 : 4) +
      (soilData.phosphorus_level === 'High' ? 10 : soilData.phosphorus_level === 'Medium' ? 7 : 4) +
      (soilData.potassium_level === 'High' ? 10 : soilData.potassium_level === 'Medium' ? 7 : 4);
    score += npk;

    return Math.round(score);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'from-success/20 to-success/5';
    if (score >= 60) return 'from-warning/20 to-warning/5';
    return 'from-destructive/20 to-destructive/5';
  };

  const getStatus = (score: number) => {
    if (score >= 80) return { text: 'Excellent', variant: 'default' as const };
    if (score >= 60) return { text: 'Good', variant: 'secondary' as const };
    if (score >= 40) return { text: 'Fair', variant: 'outline' as const };
    return { text: 'Poor', variant: 'destructive' as const };
  };

  const getNPKColor = (level: string) => {
    if (level === 'High') return 'text-success';
    if (level === 'Medium') return 'text-warning';
    return 'text-destructive';
  };

  const downloadPDF = async () => {
    if (!reportRef.current || !soilData || !farmerData || !landData) return;
    
    try {
      setDownloading(true);
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `soil-report-${farmerData.farmer_code}-${landData.name}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      await html2pdf().set(opt).from(reportRef.current).save();
      toast({ title: 'Success', description: 'PDF downloaded' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const downloadJPG = async () => {
    if (!cardRef.current || !soilData || !farmerData) return;
    
    try {
      setDownloading(true);
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const link = document.createElement('a');
      link.download = `soil-card-${farmerData.farmer_code}-${new Date().toISOString().split('T')[0]}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.95);
      link.click();
      
      toast({ title: 'Success', description: 'Image downloaded' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate image', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const shareReport = async () => {
    if (!soilData || !farmerData || !landData) return;
    
    const score = calculateScore();
    const status = getStatus(score);
    
    const text = `🌱 Soil Health Report\n\nFarmer: ${farmerData.full_name}\nLand: ${landData.name}\nHealth Score: ${score}% (${status.text})\n\npH: ${soilData.ph_level}\nOrganic Carbon: ${soilData.organic_carbon}%\nNPK: ${soilData.nitrogen_level}/${soilData.phosphorus_level}/${soilData.potassium_level}`;
    
    try {
      if (navigator.share) {
        await navigator.share({ title: `Soil Report - ${landData.name}`, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: 'Copied', description: 'Report copied to clipboard' });
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!soilData || !farmerData || !landData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
            <Button onClick={() => navigate(-1)}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const score = calculateScore();
  const status = getStatus(score);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 pb-24">
      <div className="sticky top-0 z-40 glassmorphism-strong border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-bold text-lg">Soil Health Report</h1>
              <p className="text-xs text-muted-foreground">{landData.name}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={shareReport} className="glassmorphism">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={downloadJPG} disabled={downloading} className="glassmorphism">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            </Button>
            <Button variant="default" size="icon" onClick={downloadPDF} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div ref={reportRef} className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary/20">
                    <AvatarImage src={farmerData.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {farmerData.full_name?.charAt(0) || 'F'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold">{farmerData.full_name}</h2>
                    <p className="text-sm text-muted-foreground">Code: {farmerData.farmer_code}</p>
                    {farmerData.mobile_number && (
                      <p className="text-xs text-muted-foreground mt-1">📱 {farmerData.mobile_number}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    {[farmerData.address_line1, farmerData.village, farmerData.district, farmerData.state, farmerData.pincode].filter(Boolean).join(', ')}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} ref={cardRef}>
            <Card className={`glass-card-premium overflow-hidden border-2 bg-gradient-to-br ${getScoreBg(score)}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Overall Health Score</p>
                    <h2 className={`text-6xl font-bold ${getScoreColor(score)}`}>{score}%</h2>
                  </div>
                  <Activity className={`h-20 w-20 ${getScoreColor(score)}`} />
                </div>
                <Progress value={score} className="h-4 mb-4" />
                <div className="flex items-center justify-between">
                  <Badge variant={status.variant} className="text-sm px-3 py-1">{status.text}</Badge>
                  {soilData.test_date && (
                    <p className="text-xs text-muted-foreground">
                      Tested: {new Date(soilData.test_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-3 gap-3">
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="p-2 rounded-full bg-blue-500/10 inline-block mb-2">
                  <Droplet className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-xs text-muted-foreground">Nitrogen</p>
                <p className="text-2xl font-bold">{soilData.nitrogen_kg_per_ha}</p>
                <p className="text-xs text-muted-foreground">kg/ha</p>
                <Badge variant="outline" className={`mt-2 text-xs ${getNPKColor(soilData.nitrogen_level)}`}>
                  {soilData.nitrogen_level}
                </Badge>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="p-2 rounded-full bg-orange-500/10 inline-block mb-2">
                  <Leaf className="h-5 w-5 text-orange-500" />
                </div>
                <p className="text-xs text-muted-foreground">Phosphorus</p>
                <p className="text-2xl font-bold">{soilData.phosphorus_kg_per_ha}</p>
                <p className="text-xs text-muted-foreground">kg/ha</p>
                <Badge variant="outline" className={`mt-2 text-xs ${getNPKColor(soilData.phosphorus_level)}`}>
                  {soilData.phosphorus_level}
                </Badge>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="p-2 rounded-full bg-purple-500/10 inline-block mb-2">
                  <TestTube className="h-5 w-5 text-purple-500" />
                </div>
                <p className="text-xs text-muted-foreground">Potassium</p>
                <p className="text-2xl font-bold">{soilData.potassium_kg_per_ha}</p>
                <p className="text-xs text-muted-foreground">kg/ha</p>
                <Badge variant="outline" className={`mt-2 text-xs ${getNPKColor(soilData.potassium_level)}`}>
                  {soilData.potassium_level}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Soil Properties
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">pH Level</p>
                  <p className="text-2xl font-bold">{soilData.ph_level?.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Organic Carbon</p>
                  <p className="text-2xl font-bold">{soilData.organic_carbon?.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bulk Density</p>
                  <p className="text-2xl font-bold">{soilData.bulk_density?.toFixed(2) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CEC</p>
                  <p className="text-2xl font-bold">{soilData.cec?.toFixed(1) || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Soil Type</p>
                  <p className="text-sm font-semibold">{soilData.soil_type || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Texture</p>
                  <p className="text-sm font-semibold">{soilData.texture || 'Unknown'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Soil Composition</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Sand</span>
                  <span className="text-sm font-bold text-muted-foreground">{soilData.sand_percent?.toFixed(1) || 0}%</span>
                </div>
                <Progress value={soilData.sand_percent || 0} className="h-3" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Silt</span>
                  <span className="text-sm font-bold text-muted-foreground">{soilData.silt_percent?.toFixed(1) || 0}%</span>
                </div>
                <Progress value={soilData.silt_percent || 0} className="h-3" />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Clay</span>
                  <span className="text-sm font-bold text-muted-foreground">{soilData.clay_percent?.toFixed(1) || 0}%</span>
                </div>
                <Progress value={soilData.clay_percent || 0} className="h-3" />
              </div>
            </CardContent>
          </Card>

          <Card className="glassmorphism-subtle">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>Source: {soilData.source || 'Lab'}</span>
                  {soilData.confidence_level && (
                    <Badge variant="outline" className="text-xs">{soilData.confidence_level}</Badge>
                  )}
                </div>
                <span>Generated: {new Date().toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}