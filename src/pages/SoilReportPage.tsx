import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Download, Share2, Loader2, Activity, AlertCircle, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import html2pdf from 'html2pdf.js';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

interface SoilProperties {
  bdod: { mean: number; unit: string };
  cec: { mean: number; unit: string };
  cfvo: { mean: number; unit: string };
  clay: { mean: number; unit: string };
  nitrogen: { mean: number; unit: string };
  ocd: { mean: number; unit: string };
  ocs: { mean: number; unit: string };
  phh2o: { mean: number; unit: string };
  sand: { mean: number; unit: string };
  silt: { mean: number; unit: string };
  soc: { mean: number; unit: string };
}

export default function SoilReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const reportRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [landName, setLandName] = useState('');
  const [soilData, setSoilData] = useState<SoilProperties | null>(null);
  const { speak, stop, isSpeaking } = useTextToSpeech();

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { landsApi } = await import('@/services/landsApi');
      const land = await landsApi.fetchLandById(id!);
      
      if (!land) {
        toast({ title: 'Error', description: 'Land not found', variant: 'destructive' });
        navigate('/app/lands');
        return;
      }
      
      setLandName(land.name);
      
      let lat = 0, lng = 0;
      if (land.boundary_polygon_old?.coordinates) {
        const coords = land.boundary_polygon_old.coordinates[0];
        coords.forEach((c: number[]) => { lat += c[1]; lng += c[0]; });
        lat /= coords.length;
        lng /= coords.length;
      } else if (land.center_point_old?.coordinates) {
        lng = land.center_point_old.coordinates[0];
        lat = land.center_point_old.coordinates[1];
      }
      
      if (!lat || !lng) {
        toast({ title: 'Error', description: 'Land coordinates not found', variant: 'destructive' });
        return;
      }
      
      const res = await fetch(`https://kisanshakti-api.onrender.com/soil?latitude=${lat}&longitude=${lng}&depth=0-5cm`);
      if (!res.ok) throw new Error('Failed to fetch soil data');
      const data = await res.json();
      setSoilData(data.properties);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load soil data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getHealthScore = () => {
    if (!soilData) return 0;
    let score = 0;
    const pH = soilData.phh2o.mean / 10;
    const orgC = soilData.soc.mean / 10;
    const nitrogen = soilData.nitrogen.mean / 10;
    
    if (pH >= 6.0 && pH <= 7.5) score += 40;
    else if (pH >= 5.5 && pH <= 8.0) score += 30;
    else score += 15;
    
    if (orgC >= 1.5) score += 30;
    else if (orgC >= 1.0) score += 20;
    else score += 10;
    
    if (nitrogen >= 3.0) score += 30;
    else if (nitrogen >= 2.0) score += 20;
    else score += 10;
    
    return Math.round(score);
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    try {
      const opt = {
        margin: 10,
        filename: `soil-report-${landName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdf().set(opt).from(reportRef.current).save();
      toast({ title: 'Success', description: 'PDF downloaded' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to download PDF', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!soilData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Data Available</h2>
            <Button onClick={() => navigate(`/app/lands/${id}`)}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const score = getHealthScore();
  const status = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/app/lands/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-bold text-lg">Soil Report</h1>
              <p className="text-xs text-muted-foreground">{landName}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={() => navigator.share({ title: `Soil Report - ${landName}` })}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="default" size="icon" onClick={downloadPDF}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4" ref={reportRef}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden border-2">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Soil Health Score</p>
                  <h2 className="text-5xl font-bold text-primary">{score}%</h2>
                </div>
                <Activity className="h-16 w-16 text-primary" />
              </div>
              <Progress value={score} className="h-3 mb-3" />
              <Badge className="text-sm">{status}</Badge>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">pH Level</p>
              <p className="text-2xl font-bold">{(soilData.phh2o.mean / 10).toFixed(1)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Organic C</p>
              <p className="text-2xl font-bold">{(soilData.soc.mean / 10).toFixed(2)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Nitrogen</p>
              <p className="text-2xl font-bold">{(soilData.nitrogen.mean / 10).toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Clay</p>
              <p className="text-2xl font-bold">{(soilData.clay.mean / 10).toFixed(0)}%</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Soil Composition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Sand</span>
                <span className="text-sm text-muted-foreground">{(soilData.sand.mean / 10).toFixed(1)}%</span>
              </div>
              <Progress value={soilData.sand.mean / 10} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Silt</span>
                <span className="text-sm text-muted-foreground">{(soilData.silt.mean / 10).toFixed(1)}%</span>
              </div>
              <Progress value={soilData.silt.mean / 10} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Clay</span>
                <span className="text-sm text-muted-foreground">{(soilData.clay.mean / 10).toFixed(1)}%</span>
              </div>
              <Progress value={soilData.clay.mean / 10} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
